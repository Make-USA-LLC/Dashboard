import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from './firebase_config';
import { collection, doc, setDoc, deleteDoc, onSnapshot, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { ArrowLeft, Trash2, Globe, Save, ExternalLink } from 'lucide-react';

const LinksManager = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [routes, setRoutes] = useState([]);
    const [input, setInput] = useState({ domain: '', path: '' });

    // --- 1. AUTH CHECK ---
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                if (user.email.toLowerCase() === 'daniel.s@makeit.buzz') {
                    initData();
                    return;
                }
                getDoc(doc(db, "master_admin_access", user.email.toLowerCase()))
                    .then(snap => {
                        if (snap.exists()) initData();
                        else navigate('/');
                    })
                    .catch(() => navigate('/'));
            } else {
                navigate('/');
            }
        });
        return () => unsubscribe();
    }, []);

    // --- 2. DATA LISTENER ---
    const initData = () => {
        onSnapshot(collection(db, "config_routing"), 
            (snapshot) => {
                setRoutes(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
                setLoading(false);
            },
            (error) => {
                console.error("Error fetching routes:", error);
                setLoading(false); 
            }
        );
    };

    // --- 3. ACTIONS ---
    const handleAdd = async () => {
        // Lowercase and remove protocols (http://) if pasted
        let sourceRaw = input.domain.toLowerCase().trim();
        sourceRaw = sourceRaw.replace(/^https?:\/\//, ''); // Remove http:// or https://
        
        const destination = input.path.trim();

        if (!sourceRaw || !destination) return alert("Please fill in both fields");

        try {
            // FIX: Encode the source to creating a valid ID even if it has slashes (makeusa.us/kiosk)
            const safeId = encodeURIComponent(sourceRaw);

            await setDoc(doc(db, "config_routing", safeId), {
                source: sourceRaw,
                destination: destination,
                createdAt: new Date()
            });
            setInput({ domain: '', path: '' });
        } catch (e) {
            alert("Error saving route: " + e.message);
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm(`Delete redirect?`)) {
            await deleteDoc(doc(db, "config_routing", id));
        }
    };

    if (loading) return <div style={{padding:'50px', textAlign:'center'}}>Loading Links Manager...</div>;

    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Segoe UI, sans-serif' }}>
            <div style={{ background: '#3b82f6', padding: '20px', color: 'white', display: 'flex', alignItems: 'center', gap: '15px' }}>
                <button onClick={() => navigate('/admin')} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '8px', borderRadius: '50%', cursor: 'pointer', display:'flex' }}>
                    <ArrowLeft size={20} />
                </button>
                <h2 style={{ margin: 0 }}>Domain & Link Manager</h2>
            </div>

            <div style={{ maxWidth: '800px', margin: '40px auto', padding: '0 20px' }}>
                
                {/* CREATE BOX */}
                <div style={{ background: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', marginBottom: '30px' }}>
                    <h3 style={{ margin: '0 0 15px 0', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Globe size={20} color="#3b82f6" />
                        Add New Redirect
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '15px' }}>
                        <div>
                            <label style={labelStyle}>Incoming Source</label>
                            <input 
                                placeholder="e.g. hr.makeusa.us OR makeusa.us/kiosk" 
                                value={input.domain}
                                onChange={e => setInput({...input, domain: e.target.value})}
                                style={inputStyle} 
                            />
                        </div>
                        <div>
                            <label style={labelStyle}>Destination Path</label>
                            <input 
                                placeholder="e.g. /hr/dashboard" 
                                value={input.path}
                                onChange={e => setInput({...input, path: e.target.value})}
                                style={inputStyle} 
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                            <button onClick={handleAdd} style={btnStyle}>
                                <Save size={18} /> Save
                            </button>
                        </div>
                    </div>
                    <p style={{fontSize:'13px', color:'#64748b', marginTop:'10px'}}>
                        * You can enter a domain (hr.mysite.com) OR a specific path (mysite.com/kiosk).
                    </p>
                </div>

                {/* LIST BOX */}
                <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                    <div style={{ padding: '15px 25px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', fontWeight: 'bold', color: '#475569' }}>
                        Active Redirects
                    </div>
                    {routes.length === 0 ? (
                        <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>No redirects configured.</div>
                    ) : (
                        routes.map(route => (
                            <div key={route.id} style={itemStyle}>
                                <div style={{flex: 1}}>
                                    <div style={{display:'flex', alignItems:'center', gap:'8px', color: '#0f172a', fontWeight:'600'}}>
                                        <ExternalLink size={14} color="#3b82f6"/> 
                                        {route.source}
                                    </div>
                                </div>
                                <div style={{flex: 1, color: '#64748b', fontFamily:'monospace', background:'#f8fafc', padding:'4px 8px', borderRadius:'4px', fontSize:'13px'}}>
                                    → {route.destination}
                                </div>
                                <button onClick={() => handleDelete(route.id)} style={deleteBtnStyle}>
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

// Styles
const labelStyle = { display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '5px', fontWeight: '600' };
const inputStyle = { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '15px' };
const btnStyle = { background: '#3b82f6', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', height: '42px' };
const itemStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 25px', borderBottom: '1px solid #f1f5f9', gap: '20px' };
const deleteBtnStyle = { background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '5px', display: 'flex', alignItems: 'center' };

export default LinksManager;