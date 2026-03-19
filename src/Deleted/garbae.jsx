import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { db } from '../firebase_config';
import { useRole } from '../hooks/useRole';
import { Trash2, RefreshCcw, AlertTriangle, ShieldAlert } from 'lucide-react';
import Loader from '../components/loader';

export default function DeletedItems() {
    const navigate = useNavigate();
    const { user, checkAccess, access, loading: roleLoading } = useRole();
    
    const [loading, setLoading] = useState(true);
    const [trashItems, setTrashItems] = useState([]);
    
    const [hasAccess, setHasAccess] = useState(false);
    const [isMasterAdminLocal, setIsMasterAdminLocal] = useState(false);
    
    const [showEmptyModal, setShowEmptyModal] = useState(false);
    const [confirmChecks, setConfirmChecks] = useState([false, false, false, false, false]);
    const [typedConfirm, setTypedConfirm] = useState("");

    useEffect(() => {
        if (roleLoading) return;
        
        if (!user?.email) {
            navigate('/');
            return;
        }

        let unsub = () => {};

        const checkPermissionsAndLoad = async () => {
            try {
                const email = user.email.toLowerCase();
                let master = false;
                let granted = false;

                if (email === 'daniel.s@makeit.buzz') {
                    master = true;
                    granted = true;
                } else {
                    const masterSnap = await getDoc(doc(db, "master_admin_access", email));
                    if (masterSnap.exists()) {
                        master = true;
                        granted = true;
                    }
                }

                if (!granted) {
                    const binSnap = await getDoc(doc(db, "deleted_items_access", email));
                    if (binSnap.exists()) {
                        granted = true;
                    }
                }

                if (!granted) {
                    navigate('/');
                    return;
                }

                setIsMasterAdminLocal(master);
                setHasAccess(true);

                unsub = onSnapshot(collection(db, "trash_bin"), (snapshot) => {
                    const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                    items.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
                    setTrashItems(items);
                    setLoading(false);
                }, (error) => {
                    console.error("Firebase Listener Error:", error);
                    alert("Firebase denied access: " + error.message);
                    setLoading(false);
                });

            } catch (err) {
                console.error("Permission Check Failed:", err);
                alert("Failed to check permissions: " + err.message);
                setLoading(false);
            }
        };

        checkPermissionsAndLoad();

        return () => unsub();
    }, [user, roleLoading, navigate]);

    // --- RESTORE LOGIC ---
    const handleRestore = async (item) => {
        if (access?.readOnly === true) return alert("Read-Only Mode active. Cannot restore.");
        
        const hasRestorePerms = checkAccess(item.originalSystem, item.originalFeature, 'edit');
        if (!isMasterAdminLocal && !hasRestorePerms) {
            return alert(`You do not have edit permissions for the ${item.originalSystem} module to restore this item.`);
        }

        if (!window.confirm(`Restore "${item.displayName}" back to active data?`)) return;

        try {
            if (item.type === 'document') {
                await setDoc(doc(db, item.collection, item.originalId), item.data);
            } else if (item.type === 'array') {
                await updateDoc(doc(db, item.collection, item.docId), {
                    [item.arrayField]: arrayUnion(item.data)
                });
            }

            await deleteDoc(doc(db, "trash_bin", item.id));
            
        } catch (err) {
            console.error("Failed to restore item:", err);
            alert("Error restoring item. Check console.");
        }
    };

    // --- EMPTY TRASH LOGIC (MASTER ADMIN ONLY) ---
    const handleEmptyTrash = async () => {
        if (!isMasterAdminLocal) return;
        if (confirmChecks.includes(false) || typedConfirm !== "PERMANENTLY DELETE") {
            return alert("You must complete all confirmation steps.");
        }

        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const itemsToDelete = trashItems.filter(item => new Date(item.deletedAt) < ninetyDaysAgo);

        if (itemsToDelete.length === 0) {
            alert("There are no items older than 90 days in the trash.");
            setShowEmptyModal(false);
            return;
        }

        try {
            for (const item of itemsToDelete) {
                await deleteDoc(doc(db, "trash_bin", item.id));
            }
            alert(`Successfully purged ${itemsToDelete.length} items permanently.`);
            setShowEmptyModal(false);
            setConfirmChecks([false, false, false, false, false]);
            setTypedConfirm("");
        } catch (err) {
            alert("Error emptying trash.");
        }
    };

    if (roleLoading) return <div style={{height: '100vh', display: 'flex', alignItems: 'center'}}><Loader message="Waiting for User Roles..." /></div>;
    if (!hasAccess) return <div style={{height: '100vh', display: 'flex', alignItems: 'center'}}><Loader message="Verifying Permissions..." /></div>;
    if (loading) return <div style={{height: '100vh', display: 'flex', alignItems: 'center'}}><Loader message="Fetching Trash Data..." /></div>;

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const purgeableCount = trashItems.filter(item => new Date(item.deletedAt) < ninetyDaysAgo).length;

    const isPurgeDisabled = confirmChecks.includes(false) || typedConfirm !== "PERMANENTLY DELETE";

    return (
        <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                    <Link to="/" style={{ textDecoration: 'none', color: '#2563eb', fontWeight: 'bold' }}>&larr; Command Center</Link>
                    <h1 style={{ margin: '10px 0 0 0', display: 'flex', alignItems: 'center', gap: '10px', color: '#0f172a' }}>
                        <Trash2 size={28} /> Deleted Items
                    </h1>
                    <p style={{ margin: '5px 0 0 0', color: '#64748b' }}>Data stored here can be restored to its original module.</p>
                </div>
                
                {isMasterAdminLocal && (
                    <button 
                        onClick={() => setShowEmptyModal(true)}
                        style={{ 
                            background: purgeableCount > 0 ? '#ef4444' : '#f8fafc', 
                            color: purgeableCount > 0 ? 'white' : '#94a3b8', 
                            border: purgeableCount > 0 ? 'none' : '1px solid #cbd5e1', 
                            padding: '10px 20px', 
                            borderRadius: '8px', 
                            fontWeight: 'bold', 
                            cursor: purgeableCount > 0 ? 'pointer' : 'not-allowed', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px' 
                        }}
                        disabled={purgeableCount === 0}
                    >
                        <ShieldAlert size={18} /> Empty Trash (>90 Days)
                    </button>
                )}
            </div>

            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        <tr>
                            <th style={{ padding: '15px', color: '#475569', fontSize: '13px', textTransform: 'uppercase' }}>Item Name</th>
                            <th style={{ padding: '15px', color: '#475569', fontSize: '13px', textTransform: 'uppercase' }}>Original Module</th>
                            <th style={{ padding: '15px', color: '#475569', fontSize: '13px', textTransform: 'uppercase' }}>Deleted By</th>
                            <th style={{ padding: '15px', color: '#475569', fontSize: '13px', textTransform: 'uppercase' }}>Deleted Date</th>
                            <th style={{ padding: '15px', textAlign: 'right' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {trashItems.length === 0 && (
                            <tr><td colSpan="5" style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>Trash is empty.</td></tr>
                        )}
                        {trashItems.map(item => {
                            const canRestore = isMasterAdminLocal || checkAccess(item.originalSystem, item.originalFeature, 'edit');
                            const isOld = new Date(item.deletedAt) < ninetyDaysAgo;

                            return (
                                <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', background: isOld ? '#fff1f2' : 'white' }}>
                                    <td style={{ padding: '15px', fontWeight: 'bold', color: '#1e293b' }}>{item.displayName}</td>
                                    <td style={{ padding: '15px' }}>
                                        <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', textTransform: 'capitalize' }}>
                                            {item.originalSystem}
                                        </span>
                                    </td>
                                    <td style={{ padding: '15px', color: '#64748b', fontSize: '14px' }}>{item.deletedBy}</td>
                                    <td style={{ padding: '15px', color: '#64748b', fontSize: '14px' }}>
                                        {new Date(item.deletedAt).toLocaleDateString()}
                                        {isOld && <span style={{ color: '#ef4444', marginLeft: '8px', fontSize: '11px', fontWeight: 'bold' }}>&gt; 90 Days</span>}
                                    </td>
                                    <td style={{ padding: '15px', textAlign: 'right' }}>
                                        <button 
                                            onClick={() => handleRestore(item)}
                                            disabled={!canRestore || access?.readOnly === true}
                                            style={{ background: canRestore ? '#10b981' : '#f1f5f9', color: canRestore ? 'white' : '#94a3b8', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', cursor: canRestore ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                        >
                                            <RefreshCcw size={16} /> Restore
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* MASTER ADMIN PURGE CONFIRMATION MODAL */}
            {showEmptyModal && isMasterAdminLocal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: 'white', padding: '30px', borderRadius: '12px', maxWidth: '500px', width: '90%' }}>
                        <h2 style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '10px', marginTop: 0 }}>
                            <AlertTriangle /> Irrecoverable Data Purge
                        </h2>
                        <p style={{ color: '#334155', fontWeight: 'bold' }}>
                            You are about to permanently delete {purgeableCount} items that have been in the trash for over 90 days. This bypasses all safety nets.
                        </p>
                        
                        <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {[
                                "I understand that this action CANNOT be undone.",
                                "I understand that these items will be wiped from the Firebase database entirely.",
                                "I understand that no backups exist for purged data.",
                                "I confirm that I am authorized to destroy company data.",
                                "I take full responsibility for this data destruction."
                            ].map((text, i) => (
                                <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', fontSize: '14px', color: '#475569' }}>
                                    <input 
                                        type="checkbox" 
                                        checked={confirmChecks[i]} 
                                        onChange={(e) => {
                                            const newChecks = [...confirmChecks];
                                            newChecks[i] = e.target.checked;
                                            setConfirmChecks(newChecks);
                                        }} 
                                        style={{ marginTop: '3px' }}
                                    />
                                    {text}
                                </label>
                            ))}
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#64748b', marginBottom: '5px' }}>
                                Type "PERMANENTLY DELETE" to confirm:
                            </label>
                            <input 
                                type="text" 
                                value={typedConfirm} 
                                onChange={e => setTypedConfirm(e.target.value)}
                                placeholder="PERMANENTLY DELETE"
                                style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', boxSizing: 'border-box' }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={() => { setShowEmptyModal(false); setConfirmChecks([false,false,false,false,false]); setTypedConfirm(""); }} style={{ flex: 1, padding: '12px', background: '#e2e8f0', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Cancel</button>
                            
                            <button 
                                onClick={handleEmptyTrash} 
                                disabled={isPurgeDisabled}
                                style={{ 
                                    flex: 1, 
                                    padding: '12px', 
                                    background: isPurgeDisabled ? '#fca5a5' : '#ef4444', 
                                    color: 'white', 
                                    border: 'none', 
                                    borderRadius: '6px', 
                                    fontWeight: 'bold', 
                                    cursor: isPurgeDisabled ? 'not-allowed' : 'pointer' 
                                }}
                            >
                                Execute Purge
                            </button>

                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}  </div>
                </div>
            )}
        </div>
    );
}