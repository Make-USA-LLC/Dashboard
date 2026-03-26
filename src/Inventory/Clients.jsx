import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { collection, onSnapshot, addDoc, deleteDoc, doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { Users, Plus, Trash2, Mail, ShieldAlert, Edit2, Save, X, Search } from 'lucide-react';

export default function Clients() {
    const [clients, setClients] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Modal & Form State
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null); 
    const [name, setName] = useState('');
    const [emailInput, setEmailInput] = useState('');
    const [stagedEmails, setStagedEmails] = useState([]);

    // Global CC State
    const [globalCc, setGlobalCc] = useState([]);
    const [ccInput, setCcInput] = useState('');

    useEffect(() => {
        const unsubClients = onSnapshot(collection(db, "inv_clients"), snap => {
            setClients(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const fetchGlobalCc = async () => {
            const snap = await getDoc(doc(db, "config", "inv_settings"));
            if (snap.exists() && snap.data().alwaysCc) {
                setGlobalCc(snap.data().alwaysCc);
            }
        };
        fetchGlobalCc();

        return () => unsubClients();
    }, []);

    // --- Modal & Client Form Logic ---
    const openNewClientModal = () => {
        setEditingId(null);
        setName('');
        setStagedEmails([]);
        setEmailInput('');
        setShowModal(true);
    };

    const handleEditClick = (client) => {
        setEditingId(client.id);
        setName(client.name);
        setStagedEmails(client.emails || []);
        setEmailInput('');
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingId(null);
        setName('');
        setStagedEmails([]);
        setEmailInput('');
    };

    const addStagedEmail = (e) => {
        e.preventDefault();
        if (emailInput && !stagedEmails.includes(emailInput)) {
            setStagedEmails([...stagedEmails, emailInput.toLowerCase()]);
            setEmailInput('');
        }
    };

    const removeStagedEmail = (emailToRemove) => {
        setStagedEmails(stagedEmails.filter(e => e !== emailToRemove));
    };

    const handleSaveClient = async () => {
        if (!name.trim()) return alert("Client name required.");
        if (stagedEmails.length === 0) return alert("Add at least one email for this client.");
        
        try {
            if (editingId) {
                await updateDoc(doc(db, "inv_clients", editingId), { name, emails: stagedEmails });
            } else {
                await addDoc(collection(db, "inv_clients"), { name, emails: stagedEmails });
            }
            closeModal();
        } catch (e) { alert(e.message); }
    };

    // --- Global CC Logic ---
    const handleAddGlobalCc = async (e) => {
        e.preventDefault();
        if (!ccInput) return;
        const newCcList = [...globalCc, ccInput.toLowerCase()];
        try {
            await setDoc(doc(db, "config", "inv_settings"), { alwaysCc: newCcList }, { merge: true });
            setGlobalCc(newCcList);
            setCcInput('');
        } catch (e) { alert(e.message); }
    };

    const removeGlobalCc = async (emailToRemove) => {
        const newCcList = globalCc.filter(e => e !== emailToRemove);
        try {
            await setDoc(doc(db, "config", "inv_settings"), { alwaysCc: newCcList }, { merge: true });
            setGlobalCc(newCcList);
        } catch (e) { alert(e.message); }
    };

    const filteredClients = clients.filter(c => 
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (c.emails && c.emails.some(e => e.toLowerCase().includes(searchTerm.toLowerCase())))
    );

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '30px' }}>
            
            {/* CLIENTS TABLE */}
            <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                
                {/* Action Bar */}
                <div style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', padding: '10px 15px', borderRadius: '8px', width: '350px' }}>
                        <Search size={18} color="#64748b" />
                        <input 
                            placeholder="Search..." 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{ border: 'none', background: 'transparent', outline: 'none', marginLeft: '10px', width: '100%', fontSize: '14px' }}
                        />
                    </div>
                    <button onClick={openNewClientModal} style={btnPrimary}><Plus size={18} /> New Client</button>
                </div>

                {/* Table */}
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr>
                                <th style={thStyle}>Name</th>
                                <th style={thStyle}>Main Email(s)</th>
                                <th style={thStyle}>More Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredClients.map(c => (
                                <tr key={c.id} style={{ borderBottom: '1px solid #e2e8f0', transition: 'background 0.2s' }} onMouseOver={e => e.currentTarget.style.background = '#f8fafc'} onMouseOut={e => e.currentTarget.style.background = 'white'}>
                                    <td style={{...tdStyle, fontWeight: 'bold'}}>{c.name}</td>
                                    <td style={tdStyle}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {c.emails?.map(e => (
                                                <div key={e} style={{display: 'flex', alignItems: 'center', gap: '6px', color: '#475569', fontSize: '14px'}}>
                                                    <Mail size={14} color="#94a3b8"/> {e}
                                                </div>
                                            ))}
                                        </div>
                                    </td>
                                    <td style={tdStyle}>
                                        <div style={{ display: 'flex', gap: '10px' }}>
                                            <button onClick={() => handleEditClick(c)} style={actionBtnBlue} title="Edit Client"><Edit2 size={16} /></button>
                                            <button onClick={() => deleteDoc(doc(db, "inv_clients", c.id))} style={actionBtnRed} title="Delete Client"><Trash2 size={16} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredClients.length === 0 && (
                                <tr>
                                    <td colSpan="3" style={{textAlign: 'center', padding: '40px', color: '#94a3b8'}}>No clients found matching your search.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* GLOBAL ALWAYS CC (Full Width) */}
            <div style={{ background: 'white', padding: '30px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}><ShieldAlert size={24} color="#ea580c" /><h2>Always CC (Internal)</h2></div>
                <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '20px' }}>These internal team members will automatically receive a CC copy of every Packing List and Receiving Report sent from the system.</p>
                
                <form onSubmit={handleAddGlobalCc} style={{ display: 'flex', gap: '10px', marginBottom: '20px', maxWidth: '500px' }}>
                    <input required type="email" placeholder="Internal Email Address" value={ccInput} onChange={e=>setCcInput(e.target.value)} style={inp} />
                    <button type="submit" style={{...btnPrimary, background: '#ea580c'}}><Plus size={18}/> Add to CC</button>
                </form>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {globalCc.map(email => (
                        <div key={email} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 15px', background: '#fffbeb', borderRadius: '8px', border: '1px solid #fde68a' }}>
                            <span style={{ color: '#92400e', fontWeight: '500' }}>{email}</span>
                            <Trash2 size={16} color="#ef4444" style={{cursor: 'pointer'}} onClick={() => removeGlobalCc(email)} />
                        </div>
                    ))}
                    {globalCc.length === 0 && <p style={{fontSize: '13px', color: '#94a3b8'}}>No internal CC emails configured.</p>}
                </div>
            </div>

            {/* ADD/EDIT CLIENT MODAL */}
            {showModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: 'white', padding: '30px', borderRadius: '12px', width: '500px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, color: '#0f172a' }}>{editingId ? 'Edit Client' : 'New Client'}</h3>
                            <button onClick={closeModal} style={{ background:'none', border:'none', color:'#64748b', cursor:'pointer' }}><X size={20}/></button>
                        </div>

                        <label style={lbl}>Client Name</label>
                        <input required placeholder="Company Name" value={name} onChange={e=>setName(e.target.value)} style={{...inp, marginBottom: '20px', width: '100%', boxSizing: 'border-box'}} />
                        
                        <label style={lbl}>Client Email(s) for Reports</label>
                        <form onSubmit={addStagedEmail} style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                            <input type="email" placeholder="Add Email Address" value={emailInput} onChange={e=>setEmailInput(e.target.value)} style={{...inp, flex: 1}} />
                            <button type="submit" style={btnPrimary}><Plus size={18}/> Add</button>
                        </form>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '25px', minHeight: '40px', padding: '10px', background: '#f8fafc', borderRadius: '6px', border: '1px dashed #cbd5e1' }}>
                            {stagedEmails.length === 0 && <span style={{color: '#94a3b8', fontSize: '13px'}}>No emails added yet.</span>}
                            {stagedEmails.map(email => (
                                <span key={email} style={{ background: '#dbeafe', color: '#1e40af', padding: '6px 10px', borderRadius: '6px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {email} <X size={14} style={{cursor: 'pointer'}} onClick={() => removeStagedEmail(email)} />
                                </span>
                            ))}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button onClick={closeModal} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', fontWeight: '500' }}>Cancel</button>
                            <button onClick={handleSaveClient} style={btnPrimary}>
                                <Save size={18}/> {editingId ? 'Save Changes' : 'Create Client'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}

// Styles matching the screenshot
const thStyle = { background: '#2563eb', color: 'white', padding: '15px 20px', fontWeight: '600', textTransform: 'uppercase', fontSize: '13px', letterSpacing: '0.5px' };
const tdStyle = { padding: '15px 20px', color: '#334155' };

const inp = { padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '14px' };
const lbl = { display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#64748b', marginBottom: '6px' };

const btnPrimary = { background: '#2563eb', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', fontSize: '14px' };
const actionBtnBlue = { background: '#2563eb', color: 'white', border: 'none', padding: '8px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const actionBtnRed = { background: '#ef4444', color: 'white', border: 'none', padding: '8px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };