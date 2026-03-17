import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom'; 
import './Admin.css';
import { db } from './firebase_config.jsx';
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  getDoc 
} from 'firebase/firestore';
import Loader from '../components/loader';
import { useRole } from './hooks/useRole'; // <-- Import our new hook!

const FEATURES = [
    { id: 'access', label: 'Dashboard Login' },
    { id: 'timer', label: 'Live Timer' },
    { id: 'settings', label: 'Project Info' },
    { id: 'workers', label: 'Worker DB' },
    { id: 'fleet', label: 'Fleet Mgmt' },
    { id: 'queue_add', label: 'Project Queue (Add New)' }, 
    { id: 'queue', label: 'Project Queue (Edit/Remove)' }, 
    { id: 'manual_ingest', label: 'Manual Ingest' },
    { id: 'prod_input', label: 'Production Input' },
    { id: 'finance', label: 'Finance Input / Setup' },
    { id: 'financial_report', label: 'Financial Report' }, 
    { id: 'commissions', label: 'Commissions & Agents' }, 
    { id: 'bonuses', label: 'Bonus Manager' },
    { id: 'search', label: 'Project Archive' },
    { id: 'summary', label: 'Past Prod Summary' },
    { id: 'admin', label: 'Admin Panel' }
];

const Admin = () => {
    const navigate = useNavigate(); 
    
    // --- 1. USE THE HOOK ---
    const { user, isReadOnly, hasPerm, loading: roleLoading } = useRole();
    const canView = hasPerm('admin', 'view');
    const canEdit = hasPerm('admin', 'edit');

    const [pageLoading, setPageLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('users');
    const [users, setUsers] = useState([]);
    
    // We keep a local copy of roles config so you can edit it before saving
    const [localRolesConfig, setLocalRolesConfig] = useState({});
    
    // Form States
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserRole, setNewUserRole] = useState('viewer');
    const [newUserPassAccess, setNewUserPassAccess] = useState(false);
    const [newRoleName, setNewRoleName] = useState('');

    // --- 2. STREAMLINED INITIALIZATION ---
    useEffect(() => {
        if (roleLoading) return; // Wait for the hook to finish thinking

        if (!user || !canView) {
            navigate('/dashboard'); 
            return;
        }

        const loadData = async () => {
            await fetchRolesConfig(); 
            await fetchUsers();
            setPageLoading(false);
        };

        loadData();
    }, [user, canView, roleLoading, navigate]);

    const fetchRolesConfig = async () => {
        const snap = await getDoc(doc(db, "config", "roles"));
        if (snap.exists()) setLocalRolesConfig(snap.data());
    };

    const fetchUsers = async () => {
        const usersSnap = await getDocs(collection(db, "users"));
        const masterSnap = await getDocs(collection(db, "master_admin_access"));
        
        const masterEmails = new Set();
        masterSnap.forEach(d => masterEmails.add(d.id.toLowerCase()));

        const list = [];
        usersSnap.forEach(d => {
            const u = d.data();
            const email = u.email ? u.email.toLowerCase() : d.id.toLowerCase();

            if (u.previous_role === "NO_ACCESS" && !masterEmails.has(email)) return; 

            if (u.previous_role && u.previous_role !== "NO_ACCESS" && !masterEmails.has(email)) {
                u.role = u.previous_role; 
            }

            if (masterEmails.has(email)) {
                u.isMasterAdmin = true;
                u.role = 'admin'; 
            }

            list.push(u);
        });
        setUsers(list);
    };

    // --- 3. ACTIONS PROTECTED BY canEdit / isReadOnly ---
    const handleAddUser = async () => {
        if (!canEdit) return alert("Read-Only Access");
        if (!newUserEmail) return alert("Enter email");
        const email = newUserEmail.toLowerCase().trim();
        await setDoc(doc(db, "users", email), {
            email: email,
            role: newUserRole,
            allowPassword: newUserPassAccess,
            passwordSet: false
        });
        setNewUserEmail('');
        fetchUsers();
    };

    const handleUpdateUser = async (email, field, value) => {
        if (!canEdit) return alert("Read-Only Access");
        await updateDoc(doc(db, "users", email), { [field]: value });
        fetchUsers();
    };

    const handleDeleteUser = async (email) => {
        if (!canEdit) return alert("Read-Only Access");
        if (window.confirm(`Remove access for ${email}?`)) {
            await deleteDoc(doc(db, "users", email));
            fetchUsers();
        }
    };

    const handleAddRole = () => {
        if (!canEdit) return alert("Read-Only Access");
        const roleKey = newRoleName.trim().toLowerCase().replace(/\s+/g, '_');
        if (!roleKey) return;
        if (localRolesConfig[roleKey]) return alert("Role exists");

        const newConfig = { ...localRolesConfig, [roleKey]: { access_view: true } };
        setLocalRolesConfig(newConfig);
        setNewRoleName('');
    };

    const handleDeleteRole = (roleKey) => {
        if (!canEdit) return alert("Read-Only Access");
        if (window.confirm(`Delete role ${roleKey}?`)) {
            const newConfig = { ...localRolesConfig };
            delete newConfig[roleKey];
            setLocalRolesConfig(newConfig);
        }
    };

    const handleSetPermission = (roleKey, featureId, level) => {
        if (!canEdit) return;
        const newConfig = { ...localRolesConfig };
        const viewKey = featureId + '_view';
        const editKey = featureId + '_edit';

        newConfig[roleKey][viewKey] = false;
        newConfig[roleKey][editKey] = false;

        if (level === 'view') newConfig[roleKey][viewKey] = true;
        if (level === 'edit') {
            newConfig[roleKey][viewKey] = true;
            newConfig[roleKey][editKey] = true;
        }
        
        setLocalRolesConfig(newConfig);
    };

    const saveAllRoles = async () => {
        if (!canEdit) return alert("Read-Only Access");
        await setDoc(doc(db, "config", "roles"), localRolesConfig);
        alert("Roles Configuration Saved!");
    };

    if (roleLoading || pageLoading) return <div style={{height: '100vh', display: 'flex', alignItems: 'center', background: '#f8fafc'}}><Loader message="Loading Admin Panel..." /></div>;
    if (!canView) return null; // Fallback catch

    const sortedRoles = Object.keys(localRolesConfig).sort((a, b) => 
        a === 'admin' ? -1 : b === 'admin' ? 1 : a.localeCompare(b)
    );

    const currentUserEmail = user?.email?.toLowerCase();

    return (
        <div className="admin-page-wrapper" style={{background:'#f4f7f6', minHeight:'100vh'}}>
            <div className="admin-top-bar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <button 
                        onClick={() => navigate('/dashboard')} 
                        style={{background:'none', border:'none', fontSize:'16px', fontWeight:'bold', cursor:'pointer', color:'#2c3e50'}}
                    >
                        &larr; Dashboard
                    </button>
                </div>
            </div>

            <div className="admin-container">
                <div className="admin-tabs">
                    <button 
                        className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`} 
                        onClick={() => setActiveTab('users')}
                    >
                        User Management
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === 'roles' ? 'active' : ''}`} 
                        onClick={() => setActiveTab('roles')}
                    >
                        Role Configuration
                    </button>
                </div>

                {activeTab === 'users' && (
                    <>
                        <div className="admin-card">
                            <div style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '20px' }}>User Access Control</div>
                            
                            {canEdit && (
                            <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '8px', display: 'flex', gap: '10px', marginBottom: '20px', alignItems: 'center', flexWrap:'wrap' }}>
                                <input 
                                    type="text" 
                                    className="admin-input"
                                    placeholder="Email Address" 
                                    value={newUserEmail}
                                    onChange={(e) => setNewUserEmail(e.target.value)}
                                    style={{ flex: 2 }} 
                                />
                                <select 
                                    className="admin-input"
                                    value={newUserRole}
                                    onChange={(e) => setNewUserRole(e.target.value)}
                                    style={{ flex: 1 }}
                                >
                                    {sortedRoles.map(r => (
                                        <option key={r} value={r}>{r.toUpperCase()}</option>
                                    ))}
                                </select>
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 'bold' }}>Pwd Login:</span>
                                    <label className="switch">
                                        <input 
                                            type="checkbox" 
                                            checked={newUserPassAccess}
                                            onChange={(e) => setNewUserPassAccess(e.target.checked)}
                                        />
                                        <span className="slider"></span>
                                    </label>
                                </div>
                                <button className="btn-green" onClick={handleAddUser}>Authorize</button>
                            </div>
                            )}

                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Email</th>
                                        <th>Role</th>
                                        <th style={{textAlign:'center'}}>Pwd Access</th>
                                        <th style={{textAlign:'right'}}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map(u => (
                                        <tr key={u.email}>
                                            <td>
                                                {u.email} {u.email === currentUserEmail ? '(You)' : ''}
                                                {u.isMasterAdmin && <span style={{fontSize: '11px', background: '#f1c40f', color: '#000', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px', fontWeight: 'bold'}}>MASTER</span>}
                                            </td>
                                            <td>
                                                <select 
                                                    value={u.role} 
                                                    onChange={(e) => handleUpdateUser(u.email, 'role', e.target.value)}
                                                    className="admin-input"
                                                    style={{ padding: '5px' }}
                                                    disabled={u.email === currentUserEmail || u.isMasterAdmin || !canEdit}
                                                >
                                                    {sortedRoles.map(r => (
                                                        <option key={r} value={r}>{r.toUpperCase()}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td style={{textAlign:'center'}}>
                                                <label className="switch">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={u.allowPassword || false} 
                                                        onChange={(e) => handleUpdateUser(u.email, 'allowPassword', e.target.checked)}
                                                        disabled={u.email === currentUserEmail || u.isMasterAdmin || !canEdit}
                                                    />
                                                    <span className="slider"></span>
                                                </label>
                                            </td>
                                            <td style={{textAlign:'right'}}>
                                                {u.email !== currentUserEmail && !u.isMasterAdmin && canEdit && (
                                                    <button className="btn-red-outline" onClick={() => handleDeleteUser(u.email)}>Remove</button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {activeTab === 'roles' && (
                    <div className="admin-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ margin: 0 }}>Permissions Matrix</h2>
                            {canEdit && <button className="btn-green" onClick={saveAllRoles}>Save All Changes</button>}
                        </div>

                        {canEdit && (
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', background: '#e8f6f3', padding: '15px', borderRadius: '8px', alignItems: 'center' }}>
                            <span className="material-icons" style={{ color: '#27ae60' }}>add_circle</span>
                            <input 
                                type="text" 
                                className="admin-input"
                                placeholder="New Role Name (e.g. Intern)" 
                                style={{ flex: 1 }}
                                value={newRoleName}
                                onChange={(e) => setNewRoleName(e.target.value)}
                            />
                            <button className="btn-green" style={{ padding: '8px 15px' }} onClick={handleAddRole}>Create Role</button>
                        </div>
                        )}

                        <div className="role-grid">
                            {sortedRoles.map(role => {
                                const perms = localRolesConfig[role] || {};
                                const isLocked = perms._locked === true;
                                
                                return (
                                    <div key={role} className={`role-card ${role === 'admin' ? 'admin-role' : ''}`}>
                                        <div className="role-header">
                                            <div className="role-name">{role.replace(/_/g, ' ')}</div>
                                            {!isLocked && canEdit && (
                                                <span 
                                                    className="material-icons" 
                                                    style={{ color: '#e74c3c', cursor: 'pointer' }} 
                                                    onClick={() => handleDeleteRole(role)}
                                                >
                                                    delete
                                                </span>
                                            )}
                                        </div>

                                        {isLocked ? (
                                            <div style={{ textAlign: 'center', color: '#888', fontSize: '13px', padding: '20px' }}>
                                                <i>Full System Access (Locked)</i>
                                            </div>
                                        ) : (
                                            FEATURES.map(f => {
                                                const vKey = f.id + '_view';
                                                const eKey = f.id + '_edit';
                                                
                                                let level = 'none';
                                                if (perms[eKey]) level = 'edit';
                                                else if (perms[vKey]) level = 'view';

                                                return (
                                                    <div key={f.id} className="perm-row">
                                                        <div className="perm-label">{f.label}</div>
                                                        <div className="level-select">
                                                            <div 
                                                                className={`level-opt ${level === 'none' ? 'active' : ''} ${!canEdit ? 'disabled' : ''}`}
                                                                onClick={() => handleSetPermission(role, f.id, 'none')}
                                                            >None</div>
                                                            <div 
                                                                className={`level-opt view ${level === 'view' ? 'active' : ''} ${!canEdit ? 'disabled' : ''}`}
                                                                onClick={() => handleSetPermission(role, f.id, 'view')}
                                                            >View</div>
                                                            <div 
                                                                className={`level-opt edit ${level === 'edit' ? 'active' : ''} ${!canEdit ? 'disabled' : ''}`}
                                                                onClick={() => handleSetPermission(role, f.id, 'edit')}
                                                            >Edit</div>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Admin;