import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom'; 
import { collection, addDoc, onSnapshot, doc, getDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { logAudit } from '../utils/logger'; 
import { useRole } from '../hooks/useRole';

export default function Reviews() {
  const location = useLocation(); 
  
  // --- PERMISSIONS ---
  const { checkAccess } = useRole();
  const canEdit = checkAccess('reviews', 'edit');
  const canView = checkAccess('reviews', 'view');

  const [reviews, setReviews] = useState([]);
  const [employees, setEmployees] = useState([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false); 
  // Added 'note' to approval modal state
  const [approveModal, setApproveModal] = useState({ isOpen: false, review: null, salary: "", note: "" }); 
  const [viewReview, setViewReview] = useState(null); 

  const [config, setConfig] = useState(null); 
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [allowedApprovers, setAllowedApprovers] = useState([]); 

  const [selectedEmpId, setSelectedEmpId] = useState("");
  const [editingReviewId, setEditingReviewId] = useState(null);
  
  const [scores, setScores] = useState({});
  const [reviewNotes, setReviewNotes] = useState(""); 
  
  const canApprove = allowedApprovers.includes(currentUserEmail) || canEdit;

  // RESET
  const closeAndReset = () => {
      setIsModalOpen(false);
      setViewReview(null);
      setSelectedEmpId("");
      setEditingReviewId(null);
      setReviewNotes("");
      
      const initScores = {};
      if (config?.categories) {
          config.categories.forEach(cat => initScores[cat.id] = Array(cat.skills.length).fill(0));
      }
      setScores(initScores);
  };

  useEffect(() => {
      if (location.state?.startReviewForId && config && canEdit) {
          closeAndReset(); 
          setSelectedEmpId(location.state.startReviewForId);
          setIsModalOpen(true);
          window.history.replaceState({}, document.title);
      }
      if (location.state?.viewReviewId && reviews.length > 0) {
          const target = reviews.find(r => r.id === location.state.viewReviewId);
          if (target) {
              closeAndReset();
              setViewReview(target);
          }
          window.history.replaceState({}, document.title);
      }
  }, [location.state, config, reviews, canEdit]);

  // DATA LOADING
  useEffect(() => {
    if (auth.currentUser) setCurrentUserEmail(auth.currentUser.email);
    
    const unsubReviews = onSnapshot(collection(db, "reviews"), (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a,b) => new Date(b.date) - new Date(a.date));
        setReviews(list);
    });
    
    const unsubEmps = onSnapshot(collection(db, "employees"), (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (a.lastName || "").localeCompare(b.lastName || ""));
        setEmployees(list);
    });
    
    const loadSettings = async () => {
        const revSnap = await getDoc(doc(db, "settings", "reviews"));
        if(revSnap.exists()) {
            const data = revSnap.data();
            let safeConfig = { ...data, minWage: data.minWage || 15.00, maxSalary: data.maxSalary || 25.00 };
            
            if (!safeConfig.categories && safeConfig.floorSkills) {
                safeConfig.categories = [
                    { id: "floor", name: "Floor Skills", weight: safeConfig.floorWeight, points: safeConfig.floorPoints, skills: safeConfig.floorSkills },
                    { id: "machines", name: "Machine Skills", weight: safeConfig.machineWeight, points: safeConfig.machinePoints, skills: safeConfig.machineSkills },
                    { id: "leadership", name: "Leadership", weight: safeConfig.leadWeight, points: safeConfig.leadPoints, skills: safeConfig.leadSkills }
                ];
            }
            setConfig(safeConfig);
            
            const initScores = {};
            if (safeConfig.categories) {
                safeConfig.categories.forEach(cat => {
                    initScores[cat.id] = Array(cat.skills.length).fill(0);
                });
            }
            setScores(initScores);
        }

        const globalSnap = await getDoc(doc(db, "settings", "global_options"));
        if(globalSnap.exists()) {
            setAllowedApprovers(globalSnap.data().reviewApprovers || []);
        }
    };
    loadSettings();

    return () => { unsubReviews(); unsubEmps(); };
  }, []);

  if (!config) return <div style={{padding:40, textAlign:'center', fontSize:'20px'}}>Loading Reviews...</div>;

  // CALCULATIONS
  const catWeightSum = config.categories?.reduce((sum, cat) => sum + (cat.weight || 0), 0) || 0;
  const totalConfigWeight = catWeightSum + (config.seniorityWeight || 0);
  const isConfigValid = totalConfigWeight === 100;

  const calculateResults = () => {
      if (!config.categories) return { totalScore: 0, suggestedSalary: 0 };

      let totalScore = 0;
      let breakdown = {};

      config.categories.forEach(cat => {
          const catIndices = scores[cat.id] || Array(cat.skills.length).fill(0);
          const rawScore = catIndices.reduce((sum, levelIndex) => sum + (cat.points[levelIndex] || 0), 0);
          const maxPossible = cat.skills.length * Math.max(...cat.points);
          const weightedScore = maxPossible > 0 ? (rawScore / maxPossible) * cat.weight : 0;
          
          totalScore += weightedScore;
          breakdown[cat.id] = weightedScore;
      });

      let seniorityRaw = 0;
      if (selectedEmpId) {
          const emp = employees.find(e => e.id === selectedEmpId);
          if (emp && emp.hireDate) {
              const hire = new Date(emp.hireDate.seconds * 1000);
              const now = new Date();
              const diffMonths = (now.getFullYear() - hire.getFullYear()) * 12 + (now.getMonth() - hire.getMonth());
              seniorityRaw = Math.min(Math.max(diffMonths, 0), config.seniorityCap); 
          }
      }
      const seniorityWeighted = (seniorityRaw / config.seniorityCap) * config.seniorityWeight;
      totalScore += seniorityWeighted;
      
      const finalScore = Math.min(totalScore, 100);
      const rawSalary = (finalScore / 100) * config.maxSalary;
      const suggestedSalary = Math.max(rawSalary, config.minWage); 

      return { totalScore: finalScore, rawSalary, suggestedSalary, breakdown, seniorityRaw, seniorityWeighted };
  };

  const results = calculateResults();

  // --- ACTIONS ---
  const handleScoreChange = (catId, skillIndex, level) => {
      const newScores = { ...scores };
      if (!newScores[catId]) newScores[catId] = [];
      newScores[catId][skillIndex] = level;
      setScores(newScores);
  };

  const saveReviewDoc = async (status) => {
      if (!canEdit) return;
      if (!selectedEmpId) return alert("Please select an employee first.");
      const emp = employees.find(e => e.id === selectedEmpId);
      const reviewDate = new Date(); 
      
      const reportData = {
          employeeId: emp.id, 
          employeeName: emp.firstName + " " + emp.lastName,
          date: reviewDate.toISOString().split('T')[0], 
          scores: scores,
          results: results,
          notes: reviewNotes,
          configSnapshot: config, 
          status: status
      };

      if (editingReviewId) {
          await updateDoc(doc(db, "reviews", editingReviewId), reportData);
          logAudit("Review Updated", emp.firstName + " " + emp.lastName, `Status: ${status}`);
      } else {
          reportData.approvedSalary = null;
          reportData.approvedBy = null;
          await addDoc(collection(db, "reviews"), reportData);
          logAudit(status === "Draft" ? "Draft Saved" : "Submit Review", emp.firstName + " " + emp.lastName, `Score: ${results.totalScore.toFixed(1)}`);
      }
      closeAndReset();
  };

  const handleResumeDraft = (review) => {
      if (!canEdit) return;
      setSelectedEmpId(review.employeeId);
      setScores(review.scores);
      setReviewNotes(review.notes || "");
      setEditingReviewId(review.id);
      setIsModalOpen(true);
  };

  const openApproveModal = (review) => { 
      if (!canApprove) return;
      const salary = review.results?.suggestedSalary || 0;
      // Initialize with empty note
      setApproveModal({ isOpen: true, review: review, salary: salary.toFixed(2), note: "" }); 
  };

  const submitApproval = async () => {
      if (!canApprove) return;
      const { review, salary, note } = approveModal;
      if (!review) return;
      if (parseFloat(salary) < config.minWage) { alert(`Error: Cannot approve below Minimum Wage ($${config.minWage.toFixed(2)})`); return; }
      
      const today = new Date();
      await updateDoc(doc(db, "reviews", review.id), { 
          status: "Approved", 
          approvedSalary: parseFloat(salary), 
          approvedBy: currentUserEmail, 
          approvedAt: today.toISOString(),
          approvalNote: note // Save the approval note
      });
      await updateDoc(doc(db, "employees", review.employeeId), { 
          lastReviewDate: today, compensation: parseFloat(salary) 
      });

      logAudit("Approve Review", review.employeeName, `Approved Salary: $${salary}`);
      setApproveModal({ isOpen: false, review: null, salary: "", note: "" });
  };

  const handleDelete = async (id) => { 
      if(!canEdit) return;
      if(confirm("Permanently delete this review?")) { 
          await deleteDoc(doc(db, "reviews", id)); 
          logAudit("Delete Review", id, "Review deleted"); 
      } 
  };

  if (!canView) return <div style={{padding:20}}>⛔ Access Denied</div>;

  return (
    <div>
      {/* HEADER */}
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 30}}>
        <h2 style={{fontSize:'28px', margin:0}}>Performance Reviews</h2>
        <div style={{display:'flex', gap: 15, alignItems:'center'}}>
            {!isConfigValid && (
                <div style={{display:'flex', alignItems:'center', background:'#fee2e2', color:'#b91c1c', border:'1px solid #f87171', padding:'8px 12px', borderRadius: 6, fontSize:'13px', fontWeight:'bold'}}>
                    ⚠️ Config Error: Total Weight is {totalConfigWeight}% (Must be 100%)
                </div>
            )}
            <Link to="/hr/settings" state={{ activeTab: 'reviews' }}>
                <button style={{background:'white', color:'#475569', border:'2px solid #cbd5e1', cursor:'pointer', padding:'12px 20px', borderRadius: 8, fontSize:'14px', fontWeight:'bold'}}>
                    ⚙️ Settings
                </button>
            </Link>
            
            {canEdit && (
                <button 
                    className="primary" 
                    onClick={() => { closeAndReset(); setIsModalOpen(true); }} 
                    disabled={!isConfigValid}
                    title={!isConfigValid ? "Fix weights in Settings first" : "Create Review"}
                    style={{padding:'12px 25px', fontSize:'14px', opacity: !isConfigValid ? 0.5 : 1, cursor: !isConfigValid ? 'not-allowed' : 'pointer'}}
                >
                    + New Review
                </button>
            )}
        </div>
      </div>

      {/* REVIEW CARDS GRID */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap: 20}}>
          {reviews.length === 0 && <p style={{color:'#64748b', fontSize:'18px'}}>No reviews yet.</p>}
          
          {reviews.map(r => {
              const isApproved = r.status === "Approved";
              const isDraft = r.status === "Draft";
              const totalScore = r.results?.totalScore || 0;
              const scoreColor = totalScore > 80 ? '#22c55e' : (totalScore > 50 ? '#eab308' : '#ef4444');
              const rawWage = r.results?.rawSalary || 0;
              const suggestedSalary = r.results?.suggestedSalary || 0;
              const minWage = r.configSnapshot?.minWage || config.minWage;
              const isUnderMin = rawWage < minWage;

              return (
                <div key={r.id} className="card" style={{padding: 0, overflow:'hidden', border: isApproved ? '2px solid #22c55e' : (isDraft ? '2px dashed #94a3b8' : '2px solid #e2e8f0'), boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'}}>
                    <div 
                        style={{background: isApproved ? '#f0fdf4' : (isDraft ? '#f1f5f9' : '#f8fafc'), padding: 20, borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'start', cursor: 'pointer'}}
                        onClick={() => setViewReview(r)}
                    >
                        <div>
                            <h3 style={{margin:0, fontSize:'20px', color: '#0f172a'}}>{r.employeeName}</h3>
                            <p style={{margin:0, fontSize:'13px', color:'#64748b', marginTop: 4}}>📅 {new Date(r.date).toLocaleDateString()}</p>
                        </div>
                        <span style={{background: isApproved ? '#22c55e' : (isDraft ? '#64748b' : '#94a3b8'), color:'white', padding:'4px 10px', borderRadius: 6, fontSize:'12px', fontWeight:'bold', textTransform:'uppercase'}}>
                            {r.status}
                        </span>
                    </div>

                    <div style={{padding: 20, cursor: 'pointer'}} onClick={() => setViewReview(r)}>
                        <div style={{marginBottom: 20}}>
                            <div style={{display:'flex', justifyContent:'space-between', marginBottom: 5}}>
                                <span style={{fontWeight:'bold', color:'#475569'}}>Total Score</span>
                                <span style={{fontWeight:'bold', color: scoreColor}}>{totalScore.toFixed(1)} / 100</span>
                            </div>
                            <div style={{width:'100%', height: 10, background:'#e2e8f0', borderRadius: 5, overflow:'hidden'}}>
                                <div style={{width: `${Math.min(totalScore, 100)}%`, height:'100%', background: scoreColor}}></div>
                            </div>
                        </div>

                        <div style={{display:'flex', flexDirection:'column', background:'#f8fafc', padding: 10, borderRadius: 8}}>
                            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                <span style={{fontSize:'13px', color:'#64748b'}}>New Rate:</span>
                                {isApproved ? (
                                    <span style={{fontSize:'20px', fontWeight:'bold', color:'#16a34a'}}>${(r.approvedSalary || 0).toFixed(2)}</span>
                                ) : (
                                    <span style={{fontSize:'18px', fontWeight:'bold', color:'#94a3b8'}}>${suggestedSalary.toFixed(2)}</span>
                                )}
                            </div>
                            {isUnderMin && (
                                <div style={{textAlign:'right', color:'#ef4444', fontSize:'11px', fontWeight:'bold', marginTop: 2}}>
                                    Scored Rate: ${rawWage.toFixed(2)}
                                </div>
                            )}
                        </div>
                        
                        {isApproved && (
                            <div style={{marginTop: 10, fontSize:'11px', color:'#64748b', textAlign:'center'}}>
                                Approved by {r.approvedBy?.split('@')[0]}
                            </div>
                        )}
                    </div>

                    <div style={{borderTop:'1px solid #e2e8f0', display:'flex'}}>
                        {isDraft ? (
                            canEdit && (
                                <button onClick={() => handleResumeDraft(r)} style={{flex: 1, background:'#f8fafc', color:'#0f172a', border:'none', padding: 15, cursor:'pointer', fontWeight:'bold', borderRight:'1px solid #e2e8f0'}}>
                                    ✏️ RESUME
                                </button>
                            )
                        ) : (
                            !isApproved && canApprove ? (
                                <button onClick={() => openApproveModal(r)} style={{flex: 1, background:'#f0fdf4', color:'#166534', border:'none', padding: 15, cursor:'pointer', fontWeight:'bold', borderRight:'1px solid #e2e8f0'}}>
                                    ✅ APPROVE
                                </button>
                            ) : (
                                <div style={{flex:1, padding: 15, textAlign:'center', color:'#cbd5e1', fontSize:'12px', borderRight:'1px solid #e2e8f0'}}>
                                    {isApproved ? "LOCKED" : "WAITING AUTHORIZATION"}
                                </div>
                            )
                        )}
                        {canEdit && (
                            <button onClick={() => handleDelete(r.id)} style={{width: 60, background:'white', color:'#ef4444', border:'none', cursor:'pointer', fontWeight:'bold'}}>🗑</button>
                        )}
                    </div>
                </div>
              );
          })}
      </div>
      
      {/* REVIEW MODAL (CREATE / EDIT) */}
      {isModalOpen && (
        <div className="modal-overlay" style={{alignItems:'flex-start', paddingTop: 30, overflowY:'auto'}} onClick={(e) => {if(e.target.className === 'modal-overlay') closeAndReset()}}>
          <div className="modal" style={{width:'900px', maxWidth:'90%', maxHeight: '90vh', display:'flex', flexDirection:'column', padding: 0, borderRadius: 12}}>
            
            <div style={{background:'#1e293b', padding: 20, color:'white', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <h3 style={{margin:0}}>{editingReviewId ? "Edit Review" : "New Performance Review"}</h3>
                <button onClick={closeAndReset} style={{background:'transparent', border:'none', color:'white', fontSize:'24px', cursor:'pointer'}}>×</button>
            </div>

            <div style={{padding: 25, overflowY:'auto', flex: 1}}>
                <label style={{display:'block', marginBottom: 5, fontWeight:'bold', fontSize:'14px'}}>Select Employee</label>
                <select 
                    value={selectedEmpId} 
                    onChange={e => setSelectedEmpId(e.target.value)} 
                    disabled={!!editingReviewId} 
                    style={{width:'100%', padding: 12, fontSize:'16px', borderRadius: 6, border:'1px solid #cbd5e1', marginBottom: 25, background: editingReviewId ? '#f1f5f9' : 'white'}}
                >
                    <option value="">-- Choose Staff Member --</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.lastName}, {e.firstName}</option>)}
                </select>
                
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap: 30}}>
                    <div>
                        {config.categories && config.categories.map((cat) => (
                            <div key={cat.id} style={{marginBottom: 25, background:'white', border:'1px solid #e2e8f0', borderRadius: 8, padding: 15}}>
                                <h4 style={{margin:0, marginBottom: 15, color:'#334155', borderBottom:'2px solid #f1f5f9', paddingBottom: 10}}>
                                    {cat.name} <span style={{fontSize:'12px', color:'#64748b', fontWeight:'normal'}}>({cat.weight}%)</span>
                                </h4>
                                {cat.skills.map((skill, i) => (
                                    <div key={i} style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 12}}>
                                        <span style={{fontSize:'14px', color:'#475569', fontWeight:'500'}}>{skill}</span>
                                        <select 
                                            value={(scores[cat.id] && scores[cat.id][i]) || 0} 
                                            onChange={e => handleScoreChange(cat.id, i, parseInt(e.target.value))} 
                                            style={{width: '60px', padding: '6px', borderRadius: 4, border:'1px solid #cbd5e1', background:'#f8fafc', fontWeight:'bold', textAlign: 'center', cursor: 'pointer'}}
                                        >
                                            {Array.from({length: cat.points.length}, (_, lvl) => (
                                                <option key={lvl} value={lvl}>{lvl}</option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>

                    {/* RESULTS SIDEBAR */}
                    <div>
                        <div style={{background:'#f8fafc', padding: 25, borderRadius: 12, border:'1px solid #e2e8f0', position:'sticky', top: 0}}>
                            <h4 style={{marginTop:0, color:'#334155'}}>Score Preview</h4>
                            
                            {config.categories && config.categories.map(cat => (
                                <div key={cat.id} style={{display:'flex', justifyContent:'space-between', marginBottom:8, fontSize:'14px'}}>
                                    <span style={{color:'#64748b'}}>{cat.name}</span>
                                    <strong>{(results.breakdown[cat.id] || 0).toFixed(1)}</strong>
                                </div>
                            ))}
                            <div style={{display:'flex', justifyContent:'space-between', marginBottom:8, fontSize:'14px', color:'#64748b'}}>
                                <span>Seniority ({results.seniorityRaw} mo)</span>
                                <strong>{results.seniorityWeighted.toFixed(1)}</strong>
                            </div>

                            <div style={{borderTop:'2px solid #cbd5e1', marginTop: 15, paddingTop: 15}}>
                                <div style={{display:'flex', justifyContent:'space-between', fontSize:'18px', marginBottom: 10}}>
                                    <span>Total Score</span>
                                    <strong>{results.totalScore.toFixed(1)}</strong>
                                </div>
                                <div style={{background:'#22c55e', color:'white', padding: 15, borderRadius: 8, textAlign:'center'}}>
                                    <div style={{fontSize:'12px', textTransform:'uppercase', opacity: 0.9}}>Suggested Rate</div>
                                    <div style={{fontSize:'32px', fontWeight:'bold'}}>${results.suggestedSalary.toFixed(2)}</div>
                                    
                                    {results.rawSalary < config.minWage && (
                                        <div style={{marginTop: 5, color: '#fee2e2', fontSize: '13px', fontWeight: 'bold', borderTop: '1px solid rgba(255,255,255,0.3)', paddingTop: 5}}>
                                            Real Scored Rate: ${results.rawSalary.toFixed(2)}
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            <div style={{marginTop: 20, display:'flex', gap: 10}}>
                                <button onClick={() => saveReviewDoc("Draft")} style={{flex: 1, padding: 15, background:'white', border:'1px solid #cbd5e1', color:'#334155', cursor:'pointer', fontWeight:'bold', borderRadius: 6}}>
                                    💾 Save Draft
                                </button>
                                <button onClick={() => saveReviewDoc("Pending Approval")} className="primary" style={{flex: 1, padding: 15, fontSize:'16px'}}>
                                    Submit
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{marginTop: 20}}>
                    <label style={{display:'block', marginBottom: 5, fontWeight:'bold', fontSize:'14px', color:'#475569'}}>Supervisor Notes</label>
                    <textarea
                        value={reviewNotes}
                        onChange={e => setReviewNotes(e.target.value)}
                        placeholder="Add comments about performance, goals, and areas for improvement..."
                        style={{width:'100%', height:'80px', padding: 10, borderRadius: 6, border:'1px solid #cbd5e1', fontFamily:'inherit'}}
                    />
                </div>

            </div>
          </div>
        </div>
      )}

      {/* VIEW REVIEW MODAL */}
      {viewReview && (
        <div className="modal-overlay" style={{alignItems:'flex-start', paddingTop: 30, overflowY:'auto'}} onClick={(e) => {if(e.target.className === 'modal-overlay') setViewReview(null)}}>
          <div className="modal" style={{width:'900px', maxWidth:'90%', maxHeight: '90vh', display:'flex', flexDirection:'column', padding: 0, borderRadius: 12}}>
            
            <div style={{background:'#1e293b', padding: 20, color:'white', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <h3 style={{margin:0}}>View Review: {viewReview.employeeName}</h3>
                <button onClick={() => setViewReview(null)} style={{background:'transparent', border:'none', color:'white', fontSize:'24px', cursor:'pointer'}}>×</button>
            </div>

            <div style={{padding: 25, overflowY:'auto', flex: 1}}>
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap: 30}}>
                    <div>
                        {/* ITERATE CATEGORIES WITH READ-ONLY SCORES */}
                        {(viewReview.configSnapshot?.categories || viewReview.snapshot?.categories || config?.categories || []).map((cat) => (
                            <div key={cat.id} style={{marginBottom: 25, background:'white', border:'1px solid #e2e8f0', borderRadius: 8, padding: 15}}>
                                <h4 style={{margin:0, marginBottom: 15, color:'#334155', borderBottom:'2px solid #f1f5f9', paddingBottom: 10}}>
                                    {cat.name} <span style={{fontSize:'12px', color:'#64748b', fontWeight:'normal'}}>({cat.weight}%)</span>
                                </h4>
                                {cat.skills.map((skill, i) => {
                                    // Retrieve score from saved data
                                    const scoreVal = (viewReview.scores && viewReview.scores[cat.id]) ? viewReview.scores[cat.id][i] : 0;
                                    return (
                                        <div key={i} style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 12, borderBottom: '1px dashed #f1f5f9', paddingBottom: 5}}>
                                            <span style={{fontSize:'14px', color:'#475569', fontWeight:'500'}}>{skill}</span>
                                            {/* DISPLAY SCORE TEXT INSTEAD OF DROPDOWN */}
                                            <strong style={{color: scoreVal > 0 ? '#16a34a' : '#94a3b8', fontSize:'16px'}}>{scoreVal}</strong>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>

                    {/* READ ONLY RESULTS SIDEBAR */}
                    <div>
                        <div style={{background:'#f8fafc', padding: 25, borderRadius: 12, border:'1px solid #e2e8f0', position:'sticky', top: 0}}>
                            <h4 style={{marginTop:0, color:'#334155'}}>Review Results</h4>
                            
                            <div style={{borderTop:'2px solid #cbd5e1', marginTop: 15, paddingTop: 15}}>
                                <div style={{display:'flex', justifyContent:'space-between', fontSize:'18px', marginBottom: 10}}>
                                    <span>Total Score</span>
                                    <strong>{(viewReview.results?.totalScore || 0).toFixed(1)}</strong>
                                </div>
                                <div style={{background:'#f1f5f9', color:'#334155', padding: 15, borderRadius: 8, textAlign:'center', border: '1px solid #cbd5e1'}}>
                                    <div style={{fontSize:'12px', textTransform:'uppercase', opacity: 0.9}}>Status</div>
                                    <div style={{fontSize:'24px', fontWeight:'bold', color: viewReview.status==='Approved'?'#16a34a':'#eab308'}}>{viewReview.status}</div>
                                </div>
                                {viewReview.approvedSalary && (
                                    <div style={{marginTop: 10, textAlign:'center', color:'#16a34a', fontWeight:'bold'}}>
                                        Approved Salary: ${viewReview.approvedSalary.toFixed(2)}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* READ ONLY SUPERVISOR NOTES */}
                {viewReview.notes && (
                    <div style={{marginTop: 20, background: '#fef9c3', padding: 15, borderRadius: 8, border: '1px solid #fde047'}}>
                        <h4 style={{margin:'0 0 5px 0', color:'#b45309'}}>Supervisor Notes</h4>
                        <p style={{margin:0, color:'#78350f', whiteSpace:'pre-wrap'}}>{viewReview.notes}</p>
                    </div>
                )}

                {/* READ ONLY APPROVAL NOTES (NEW) */}
                {viewReview.approvalNote && (
                    <div style={{marginTop: 20, background: '#dcfce7', padding: 15, borderRadius: 8, border: '1px solid #86efac'}}>
                        <h4 style={{margin:'0 0 5px 0', color:'#166534'}}>Approval Note</h4>
                        <p style={{margin:0, color:'#14532d', whiteSpace:'pre-wrap'}}>{viewReview.approvalNote}</p>
                    </div>
                )}

            </div>
          </div>
        </div>
      )}
      
      {/* APPROVE MODAL - 90% HEIGHT */}
      {approveModal.isOpen && (
          <div className="modal-overlay" onClick={(e)=>{if(e.target.className==='modal-overlay') setApproveModal({...approveModal, isOpen:false})}}>
              <div className="modal" style={{width: '400px', maxHeight: '90vh', overflowY: 'auto', textAlign:'center', padding: 30}}>
                  <h2 style={{marginTop:0}}>Approve Rate</h2>
                  <p style={{color:'#64748b'}}>For <strong>{approveModal.review.employeeName}</strong></p>
                  
                  {(approveModal.review.results?.rawSalary || 0) < config.minWage && (
                      <div style={{background:'#fee2e2', color:'#b91c1c', padding: 10, borderRadius: 6, fontSize: '13px', marginBottom: 15}}>
                          ⚠️ <strong>Performance Alert</strong><br/>
                          This employee scored <strong>${(approveModal.review.results?.rawSalary || 0).toFixed(2)}</strong>, which is below Minimum Wage.
                      </div>
                  )}

                  <div style={{fontSize:'40px', fontWeight:'bold', color:'#334155', margin:'20px 0'}}>
                    $<input 
                        type="number" step="0.01" 
                        value={approveModal.salary} 
                        onChange={e => setApproveModal({...approveModal, salary: e.target.value})} 
                        style={{width: 220, fontSize: '40px', fontWeight:'bold', border:'none', borderBottom:'2px solid #cbd5e1', textAlign:'center', color:'#334155'}} 
                    />
                  </div>

                  {/* APPROVAL NOTE FIELD */}
                  <div style={{textAlign: 'left', marginBottom: 20}}>
                      <label style={{display:'block', marginBottom: 5, fontSize:'12px', fontWeight:'bold', color:'#64748b'}}>Final Note</label>
                      <textarea
                          value={approveModal.note}
                          onChange={e => setApproveModal({...approveModal, note: e.target.value})}
                          placeholder="e.g. Approved, great work this year."
                          style={{width:'100%', height:'60px', padding: 8, borderRadius: 4, border:'1px solid #cbd5e1', fontFamily:'inherit'}}
                      />
                  </div>

                  <div style={{display:'flex', gap: 10}}>
                      <button onClick={() => setApproveModal({isOpen:false, review:null, salary:""})} style={{flex:1, padding: 12}}>Cancel</button>
                      <button onClick={submitApproval} className="primary" style={{flex:1, background: '#16a34a', padding: 12}} disabled={parseFloat(approveModal.salary) < (config.minWage || 15)}>Confirm</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}