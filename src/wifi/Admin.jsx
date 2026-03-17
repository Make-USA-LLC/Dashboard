import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { collection, doc, setDoc, deleteDoc, onSnapshot, updateDoc, deleteField } from 'firebase/firestore';
import { ShieldAlert, Users, Plus, X } from 'lucide-react';

export default function Admin({ isReadOnly = false }) {
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState({}); 
    const [newUserEmail, setNewUserEmail] = useState('');
    
    const [newRoleName, setNewRoleName] = useState('');
    const [newRolePerms, setNewRolePerms] = useState({ create: true, logs: false, revoke: false, admin: false });
    const [error, setError] = useState('');

    useEffect(() => {
        const unsubUsers = onSnapshot(collection(db, 'wifi_access'), (snapshot) => {
            setUsers(snapshot.docs.map(d => ({ email: d.id, ...d.data() })));
        });

        const unsubRoles = onSnapshot(doc(db, 'config', 'wifi_roles'), (docSnap) => {
            if (docSnap.exists()) {
                setRoles(docSnap.data());
            } else {
                setRoles({ 'Basic User': { create: true, logs: false, revoke: false, admin: false } }); 
            }
        });

        return () => { unsubUsers(); unsubRoles(); };
    }, []);

    const handleAddUser = async (e) => {
        e.preventDefault();
        if (isReadOnly) return alert("Read-Only Mode");
        if (!newUserEmail) return;
        try {
            await setDoc(doc(db, 'wifi_access', newUserEmail.toLowerCase()), { role: Object.keys(roles)[0] || 'Basic User' });
            setNewUserEmail(''); setError('');
        } catch (err) { setError(err.message); }
    };

    const handleRemoveUser = async (email) => {
        if (isReadOnly) return alert("Read-Only Mode");
        if (window.confirm(`Revoke access for ${email}?`)) {
            await deleteDoc(doc(db, 'wifi_access', email));
        }
    };

    const handleRoleChange = async (email, newRole) => {
        if (isReadOnly) return alert("Read-Only Mode");
        await updateDoc(doc(db, 'wifi_access', email), { role: newRole });
    };

    const handleAddRole = async (e) => {
        e.preventDefault();
        if (isReadOnly) return alert("Read-Only Mode");
        if (!newRoleName) return;
        try {
            await setDoc(doc(db, 'config', 'wifi_roles'), { [newRoleName]: newRolePerms }, { merge: true });
            setNewRoleName(''); 
            setNewRolePerms({ create: true, logs: false, revoke: false, admin: false });
            setError('');
        } catch (err) { setError(err.message); }
    };

    const handleDeleteRole = async (roleName) => {
        if (isReadOnly) return alert("Read-Only Mode");
        if (window.confirm(`Delete the role "${roleName}"?`)) {
            await updateDoc(doc(db, 'config', 'wifi_roles'), { [roleName]: deleteField() });
        }
    };

    const togglePerm = (perm) => {
        if (isReadOnly) return;
        setNewRolePerms(prev => ({ ...prev, [perm]: !prev[perm] }));
    };

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>
            
            {/* USERS PANEL */}
            <div style={{ background: 'white', padding: '25px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}><Users size={20}/> Wi-Fi Staff</h3>
                    {isReadOnly && <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '12px' }}>Read-Only</span>}
                </div>
                {error && <p style={{ color: 'red', fontSize: '12px' }}>{error}</p>}
                
                <form onSubmit={handleAddUser} style={{ display: 'flex', gap: '10px', marginBottom: '20px', opacity: isReadOnly ? 0.6 : 1 }}>
                    <input required type="email" placeholder="Staff Email" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} disabled={isReadOnly} style={{ flex: 1, padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }} />
                    <button type="submit" disabled={isReadOnly} style={{ padding: '10px 15px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '5px', cursor: isReadOnly ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>Add</button>
                </form>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {users.map(u => (
                        <div key={u.email} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: '#f8fafc', borderRadius: '5px', border: '1px solid #e2e8f0' }}>
                            <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{u.email}</span>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <select value={u.role || ''} onChange={e => handleRoleChange(u.email, e.target.value)} disabled={isReadOnly} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }}>
                                    {Object.keys(roles).map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                                {!isReadOnly && <button onClick={() => handleRemoveUser(u.email)} style={{ background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '6px 10px' }}><X size={14}/></button>}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ROLES PANEL */}
            <div style={{ background: 'white', padding: '25px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '10px' }}><ShieldAlert size={20}/> Custom Roles</h3>
                <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>Define what different roles are allowed to access.</p>
                
                <form onSubmit={handleAddRole} style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px', opacity: isReadOnly ? 0.6 : 1 }}>
                    <input required placeholder="Role Name (e.g. IT Support)" value={newRoleName} onChange={e => setNewRoleName(e.target.value)} disabled={isReadOnly} style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', marginBottom: '15px', boxSizing: 'border-box' }} />
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: isReadOnly ? 'default' : 'pointer' }}>
                            <input type="checkbox" checked={newRolePerms.create} onChange={() => togglePerm('create')} disabled={isReadOnly} /> Generate Codes
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: isReadOnly ? 'default' : 'pointer' }}>
                            <input type="checkbox" checked={newRolePerms.logs} onChange={() => togglePerm('logs')} disabled={isReadOnly} /> View Access Logs
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: isReadOnly ? 'default' : 'pointer', color: '#b91c1c' }}>
                            <input type="checkbox" checked={newRolePerms.revoke} onChange={() => togglePerm('revoke')} disabled={isReadOnly} /> Use Kill Switch
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: isReadOnly ? 'default' : 'pointer', color: '#0f172a' }}>
                            <input type="checkbox" checked={newRolePerms.admin} onChange={() => togglePerm('admin')} disabled={isReadOnly} /> Admin Panel
                        </label>
                    </div>

                    <button type="submit" disabled={isReadOnly} style={{ width: '100%', padding: '10px', background: '#10b981', color: 'white', border: 'none', borderRadius: '5px', cursor: isReadOnly ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}><Plus size={16} style={{ verticalAlign: 'middle' }}/> Create Role</button>
                </form>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {Object.entries(roles).map(([roleName, perms]) => (
                        <div key={roleName} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: '#f1f5f9', borderRadius: '5px', border: '1px solid #e2e8f0' }}>
                            <div>
                                <div style={{ fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>{roleName}</div>
                                <div style={{ display: 'flex', gap: '5px', fontSize: '11px', fontWeight: 'bold' }}>
                                    {perms.create && <span style={{ background: '#dcfce7', color: '#16a34a', padding: '2px 6px', borderRadius: '4px' }}>CREATE</span>}
                                    {perms.logs && <span style={{ background: '#e0f2fe', color: '#0284c7', padding: '2px 6px', borderRadius: '4px' }}>LOGS</span>}
                                    {perms.revoke && <span style={{ background: '#fee2e2', color: '#dc2626', padding: '2px 6px', borderRadius: '4px' }}>REVOKE</span>}
                                    {perms.admin && <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>ADMIN</span>}
                                </div>
                            </div>
                            {!isReadOnly && <button onClick={() => handleDeleteRole(roleName)} style={{ background: 'transparent', color: '#94a3b8', border: 'none', cursor: 'pointer' }}><X size={18}/></button>}
                        </div>
                    ))}
                </div>
            </div>

        </div>
    );
}