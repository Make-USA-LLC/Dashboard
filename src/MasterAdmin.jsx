import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from './firebase_config'; 
import { collection, doc, setDoc, deleteDoc, getDoc, onSnapshot, updateDoc, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Globe } from 'lucide-react'; 
import './MasterAdmin.css';

const MasterAdmin = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    
    const [lists, setLists] = useState({ 
        ipad: [], hr: [], tech: [], shed: [], machine: [], shipment: [], 
        production: [], qc: [], blending: [], admin: [] 
    });
    const [inputs, setInputs] = useState({ 
        ipad: '', hr: '', tech: '', shed: '', machine: '', shipment: '', 
        production: '', qc: '', blending: '', admin: '' 
    });
    
    const [roles, setRoles] = useState({ ipad: [], hr: [] });

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                if (user.email.toLowerCase() === 'daniel.s@makeit.buzz') {
                    setupListeners();
                    return;
                }
                getDoc(doc(db, "master_admin_access", user.email.toLowerCase()))
                    .then(snap => {
                        if (snap.exists()) setupListeners();
                        else navigate('/');
                    })
                    .catch(() => navigate('/')); 
            } else {
                navigate('/');
            }
        });
        return () => unsubscribe();
    }, []);

    const setupListeners = () => {
        const listen = (coll, key, mapFn) => {
            onSnapshot(collection(db, coll), 
                (s) => setLists(prev => ({ ...prev, [key]: s.docs.map(mapFn) })),
                (err) => console.log(`Waiting for ${coll}...`) 
            );
        };

        listen("users", "ipad", d => d.data());
        listen("authorized_users", "hr", d => ({email: d.id, ...d.data()}));
        listen("tech_access", "tech", d => ({email: d.id}));
        listen("shed_access", "shed", d => ({email: d.id}));
        listen("shipment_access", "shipment", d => ({email: d.id, ...d.data()}));
        
        listen("production_access", "production", d => ({email: d.id}));
        listen("qc_access", "qc", d => ({email: d.id}));
        listen("blending_access", "blending", d => ({email: d.id}));
        
        // Updated to capture the role for Machine/QC Reports
        listen("machine_access", "machine", d => ({email: d.id, ...d.data()})); 
        
        listen("master_admin_access", "admin", d => ({email: d.id}));
        
        getDoc(doc(db, "config", "roles")).then(s => s.exists() && setRoles(p => ({...p, ipad: Object.keys(s.data())})));
        getDocs(collection(db, "roles")).then(s => setRoles(p => ({...p, hr: s.docs.map(d => d.id)})));
        
        setLoading(false);
    };

    const handleAdd = async (key, coll, data = {}) => {
        const email = inputs[key].toLowerCase().trim();
        if (!email) return;
        try {
            await setDoc(doc(db, coll, email), { email, ...data });
            setInputs(p => ({ ...p, [key]: '' }));
        } catch (e) { alert("Error adding user: " + e.message); }
    };

    const handleRemove = async (coll, email) => {
        if (window.confirm(`Revoke access for ${email}?`)) {
            try { await deleteDoc(doc(db, coll, email.toLowerCase())); }
            catch (e) { alert("Error removing user: " + e.message); }
        }
    };

    const updateRole = async (coll, email, role) => {
        try { await updateDoc(doc(db, coll, email.toLowerCase()), { role }); }
        catch (e) { console.error(e); }
    };

    if (loading) return <div style={{padding:'50px', textAlign:'center', color:'#666'}}>Loading Console...</div>;

    return (
        <div className="master-admin-container">
            
            <div className="admin-header-row">
                <div className="admin-title-group">
                    <h2>System Access Console</h2>
                    <button onClick={() => navigate('/admin/links')} className="btn-links">
                        <Globe size={16} /> Manage Links
                    </button>
                </div>
                <button onClick={() => navigate('/')} className="btn-exit">Exit</button>
            </div>

            {/* ROW 1: General Employees */}
            <div className="admin-grid-row">
                <div className="admin-card">
                    <h3 className="admin-card-header">iPad Command Center</h3>
                    <div className="admin-add-row">
                        <input value={inputs.ipad} onChange={e => setInputs({...inputs, ipad: e.target.value})} placeholder="Email" className="admin-input" />
                        <button onClick={() => handleAdd("ipad", "users", { role: 'viewer' })} className="btn-add">Add</button>
                    </div>
                    <div className="admin-scroll-box">
                        {lists.ipad.map(u => (
                            <div key={u.email} className="admin-list-item">
                                <span>{u.email}</span>
                                <select value={u.role} onChange={e => updateRole("users", u.email, e.target.value)} className="admin-role-select">
                                    {roles.ipad.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                                <button onClick={() => handleRemove("users", u.email)} className="btn-remove">×</button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="admin-card">
                    <h3 className="admin-card-header">HR Platform</h3>
                    <div className="admin-add-row">
                        <input value={inputs.hr} onChange={e => setInputs({...inputs, hr: e.target.value})} placeholder="Email" className="admin-input" />
                        <button onClick={() => handleAdd("hr", "authorized_users", { role: 'Employee' })} className="btn-add">Add</button>
                    </div>
                    <div className="admin-scroll-box">
                        {lists.hr.map(u => (
                            <div key={u.email} className="admin-list-item">
                                <span>{u.email}</span>
                                <select value={u.role} onChange={e => updateRole("authorized_users", u.email, e.target.value)} className="admin-role-select">
                                    {roles.hr.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                                <button onClick={() => handleRemove("authorized_users", u.email)} className="btn-remove">×</button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ROW 2: Production & QC */}
            <div className="admin-grid-row">
                <div className="admin-card">
                    <h3 className="admin-card-header" style={{borderLeft: '5px solid #16a34a'}}>Production Mgmt</h3>
                    <div className="admin-add-row">
                        <input value={inputs.production} onChange={e => setInputs({...inputs, production: e.target.value})} placeholder="Email" className="admin-input" />
                        <button onClick={() => handleAdd("production", "production_access")} className="btn-add">Grant</button>
                    </div>
                    <div className="admin-scroll-box">
                        {lists.production.map(u => (
                            <div key={u.email} className="admin-list-item">
                                <span>{u.email}</span>
                                <button onClick={() => handleRemove("production_access", u.email)} className="btn-remove">Revoke</button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="admin-card">
                    <h3 className="admin-card-header" style={{borderLeft: '5px solid #be185d'}}>QC Module</h3>
                    <div className="admin-add-row">
                        <input value={inputs.qc} onChange={e => setInputs({...inputs, qc: e.target.value})} placeholder="Email" className="admin-input" />
                        <button onClick={() => handleAdd("qc", "qc_access")} className="btn-add">Grant</button>
                    </div>
                    <div className="admin-scroll-box">
                        {lists.qc.map(u => (
                            <div key={u.email} className="admin-list-item">
                                <span>{u.email}</span>
                                <button onClick={() => handleRemove("qc_access", u.email)} className="btn-remove">Revoke</button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ROW 3: Blending & Techs */}
            <div className="admin-grid-row">
                <div className="admin-card">
                    <h3 className="admin-card-header" style={{borderLeft: '5px solid #8b5cf6'}}>Blending Lab</h3>
                    <div className="admin-add-row">
                        <input value={inputs.blending} onChange={e => setInputs({...inputs, blending: e.target.value})} placeholder="Email" className="admin-input" />
                        <button onClick={() => handleAdd("blending", "blending_access")} className="btn-add">Grant</button>
                    </div>
                    <div className="admin-scroll-box">
                        {lists.blending.map(u => (
                            <div key={u.email} className="admin-list-item">
                                <span>{u.email}</span>
                                <button onClick={() => handleRemove("blending_access", u.email)} className="btn-remove">Revoke</button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="admin-card">
                    <h3 className="admin-card-header">Technician Access</h3>
                    <div className="admin-add-row">
                        <input value={inputs.tech} onChange={e => setInputs({...inputs, tech: e.target.value})} placeholder="Email" className="admin-input" />
                        <button onClick={() => handleAdd("tech", "tech_access")} className="btn-add">Grant</button>
                    </div>
                    <div className="admin-scroll-box">
                        {lists.tech.map(u => (
                            <div key={u.email} className="admin-list-item">
                                <span>{u.email}</span>
                                <button onClick={() => handleRemove("tech_access", u.email)} className="btn-remove">Revoke</button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ROW 4: Shed & Shipment */}
            <div className="admin-grid-row">
                <div className="admin-card">
                    <h3 className="admin-card-header">Shed Inventory Access</h3>
                    <div className="admin-add-row">
                        <input value={inputs.shed} onChange={e => setInputs({...inputs, shed: e.target.value})} placeholder="Email" className="admin-input" />
                        <button onClick={() => handleAdd("shed", "shed_access")} className="btn-add">Grant</button>
                    </div>
                    <div className="admin-scroll-box">
                        {lists.shed.map(u => (
                            <div key={u.email} className="admin-list-item">
                                <span>{u.email}</span>
                                <button onClick={() => handleRemove("shed_access", u.email)} className="btn-remove">Revoke</button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="admin-card">
                    <h3 className="admin-card-header" style={{borderLeft: '5px solid #0ea5e9'}}>Shipment Billing</h3>
                    <div className="admin-add-row">
                        <input value={inputs.shipment} onChange={e => setInputs({...inputs, shipment: e.target.value})} placeholder="Email" className="admin-input" />
                        <button onClick={() => handleAdd("shipment", "shipment_access", { role: 'Input' })} className="btn-add">Add</button>
                    </div>
                    <div className="admin-scroll-box">
                        {lists.shipment.map(u => (
                            <div key={u.email} className="admin-list-item">
                                <span>{u.email}</span>
                                <select value={u.role} onChange={e => updateRole("shipment_access", u.email, e.target.value)} className="admin-role-select">
                                    <option value="Input">Input Only</option>
                                    <option value="Finance">Finance</option>
                                    <option value="Admin">Admin</option>
                                </select>
                                <button onClick={() => handleRemove("shipment_access", u.email)} className="btn-remove">×</button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* FULL WIDTH ROWS: Reports & Master Admin */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* MACHINE & QC REPORTS (NOW HAS THE DROPDOWN) */}
                <div className="admin-card" style={{ borderLeft: '5px solid #ef4444' }}>
                    <h3 className="admin-card-header">Machine & QC Reports Access</h3>
                    <div className="admin-add-row">
                        <input value={inputs.machine} onChange={e => setInputs({...inputs, machine: e.target.value})} placeholder="Email" className="admin-input" />
                        <button onClick={() => handleAdd("machine", "machine_access", { role: 'Both' })} className="btn-add">Add</button>
                    </div>
                    <div className="admin-scroll-box">
                        {lists.machine.map(u => (
                            <div key={u.email} className="admin-list-item">
                                <span>{u.email}</span>
                                <select value={u.role || 'Both'} onChange={e => updateRole("machine_access", u.email, e.target.value)} className="admin-role-select">
                                    <option value="QC">QC Only</option>
                                    <option value="Tech">Tech Only</option>
                                    <option value="Both">Both (QC & Tech)</option>
                                    <option value="QC_Finance">QC + Finance</option>
                                    <option value="Tech_Finance">Tech + Finance</option>
                                    <option value="Both_Finance">Both + Finance</option>
                                </select>
                                <button onClick={() => handleRemove("machine_access", u.email)} className="btn-remove">×</button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Master Admin */}
                <div className="admin-card master-card">
                    <h3 className="admin-card-header">Master Admin</h3>
                    <div className="admin-add-row">
                        <input value={inputs.admin} onChange={e => setInputs({...inputs, admin: e.target.value})} placeholder="Admin Email" className="admin-input" />
                        <button onClick={() => handleAdd("admin", "master_admin_access")} className="btn-add">Add Admin</button>
                    </div>
                    <div className="admin-scroll-box">
                        {lists.admin.map(u => (
                            <div key={u.email} className="admin-list-item">
                                <span>{u.email}</span>
                                <button onClick={() => handleRemove("master_admin_access", u.email)} className="btn-remove">Remove</button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

        </div>
    );
};

export default MasterAdmin;