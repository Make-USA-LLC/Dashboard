import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, collection, onSnapshot, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit, serverTimestamp, getDoc } from "firebase/firestore";
import { db, auth } from "../firebase_config";

export default function LineDetails() {
  const { id } = useParams();
  const [lineData, setLineData] = useState(null); 
  const [contacts, setContacts] = useState([]);
  const [parts, setParts] = useState([]);
  const [linkedInventory, setLinkedInventory] = useState([]); 
  const [logs, setLogs] = useState([]); 
  
  const [showModal, setShowModal] = useState(false);
  const [modalStep, setModalStep] = useState("selection");

  // --- TRACKING STATES ---
  const [usageDate, setUsageDate] = useState("");
  
  // MICRO TEST STATES
  const [testDate, setTestDate] = useState("");
  const [hasResult, setHasResult] = useState(false);
  const [testResult, setTestResult] = useState("Pass");
  const [testNotes, setTestNotes] = useState("");       
  
  // INTERVAL STATES
  const [testInterval, setTestInterval] = useState(90);
  const [globalInterval, setGlobalInterval] = useState(90);
  const [isUsingGlobal, setIsUsingGlobal] = useState(true);

  // --- RESULT UPDATE MODAL ---
  const [showResultModal, setShowResultModal] = useState(false);
  const [targetLog, setTargetLog] = useState(null);
  const [updateResultVal, setUpdateResultVal] = useState("Pass");
  const [updateNotesVal, setUpdateNotesVal] = useState("");

  // --- FORM STATES ---
  const [cForm, setCForm] = useState({
    firstName: "", lastName: "", phone: "", email: "", 
    notes: "", messaging: [] 
  });
  
  const [msgService, setMsgService] = useState("WeChat");
  const [msgHandle, setMsgHandle] = useState("");

  const [pForm, setPForm] = useState({
    name: "", partNumber: "", supplier: "", description: "", 
    link: "", price: "", leadTime: "", criticality: "Medium"
  });

  // --- LOADING DATA ---
  useEffect(() => {
    // 0. Fetch Global Config
    getDoc(doc(db, "config", "techs")).then(s => {
        if(s.exists()) setGlobalInterval(s.data().defaultMicroInterval || 90);
    });

    // 1. Get Line Data
    const unsubLine = onSnapshot(doc(db, "lines", id), (d) => {
      if(d.exists()) {
        const data = d.data();
        setLineData(data);
        
        // Determine if we are using custom or global
        if (data.microInterval) {
            setTestInterval(data.microInterval);
            setIsUsingGlobal(false);
        } else {
            // Will be updated when globalInterval loads, but set logic here too
            setIsUsingGlobal(true);
        }
      }
    });

    // 2. Get Contacts
    const unsubContacts = onSnapshot(collection(db, "lines", id, "contacts"), s => {
      setContacts(s.docs.map(d => ({id: d.id, ...d.data()})));
    });

    // 3. Get Parts
    const unsubParts = onSnapshot(collection(db, "lines", id, "parts"), s => {
      setParts(s.docs.map(d => ({id: d.id, ...d.data()})));
    });

    // 4. Get Linked Inventory
    const qInv = query(collection(db, "inventory"), where("lineId", "==", id));
    const unsubInv = onSnapshot(qInv, (s) => {
      setLinkedInventory(s.docs.map(d => ({id: d.id, ...d.data()})));
    });

    // 5. Get Recent Logs
    const qLogs = query(collection(db, "lines", id, "logs"), orderBy("date", "desc"), limit(10));
    const unsubLogs = onSnapshot(qLogs, (s) => {
      setLogs(s.docs.map(d => ({id: d.id, ...d.data()})));
    });

    return () => { unsubLine(); unsubContacts(); unsubParts(); unsubInv(); unsubLogs(); };
  }, [id]);

  // Sync Global Interval display if using global
  useEffect(() => {
      if (isUsingGlobal) {
          setTestInterval(globalInterval);
      }
  }, [globalInterval, isUsingGlobal]);

  // --- TRACKING ACTIONS ---
  
  const saveInterval = async () => {
    // If they saved the same value as global, maybe we should remove the override?
    // For now, let's just save it as a specific override if they clicked Save.
    await updateDoc(doc(db, "lines", id), { microInterval: parseInt(testInterval) });
    setIsUsingGlobal(false);
    alert("Custom Interval Saved!");
  };

  const resetToGlobal = async () => {
    await updateDoc(doc(db, "lines", id), { microInterval: null }); // Remove field to fallback
    setIsUsingGlobal(true);
    setTestInterval(globalInterval);
  };

  const logUsage = async () => {
    if(!usageDate) return alert("Select a date");
    
    const [y, m, d] = usageDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d, 12, 0, 0); 
    
    await updateDoc(doc(db, "lines", id), { lastUsageDate: dateObj.toISOString() });
    
    await addDoc(collection(db, "lines", id, "logs"), {
      type: "usage",
      date: dateObj.toISOString(),
      user: auth.currentUser?.email || "Unknown",
      lineName: lineData?.name || "Unknown",
      lineId: id,
      createdAt: serverTimestamp()
    });
    setUsageDate("");
  };

  const logMicroTest = async () => {
    if(!testDate) return alert("Select a date");

    const [y, m, d] = testDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d, 12, 0, 0); 
    
    await updateDoc(doc(db, "lines", id), { lastMicroTestDate: dateObj.toISOString() });
    
    const finalResult = hasResult ? testResult : "Pending";
    const finalNotes = hasResult ? testNotes : "";

    await addDoc(collection(db, "lines", id, "logs"), {
      type: "micro",
      date: dateObj.toISOString(),
      user: auth.currentUser?.email || "Unknown",
      lineName: lineData?.name || "Unknown",
      lineId: id,
      result: finalResult, 
      notes: finalNotes,   
      createdAt: serverTimestamp()
    });
    
    setTestDate("");
    setTestResult("Pass");
    setTestNotes("");
    setHasResult(false);
  };

  // --- UPDATE PENDING RESULT ---
  const openUpdateModal = (log) => {
    setTargetLog(log);
    setUpdateResultVal("Pass");
    setUpdateNotesVal("");
    setShowResultModal(true);
  };

  const saveResultUpdate = async () => {
    if(!targetLog) return;
    try {
        await updateDoc(doc(db, "lines", id, "logs", targetLog.id), {
            result: updateResultVal,
            notes: updateNotesVal
        });
        setShowResultModal(false);
        setTargetLog(null);
    } catch(e) {
        console.error(e);
        alert("Error updating log: " + e.message);
    }
  };

  // --- GENERAL ACTIONS ---
  const handleAddMsg = (e) => {
    e.preventDefault();
    if(!msgHandle) return;
    setCForm({ ...cForm, messaging: [...cForm.messaging, { service: msgService, handle: msgHandle }] });
    setMsgHandle("");
  };

  const removeMsg = (index) => {
    const newMsg = [...cForm.messaging];
    newMsg.splice(index, 1);
    setCForm({...cForm, messaging: newMsg});
  };

  const submitContact = async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "lines", id, "contacts"), cForm);
    closeModal();
  };

  const submitPart = async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "lines", id, "parts"), pForm);
    closeModal();
  };

  const deleteItem = async (col, itemId) => {
    if(window.confirm("Delete this item?")) {
      await deleteDoc(doc(db, "lines", id, col, itemId));
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setModalStep("selection");
    setCForm({ firstName: "", lastName: "", phone: "", email: "", notes: "", messaging: [] });
    setPForm({ name: "", partNumber: "", supplier: "", description: "", link: "", price: "", leadTime: "", criticality: "Medium" });
    setMsgService("WeChat");
    setMsgHandle("");
  };

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString() : "Never";

  return (
    <div className="page">
      <Link to="/techs" className="back-link">← Back to Dashboard</Link>
      <div className="header-flex">
        <h1>{lineData?.name || "Loading..."}</h1>
      </div>

      {/* --- TRACKING SECTION --- */}
      <div className="card" style={{marginBottom: 24, borderTop: '5px solid #8b5cf6'}}>
        <h3>Machine Tracking & Logs</h3>
        
        <div className="grid" style={{marginTop: 15, gap: 20}}>
          
          {/* USAGE TRACKER */}
          <div style={{background:'#f8fafc', padding: 15, borderRadius: 8}}>
            <h4 style={{marginTop:0, color:'#475569'}}>Machine Usage</h4>
            <div style={{fontSize:'0.9rem', marginBottom: 10}}>
              Last Used: <strong>{fmtDate(lineData?.lastUsageDate)}</strong>
            </div>
            <div style={{display:'flex', gap: 5}}>
              <input type="date" value={usageDate} onChange={e=>setUsageDate(e.target.value)} />
              <button onClick={logUsage} style={{background:'#475569', color:'white', border:'none', padding:'5px 10px', borderRadius:4, cursor:'pointer'}}>Log Usage</button>
            </div>
          </div>

          {/* MICRO TRACKER */}
          <div style={{background:'#f8fafc', padding: 15, borderRadius: 8}}>
            <h4 style={{marginTop:0, color:'#059669'}}>Micro Testing (Swab)</h4>
            <div style={{fontSize:'0.9rem', marginBottom: 10}}>
              Last Swab: <strong>{fmtDate(lineData?.lastMicroTestDate)}</strong>
            </div>
            
            {/* INPUT ROW 1: Date */}
            <div style={{display:'flex', gap: 5, marginBottom: 5}}>
              <input type="date" value={testDate} onChange={e=>setTestDate(e.target.value)} style={{flex:1}} />
            </div>

            {/* TOGGLE: RESULTS NOW OR LATER */}
            <div style={{marginBottom: 10, fontSize:'0.85rem'}}>
                <label style={{display:'flex', alignItems:'center', cursor:'pointer'}}>
                    <input 
                        type="checkbox" 
                        checked={hasResult} 
                        onChange={e => setHasResult(e.target.checked)} 
                        style={{marginRight: 8}}
                    />
                    I have results now
                </label>
            </div>

            {/* INPUT ROW 2: Results */}
            {hasResult && (
                <div style={{marginBottom: 10}}>
                    <div style={{display:'flex', gap: 5, marginBottom: 5}}>
                        <select value={testResult} onChange={e=>setTestResult(e.target.value)} style={{fontWeight:'bold', width:'100%', padding:5, color: testResult==='Fail'?'red':'green'}}>
                            <option value="Pass">Pass</option>
                            <option value="Fail">Fail</option>
                        </select>
                    </div>
                    <input 
                        placeholder="RLU / Notes..." 
                        value={testNotes} 
                        onChange={e=>setTestNotes(e.target.value)} 
                        style={{width:'100%', padding: 5, boxSizing:'border-box'}}
                    />
                </div>
            )}
            
            <button onClick={logMicroTest} style={{width:'100%', background:'#059669', color:'white', border:'none', padding:'8px', borderRadius:4, cursor:'pointer', fontWeight:'bold'}}>
                {hasResult ? "Log Test & Result" : "Log Sample Taken (Pending)"}
            </button>
            
            {/* INTERVAL SETTING */}
            <div style={{display:'flex', alignItems:'center', gap: 10, fontSize:'0.8rem', borderTop:'1px solid #e2e8f0', paddingTop: 10, marginTop:10}}>
              <label>Frequency (Days):</label>
              <input 
                type="number" 
                value={testInterval} 
                onChange={e=>setTestInterval(e.target.value)} 
                style={{width: 50, padding: 3}} 
              />
              <button onClick={saveInterval} style={{fontSize:'0.7rem', padding:'2px 5px'}}>Save</button>
              {!isUsingGlobal && (
                  <button onClick={resetToGlobal} style={{fontSize:'0.7rem', padding:'2px 5px', color:'#ef4444'}}>Reset to Default</button>
              )}
            </div>
            {isUsingGlobal && <div style={{fontSize:'0.7rem', color:'#64748b', marginTop:2}}>Using Global Default</div>}
          </div>

          {/* RECENT LOGS */}
          <div style={{gridColumn: '1 / -1'}}>
            <h4 style={{marginBottom: 5, color:'#64748b'}}>Recent Activity</h4>
            <div style={{maxHeight: 150, overflowY:'auto', border:'1px solid #e2e8f0', borderRadius: 4, padding: 5, background:'white'}}>
              {logs.length === 0 ? <div style={{padding:10, fontStyle:'italic', color:'#ccc'}}>No logs yet</div> : (
                <table style={{width:'100%', fontSize:'0.85rem', borderCollapse:'collapse'}}>
                  <thead>
                    <tr style={{textAlign:'left', color:'#94a3b8'}}><th>Date</th><th>Type</th><th>Result</th><th>User</th></tr>
                  </thead>
                  <tbody>
                    {logs.map(l => (
                      <tr key={l.id} style={{borderBottom:'1px solid #f1f5f9'}}>
                        <td style={{padding: 4}}>{fmtDate(l.date)}</td>
                        <td style={{padding: 4}}>
                          <span style={{
                            padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem',
                            background: l.type === 'micro' ? '#dcfce7' : '#f1f5f9',
                            color: l.type === 'micro' ? '#166534' : '#475569'
                          }}>
                            {l.type === 'micro' ? 'SWAB' : 'USAGE'}
                          </span>
                        </td>
                        <td style={{padding: 4}}>
                            {l.type === 'micro' ? (
                                l.result === "Pending" ? (
                                    <button 
                                        onClick={() => openUpdateModal(l)}
                                        style={{background:'#eab308', color:'white', border:'none', borderRadius:4, padding:'2px 6px', cursor:'pointer', fontSize:'0.7rem'}}
                                    >
                                        Enter Result
                                    </button>
                                ) : (
                                    <span>
                                        <strong style={{color: l.result === 'Fail' ? 'red' : 'green'}}>{l.result}</strong>
                                        {l.notes && <span style={{color:'#94a3b8', marginLeft:5}}>({l.notes})</span>}
                                    </span>
                                )
                            ) : '-'}
                        </td>
                        <td style={{padding: 4, color:'#64748b'}}>{l.user}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* NEW: Inventory Section */}
      <div className="card" style={{marginBottom: 24, borderLeft: '5px solid #2563eb'}}>
        <h3>Live Inventory / Spares</h3>
        {linkedInventory.length === 0 ? (
          <p style={{color:'#94a3b8', fontStyle:'italic'}}>
            No inventory assigned to this machine. Go to the <Link to="/techs/inventory" style={{color:'#2563eb'}}>Inventory Page</Link> to assign items.
          </p>
        ) : (
          <div className="grid" style={{gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', marginTop: 15}}>
            {linkedInventory.map(item => (
              <div key={item.id} style={{border:'1px solid #e2e8f0', padding: 10, borderRadius: 8}}>
                <div style={{fontWeight:'bold', color:'#0f172a'}}>{item.name}</div>
                <div style={{fontSize:'0.8rem', color:'#64748b'}}>#{item.partNumber}</div>
                <div style={{marginTop: 5, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                   <span style={{fontSize:'1.2rem', fontWeight:'bold', color: item.quantity <= item.minLevel ? '#ef4444' : '#16a34a'}}>
                     {item.quantity} <span style={{fontSize:'0.8rem', fontWeight:'normal', color:'#64748b'}}>in stock</span>
                   </span>
                   <Link to="/techs/inventory" style={{fontSize:'0.8rem', color:'#2563eb'}}>Manage</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* OTHER SECTIONS (CONTACTS, PARTS) - SAME AS BEFORE */}
      <div className="split-view">
        <div className="section">
          <h3>Contacts</h3>
          {contacts.length === 0 && <p className="empty-state">No contacts added.</p>}
          <div className="list-container">
            {contacts.map(c => (
              <div key={c.id} className="item-card">
                <div className="item-header">
                  <strong>{c.firstName} {c.lastName}</strong>
                  <button onClick={() => deleteItem("contacts", c.id)} className="delete-x">×</button>
                </div>
                <div className="item-details">
                  {c.phone && <div>📞 {c.phone}</div>}
                  {c.email && <div>✉️ {c.email}</div>}
                  {c.messaging && c.messaging.map((m, i) => (
                    <div key={i} className="badge">{m.service}: {m.handle}</div>
                  ))}
                  {c.notes && <div className="notes">"{c.notes}"</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="section">
          <h3>Reference Parts List</h3>
          <p style={{fontSize:'0.8rem', color:'#94a3b8', marginBottom:10}}>Use this list for parts that you need to order but don't stock.</p>
          {parts.length === 0 && <p className="empty-state">No parts listed.</p>}
          <div className="list-container">
            {parts.map(p => (
              <div key={p.id} className="item-card">
                 <div className="item-header">
                  <strong>{p.name}</strong>
                  <button onClick={() => deleteItem("parts", p.id)} className="delete-x">×</button>
                </div>
                <div className="item-sub">#{p.partNumber} • {p.supplier}</div>
                <div className="item-details">
                  <div className="desc">{p.description}</div>
                  <div className="meta-row">
                    {p.price && <span>💵 {p.price}</span>}
                    {p.leadTime && <span>⏱ {p.leadTime}</span>}
                    {p.criticality && <span className={`crit ${p.criticality.toLowerCase()}`}>{p.criticality} Priority</span>}
                  </div>
                  {p.link && <a href={p.link} target="_blank" rel="noreferrer" className="link-btn">Order Link ↗</a>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <button className="fab" onClick={() => setShowModal(true)}>+</button>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <button className="close-modal" onClick={closeModal}>×</button>
            
            {modalStep === "selection" && (
              <div className="selection-step">
                <h2>What would you like to add?</h2>
                <div className="selection-buttons">
                  <button onClick={() => setModalStep("contact")}>👤 Add Contact</button>
                  <button onClick={() => setModalStep("part")}>⚙️ Add Reference Part</button>
                </div>
              </div>
            )}

            {modalStep === "contact" && (
              <form onSubmit={submitContact} className="modal-form">
                <h2>New Contact</h2>
                <div className="form-row">
                  <input placeholder="First Name" value={cForm.firstName} onChange={e=>setCForm({...cForm, firstName:e.target.value})} required />
                  <input placeholder="Last Name" value={cForm.lastName} onChange={e=>setCForm({...cForm, lastName:e.target.value})} required />
                </div>
                <div className="form-row">
                  <input placeholder="Phone" value={cForm.phone} onChange={e=>setCForm({...cForm, phone:e.target.value})} />
                  <input placeholder="Email" value={cForm.email} onChange={e=>setCForm({...cForm, email:e.target.value})} />
                </div>
                
                <div className="messaging-section">
                  <label>Messaging Apps</label>
                  <div className="msg-input-row">
                    <select value={msgService} onChange={e=>setMsgService(e.target.value)}>
                      <option>WeChat</option>
                      <option>WhatsApp</option>
                      <option>Telegram</option>
                      <option>Line</option>
                      <option>Other</option>
                    </select>
                    <input placeholder="ID / Number" value={msgHandle} onChange={e=>setMsgHandle(e.target.value)} />
                    <button type="button" onClick={handleAddMsg} className="small-add">Add</button>
                  </div>
                  <div className="chips">
                    {cForm.messaging.map((m, i) => (
                      <span key={i} className="chip">{m.service}: {m.handle} <b onClick={()=>removeMsg(i)}>×</b></span>
                    ))}
                  </div>
                </div>

                <textarea placeholder="Notes / Role Description..." value={cForm.notes} onChange={e=>setCForm({...cForm, notes:e.target.value})} />
                <button type="submit" className="save-btn">Save Contact</button>
              </form>
            )}

            {modalStep === "part" && (
              <form onSubmit={submitPart} className="modal-form">
                <h2>New Reference Part</h2>
                <p style={{fontSize:'0.85rem', color:'#64748b', marginBottom:15}}>
                  Note: This adds to the reference list. To add trackable stock, use the Inventory page.
                </p>
                <div className="form-row">
                  <input placeholder="Part Name" value={pForm.name} onChange={e=>setPForm({...pForm, name:e.target.value})} required />
                  <input placeholder="Part Number / SKU" value={pForm.partNumber} onChange={e=>setPForm({...pForm, partNumber:e.target.value})} />
                </div>
                <div className="form-row">
                  <input placeholder="Supplier Name" value={pForm.supplier} onChange={e=>setPForm({...pForm, supplier:e.target.value})} />
                  <input placeholder="Price (e.g. $50)" value={pForm.price} onChange={e=>setPForm({...pForm, price:e.target.value})} />
                </div>
                <div className="form-row">
                   <select value={pForm.criticality} onChange={e=>setPForm({...pForm, criticality:e.target.value})}>
                      <option>Low</option>
                      <option>Medium</option>
                      <option>High</option>
                      <option>Critical</option>
                   </select>
                   <input placeholder="Lead Time (e.g. 3 days)" value={pForm.leadTime} onChange={e=>setPForm({...pForm, leadTime:e.target.value})} />
                </div>
                <input placeholder="Order Link (http://...)" value={pForm.link} onChange={e=>setPForm({...pForm, link:e.target.value})} />
                <textarea placeholder="Part Description..." value={pForm.description} onChange={e=>setPForm({...pForm, description:e.target.value})} />
                <button type="submit" className="save-btn">Save Part</button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* RESULTS UPDATE MODAL */}
      {showResultModal && (
        <div className="modal-overlay">
            <div className="modal-box" style={{maxWidth: 350}}>
                <button className="close-modal" onClick={() => setShowResultModal(false)}>×</button>
                <h2>Enter Swab Results</h2>
                <p style={{fontSize:'0.9rem', color:'#64748b'}}>For sample taken on {fmtDate(targetLog?.date)}</p>
                
                <label style={{fontWeight:'bold', display:'block', marginTop: 15}}>Result</label>
                <select 
                    value={updateResultVal} 
                    onChange={e => setUpdateResultVal(e.target.value)}
                    style={{width:'100%', padding: 8, marginTop: 5, fontWeight:'bold', color: updateResultVal==='Fail'?'red':'green'}}
                >
                    <option value="Pass">Pass</option>
                    <option value="Fail">Fail</option>
                </select>

                <label style={{fontWeight:'bold', display:'block', marginTop: 15}}>Notes / RLU</label>
                <input 
                    value={updateNotesVal} 
                    onChange={e => setUpdateNotesVal(e.target.value)} 
                    placeholder="e.g. RLU 50, Cleaned area..."
                    style={{width:'100%', padding: 8, marginTop: 5, boxSizing:'border-box'}}
                />

                <button onClick={saveResultUpdate} className="save-btn" style={{marginTop: 20}}>Save Result</button>
            </div>
        </div>
      )}
    </div>
  );
}