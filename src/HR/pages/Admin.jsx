import React, { useState, useEffect } from 'react';
import { collection, doc, setDoc, deleteDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { logAudit } from '../utils/logger'; 
import { useRole } from '../hooks/useRole';
import RoleManager from '../components/RoleManager'; 

export default function Admin() {
  const { checkAccess } = useRole();
  
  const [users, setUsers] = useState([]);
  const [rolesList, setRolesList] = useState(["Admin", "Employee", "Manager"]); // Default roles
  
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState("Employee"); 
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [activeTab, setActiveTab] = useState("users");

  useEffect(() => {
      if(auth.currentUser) setCurrentUserEmail(auth.currentUser.email);
  }, []);

  // Listen for Users
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "authorized_users"), (snap) => {
      setUsers(snap.docs.map(d => ({ email: d.id, ...d.data() })));
    });
    return () => unsubscribe();
  }, []);

  // Listen for Roles
  useEffect(() => {
      const unsubRoles = onSnapshot(collection(db, "roles"), (snap) => {
          const list = snap.docs.map(d => d.id);
          if (list.length > 0) {
              setRolesList(list);
              setNewUserRole(prev => list.includes(prev) ? prev : list[0]);
          }
      });
      return () => unsubRoles();
  }, []);

  const addUser = async (e) => {
    e.preventDefault();
    const email = newUserEmail.trim().toLowerCase();
    if(!email) return;

    try {
        await setDoc(doc(db, "authorized_users", email), { role: newUserRole });
        logAudit("Access Control", "System", `Granted ${newUserRole} access to ${email}`);
        setNewUserEmail("");
    } catch (e) {
        alert("Error: " + e.message);
    }
  };

  const updateUserRole = async (email, newRole) => {
      if (email === currentUserEmail) return alert("You cannot change your own role.");
      await updateDoc(doc(db, "authorized_users", email), { role: newRole });
  };

  const removeUser = async (email) => {
    if (email === currentUserEmail) return alert("You cannot revoke your own access.");
    if (confirm(`Revoke ALL access for ${email}?`)) {
      await deleteDoc(doc(db, "authorized_users", email));
    }
  };

  return (
    <div style={{ width: '100%', textAlign: 'left' }}>
      {/* HEADER */}
      <div style={{ marginBottom: 30, display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '15px' }}>
          <div>
            <h2 style={{margin:0, color: '#1e293b'}}>Administration</h2>
            <p style={{color: '#64748b', margin:0, fontSize: '14px'}}>Manage authorized users and permissions.</p>
          </div>
          <div style={{display:'flex', gap: 10}}>
              <button onClick={() => setActiveTab("users")} style={activeTab === 'users' ? activeTabStyle : tabStyle}>Users</button>
              <button onClick={() => setActiveTab("roles")} style={activeTab === 'roles' ? activeTabStyle : tabStyle}>Roles</button>
          </div>
      </div>
      
      {activeTab === "users" && (
          <div className="animate-fade">
              {/* ADD USER BAR - Using CSS Grid for perfect spacing */}
              <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '2fr 1fr auto', 
                  gap: '15px', 
                  alignItems: 'end', 
                  background: '#f8fafc', 
                  border: '1px solid #e2e8f0', 
                  padding: '20px', 
                  borderRadius: '8px',
                  marginBottom: '30px' 
              }}>
                <div>
                    <label style={{fontSize:'12px', fontWeight:'bold', display:'block', marginBottom: 5, color: '#475569'}}>User Email</label>
                    <input 
                        type="email" 
                        placeholder="new.user@makeusa.us" 
                        value={newUserEmail} 
                        onChange={e => setNewUserEmail(e.target.value)} 
                        style={inputStyle} 
                    />
                </div>
                <div>
                    <label style={{fontSize:'12px', fontWeight:'bold', display:'block', marginBottom: 5, color: '#475569'}}>Role</label>
                    <select 
                        value={newUserRole} 
                        onChange={e => setNewUserRole(e.target.value)} 
                        style={inputStyle}
                    >
                        {rolesList.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                </div>
                <button onClick={addUser} style={btnPrimary}>+ Add User</button>
              </div>

              {/* USER GRID */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                {users.map(u => {
                    const isMe = u.email === currentUserEmail;
                    return (
                        <div key={u.email} style={cardStyle}>
                            <div style={{marginBottom: '10px'}}>
                                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                    <strong style={{color: '#334155', fontSize: '14px'}}>{u.email}</strong>
                                    {isMe && <span style={badgeStyle}>YOU</span>}
                                </div>
                            </div>
                            <div style={{display:'flex', gap: '8px', alignItems:'center'}}>
                                <select 
                                    value={u.role} 
                                    onChange={(e) => updateUserRole(u.email, e.target.value)} 
                                    disabled={isMe} 
                                    style={{...inputStyle, flex: 1, cursor: isMe ? 'not-allowed' : 'pointer'}}
                                >
                                    {rolesList.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                                <button 
                                    onClick={() => removeUser(u.email)} 
                                    disabled={isMe} 
                                    style={{...btnDestructive, opacity: isMe ? 0.3 : 1, cursor: isMe ? 'not-allowed' : 'pointer'}}
                                >
                                    Revoke
                                </button>
                            </div>
                        </div>
                    )
                })}
              </div>
          </div>
      )}

      {activeTab === "roles" && (
          <div className="animate-fade">
              <RoleManager />
          </div>
      )}
    </div>
  );
}

// STYLES
const tabStyle = {
    padding:'8px 16px', background:'transparent', border:'none', cursor:'pointer', color: '#64748b', fontWeight: '500'
};
const activeTabStyle = {
    ...tabStyle, color: '#2563eb', background: '#eff6ff', borderRadius: '6px', fontWeight: 'bold'
};
const inputStyle = {
    width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', background: 'white'
};
const btnPrimary = {
    padding: '10px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', height: '42px'
};
const btnDestructive = {
    padding: '10px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', fontWeight: 'bold'
};
const cardStyle = {
    background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '15px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
};
const badgeStyle = {
    fontSize:'10px', background:'#0f172a', color:'white', padding:'2px 6px', borderRadius: '4px', fontWeight: 'bold'
};