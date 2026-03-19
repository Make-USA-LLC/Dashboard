import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc, arrayUnion, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase_config';
import { useRole } from '../hooks/useRole';
import { Trash2, RefreshCcw, AlertTriangle, ShieldAlert, History } from 'lucide-react';
import Loader from '../components/loader';

export default function DeletedItems() {
    const navigate = useNavigate();
    const { checkAccess, access, loading: roleLoading } = useRole();
    
    const [loading, setLoading] = useState(true);
    const [trashItems, setTrashItems] = useState([]);
    
    const [showEmptyModal, setShowEmptyModal] = useState(false);
    const [confirmChecks, setConfirmChecks] = useState([false, false, false, false]);
    const [typedConfirm, setTypedConfirm] = useState("");

    const isMasterAdminLocal = access?.master === true;
    const hasAccess = isMasterAdminLocal || checkAccess('admin', 'deleted_items', 'view');

    useEffect(() => {
        if (roleLoading) return;
        if (!hasAccess) {
            navigate('/');
            return;
        }

        const unsubTrash = onSnapshot(collection(db, "trash_bin"), (snapshot) => {
            const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            items.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
            setTrashItems(items);
            setLoading(false);
        }, (err) => {
            console.error("Trash Bin Error:", err);
            setLoading(false);
        });

        return () => unsubTrash();
    }, [roleLoading, hasAccess, navigate]);

    const handleRestore = async (item) => {
        if (access?.readOnly === true) return alert("Read-Only Mode active.");
        if (!isMasterAdminLocal && !checkAccess(item.originalSystem, item.originalFeature, 'edit')) {
            return alert("Missing permissions for original module.");
        }
        if (!window.confirm(`Restore "${item.displayName}"?`)) return;

        try {
            if (item.type === 'document') {
                await setDoc(doc(db, item.collection, item.originalId), item.data);
            } else if (item.type === 'array') {
                await updateDoc(doc(db, item.collection, item.docId), {
                    [item.arrayField]: arrayUnion(item.data)
                });
            }
            await deleteDoc(doc(db, "trash_bin", item.id));
        } catch (err) { console.error(err); }
    };

    const handleEmptyTrash = async () => {
        if (!isMasterAdminLocal) return;
        
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const itemsToDelete = trashItems.filter(item => new Date(item.deletedAt) < ninetyDaysAgo);

        if (itemsToDelete.length === 0) {
            alert("No items meet the 90-day requirement for permanent deletion.");
            return;
        }

        try {
            const archivedData = itemsToDelete.map(i => ({
                displayName: i.displayName,
                originalFeature: i.originalFeature,
                originalSystem: i.originalSystem,
                collection: i.collection,
                originalId: i.originalId,
                data: i.data 
            }));

            await addDoc(collection(db, "purged_archives"), {
                action: "Permanent Trash Purge",
                timestamp: serverTimestamp(),
                user: access?.email || "Master Admin",
                details: `Purged ${itemsToDelete.length} items.`,
                payload: archivedData 
            });

            for (const item of itemsToDelete) {
                await deleteDoc(doc(db, "trash_bin", item.id));
            }

            alert("Purge successfully completed and archived.");
            setShowEmptyModal(false);
            setConfirmChecks([false, false, false, false]);
            setTypedConfirm("");
        } catch (err) { 
            console.error("Purge Error:", err);
            alert("Error during purge: " + err.message); 
        }
    };

    if (roleLoading) return <div style={{height: '100vh', display: 'flex', alignItems: 'center'}}><Loader message="Syncing Roles..." /></div>;
    if (loading) return <div style={{height: '100vh', display: 'flex', alignItems: 'center'}}><Loader message="Loading Trash..." /></div>;

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const purgeableCount = trashItems.filter(item => new Date(item.deletedAt) < ninetyDaysAgo).length;
    const isPurgeDisabled = confirmChecks.includes(false) || typedConfirm !== "PERMANENTLY DELETE";

    return (
        <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
            {/* HEADER */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                    <Link to="/" style={{ textDecoration: 'none', color: '#2563eb', fontWeight: 'bold' }}>&larr; Command Center</Link>
                    <h1 style={{ margin: '10px 0 0 0', display: 'flex', alignItems: 'center', gap: '10px', color: '#0f172a' }}>
                        <Trash2 size={28} /> Deleted Items
                    </h1>
                </div>
                
                <div style={{ display: 'flex', gap: '12px' }}>
                    <Link to="/deleted/history" style={{ textDecoration: 'none', background: 'white', border: '1px solid #cbd5e1', padding: '10px 15px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', color: '#334155', fontSize: '14px', fontWeight: '600' }}>
                        <History size={18} /> Purge History
                    </Link>

                    {isMasterAdminLocal && (
                        <button 
                            onClick={() => setShowEmptyModal(true)}
                            style={{ 
                                background: purgeableCount > 0 ? '#ef4444' : '#f8fafc', 
                                color: purgeableCount > 0 ? 'white' : '#94a3b8', 
                                border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', 
                                cursor: purgeableCount > 0 ? 'pointer' : 'not-allowed'
                            }}
                            disabled={purgeableCount === 0}
                        >
                            Empty Trash (&gt; 90 Days)
                        </button>
                    )}
                </div>
            </div>

            {/* MAIN TABLE */}
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        <tr>
                            <th style={{ padding: '15px', fontSize: '13px', color: '#475569' }}>Item Name</th>
                            <th style={{ padding: '15px', fontSize: '13px', color: '#475569' }}>Module</th>
                            <th style={{ padding: '15px', fontSize: '13px', color: '#475569' }}>Deleted By</th>
                            <th style={{ padding: '15px', fontSize: '13px', color: '#475569' }}>Deleted Date</th>
                            <th style={{ padding: '15px' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {trashItems.length === 0 && <tr><td colSpan="5" style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>Trash is empty.</td></tr>}
                        {trashItems.map(item => {
                            const isOld = new Date(item.deletedAt) < ninetyDaysAgo;
                            return (
                                <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', background: isOld ? '#fff1f2' : 'white' }}>
                                    <td style={{ padding: '15px', fontWeight: 'bold' }}>{item.displayName}</td>
                                    <td style={{ padding: '15px' }}>
                                        <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                                            {item.originalFeature?.replace('_', ' ') || "System"}
                                        </span>
                                    </td>
                                    <td style={{ padding: '15px', color: '#64748b', fontSize: '14px' }}>{item.deletedBy}</td>
                                    <td style={{ padding: '15px', color: '#64748b', fontSize: '14px' }}>
                                        {new Date(item.deletedAt).toLocaleDateString()}
                                        {isOld && <span style={{ color: '#ef4444', marginLeft: '8px', fontWeight: 'bold' }}>! Purgeable</span>}
                                    </td>
                                    <td style={{ padding: '15px', textAlign: 'right' }}>
                                        <button onClick={() => handleRestore(item)} style={{ background: '#10b981', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                            <RefreshCcw size={16} /> Restore
                                        </button>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {/* SLIMMED CONFIRMATION MODAL */}
            {showEmptyModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '15px' }}>
                    <div style={{ background: 'white', padding: '25px', borderRadius: '12px', maxWidth: '480px', width: '100%', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                        <div style={{ textAlign: 'center', marginBottom: '15px' }}>
                            <div style={{ background: '#fee2e2', width: '45px', height: '45px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                                <AlertTriangle size={24} color="#ef4444" />
                            </div>
                            <h2 style={{ color: '#1e293b', margin: 0, fontSize: '20px' }}>Permanent Data Purge</h2>
                            <p style={{ color: '#64748b', marginTop: '6px', fontSize: '14px' }}>You are about to permenantly delete <strong>{purgeableCount} item(s)</strong> that have been in the trash for over 90 days.  This bypasses all safety nets.</p>
                        </div>
                        
                        <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '15px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left' }}>
                                {[
                                    "I UNDERSTAND THAT THIS ACTION CANNOT BE UNDONE.",
                                    "I UNDERSTAND THAT THESE ITEMS WILL BE WIPED FROM THE SERVER ENTIRELY AND PERMENANTLY.",
                                    "I CONFIRM THAT I AM AUTHORIZED TO DELETE COMPANY DATA.",
				    "I CONFIRM THAT NO BACKUP EXISTS FOR PURGED DATA.",
                                    "I TAKE FULL RESPONSIBILITY FOR THIS DATA DESTRUCTION."
                                ].map((text, i) => (
                                    <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', color: '#334155' }}>
                                        <input 
                                            type="checkbox" 
                                            checked={confirmChecks[i]} 
                                            onChange={(e) => {
                                                const nc = [...confirmChecks];
                                                nc[i] = e.target.checked;
                                                setConfirmChecks(nc);
                                            }} 
                                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                        />
                                        {text}
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#64748b', marginBottom: '5px', textAlign: 'center' }}>
                                TYPE "PERMANENTLY DELETE" TO CONFIRM:
                            </label>
                            <input 
                                type="text" 
                                value={typedConfirm} 
                                onChange={e => setTypedConfirm(e.target.value)}
                                placeholder="PERMANENTLY DELETE"
                                style={{ width: '100%', padding: '10px', border: '2px solid #e2e8f0', borderRadius: '8px', textAlign: 'center', fontSize: '14px', fontWeight: 'bold', outline: 'none' }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button 
                                onClick={() => { setShowEmptyModal(false); setConfirmChecks([false,false,false,false]); setTypedConfirm(""); }} 
                                style={{ flex: 1, padding: '10px', background: '#f1f5f9', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', color: '#475569', fontSize: '14px' }}
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleEmptyTrash} 
                                disabled={isPurgeDisabled}
                                style={{ 
                                    flex: 1.5, padding: '10px', 
                                    background: isPurgeDisabled ? '#fca5a5' : '#ef4444', 
                                    color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', 
                                    cursor: isPurgeDisabled ? 'not-allowed' : 'pointer', fontSize: '14px'
                                }}
                            >
                                Execute Purge ({purgeableCount})
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}