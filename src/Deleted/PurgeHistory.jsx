import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, doc, getDoc, setDoc, deleteDoc, query, where, orderBy } from 'firebase/firestore';
import { db, auth } from '../firebase_config';
import { History, ShieldCheck, UserPlus, ChevronDown, ChevronUp, Copy, Terminal } from 'lucide-react';
import Loader from '../components/Loader';

export default function PurgeHistory() {
    const [loading, setLoading] = useState(true);
    const [hasAccess, setHasAccess] = useState(false);
    const [logs, setLogs] = useState([]);
    const [accessList, setAccessList] = useState([]);
    const [newEmail, setNewEmail] = useState("");
    const [expandedLog, setExpandedLog] = useState(null);

    useEffect(() => {
        const unsubscribeAuth = auth.onAuthStateChanged((user) => {
            if (user) {
                checkPermissionsAndLoad(user.email.toLowerCase());
            } else {
                setLoading(false);
            }
        });
        return () => unsubscribeAuth();
    }, []);

    const checkPermissionsAndLoad = async (email) => {
        try {
            let permitted = false;
            if (email === 'daniel.s@makeit.buzz') {
                permitted = true;
            } else {
                const accessSnap = await getDoc(doc(db, "purge_history_access", email));
                if (accessSnap.exists()) permitted = true;
            }

            if (!permitted) {
                setHasAccess(false);
                setLoading(false);
                return;
            }

            setHasAccess(true);

            // Fetch from dedicated archives collection
            const q = query(
                collection(db, "purged_archives"), 
                where("action", "==", "Permanent Trash Purge"), 
                orderBy("timestamp", "desc")
            );

            onSnapshot(q, (snap) => {
                setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                setLoading(false);
            }, (error) => {
                console.error("Purge Archives Error (Index Required):", error);
                setLoading(false);
            });

            onSnapshot(collection(db, "purge_history_access"), (snap) => {
                setAccessList(snap.docs.map(d => d.id));
            });

        } catch (err) {
            console.error("Security Silo Error:", err);
            setLoading(false);
        }
    };

    const handleAddAccess = async () => {
        if (!newEmail.includes('@')) return;
        await setDoc(doc(db, "purge_history_access", newEmail.toLowerCase().trim()), {
            addedAt: new Date().toISOString()
        });
        setNewEmail("");
    };

    const handleRemoveAccess = async (email) => {
        if (email === 'daniel.s@makeit.buzz') return alert("Cannot remove owner.");
        if (window.confirm(`Revoke access for ${email}?`)) {
            await deleteDoc(doc(db, "purge_history_access", email));
        }
    };

    if (loading) return <div style={{height: '100vh', display: 'flex', alignItems: 'center'}}><Loader message="Decrypting Secure Silo..." /></div>;

    if (!hasAccess) {
        return (
            <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'system-ui' }}>
                <ShieldCheck size={48} color="#ef4444" style={{ marginBottom: '20px', display: 'inline-block' }} />
                <h2>Access Denied</h2>
                <p>You do not have explicit permission to view the Reconstruction Silo.</p>
                <Link to="/deleted" style={{ color: '#2563eb', fontWeight: 'bold' }}>Return to Trash</Link>
            </div>
        );
    }

    return (
        <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ marginBottom: '30px' }}>
                <Link to="/deleted" style={{ textDecoration: 'none', color: '#2563eb', fontWeight: 'bold' }}>&larr; Back to Trash Bin</Link>
                <h1 style={{ margin: '10px 0 0 0', display: 'flex', alignItems: 'center', gap: '12px', color: '#0f172a' }}>
                    <History size={32} /> Purge Audit & Reconstruction
                </h1>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '30px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {logs.map(log => (
                        <div key={log.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                            <div 
                                onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                                style={{ padding: '20px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: expandedLog === log.id ? '#f8fafc' : 'white' }}
                            >
                                <div>
                                    <div style={{ fontWeight: 'bold', color: '#1e293b' }}>{log.timestamp?.toDate().toLocaleString()}</div>
                                    <div style={{ fontSize: '13px', color: '#64748b' }}>Operator: <strong>{log.user}</strong></div>
                                </div>
                                {expandedLog === log.id ? <ChevronUp /> : <ChevronDown />}
                            </div>

                            {expandedLog === log.id && (
                                <div style={{ padding: '20px', borderTop: '1px solid #e2e8f0', background: '#fff' }}>
                                    <div style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
                                        {log.payload?.map((item, idx) => (
                                            <div key={idx} style={{ background: '#0f172a', borderRadius: '10px', padding: '15px', border: '1px solid #334155' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                                    <span style={{ color: '#38bdf8', fontWeight: 'bold' }}><Terminal size={14} style={{display:'inline', marginRight: 5}}/> {item.displayName}</span>
                                                    <span style={{ color: '#64748b', fontSize: '11px' }}>Collection: {item.collection}</span>
                                                </div>
                                                <pre style={{ margin: 0, color: '#94a3b8', fontSize: '12px', overflowX: 'auto', whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '6px' }}>
                                                    {JSON.stringify(item.data, null, 2)}
                                                </pre>
                                                <button 
                                                    onClick={() => { navigator.clipboard.writeText(JSON.stringify(item.data)); alert("JSON Payload Copied"); }}
                                                    style={{ marginTop: '12px', background: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                                                >
                                                    <Copy size={14} /> Copy for Reconstruction
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div style={{ background: '#f8fafc', padding: '25px', borderRadius: '16px', height: 'fit-content', border: '1px solid #e2e8f0' }}>
                    <h3 style={{ marginTop: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <ShieldCheck size={20} color="#10b981" /> Access Silo
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', margin: '20px 0' }}>
                        <div style={{ padding: '10px', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: '600' }}>
                            daniel.s@makeit.buzz (Owner)
                        </div>
                        {accessList.map(email => (
                            <div key={email} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', background: 'white', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                {email}
                                <button onClick={() => handleRemoveAccess(email)} style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}>×</button>
                            </div>
                        ))}
                    </div>

                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input 
                                type="email" 
                                value={newEmail}
                                onChange={e => setNewEmail(e.target.value)}
                                placeholder="Grant access..."
                                style={{ flex: 1, padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px' }}
                            />
                            <button onClick={handleAddAccess} style={{ background: '#0f172a', color: 'white', border: 'none', borderRadius: '8px', padding: '0 12px', cursor: 'pointer' }}>
                                <UserPlus size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
