import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase_config'; 
import { collection, query, getDocs, orderBy, limit, deleteDoc, doc, addDoc } from 'firebase/firestore'; 
import { useSharePointExcel } from './useSharePointExcel'; 

const PastBills = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const { removeRowFromExcelAndUpload } = useSharePointExcel();

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const q = query(
          collection(db, "tpl_billing_history"), 
          orderBy("createdAt", "desc"),
          limit(200)
      );
      const snap = await getDocs(q);
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      try {
         const q2 = query(collection(db, "tpl_billing_history"));
         const snap2 = await getDocs(q2);
         const all = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
         all.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
         setHistory(all.slice(0, 200));
      } catch (e2) { console.error("History fetch error:", e2); }
    }
    setLoading(false);
  };

  const formatItemDate = (item) => {
      if (item.createdAt && item.createdAt.seconds) {
          return new Date(item.createdAt.seconds * 1000).toLocaleDateString();
      }
      if (typeof item.createdAt === 'string') {
          return new Date(item.createdAt).toLocaleDateString();
      }
      if (item.date) {
          return item.date;
      }
      return 'N/A';
  };

  const handleVoid = async (item) => {
    if (item.status === 'Billed') {
        return alert("Cannot void an item that has already been Billed.\nPlease enter a new adjustment transaction to correct it.");
    }

    if (window.confirm(`VOID TRANSACTION?\n\nThis will permanently delete this entry from the database AND remove the row from the SharePoint Excel file.\n\nClient: ${item.client}\nOrder: ${item.orderNumber}\nAmount: $${item.totalPrice}`)) {
        setLoading(true);
        
        // --- ENTERPRISE FALLBACK LOGIC ---
        // Step 1: Attempt SharePoint (The fragile part)
        try {
            await removeRowFromExcelAndUpload(item.client, item);
        } catch (spError) {
            console.error("SharePoint Crash Caught:", spError);
            const forceProceed = window.confirm(
                `⚠️ SHAREPOINT ERROR\n\nThe Excel file is corrupted or missing, so the row could not be automatically deleted from Microsoft.\n\nError details: ${spError.message}\n\nDo you still want to force void this from your live Firebase database?`
            );
            if (!forceProceed) {
                setLoading(false);
                return; // User aborted
            }
        }
            
        // Step 2: The Core Database Actions (The reliable part)
        try {
            const safeData = JSON.parse(JSON.stringify(item));
            await addDoc(collection(db, "trash_bin"), {
                originalSystem: "3pl_billing",
                originalFeature: "master_entry_list",
                type: "voided_transaction", 
                collection: "tpl_billing_history",
                originalId: item.id,
                displayName: `VOIDED 3PL: ${item.client} - Order ${item.orderNumber || 'N/A'}`,
                data: safeData,
                deletedAt: new Date().toISOString(),
                deletedBy: auth?.currentUser?.email || "Unknown",
                restorable: false, 
                warning: "Cannot be restored. Must be manually re-entered to trigger SharePoint sync."
            });

            await deleteDoc(doc(db, "tpl_billing_history", item.id));

            setHistory(prev => prev.filter(h => h.id !== item.id));
            alert("Success: Database transaction voided safely.");
            
        } catch (error) {
            alert(`FATAL DATABASE ERROR:\n\n${error.message}`);
        }
        setLoading(false);
    }
  };

  if (loading) return <div style={{ padding: '20px', textAlign: 'center' }}>Loading 3PL Master Entry List...</div>;

  return (
    <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: 0, color: '#1e293b' }}>3PL Master Entry List</h3>
            <p style={{ margin: '5px 0 0', color: '#64748b', fontSize: '14px' }}>Showing the last 200 items entered into the system</p>
        </div>
        <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', textAlign: 'left' }}>
                <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#64748b' }}>
                        <th style={{ padding: '15px' }}>Entered On</th>
                        <th style={{ padding: '15px' }}>Client</th>
                        <th style={{ padding: '15px' }}>Service Date</th>
                        <th style={{ padding: '15px' }}>Order #</th>
                        <th style={{ padding: '15px' }}>Service</th>
                        <th style={{ padding: '15px' }}>Description</th>
                        <th style={{ padding: '15px', textAlign: 'right' }}>Qty</th>
                        <th style={{ padding: '15px', textAlign: 'right' }}>Total Price</th>
                        <th style={{ padding: '15px', textAlign: 'center' }}>Status / Action</th>
                    </tr>
                </thead>
                <tbody>
                    {history.length === 0 ? (
                        <tr><td colSpan="9" style={{padding:'40px', textAlign:'center', color: '#94a3b8'}}>No history found.</td></tr>
                    ) : history.map(h => {
                        return (
                            <tr key={h.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '15px', color: '#64748b', fontSize: '13px' }}>
                                    {formatItemDate(h)}
                                </td>
                                <td style={{ padding: '15px', fontWeight: '500', color: '#0f172a' }}>{h.client}</td>
                                <td style={{ padding: '15px', color: '#475569' }}>{h.date}</td>
                                <td style={{ padding: '15px', fontWeight: '500' }}>{h.orderNumber || '-'}</td>
                                <td style={{ padding: '15px' }}>
                                    <span style={{ textTransform: 'capitalize', background: '#e0f2fe', color: '#0369a1', padding: '3px 8px', borderRadius: '4px', fontSize: '12px' }}>
                                        {h.serviceType}
                                    </span>
                                </td>
                                <td style={{ padding: '15px', color: '#475569', fontSize: '13px', maxWidth: '200px' }}>
                                    {h.description || '-'}
                                </td>
                                <td style={{ padding: '15px', textAlign: 'right' }}>{h.totalQuantity}</td>
                                <td style={{ padding: '15px', textAlign: 'right', color: '#059669', fontWeight: 'bold' }}>
                                    ${parseFloat(h.totalPrice || 0).toFixed(2)}
                                </td>
                                <td style={{ padding: '15px', textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                                    
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <span style={{ 
                                            background: h.status === 'Billed' ? '#dcfce7' : '#fef9c3', 
                                            color: h.status === 'Billed' ? '#166534' : '#a16207', 
                                            padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' 
                                        }}>
                                            {h.status || 'Unbilled'}
                                        </span>
                                        {h.invoiceNumber && (
                                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', fontWeight: 'bold' }}>
                                                Inv: {h.invoiceNumber}
                                            </div>
                                        )}
                                    </div>

                                    {h.status !== 'Billed' && (
                                        <button 
                                            onClick={() => handleVoid(h)}
                                            title="Void and Delete Entry"
                                            style={{ 
                                                background: 'none', border: 'none', cursor: 'pointer', 
                                                fontSize: '16px', color: '#ef4444', padding: '4px', opacity: 0.8 
                                            }}
                                            onMouseOver={(e) => e.currentTarget.style.opacity = 1}
                                            onMouseOut={(e) => e.currentTarget.style.opacity = 0.8}
                                        >
                                            🗑️
                                        </button>
                                    )}

                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    </div>
  );
};

export default PastBills;