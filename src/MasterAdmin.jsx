import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from './firebase_config'; 
import { collection, doc, setDoc, deleteDoc, getDoc, onSnapshot, updateDoc, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Globe } from 'lucide-react'; // Import Icon

const MasterAdmin = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [lists, setLists] = useState({ ipad: [], hr: [], tech: [], shed: [], admin: [] });
    const [inputs, setInputs] = useState({ ipad: '', hr: '', tech: '', shed: '', admin: '' });
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
        <div style={{ padding: '20px', background: '#f1f5f9', minHeight: '100vh', fontFamily: 'sans-serif' }}>
            
            {/* Header Section */}
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'30px'}}>
                <div style={{display:'flex', alignItems:'center', gap:'20px'}}>
                    <h2 style={{color: '#1e293b', margin:0}}>System Access Console</h2>
                    
                    {/* NEW BUTTON FOR LINKS MANAGER */}
                    <button 
                        onClick={() => navigate('/admin/links')} 
                        style={{
                            display:'flex', alignItems:'center', gap:'6px',
                            background: '#3b82f6', color:'white', border:'none', 
                            padding:'8px 16px', borderRadius:'20px', cursor:'pointer', fontWeight:'bold'
                        }}
                    >
                        <Globe size={16} /> Manage Links
                    </button>
                </div>

                <button onClick={() => navigate('/')} style={{padding:'8px 16px', background:'#64748b', color:'white', border:'none', borderRadius:'4px', cursor:'pointer'}}>Exit</button>
            </div>

            {/* TOP ROW */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                {/* iPad */}
                <div style={boxStyle}><h3 style={headStyle}>iPad Command Center</h3>
                    <div style={addStyle}><input value={inputs.ipad} onChange={e => setInputs({...inputs, ipad: e.target.value})} placeholder="Email" style={inStyle} />
                        <button onClick={() => handleAdd("ipad", "users", { role: 'viewer' })} style={btnStyle}>Add</button></div>
                    <div style={scrollBox}>{lists.ipad.map(u => (
                        <div key={u.email} style={rowStyle}><span>{u.email}</span>
                            <select value={u.role} onChange={e => updateRole("users", u.email, e.target.value)} style={{marginLeft:'auto', marginRight:'10px'}}>
                                {roles.ipad.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                            <button onClick={() => handleRemove("users", u.email)} style={xStyle}>×</button></div>))}</div>
                </div>
                {/* HR */}
                <div style={boxStyle}><h3 style={headStyle}>HR Platform</h3>
                    <div style={addStyle}><input value={inputs.hr} onChange={e => setInputs({...inputs, hr: e.target.value})} placeholder="Email" style={inStyle} />
                        <button onClick={() => handleAdd("hr", "authorized_users", { role: 'Employee' })} style={btnStyle}>Add</button></div>
                    <div style={scrollBox}>{lists.hr.map(u => (
                        <div key={u.email} style={rowStyle}><span>{u.email}</span>
                            <select value={u.role} onChange={e => updateRole("authorized_users", u.email, e.target.value)} style={{marginLeft:'auto', marginRight:'10px'}}>
                                {roles.hr.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                            <button onClick={() => handleRemove("authorized_users", u.email)} style={xStyle}>×</button></div>))}</div>
                </div>
            </div>

            {/* MIDDLE ROW */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                {/* Sheds */}
                <div style={boxStyle}><h3 style={headStyle}>Shed Inventory Access</h3>
                    <div style={addStyle}><input value={inputs.shed} onChange={e => setInputs({...inputs, shed: e.target.value})} placeholder="Email" style={inStyle} />
                        <button onClick={() => handleAdd("shed", "shed_access")} style={btnStyle}>Grant</button></div>
                    <div style={scrollBox}>{lists.shed.map(u => <div key={u.email} style={rowStyle}><span>{u.email}</span><button onClick={() => handleRemove("shed_access", u.email)} style={xStyle}>Revoke</button></div>)}</div>
                </div>
                {/* Techs */}
                <div style={boxStyle}><h3 style={headStyle}>Technician App Access</h3>
                    <div style={addStyle}><input value={inputs.tech} onChange={e => setInputs({...inputs, tech: e.target.value})} placeholder="Email" style={inStyle} />
                        <button onClick={() => handleAdd("tech", "tech_access")} style={btnStyle}>Grant</button></div>
                    <div style={scrollBox}>{lists.tech.map(u => <div key={u.email} style={rowStyle}><span>{u.email}</span><button onClick={() => handleRemove("tech_access", u.email)} style={xStyle}>Revoke</button></div>)}</div>
                </div>
            </div>

            {/* BOTTOM ROW */}
            <div style={{ ...boxStyle, border: '2px solid #1e293b' }}><h3 style={{ ...headStyle, background: '#1e293b', color: 'white' }}>Master Admin Panel Access (/admin)</h3>
                <div style={addStyle}><input value={inputs.admin} onChange={e => setInputs({...inputs, admin: e.target.value})} placeholder="Admin Email" style={inStyle} />
                    <button onClick={() => handleAdd("admin", "master_admin_access")} style={btnStyle}>Add Admin</button></div>
                <div style={scrollBox}>{lists.admin.map(u => <div key={u.email} style={rowStyle}><span>{u.email}</span><button onClick={() => handleRemove("master_admin_access", u.email)} style={xStyle}>Remove</button></div>)}</div>
            </div>
        </div>
    );
};

// Styles
const boxStyle = { background: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' };
const headStyle = { margin: 0, padding: '10px 15px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize:'16px' };
const addStyle = { display: 'flex', gap: '5px', padding: '10px', background: '#fff' };
const inStyle = { flex: 1, padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' };
const btnStyle = { padding: '8px 15px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' };
const scrollBox = { maxHeight: '200px', overflowY: 'auto' };
const rowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 15px', borderBottom: '1px solid #f1f5f9' };
const xStyle = { color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 'bold' };

export default MasterAdmin;