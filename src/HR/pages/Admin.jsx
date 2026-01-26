import React, { useState, useEffect } from 'react';
import { collection, doc, setDoc, deleteDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { logAudit } from '../utils/logger'; 
import { useRole } from '../hooks/useRole';
import RoleManager from '../components/RoleManager'; 

export default function Admin() {
  const { checkAccess } = useRole();
  const canEditUsers = checkAccess('settings_security', 'edit');

  const [users, setUsers] = useState([]);
  const [rolesList, setRolesList] = useState([]); 
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState("Manager"); 
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [activeTab, setActiveTab] = useState("users");

  useEffect(() => {
      if(auth.currentUser) setCurrentUserEmail(auth.currentUser.email);
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "authorized_users"), (snap) => {
      setUsers(snap.docs.map(d => ({ email: d.id, ...d.data() })));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
      const unsubRoles = onSnapshot(collection(db, "roles"), (snap) => {
          const list = snap.docs.map(d => d.id);
          setRolesList(list);
          if (list.length > 0 && !list.includes(newUserRole) && newUserRole !== "Manager") {
             setNewUserRole(list[0]);
          }
      });
      return () => unsubRoles();
  }, []);

  const addUser = async (e) => {
    e.preventDefault();
    if (!canEditUsers) return alert("Permission Denied");
    const email = newUserEmail.trim().toLowerCase();
    if(!email) return;

    await setDoc(doc(db, "authorized_users", email), { 
      role: newUserRole, 
      addedAt: new Date() 
    });
    logAudit("Access Control", "System", `Granted ${newUserRole} access to ${email}`);
    setNewUserEmail("");
  };

  const updateUserRole = async (email, newRole) => {
      if (!canEditUsers) return;
      if (email === currentUserEmail) return alert("You cannot change your own role.");
      await updateDoc(doc(db, "authorized_users", email), { role: newRole });
      logAudit("Access Control", "System", `Changed ${email} role to ${newRole}`);
  };

  const removeUser = async (email) => {
    if (!canEditUsers) return;
    if (email === currentUserEmail) return alert("You cannot revoke your own access.");
    if (confirm(`Revoke ALL access for ${email}?`)) {
      await deleteDoc(doc(db, "authorized_users", email));
      logAudit("Access Control", "System", `Revoked access for ${email}`);
    }
  };

  return (
    <div>
      <div style={{marginBottom: 30, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <div>
            <h2>Administration</h2>
            <p style={{color: '#64748b', margin:0}}>Manage users and system roles.</p>
          </div>
          <div style={{display:'flex', gap: 10}}>
              <button onClick={() => setActiveTab("users")} style={{padding:'10px 20px', fontWeight: activeTab === 'users' ? 'bold' : 'normal', borderBottom: activeTab === 'users' ? '3px solid #2563eb' : '3px solid transparent', background:'transparent', border:'none', cursor:'pointer', color: activeTab === 'users' ? '#2563eb' : '#64748b'}}>Authorized Users</button>
              <button onClick={() => setActiveTab("roles")} style={{padding:'10px 20px', fontWeight: activeTab === 'roles' ? 'bold' : 'normal', borderBottom: activeTab === 'roles' ? '3px solid #2563eb' : '3px solid transparent', background:'transparent', border:'none', cursor:'pointer', color: activeTab === 'roles' ? '#2563eb' : '#64748b'}}>Role Definitions</button>
          </div>
      </div>
      
      {activeTab === "users" && (
          <div className="animate-fade">
              {canEditUsers && (
                  <form onSubmit={addUser} className="card" style={{ display: 'flex', gap: '10px', alignItems:'flex-end', background:'#f8fafc', border:'1px solid #e2e8f0' }}>
                    <div style={{flex: 2}}>
                        <label style={{fontSize:'12px', fontWeight:'bold', display:'block', marginBottom: 5}}>Google Email</label>
                        <input type="email" placeholder="employee@makeusa.us" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} required style={{ marginBottom: 0, width: '100%' }} />
                    </div>
                    <div style={{flex: 1}}>
                        <label style={{fontSize:'12px', fontWeight:'bold', display:'block', marginBottom: 5}}>Role</label>
                        <select value={newUserRole} onChange={e => setNewUserRole(e.target.value)} style={{ marginBottom: 0, width: '100%' }}>
                            {rolesList.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>
                    <button type="submit" className="primary" style={{ whiteSpace: 'nowrap', height: '42px' }}>+ Authorize User</button>
                  </form>
              )}

              <div className="card-grid" style={{marginTop: 30}}>
                {users.map(u => {
                    const isMe = u.email === currentUserEmail;
                    return (
                        <div key={u.email} className="card" style={{display: 'flex', flexDirection:'column', gap: 15, borderLeft: `5px solid #64748b`}}>
                            <div>
                                <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                                    <strong style={{fontSize: '1.1rem', wordBreak:'break-all'}}>{u.email}</strong>
                                    {isMe && <span style={{fontSize:'10px', background:'#0f172a', color:'white', padding:'2px 6px', borderRadius: 4}}>YOU</span>}
                                </div>
                            </div>
                            <div style={{display:'flex', gap: 10, alignItems:'center', justifyContent:'space-between'}}>
                                <select value={u.role} onChange={(e) => updateUserRole(u.email, e.target.value)} disabled={isMe || !canEditUsers} style={{fontWeight: 'bold', border: '1px solid #cbd5e1', fontSize: '12px', padding: '5px', borderRadius: '6px', cursor: (isMe || !canEditUsers) ? 'not-allowed' : 'pointer', width: 'auto', marginBottom: 0}}>
                                    {rolesList.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                                <button onClick={() => removeUser(u.email)} disabled={isMe || !canEditUsers} style={{background: 'transparent', color: (isMe||!canEditUsers) ? '#cbd5e1' : '#ef4444', border: 'none', fontSize: '18px', cursor: (isMe||!canEditUsers) ? 'not-allowed' : 'pointer', padding: '0 10px'}} title="Revoke Access">&times;</button>
                            </div>
                        </div>
                    )
                })}
              </div>
          </div>
      )}

      {activeTab === "roles" && (
          <div className="animate-fade">
              {canEditUsers ? <RoleManager /> : <p style={{padding:20}}>View Only Access to Roles.</p>}
          </div>
      )}
    </div>
  );
}