import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { collection, doc, setDoc, deleteDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { ShieldAlert, Trash2, UserPlus, Settings2, Users, CheckSquare, Square } from 'lucide-react';

const Admin = () => {
    const [activeTab, setActiveTab] = useState('users');
    
    const [users, setUsers] = useState([]);
    const [newEmail, setNewEmail] = useState('');
    const [selectedRole, setSelectedRole] = useState('Viewer');
    
    const [roles, setRoles] = useState([]);
    const [newRoleName, setNewRoleName] = useState('');
    
    // Granular Permissions State Matrix
    const defaultPerms = {
        items: { view: false, edit: false },
        stock: { view: false, edit: false },
        receive: { view: false, edit: false },
        builds: { view: false, edit: false },
        fulfill: { view: false, edit: false },
        locations: { view: false, edit: false },
        clients: { view: false, edit: false },
        admin: { view: false, edit: false } // manage_users
    };
    const [rolePerms, setRolePerms] = useState(defaultPerms);

    useEffect(() => {
        const unsubUsers = onSnapshot(collection(db, "inventory_access"), snap => {
            setUsers(snap.docs.map(d => ({ email: d.id, ...d.data() })));
        });
        const unsubRoles = onSnapshot(collection(db, "inv_roles"), snap => {
            setRoles(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => { unsubUsers(); unsubRoles(); };
    }, []);

    // --- Users ---
    const handleAddUser = async (e) => {
        e.preventDefault();
        const email = newEmail.toLowerCase().trim();
        if (!email) return;
        try {
            await setDoc(doc(db, "inventory_access", email), { email, role: selectedRole });
            setNewEmail('');
        } catch (error) { alert(error.message); }
    };

    const handleRemoveUser = async (email) => {
        if (window.confirm(`Revoke Inventory access for ${email}?`)) {
            try { await deleteDoc(doc(db, "inventory_access", email)); } catch (error) { alert(error.message); }
        }
    };

    const updateRole = async (email, role) => {
        try { await updateDoc(doc(db, "inventory_access", email), { role }); } catch (error) { alert(error.message); }
    };

    // --- Custom Roles ---
    const handleCreateRole = async (e) => {
        e.preventDefault();
        const rName = newRoleName.trim();
        if(!rName) return;
        try {
            await setDoc(doc(db, "inv_roles", rName), rolePerms);
            setNewRoleName('');
            setRolePerms(defaultPerms);
            alert("Custom Role Created!");
        } catch (error) { alert(error.message); }
    };

    const handleDeleteRole = async (roleId) => {
        if (window.confirm(`Delete the role '${roleId}'?`)) {
            try { await deleteDoc(doc(db, "inv_roles", roleId)); } catch (error) { alert(error.message); }
        }
    }

    const togglePerm = (module, action) => {
        setRolePerms(prev => {
            const newPerms = { ...prev, [module]: { ...prev[module], [action]: !prev[module][action] } };
            // If turning off View, also turn off Edit. If turning on Edit, force View on.
            if (action === 'view' && !newPerms[module].view) newPerms[module].edit = false;
            if (action === 'edit' && newPerms[module].edit) newPerms[module].view = true;
            return newPerms;
        });
    };

    const modules = [
        { key: 'stock', label: 'Global Stock & Bins' },
        { key: 'items', label: 'Item Master (Catalog)' },
        { key: 'receive', label: 'Receiving' },
        { key: 'builds', label: 'Manufacturing' },
        { key: 'fulfill', label: 'Fulfillment & PLs' },
        { key: 'locations', label: 'Warehouses & Bins' },
        { key: 'clients', label: 'Reporting Clients' },
        { key: 'admin', label: 'Role & User Management' }
    ];

    return (
        <div style={{ maxWidth: '1000px', background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            
            <div style={{ display: 'flex', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <button onClick={() => setActiveTab('users')} style={{ ...tabStyle, borderBottom: activeTab === 'users' ? '3px solid #2563eb' : '3px solid transparent', color: activeTab === 'users' ? '#2563eb' : '#64748b' }}>
                    <Users size={18} /> Manage Users
                </button>
                <button onClick={() => setActiveTab('roles')} style={{ ...tabStyle, borderBottom: activeTab === 'roles' ? '3px solid #2563eb' : '3px solid transparent', color: activeTab === 'roles' ? '#2563eb' : '#64748b' }}>
                    <Settings2 size={18} /> Granular Custom Roles
                </button>
            </div>

            <div style={{ padding: '30px' }}>
                {activeTab === 'users' ? (
                    <div>
                        <form onSubmit={handleAddUser} style={{ display: 'flex', gap: '15px', marginBottom: '30px', background: '#eff6ff', padding: '20px', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                            <input type="email" required placeholder="User Email Address" value={newEmail} onChange={e => setNewEmail(e.target.value)} style={inpStyle} />
                            <select value={selectedRole} onChange={e => setSelectedRole(e.target.value)} style={{...inpStyle, width: '200px'}}>
                                <option value="Viewer">Viewer (Legacy)</option>
                                <option value="Manager">Manager (Legacy)</option>
                                <option value="Admin">Admin (Legacy)</option>
                                <optgroup label="Custom Roles">
                                    {roles.map(r => <option key={r.id} value={r.id}>{r.id}</option>)}
                                </optgroup>
                            </select>
                            <button type="submit" style={btnStyle}><UserPlus size={18} /> Grant</button>
                        </form>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {users.map(u => (
                                <div key={u.email} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                    <strong style={{ color: '#334155' }}>{u.email}</strong>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                        <select value={u.role || 'Viewer'} onChange={e => updateRole(u.email, e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                                            <option value="Viewer">Viewer (Legacy)</option>
                                            <option value="Manager">Manager (Legacy)</option>
                                            <option value="Admin">Admin (Legacy)</option>
                                            <optgroup label="Custom Roles">
                                                {roles.map(r => <option key={r.id} value={r.id}>{r.id}</option>)}
                                            </optgroup>
                                        </select>
                                        <button onClick={() => handleRemoveUser(u.email)} style={{ background: '#fee2e2', color: '#ef4444', border: 'none', padding: '8px', borderRadius: '6px', cursor: 'pointer' }}><Trash2 size={18} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div>
                        <form onSubmit={handleCreateRole} style={{ marginBottom: '40px', background: '#f8fafc', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <h4 style={{margin: '0 0 15px', color: '#0f172a'}}>Create Granular Role</h4>
                            <input required placeholder="Role Name (e.g. 'Dock Worker', 'Floor Manager')" value={newRoleName} onChange={e => setNewRoleName(e.target.value)} style={{...inpStyle, marginBottom: '20px'}} />
                            
                            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', background: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                <thead>
                                    <tr style={{ background: '#e2e8f0', color: '#475569', fontSize: '14px', textAlign: 'left' }}>
                                        <th style={{ padding: '12px 15px' }}>System Module</th>
                                        <th style={{ padding: '12px 15px', textAlign: 'center' }}>Can View</th>
                                        <th style={{ padding: '12px 15px', textAlign: 'center' }}>Can Edit/Execute</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {modules.map(mod => (
                                        <tr key={mod.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '12px 15px', fontWeight: '500', color: '#334155' }}>{mod.label}</td>
                                            <td style={{ padding: '12px 15px', textAlign: 'center' }}>
                                                <div onClick={() => togglePerm(mod.key, 'view')} style={{ cursor: 'pointer', display: 'inline-flex', color: rolePerms[mod.key].view ? '#2563eb' : '#cbd5e1' }}>
                                                    {rolePerms[mod.key].view ? <CheckSquare size={20} /> : <Square size={20} />}
                                                </div>
                                            </td>
                                            <td style={{ padding: '12px 15px', textAlign: 'center' }}>
                                                <div onClick={() => togglePerm(mod.key, 'edit')} style={{ cursor: 'pointer', display: 'inline-flex', color: rolePerms[mod.key].edit ? '#16a34a' : '#cbd5e1' }}>
                                                    {rolePerms[mod.key].edit ? <CheckSquare size={20} /> : <Square size={20} />}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <button type="submit" style={{...btnStyle, width: '100%', justifyContent: 'center'}}>Save Custom Role Matrix</button>
                        </form>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                            {roles.map(r => (
                                <div key={r.id} style={{ padding: '15px', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px'}}>
                                        <strong style={{ color: '#2563eb', fontSize: '16px' }}>{r.id}</strong>
                                        <button onClick={() => handleDeleteRole(r.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={16} /></button>
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                                        {modules.map(mod => {
                                            if (!r[mod.key]?.view && !r[mod.key]?.edit) return null;
                                            return (
                                                <div key={mod.key} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                    <span>{mod.label}</span>
                                                    <span style={{ fontWeight: 'bold', color: r[mod.key]?.edit ? '#16a34a' : '#2563eb' }}>
                                                        {r[mod.key]?.edit ? 'View + Edit' : 'View Only'}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const tabStyle = { flex: 1, padding: '15px', background: 'none', border: 'none', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' };
const inpStyle = { flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' };
const btnStyle = { background: '#2563eb', color: 'white', border: 'none', padding: '0 20px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' };

export default Admin;