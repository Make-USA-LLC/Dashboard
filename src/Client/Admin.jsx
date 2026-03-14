import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { collection, doc, onSnapshot, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { ShieldCheck, UserPlus, Trash2, Mail, ChevronLeft, Settings2, CheckSquare, Square, User, ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Admin() {
    const [activeTab, setActiveTab] = useState('users');
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    
    const [newEmail, setNewEmail] = useState('');
    const [selectedRole, setSelectedRole] = useState('');
    const [newRoleName, setNewRoleName] = useState('');
    
    const [rolePerms, setRolePerms] = useState({
        view_clients: true, edit_client_details: false, 
        manage_client_status: false, // <-- NEW PERMISSION
        view_w9: false, upload_w9: false, 
        view_legal: false, upload_legal: false, 
        view_samples: false, manage_samples: false, 
        manage_settings: false, manage_permissions: false
    });

    useEffect(() => {
        const unsubUsers = onSnapshot(collection(db, "client_access"), (s) => 
            setUsers(s.docs.map(d => ({ email: d.id, ...d.data() }))));
        const unsubRoles = onSnapshot(collection(db, "client_roles"), (s) => {
            const rList = s.docs.map(d => ({ name: d.id, ...d.data() }));
            setRoles(rList);
            if (rList.length > 0 && !selectedRole) setSelectedRole(rList[0].name);
        });
        return () => { unsubUsers(); unsubRoles(); };
    }, [selectedRole]);

    const handleCreateRole = async (e) => {
        e.preventDefault();
        if (!newRoleName) return;
        await setDoc(doc(db, "client_roles", newRoleName.trim()), rolePerms);
        setNewRoleName('');
        alert(`Role "${newRoleName}" created.`);
    };

    const handleAddUser = async (e) => {
        e.preventDefault();
        const email = newEmail.toLowerCase().trim();
        if (!email || !selectedRole) return;
        await setDoc(doc(db, "client_access", email), { email, role: selectedRole });
        setNewEmail('');
    };

    return (
        <div className="p-8 max-w-6xl mx-auto text-slate-800">
            <Link to="/clients" className="flex items-center gap-2 text-blue-600 font-bold mb-8 no-underline" style={{textDecoration:'none'}}>
                <ChevronLeft size={20} /> Dashboard
            </Link>

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
                <div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                        <ShieldCheck size={40} className="text-blue-600" /> Permissions
                    </h1>
                    <p className="text-slate-500 font-medium">Control custom roles and authorized users.</p>
                </div>
                <div className="flex bg-slate-100 p-1.5 rounded-2xl shadow-inner">
                    <button onClick={() => setActiveTab('users')} className={`px-8 py-2.5 rounded-xl font-bold transition-all ${activeTab === 'users' ? 'bg-white shadow-md text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>Authorized Users</button>
                    <button onClick={() => setActiveTab('roles')} className={`px-8 py-2.5 rounded-xl font-bold transition-all ${activeTab === 'roles' ? 'bg-white shadow-md text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>Role Builder</button>
                </div>
            </div>

            {activeTab === 'users' ? (
                <div className="space-y-8">
                    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                        <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-700"><UserPlus size={22}/> Add User to Module</h3>
                        <form onSubmit={handleAddUser} className="flex flex-col md:flex-row gap-4 items-center">
                            <div className="relative flex-1 w-full">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={20} />
                                <input required type="email" placeholder="email@makeit.buzz" value={newEmail} onChange={e => setNewEmail(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl shadow-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium" />
                            </div>
                            <div className="relative md:w-72 w-full">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={20} />
                                <select value={selectedRole} onChange={e => setSelectedRole(e.target.value)} className="w-full pl-11 pr-10 py-3 bg-white border border-slate-200 rounded-xl shadow-sm outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer font-bold text-slate-700">
                                    {roles.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
                                    {roles.length === 0 && <option disabled>Create a role first...</option>}
                                </select>
                                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
                            </div>
                            <button type="submit" className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all active:scale-95 whitespace-nowrap w-full md:w-auto">Grant Access</button>
                        </form>
                    </div>

                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50/50 border-b border-slate-100">
                                <tr>
                                    <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">User Identity</th>
                                    <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Assigned Role</th>
                                    <th className="px-8 py-5"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {users.map(u => (
                                    <tr key={u.email} className="hover:bg-slate-50/30 transition-colors">
                                        <td className="px-8 py-5 font-bold text-slate-700">{u.email}</td>
                                        <td className="px-8 py-5">
                                            <div className="relative inline-block min-w-[140px]">
                                                <select value={u.role} onChange={e => updateDoc(doc(db, "client_access", u.email), { role: e.target.value })} className="bg-blue-50 text-blue-700 text-xs font-black uppercase pl-3 pr-8 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-100 transition-colors appearance-none">
                                                    {roles.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
                                                </select>
                                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none" size={14} />
                                            </div>
                                        </td>
                                        <td className="px-8 py-5 text-right">
                                            <button onClick={() => deleteDoc(doc(db, "client_access", u.email))} className="text-slate-300 hover:text-red-500 p-2 transition-colors"><Trash2 size={20}/></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm h-fit sticky top-8">
                        <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-700"><Settings2 size={22}/> Build Custom Role</h3>
                        <div className="space-y-5">
                            <input placeholder="e.g. Logistics Admin" value={newRoleName} onChange={e => setNewRoleName(e.target.value)} className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
                            <div className="space-y-1 border-t border-slate-100 pt-4 max-h-[400px] overflow-y-auto">
                                {Object.keys(rolePerms).map(perm => (
                                    <div key={perm} onClick={() => setRolePerms(p => ({...p, [perm]: !p[perm]}))} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl cursor-pointer transition-all border border-transparent hover:border-slate-100">
                                        <span className="text-sm font-bold text-slate-600 capitalize">{perm.replace(/_/g, ' ')}</span>
                                        {rolePerms[perm] ? <CheckSquare size={20} className="text-blue-600"/> : <Square size={20} className="text-slate-300"/>}
                                    </div>
                                ))}
                            </div>
                            <button onClick={handleCreateRole} className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl hover:bg-black transition-all shadow-xl shadow-slate-200">Save Definition</button>
                        </div>
                    </div>
                    <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 h-fit">
                        {roles.map(role => (
                            <div key={role.name} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative group">
                                <button onClick={() => deleteDoc(doc(db, "client_roles", role.name))} className="absolute top-6 right-6 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={20}/></button>
                                <h4 className="font-black text-xl text-slate-900 mb-4">{role.name}</h4>
                                <div className="flex flex-wrap gap-2">
                                    {Object.keys(role).filter(k => role[k] === true && k !== 'name').map(k => (
                                        <span key={k} className="bg-slate-100 text-slate-500 text-[10px] font-black uppercase px-2 py-1.5 rounded-lg tracking-tighter">
                                            {k.replace('manage_', '⚒️ ').replace('view_', '👁️ ').replace('upload_', '⬆️ ').replace('edit_', '✏️ ')}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}