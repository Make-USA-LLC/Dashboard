import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './UpcomingProjects.css';
import Loader from '../components/Loader';
import { db } from './firebase_config.jsx';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDoc, query, orderBy, onSnapshot, serverTimestamp, getDocFromServer } from 'firebase/firestore';
import { useRole } from './hooks/useRole';

const UpcomingProjects = () => {
    const navigate = useNavigate();
    
    const { user, hasPerm, isReadOnly, loading: roleLoading } = useRole();
    
    const canView = hasPerm('queue', 'view') || hasPerm('admin', 'view') || isReadOnly;
    const canEdit = (hasPerm('queue', 'edit') || hasPerm('admin', 'edit')) && !isReadOnly;
    const canAdd = (hasPerm('queue_add', 'view') || hasPerm('queue_add', 'edit') || hasPerm('admin', 'edit')) && !isReadOnly;

    const [pageLoading, setPageLoading] = useState(true);
    const [costPerHour, setCostPerHour] = useState(0);
    const [options, setOptions] = useState({ companies: [], categories: [], sizes: [] });
    const [jobs, setJobs] = useState([]);
    
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState({
        company: '', project: '', category: '', size: '', 
        quantity: '', price: ''
    });
    const [timePreview, setTimePreview] = useState("Waiting for input...");

    // --- INITIALIZATION & LISTENER ---
    useEffect(() => {
        if (roleLoading) return;
        if (!user || !canView) {
            navigate('/dashboard');
            return;
        }

        // 1. Attach Listener
        const q = query(collection(db, "project_queue"), orderBy("createdAt", "asc"));
        const unsubscribeQueue = onSnapshot(q, (snap) => {
            const list = [];
            snap.forEach(d => {
                const data = d.data();
                // 🔥 THE NUCLEAR FIX: Strip out any fake 'id' field from the data payload
                const { id: fakeId, ...cleanData } = data; 
                
                // Push the clean data and force the True Firebase Document ID
                list.push({ ...cleanData, id: d.id });
            });
            
            setJobs(list);
        }, (error) => {
            console.error("🛑 [LISTENER ERROR]", error);
        });

        // 2. Load Configs
        const loadConfigs = async () => {
            try {
                const [finSnap, optSnap] = await Promise.all([
                    getDoc(doc(db, "config", "finance")),
                    getDoc(doc(db, "config", "project_options"))
                ]);
                if(finSnap.exists()) setCostPerHour(parseFloat(finSnap.data().costPerHour) || 0);
                if(optSnap.exists()) setOptions(optSnap.data());
            } catch (e) { 
                console.error("🛑 [INIT ERROR]", e); 
            } finally {
                setPageLoading(false);
            }
        };
        
        loadConfigs();

        return () => unsubscribeQueue();
    }, [user, canView, roleLoading, navigate]);

    // --- FORM LOGIC ---
    useEffect(() => {
        const qty = parseFloat(form.quantity) || 0;
        const price = parseFloat(form.price) || 0;

        if (costPerHour <= 0) {
            setTimePreview("Error: Cost Per Hour not set");
            return;
        }

        if (qty > 0 && price > 0) {
            const revenue = qty * price;
            const totalHours = revenue / costPerHour;
            const h = Math.floor(totalHours);
            const m = Math.floor((totalHours - h) * 60);
            setTimePreview(`${h} Hours ${m} Minutes`);
        } else {
            setTimePreview("Enter Quantity & Price...");
        }
    }, [form.quantity, form.price, costPerHour]);

    const handleFormChange = (e) => {
        setForm({ ...form, [e.target.id]: e.target.value });
    };

    const handleSubmit = async () => {
        if (editingId && !canEdit) return alert("Access Denied.");
        if (!editingId && !canAdd) return alert("Access Denied.");

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
                await updateDoc(doc(db, "project_queue", editingId), payload);
                handleCancel();
            } else {
                payload.createdAt = serverTimestamp();
                await addDoc(collection(db, "project_queue"), payload);
                handleCancel(); 
            }
        } catch (e) { alert("Error: " + e.message); }
    };

    const handleEdit = (job) => {
        if (!canEdit) return alert("Read-Only Access");
        setEditingId(job.id);
        setForm({
            company: job.company || '',
            project: job.project || '',
            category: job.category || '',
            size: job.size || '',
            quantity: job.expectedUnits || '',
            price: job.pricePerUnit || ''
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancel = () => {
        setEditingId(null);
        setForm({ company: '', project: '', category: '', size: '', quantity: '', price: '' });
    };

    // --- STANDARD DELETE WITH GHOST HANDLING ---
    const handleDelete = async (job) => {
        if (!canEdit) return alert("Access Denied.");
        
        if (window.confirm(`Are you sure you want to remove ${job.project}? It will be moved to the Recycle Bin.`)) {
            if (editingId === job.id) handleCancel();
            
            try {
                // 1. Clean the data for backup
                const safeData = JSON.parse(JSON.stringify(job));
                const docRef = doc(db, "project_queue", job.id);
                
                // 2. Save to the existing trash_bin collection
                await addDoc(collection(db, "trash_bin"), {
                    originalSystem: "dashboard",
                    originalFeature: "upcoming_projects",
                    type: "document",
                    collection: "project_queue",
                    originalId: job.id,
                    displayName: `Queued Project: ${job.project} (${job.company})`,
                    data: safeData,
                    deletedAt: new Date().toISOString(),
                    deletedBy: user?.email || "Unknown"
                });
                
                // 3. Delete from the active queue
                await deleteDoc(docRef);
                
                // 4. Manually remove it from the React state
                setJobs(prevJobs => prevJobs.filter(j => j.id !== job.id));
                
            } catch (error) {
                // THE GHOST TRAP
                if (error.code === 'not-found') {
                    console.log("👻 Ghost busted! Document was already deleted on the server.");
                    setJobs(prevJobs => prevJobs.filter(j => j.id !== job.id));
                } else {
                    console.error("DELETE ERROR:", error);
                    alert(`Error removing project: ${error.message}`);
                }
            }
        }
    };

    if (roleLoading || pageLoading) return <div style={{height: '100vh', display: 'flex', alignItems: 'center', background: '#f8fafc'}}><Loader message="Loading Queue..." /></div>;
    if (!canView) return null;

    const showForm = (canAdd && !editingId) || (editingId !== null);

    return (
        <div className="up-wrapper">
            <div className="up-top-bar">
                <button onClick={() => navigate('/dashboard')} style={{background:'none', border:'none', fontSize:'16px', fontWeight:'bold', cursor:'pointer', color:'#2c3e50', display:'flex', alignItems:'center', gap:'5px'}}>
                    <span className="material-icons">arrow_back</span> Dashboard
                </button>
                <div style={{fontWeight:'bold'}}>Upcoming Project Queue</div>
                <div /> 
            </div>

            <div className="up-container">
                <div className={`up-card ${editingId ? 'edit-mode' : ''}`}>
                    
                    {showForm ? (
                        <>
                            <h2 style={{color: editingId ? '#f39c12' : '#2c3e50'}}>
                                {editingId ? "Edit Project" : "Add New Project"}
                            </h2>

                            <div id="inputSection">
                                {canEdit && (
                                    <button className="up-link-btn" onClick={() => navigate('/dashboard/project-options')}>
                                        Manage Dropdowns &rarr;
                                    </button>
                                )}

                                <div className="up-form-row">
                                    <div className="up-form-group">
                                        <label className="up-label">Company</label>
                                        <select className="up-select" id="company" value={form.company} onChange={handleFormChange}>
                                            <option value="">-- Select Company --</option>
                                            {(options.companies || []).map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div className="up-form-group">
                                        <label className="up-label">Project Name</label>
                                        <input className="up-input" type="text" id="project" value={form.project} onChange={handleFormChange} />
                                    </div>
                                </div>

                                <div className="up-form-row">
                                    <div className="up-form-group">
                                        <label className="up-label">Category</label>
                                        <select className="up-select" id="category" value={form.category} onChange={handleFormChange}>
                                            <option value="">-- Select Category --</option>
                                            {(options.categories || []).map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div className="up-form-group">
                                        <label className="up-label">Size</label>
                                        <select className="up-select" id="size" value={form.size} onChange={handleFormChange}>
                                            <option value="">-- Select Size --</option>
                                            {(options.sizes || []).map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div className="up-form-row">
                                    <div className="up-form-group">
                                        <label className="up-label">Quantity (Units)</label>
                                        <input className="up-input" type="number" id="quantity" placeholder="e.g. 5000" value={form.quantity} onChange={handleFormChange} />
                                    </div>
                                    <div className="up-form-group">
                                        <label className="up-label">Price Per Unit ($)</label>
                                        <input className="up-input" type="number" id="price" placeholder="e.g. 0.75" step="0.01" value={form.price} onChange={handleFormChange} />
                                    </div>
                                </div>

                                <div className="up-form-row">
                                    <div className="up-form-group">
                                        <label className="up-label">Calculated Time Budget (Read Only)</label>
                                        <input type="text" className="up-input up-calc-preview" disabled value={timePreview} />
                                    </div>
                                    <div style={{display:'flex', gap:'10px'}}>
                                        {editingId && (
                                            <button className="btn btn-gray" onClick={handleCancel}>Cancel</button>
                                        )}
                                        <button 
                                            className={`btn ${editingId ? 'btn-blue' : 'btn-green'}`} 
                                            onClick={handleSubmit}
                                        >
                                            {editingId ? "Update Project" : "Add to Queue"}
                                        </button>
                                    </div>
                                </div>
                                <hr style={{margin:'30px 0', border:0, borderTop:'1px solid #eee'}} />
                            </div>
                        </>
                    ) : (
                        <div style={{ color: '#999', fontStyle: 'italic', marginBottom: '20px' }}>
                            Read Only View: You do not have permission to add new projects.
                        </div>
                    )}

                    <h3 style={{marginTop:0, color:'#2c3e50'}}>Pending Projects</h3>
                    
                    <div className="up-job-list">
                        {jobs.length === 0 && <div className="up-denied">Queue is empty.</div>}
                        {jobs.map(job => {
                            const h = Math.floor(job.seconds / 3600);
                            const m = Math.floor((job.seconds % 3600) / 60);
                            
                            return (
                                <div key={job.id} className="up-job-item">
                                    <div>
                                        <div className="up-job-title">{job.project}</div>
                                        <div className="up-job-meta">{job.company} • {job.category} • {job.size}</div>
                                    </div>
                                    <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
                                        <span className="up-job-time">{h}h {m}m</span>
                                        {canEdit && (
                                            <div style={{display:'flex'}}>
                                                <button className="btn-edit-small" onClick={() => handleEdit(job)}>Edit</button>
                                                <button className="btn-red-small" onClick={() => handleDelete(job)}>Remove</button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UpcomingProjects;