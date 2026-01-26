import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './UpcomingProjects.css';
import { db, auth, loadUserData } from './firebase_config.jsx';
import { collection, addDoc, updateDoc, deleteDoc, setDoc, doc, getDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

const UpcomingProjects = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [hasAccess, setHasAccess] = useState(false);
    const [canEdit, setCanEdit] = useState(false);
    
    const [costPerHour, setCostPerHour] = useState(0);
    const [options, setOptions] = useState({ companies: [], categories: [], sizes: [] });
    
    const [stagingJobs, setStagingJobs] = useState([]); 
    const [liveJobs, setLiveJobs] = useState([]);       
    
    const [editingId, setEditingId] = useState(null);
    const [editingSource, setEditingSource] = useState(null); 
    
    const [form, setForm] = useState({
        company: '', project: '', category: '', size: '', 
        quantity: '', price: ''
    });
    const [timePreview, setTimePreview] = useState("Waiting for input...");

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                loadUserData(user, async () => {
                    await checkAccess(user);
                });
            } else navigate('/');
        });
        return () => unsubscribe();
    }, []);

    // --- DATA LISTENERS ---
    useEffect(() => {
        if (!hasAccess) return;

        const qStaging = query(collection(db, "project_staging"), orderBy("createdAt", "asc"));
        const unsubStaging = onSnapshot(qStaging, (snap) => {
            const list = [];
            snap.forEach(d => list.push({ id: d.id, ...d.data() }));
            setStagingJobs(list);
        });

        const qLive = query(collection(db, "project_queue"), orderBy("createdAt", "asc"));
        const unsubLive = onSnapshot(qLive, (snap) => {
            const list = [];
            snap.forEach(d => list.push({ id: d.id, ...d.data() }));
            setLiveJobs(list);
        });

        return () => { unsubStaging(); unsubLive(); };
    }, [hasAccess]);

    const checkAccess = async (user) => {
        try {
            const uSnap = await getDoc(doc(db, "users", user.email.toLowerCase()));
            if (!uSnap.exists()) return navigate('/'); 
            const role = uSnap.data().role;
            const rolesSnap = await getDoc(doc(db, "config", "roles"));
            let edit = false;
            
            if (role === 'admin') edit = true;
            else if (rolesSnap.exists()) {
                const rc = rolesSnap.data()[role];
                if (rc && (rc['queue_edit'] || rc['admin_edit'])) edit = true;
            }

            setCanEdit(edit);
            setHasAccess(true);
            await Promise.all([loadFinanceConfig(), loadOptions()]);
            setLoading(false);
        } catch (e) { setLoading(false); }
    };

    const loadFinanceConfig = async () => {
        try {
            const docSnap = await getDoc(doc(db, "config", "finance"));
            if(docSnap.exists()) setCostPerHour(parseFloat(docSnap.data().costPerHour) || 0);
        } catch(e) { console.error(e); }
    };

    const loadOptions = async () => {
        try {
            const docSnap = await getDoc(doc(db, "config", "project_options"));
            if(docSnap.exists()) setOptions(docSnap.data());
        } catch(e) { console.error(e); }
    };

    useEffect(() => {
        const qty = parseFloat(form.quantity) || 0;
        const price = parseFloat(form.price) || 0;
        if (costPerHour <= 0) { setTimePreview("Error: Cost Per Hour not set"); return; }
        if (qty > 0 && price > 0) {
            const revenue = qty * price;
            const totalHours = revenue / costPerHour;
            const h = Math.floor(totalHours);
            const m = Math.floor((totalHours - h) * 60);
            setTimePreview(`${h} Hours ${m} Minutes`);
        } else { setTimePreview("Enter Quantity & Price..."); }
    }, [form.quantity, form.price, costPerHour]);

    const handleFormChange = (e) => setForm({ ...form, [e.target.id]: e.target.value });

    // --- HELPER: Clears Ghost Items ---
    const removeGhostItem = (id) => {
        setLiveJobs(prev => prev.filter(j => j.id !== id));
        setStagingJobs(prev => prev.filter(j => j.id !== id));
        if (editingId === id) handleCancel();
    };

    const handleSubmit = async () => {
        if (!canEdit) return alert("Access Denied");

        const { company, project, category, size, quantity, price } = form;
        const qty = parseFloat(quantity) || 0;
        const pr = parseFloat(price) || 0;

        if (!company || !project || !category || !size) return alert("Fill all fields");
        if (qty <= 0 || pr <= 0) return alert("Invalid Quantity/Price");

        const revenue = qty * pr;
        const hours = revenue / costPerHour;
        const totalSeconds = Math.floor(hours * 3600);

        const payload = {
            company, project: project.trim(), category, size,
            expectedUnits: qty, pricePerUnit: pr, seconds: totalSeconds
        };

        try {
            if (editingId) {
                // UPDATE EXISTING
                const collName = editingSource === 'live' ? "project_queue" : "project_staging";
                const docRef = doc(db, collName, editingId);
                
                // Protection: Check existence first
                const docSnap = await getDoc(docRef);
                if (!docSnap.exists()) {
                    alert("Sync Error: This project was deleted elsewhere. Removing from view.");
                    removeGhostItem(editingId);
                    return;
                }

                await updateDoc(docRef, payload);
                alert(`Project updated in ${editingSource === 'live' ? 'Live Queue' : 'Staging'}!`);
                handleCancel();
            } else {
                // NEW ITEM
                payload.createdAt = serverTimestamp();
                payload.status = 'staging';
                payload.qcApproved = false;
                await addDoc(collection(db, "project_staging"), payload);
                alert("Added to Staging");
                handleCancel();
            }
        } catch (e) { alert("Error: " + e.message); }
    };

    const handleEdit = (job, source) => {
        setEditingId(job.id);
        setEditingSource(source); 
        setForm({
            company: job.company || '', project: job.project || '', category: job.category || '',
            size: job.size || '', quantity: job.expectedUnits || '', price: job.pricePerUnit || ''
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancel = () => {
        setEditingId(null);
        setEditingSource(null);
        setForm({ company: '', project: '', category: '', size: '', quantity: '', price: '' });
    };

    const handleDelete = async (id, source) => {
        if (!canEdit) return alert("Access Denied");
        if (window.confirm(`Remove from ${source === 'live' ? 'LIVE' : 'Staging'} queue?`)) {
            if (editingId === id) handleCancel();
            const collName = source === 'live' ? "project_queue" : "project_staging";
            const docRef = doc(db, collName, id);
            
            try {
                // Ghost check
                const docSnap = await getDoc(docRef);
                if (!docSnap.exists()) {
                    removeGhostItem(id);
                    return;
                }
                await deleteDoc(docRef);
            } catch (error) { alert("Delete failed: " + error.message); }
        }
    };

    if (loading) return <div style={{padding:'50px', textAlign:'center'}}>Loading Queue...</div>;

    return (
        <div className="up-wrapper">
            <div className="up-top-bar">
                <button onClick={() => navigate('/dashboard')} style={{background:'none', border:'none', fontSize:'16px', fontWeight:'bold', cursor:'pointer', color:'#2c3e50', display:'flex', alignItems:'center', gap:'5px'}}>
                    <span className="material-icons">arrow_back</span> Dashboard
                </button>
                <div style={{fontWeight:'bold'}}>Project Planning</div>
                <div /> 
            </div>

            <div className="up-container">
                <div className={`up-card ${editingId ? 'edit-mode' : ''}`}>
                    <h2 style={{color: editingId ? '#f39c12' : '#2c3e50'}}>
                        {editingId ? `Edit ${editingSource === 'live' ? 'Live' : 'Staging'} Project` : "Add New Project"}
                    </h2>

                    {canEdit && (
                        <div id="inputSection">
                            <button className="up-link-btn" onClick={() => navigate('/ProjectOptions')}>Manage Dropdowns &rarr;</button>
                            <div className="up-form-row">
                                <div className="up-form-group"><label className="up-label">Company</label><select className="up-select" id="company" value={form.company} onChange={handleFormChange}><option value="">-- Select Company --</option>{(options.companies || []).map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                                <div className="up-form-group"><label className="up-label">Project Name</label><input className="up-input" type="text" id="project" value={form.project} onChange={handleFormChange} /></div>
                            </div>
                            <div className="up-form-row">
                                <div className="up-form-group"><label className="up-label">Category</label><select className="up-select" id="category" value={form.category} onChange={handleFormChange}><option value="">-- Select Category --</option>{(options.categories || []).map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                                <div className="up-form-group"><label className="up-label">Size</label><select className="up-select" id="size" value={form.size} onChange={handleFormChange}><option value="">-- Select Size --</option>{(options.sizes || []).map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                            </div>
                            <div className="up-form-row">
                                <div className="up-form-group"><label className="up-label">Quantity (Units)</label><input className="up-input" type="number" id="quantity" placeholder="e.g. 5000" value={form.quantity} onChange={handleFormChange} /></div>
                                <div className="up-form-group"><label className="up-label">Price Per Unit ($)</label><input className="up-input" type="number" id="price" placeholder="e.g. 0.75" step="0.01" value={form.price} onChange={handleFormChange} /></div>
                            </div>
                            <div className="up-form-row">
                                <div className="up-form-group"><label className="up-label">Calculated Time Budget</label><input type="text" className="up-input up-calc-preview" disabled value={timePreview} /></div>
                                <div style={{display:'flex', gap:'10px'}}>{editingId && <button className="btn btn-gray" onClick={handleCancel}>Cancel</button>}<button className={`btn ${editingId ? 'btn-blue' : 'btn-green'}`} onClick={handleSubmit}>{editingId ? "Update Project" : "Add to Queue"}</button></div>
                            </div>
                            <hr style={{margin:'30px 0', border:0, borderTop:'1px solid #eee'}} />
                        </div>
                    )}

                    <h3 style={{marginTop:0, color:'#2c3e50', display:'flex', alignItems:'center', gap:'10px'}}><span className="material-icons" style={{color:'#f39c12'}}>pending</span> Staging Queue</h3>
                    <div style={{background: '#fff7ed', border:'1px solid #ffedd5', padding: '10px', borderRadius: '6px', fontSize: '13px', color: '#c2410c', marginBottom: '15px'}}>Pending QC Approval. Not visible on iPads.</div>
                    
                    <div className="up-job-list mb-8">
                        {stagingJobs.length === 0 && <div className="up-denied">Staging Queue is empty.</div>}
                        {stagingJobs.map(job => (
                            <div key={job.id} className="up-job-item" style={{opacity: 0.8, borderLeft: '4px solid #f39c12'}}>
                                <div><div className="up-job-title">{job.project}</div><div className="up-job-meta">{job.company} • {job.category} • {job.size}</div></div>
                                <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
                                    <span className="up-job-time">{Math.floor(job.seconds/3600)}h {Math.floor((job.seconds%3600)/60)}m</span>
                                    {canEdit && <div style={{display:'flex'}}><button className="btn-edit-small" onClick={() => handleEdit(job, 'staging')}>Edit</button><button className="btn-red-small" onClick={() => handleDelete(job.id, 'staging')}>Remove</button></div>}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{height:'30px'}}></div>

                    <h3 style={{marginTop:0, color:'#2c3e50', display:'flex', alignItems:'center', gap:'10px'}}><span className="material-icons" style={{color:'#27ae60'}}>play_circle</span> Live Production Queue</h3>
                    <div style={{background: '#f0fdf4', border:'1px solid #dcfce7', padding: '10px', borderRadius: '6px', fontSize: '13px', color: '#15803d', marginBottom: '15px'}}>Approved & Live on iPads.</div>

                    <div className="up-job-list">
                        {liveJobs.length === 0 && <div className="up-denied">Live Queue is empty.</div>}
                        {liveJobs.map(job => (
                            <div key={job.id} className="up-job-item" style={{borderLeft: '4px solid #27ae60'}}>
                                <div><div className="up-job-title">{job.project}</div><div className="up-job-meta">{job.company} • {job.category} • {job.size}</div>{job.qcApprover && <div style={{fontSize:'10px', color:'#27ae60', marginTop:'2px'}}>✓ Approved by {job.qcApprover}</div>}</div>
                                <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
                                    <span className="up-job-time">{Math.floor(job.seconds/3600)}h {Math.floor((job.seconds%3600)/60)}m</span>
                                    {canEdit && <div style={{display:'flex'}}><button className="btn-edit-small" onClick={() => handleEdit(job, 'live')}>Edit</button><button className="btn-red-small" onClick={() => handleDelete(job.id, 'live')}>Remove</button></div>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UpcomingProjects;