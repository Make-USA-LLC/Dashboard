import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { collection, doc, setDoc, deleteDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { ShieldAlert, Trash2, UserPlus, Settings2, Users } from 'lucide-react';

const TPLAdmin = () => {
    const [activeTab, setActiveTab] = useState('users');
    
    const [users, setUsers] = useState([]);
    const [newEmail, setNewEmail] = useState('');
    const [selectedRole, setSelectedRole] = useState('Input');
    
    const [roles, setRoles] = useState([]);
    const [newRoleName, setNewRoleName] = useState('');
    const [rolePerms, setRolePerms] = useState({
        input_entries: false,
        view_history: false,
        edit_rates: false,
        manage_clients: false,
        manage_users: false
    });

    useEffect(() => {
        const unsubUsers = onSnapshot(collection(db, "tpl_billing_access"), (snap) => {
            setUsers(snap.docs.map(doc => ({ email: doc.id, ...doc.data() })));
        });
        const unsubRoles = onSnapshot(collection(db, "tpl_roles"), (snap) => {
            setRoles(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => { unsubUsers(); unsubRoles(); };
    }, []);

    const handleAddUser = async (e) => {
        e.preventDefault();
        const email = newEmail.toLowerCase().trim();
        if (!email) return;
        try {
            await setDoc(doc(db, "tpl_billing_access", email), { email, role: selectedRole });
            setNewEmail('');
        } catch (error) { alert("Error adding user: " + error.message); }
    };

    const handleRemoveUser = async (email) => {
        if (window.confirm(`Revoke 3PL access for ${email}?`)) {
            try { await deleteDoc(doc(db, "tpl_billing_access", email)); } 
            catch (error) { alert("Error removing user: " + error.message); }
        }
    };

    const updateRole = async (email, role) => {
        try { await updateDoc(doc(db, "tpl_billing_access", email), { role }); } 
        catch (error) { alert("Error updating role: " + error.message); }
    };

    const handleCreateRole = async (e) => {
        e.preventDefault();
        const rName = newRoleName.trim();
        if(!rName) return;
        try {
            await setDoc(doc(db, "tpl_roles", rName), rolePerms);
            setNewRoleName('');
            setRolePerms({ input_entries: false, view_history: false, edit_rates: false, manage_clients: false, manage_users: false });
            alert("Custom Role Created!");
        } catch (error) { alert("Error creating role: " + error.message); }
    };

    const handleDeleteRole = async (roleId) => {
        if (window.confirm(`Delete the role '${roleId}'? Users with this role may lose access.`)) {
            try { await deleteDoc(doc(db, "tpl_roles", roleId)); } 
            catch (error) { alert("Error deleting role: " + error.message); }
        }
    }

    const togglePerm = (key) => setRolePerms(p => ({ ...p, [key]: !p[key] }));

    return (
        <div style={{ maxWidth: '900px', margin: '0 auto', background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            
            <div style={{ display: 'flex', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <button onClick={() => setActiveTab('users')} style={{ ...tabStyle, borderBottom: activeTab === 'users' ? '3px solid #ea580c' : '3px solid transparent', color: activeTab === 'users' ? '#ea580c' : '#64748b' }}>
                    <Users size={18} /> Manage Users
                </button>
                <button onClick={() => setActiveTab('roles')} style={{ ...tabStyle, borderBottom: activeTab === 'roles' ? '3px solid #ea580c' : '3px solid transparent', color: activeTab === 'roles' ? '#ea580c' : '#64748b' }}>
                    <Settings2 size={18} /> Custom Roles
                </button>
            </div>

            <div style={{ padding: '30px' }}>
                {activeTab === 'users' ? (
                    <div>
                        <form onSubmit={handleAddUser} style={{ display: 'flex', gap: '15px', marginBottom: '30px', background: '#fffbeb', padding: '20px', borderRadius: '8px', border: '1px solid #fef3c7' }}>
                            <input type="email" required placeholder="User Email Address" value={newEmail} onChange={e => setNewEmail(e.target.value)} style={inpStyle} />
                            <select value={selectedRole} onChange={e => setSelectedRole(e.target.value)} style={{...inpStyle, width: '200px'}}>
                                <option value="Input">Input (Legacy)</option>
                                <option value="Finance">Finance (Legacy)</option>
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
                                        <select value={u.role || 'Input'} onChange={e => updateRole(u.email, e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                                            <option value="Input">Input (Legacy)</option>
                                            <option value="Finance">Finance (Legacy)</option>
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
                        <form onSubmit={handleCreateRole} style={{ marginBottom: '30px', background: '#f8fafc', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <h4 style={{margin: '0 0 15px', color: '#0f172a'}}>Create New Custom Role</h4>
                            <input required placeholder="Role Name (e.g. 'Warehouse Shift Lead')" value={newRoleName} onChange={e => setNewRoleName(e.target.value)} style={{...inpStyle, marginBottom: '20px'}} />
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                                <label style={checkLabel}><input type="checkbox" checked={rolePerms.input_entries} onChange={() => togglePerm('input_entries')} /> Can Input Entries</label>
                                <label style={checkLabel}><input type="checkbox" checked={rolePerms.view_history} onChange={() => togglePerm('view_history')} /> Can Review/Bill Monthly</label>
                                <label style={checkLabel}><input type="checkbox" checked={rolePerms.edit_rates} onChange={() => togglePerm('edit_rates')} /> Can Edit Pricing Rates</label>
                                <label style={checkLabel}><input type="checkbox" checked={rolePerms.manage_clients} onChange={() => togglePerm('manage_clients')} /> Can Add/Delete Clients</label>
                                <label style={checkLabel}><input type="checkbox" checked={rolePerms.manage_users} onChange={() => togglePerm('manage_users')} /> Can Manage Users (Admin)</label>
                            </div>
                            
                            <button type="submit" style={{...btnStyle, width: '100%', justifyContent: 'center'}}>Save Custom Role</button>
                        </form>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {roles.map(r => (
                                <div key={r.id} style={{ padding: '15px', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px'}}>
                                        <strong style={{ color: '#ea580c', fontSize: '16px' }}>{r.id}</strong>
                                        <button onClick={() => handleDeleteRole(r.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={16} /></button>
                                    </div>
                                    <div style={{display: 'flex', gap: '10px', fontSize: '12px', color: '#64748b', flexWrap: 'wrap'}}>
                                        {r.input_entries && <span style={tagStyle}>Input Entries</span>}
                                        {r.view_history && <span style={tagStyle}>View/Bill</span>}
                                        {r.edit_rates && <span style={tagStyle}>Edit Rates</span>}
                                        {r.manage_clients && <span style={tagStyle}>Manage Clients</span>}
                                        {r.manage_users && <span style={tagStyle}>Manage Users</span>}
                                        {!r.input_entries && !r.view_history && !r.edit_rates && !r.manage_clients && !r.manage_users && <span>No Permissions Assigned</span>}
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
const btnStyle = { background: '#ea580c', color: 'white', border: 'none', padding: '0 20px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' };
const checkLabel = { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#334155', fontWeight: '500' };
const tagStyle = { background: '#f1f5f9', padding: '4px 8px', borderRadius: '4px' };

export default TPLAdmin;