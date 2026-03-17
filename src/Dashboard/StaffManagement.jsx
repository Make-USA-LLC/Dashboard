import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './StaffManagement.css';
import Loader from '../components/loader';
import { db } from './firebase_config.jsx';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { useRole } from './hooks/useRole'; // <-- Imported centralized hook

const StaffManagement = () => {
    const navigate = useNavigate();
    
    // --- 1. USE THE HOOK ---
    const { user, hasPerm, isReadOnly, loading: roleLoading } = useRole();
    const canView = hasPerm('workers', 'view') || hasPerm('admin', 'view') || isReadOnly;
    const canEdit = (hasPerm('workers', 'edit') || hasPerm('admin', 'edit')) && !isReadOnly;

    const [pageLoading, setPageLoading] = useState(true);
    const [workers, setWorkers] = useState([]);
    
    // Track local changes to emails before saving
    const [emailInputs, setEmailInputs] = useState({});
    
    // Status messages for individual rows
    const [statuses, setStatuses] = useState({});

    // --- 2. STREAMLINED INITIALIZATION ---
    useEffect(() => {
        if (roleLoading) return;

        if (!user || !canView) {
            navigate('/dashboard');
            return;
        }

        const initialize = async () => {
            await fetchWorkers();
            setPageLoading(false);
        };
        initialize();
    }, [user, canView, roleLoading, navigate]);

    const fetchWorkers = async () => {
        try {
            const snap = await getDocs(collection(db, "workers"));
            const list = [];
            const initialEmails = {};
            
            snap.forEach(d => {
                const data = d.data();
                list.push({ id: d.id, ...data });
                initialEmails[d.id] = data.email || ""; 
            });

            // Sort by Name
            list.sort((a,b) => {
                const nameA = a.name || a.firstName || '';
                const nameB = b.name || b.firstName || '';
                return nameA.localeCompare(nameB);
            });

            setWorkers(list);
            setEmailInputs(initialEmails);
        } catch(e) {
            console.error("Error loading workers:", e);
        }
    };

    const handleEmailChange = (id, val) => {
        if (!canEdit) return;
        setEmailInputs(prev => ({ ...prev, [id]: val }));
    };

    const handleSave = async (id) => {
        if (!canEdit) return alert("Read-Only Access");
        const email = emailInputs[id].trim().toLowerCase();
        
        setStatuses(prev => ({ ...prev, [id]: { msg: 'Saving...', type: 'normal' } }));

        try {
            await updateDoc(doc(db, "workers", id), { email: email });
            
            setStatuses(prev => ({ ...prev, [id]: { msg: 'Saved', type: 'success' } }));
            
            setTimeout(() => {
                setStatuses(prev => {
                    const newState = { ...prev };
                    delete newState[id];
                    return newState;
                });
            }, 2000);

        } catch(e) {
            console.error(e);
            setStatuses(prev => ({ ...prev, [id]: { msg: 'Error', type: 'error' } }));
        }
    };

    if (roleLoading || pageLoading) return <div style={{height: '100vh', display: 'flex', alignItems: 'center', background: '#f8fafc'}}><Loader message="Loading Staff..." /></div>;
    if (!canView) return null;

    return (
        <div className="sm-wrapper">
            <div className="sm-top-bar">
                <button onClick={() => navigate('/dashboard')} style={{background:'none', border:'none', fontSize:'16px', fontWeight:'bold', cursor:'pointer', display:'flex', alignItems:'center', gap:'5px', color:'#2c3e50'}}>
                    <span className="material-icons">arrow_back</span> Dashboard
                </button>
                <div style={{fontWeight:'bold', fontSize:'18px'}}>Staff Access Manager</div>
                <div /> 
            </div>

            <div className="sm-container">
                <div className="sm-card">
                    <h2 style={{marginTop:0}}>Pair Employees with Accounts</h2>
                    <p style={{color:'#666', fontSize:'14px', marginBottom:'20px'}}>
                        Enter the email address each employee uses to log in. <br/>
                        When they log into the portal with this email, they will automatically see their specific bonus data.
                    </p>

                    <table className="sm-table">
                        <thead>
                            <tr>
                                <th>Worker Name</th>
                                <th>Authorized Email (Login)</th>
                                <th style={{width:'150px'}}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {workers.length === 0 ? (
                                <tr><td colSpan="3" style={{textAlign:'center', padding:'20px', color:'#999'}}>No workers found.</td></tr>
                            ) : (
                                workers.map(w => {
                                    const name = w.name ? w.name : `${w.firstName || ''} ${w.lastName || ''}`;
                                    const status = statuses[w.id];

                                    return (
                                        <tr key={w.id}>
                                            <td>
                                                <div className="sm-worker-name">{name}</div>
                                                <div className="sm-worker-id">ID: {w.id}</div>
                                            </td>
                                            <td>
                                                <input 
                                                    type="email" 
                                                    className="sm-input" 
                                                    value={emailInputs[w.id] || ''} 
                                                    onChange={(e) => handleEmailChange(w.id, e.target.value)}
                                                    placeholder="employee@email.com"
                                                    disabled={!canEdit}
                                                />
                                            </td>
                                            <td>
                                                {canEdit && <button className="btn-save" onClick={() => handleSave(w.id)}>Save</button>}
                                                {status && (
                                                    <span className={`status-msg ${status.type === 'success' ? 'status-success' : status.type === 'error' ? 'status-error' : ''}`}>
                                                        {status.msg}
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default StaffManagement;