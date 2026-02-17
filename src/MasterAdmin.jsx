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
    
    // 1. ADD 'machine' TO STATE
    const [lists, setLists] = useState({ ipad: [], hr: [], tech: [], shed: [], machine: [], admin: [] });
    const [inputs, setInputs] = useState({ ipad: '', hr: '', tech: '', shed: '', machine: '', admin: '' });
    
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
        
        // 2. LISTEN TO 'machine_access' COLLECTION
        listen("machine_access", "machine", d => ({email: d.id}));
        
        listen("master_admin_access", "admin", d => ({email: d.id}));
        
        getDoc(doc(db, "config", "roles")).then(s => s.exists() && setRoles(p => ({...p, ipad: Object.keys(s.data())})));
        getDocs(collection(db, "roles")).then(s => setRoles(p => ({...p, hr: s.docs.map(d => d.id)})));
        
        setLoading(false);
    };

    const handleAdd = async (key, coll, data = {}) => {
        const email = inputs[key].toLowerCase().trim();
        if (!email) return;
        try {
            // This creates the permission document
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
            
            {/* Header Section */}
            <div className="admin-header-row">
                <div className="admin-title-group">
                    <h2>System Access Console</h2>
                    <button onClick={() => navigate('/admin/links')} className="btn-links">
                        <Globe size={16} /> Manage Links
                    </button>
                </div>
                <button onClick={() => navigate('/')} className="btn-exit">Exit</button>
            </div>

            {/* TOP ROW (iPad & HR) */}
            <div className="admin-grid-row">
                {/* iPad */}
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

                {/* HR */}
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

            {/* MIDDLE ROW (Shed & Techs) */}
            <div className="admin-grid-row">
                {/* Sheds */}
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

                {/* Techs */}
                <div className="admin-card">
                    <h3 className="admin-card-header">Technician App Access</h3>
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

            {/* BOTTOM ROW (Machines & Admin) */}
            <div className="admin-grid-row">
                
                {/* 3. NEW CARD: MACHINE REPORTS ACCESS */}
                <div className="admin-card">
                    <h3 className="admin-card-header" style={{borderLeft: '5px solid #ef4444'}}>Machine Reports Access</h3>
                    <div className="admin-add-row">
                        <input 
                            value={inputs.machine} 
                            onChange={e => setInputs({...inputs, machine: e.target.value})} 
                            placeholder="Email" 
                            className="admin-input" 
                        />
                        {/* WRITES TO 'machine_access' collection */}
                        <button onClick={() => handleAdd("machine", "machine_access")} className="btn-add">Grant</button>
                    </div>
                    <div className="admin-scroll-box">
                        {lists.machine.map(u => (
                            <div key={u.email} className="admin-list-item">
                                <span>{u.email}</span>
                                <button onClick={() => handleRemove("machine_access", u.email)} className="btn-remove">Revoke</button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Master Admin */}
                <div className="admin-card master-card">
                    <h3 className="admin-card-header">Master Admin Panel (/admin)</h3>
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