import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { logAudit } from '../utils/logger'; // <--- IMPORT

// --- GRANULAR PERMISSION STRUCTURE ---
const PERMISSION_STRUCTURE = [
    {
        id: 'hr_group', label: 'HR & Staffing', 
        children: [
            { id: 'employees', label: 'Employee Directory (Add/Edit Profiles)' },
            { id: 'pto', label: 'PTO & Time Logs' },
            { id: 'financials', label: 'Financial Data (Salaries/Rates)' },
            { id: 'reviews', label: 'Performance Reviews' },
            { id: 'checklists', label: 'On/Offboarding Config' },
            { id: 'training', label: 'Training & Certifications' }, 
            { id: 'documents', label: 'Documents (SharePoint)' }    
        ]
    },
    {
        id: 'ops_group', label: 'Operations',
        children: [
            { id: 'schedule', label: 'Scheduling System' }
        ]
    },
    {
        id: 'assets_group', label: 'Facilities & Assets',
        children: [
            { id: 'assets_hardware', label: 'IT Assets & Vehicles' },
            { id: 'assets_keys', label: 'Key Inventory' },
            { id: 'assets_lockers', label: 'Locker Management' }
        ]
    },
    {
        id: 'admin_group', label: 'Administration',
        children: [
            { id: 'logs', label: 'System Audit Logs' },
            { id: 'settings_general', label: 'General Settings (Depts, Options)' },
            { id: 'settings_security', label: 'Security (Users & Roles)' }
        ]
    }
];

export default function RoleManager() {
    const [roles, setRoles] = useState([]);
    const [selectedRole, setSelectedRole] = useState(null);
    const [editName, setEditName] = useState("");
    const [editPerms, setEditPerms] = useState({});
    const [expanded, setExpanded] = useState({}); 

    useEffect(() => {
        const unsub = onSnapshot(collection(db, "roles"), (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setRoles(list);
        });
        return () => unsub();
    }, []);

    const handleSelect = (role) => {
        setSelectedRole(role.id);
        setEditName(role.id);
        setEditPerms(role.permissions || {});
        // Auto expand all for easier viewing
        const allExpanded = {};
        PERMISSION_STRUCTURE.forEach(g => allExpanded[g.id] = true);
        setExpanded(allExpanded);
    };

    const handleNew = () => {
        setSelectedRole("NEW");
        setEditName("");
        setEditPerms({});
        const allExpanded = {};
        PERMISSION_STRUCTURE.forEach(g => allExpanded[g.id] = true);
        setExpanded(allExpanded);
    };

    const setPerm = (id, level) => {
        setEditPerms(prev => ({ ...prev, [id]: level }));
    };

    const setGroup = (group, level) => {
        const updates = {};
        group.children.forEach(child => {
            updates[child.id] = level;
        });
        setEditPerms(prev => ({ ...prev, ...updates }));
    };

    const toggleExpand = (groupId) => {
        setExpanded(prev => ({ ...prev, [groupId]: !prev[groupId] }));
    };

    const saveRole = async () => {
        if (!editName) return alert("Role Name required");
        if (editName === 'Admin') return alert("The 'Admin' role is system-protected.");
        
        await setDoc(doc(db, "roles", editName), { permissions: editPerms });
        
        logAudit("Role Manager", editName, "Updated Permissions / Saved Role"); // LOGGED
        
        setSelectedRole(null);
        alert("Role Saved");
    };

    const deleteRole = async (id) => {
        if (id === 'Admin') return alert("Cannot delete Admin.");
        if (!confirm(`Delete role "${id}"?`)) return;
        
        await deleteDoc(doc(db, "roles", id));
        
        logAudit("Role Manager", id, "Role Deleted"); // LOGGED
        
        if (selectedRole === id) setSelectedRole(null);
    };

    return (
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', height: 'calc(100vh - 200px)' }}>
            {/* ROLE LIST */}
            <div className="card" style={{ width: 250, padding: 0, overflow: 'hidden', height: '100%', overflowY: 'auto' }}>
                <div style={{ padding: 15, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: 0 }}>Roles</h4>
                    <button onClick={handleNew} style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '18px', padding: '0 8px' }}>+</button>
                </div>
                {roles.map(r => (
                    <div 
                        key={r.id} 
                        onClick={() => handleSelect(r)}
                        style={{ padding: '12px 15px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: selectedRole === r.id ? '#eff6ff' : 'white', fontWeight: selectedRole === r.id ? 'bold' : 'normal', color: selectedRole === r.id ? '#1e40af' : 'black' }}
                    >
                        {r.id}
                    </div>
                ))}
            </div>

            {/* PERMISSION EDITOR */}
            {selectedRole && (
                <div className="card" style={{ flex: 1, height: '100%', overflowY: 'auto', display:'flex', flexDirection:'column' }}>
                    <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', borderBottom:'1px solid #eee', paddingBottom:15 }}>
                        <div style={{flex:1}}>
                            <label style={{ display: 'block', fontSize: '12px', color: '#64748b' }}>Role Name</label>
                            <input value={editName} onChange={e => setEditName(e.target.value)} disabled={selectedRole !== "NEW"} style={{ fontSize: '18px', padding: 8, fontWeight: 'bold', border: '1px solid #cbd5e1', borderRadius: 4, width:'100%', maxWidth:'300px' }} />
                        </div>
                        <div style={{alignSelf:'end'}}>
                             <button onClick={saveRole} className="primary" style={{ padding: '10px 20px', fontSize: '16px', marginRight: 10 }}>Save Changes</button>
                             {selectedRole !== "NEW" && <button onClick={() => deleteRole(selectedRole)} style={{ background: 'white', border: '1px solid #ef4444', color: '#ef4444', padding: '10px', borderRadius: 4, cursor: 'pointer' }}>Delete</button>}
                        </div>
                    </div>

                    <div style={{flex:1, overflowY:'auto'}}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{position:'sticky', top:0, background:'white', zIndex:10}}>
                                <tr style={{ borderBottom: '2px solid #e2e8f0', color:'#64748b' }}>
                                    <th style={{ textAlign: 'left', padding: 10 }}>Resource</th>
                                    <th style={{ width: 60, textAlign: 'center', fontSize:'11px' }}>OFF (0)</th>
                                    <th style={{ width: 60, textAlign: 'center', fontSize:'11px' }}>VIEW (1)</th>
                                    <th style={{ width: 60, textAlign: 'center', fontSize:'11px' }}>EDIT (2)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {PERMISSION_STRUCTURE.map(group => (
                                    <React.Fragment key={group.id}>
                                        {/* GROUP HEADER */}
                                        <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                                            <td style={{ padding: '8px 10px', fontWeight: 'bold', cursor:'pointer', display:'flex', alignItems:'center', gap: 10 }} onClick={() => toggleExpand(group.id)}>
                                                <span style={{fontSize:'10px', transform: expanded[group.id] ? 'rotate(90deg)' : 'rotate(0deg)', transition:'0.2s'}}>▶</span>
                                                {group.label}
                                            </td>
                                            <td colSpan={3} style={{textAlign:'right', paddingRight:10}}>
                                                <span style={{fontSize:'9px', color:'#64748b', marginRight:10, textTransform:'uppercase'}}>Set Group:</span>
                                                <button onClick={()=>setGroup(group,0)} style={{fontSize:'10px', padding:'2px 6px', marginRight:2, cursor:'pointer'}}>None</button>
                                                <button onClick={()=>setGroup(group,1)} style={{fontSize:'10px', padding:'2px 6px', marginRight:2, cursor:'pointer'}}>View</button>
                                                <button onClick={()=>setGroup(group,2)} style={{fontSize:'10px', padding:'2px 6px', cursor:'pointer'}}>Edit</button>
                                            </td>
                                        </tr>
                                        {/* PERMISSION ROWS */}
                                        {expanded[group.id] && group.children.map(child => {
                                            const current = editPerms[child.id] || 0;
                                            return (
                                                <tr key={child.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                                                    <td style={{ padding: '10px 10px 10px 35px', color: '#334155', fontSize:'13px' }}>{child.label}</td>
                                                    <td style={{ textAlign: 'center' }}><input type="radio" name={child.id} checked={current === 0} onChange={() => setPerm(child.id, 0)} /></td>
                                                    <td style={{ textAlign: 'center' }}><input type="radio" name={child.id} checked={current === 1} onChange={() => setPerm(child.id, 1)} /></td>
                                                    <td style={{ textAlign: 'center' }}><input type="radio" name={child.id} checked={current === 2} onChange={() => setPerm(child.id, 2)} /></td>
                                                </tr>
                                            );
                                        })}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}