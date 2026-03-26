import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';

const PastBills = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const q = query(
          collection(db, "warehouse_billing"), 
          where("status", "==", "Billed"),
          orderBy("billedDate", "desc"),
          limit(100)
      );
      const snap = await getDocs(q);
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      // Fallback if index hasn't built yet
      try {
         const q2 = query(collection(db, "warehouse_billing"), where("status", "==", "Billed"));
         const snap2 = await getDocs(q2);
         const all = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
         all.sort((a,b) => (b.billedDate?.seconds || 0) - (a.billedDate?.seconds || 0));
         setHistory(all.slice(0, 100));
      } catch (e2) { console.error(e2); }
    }
    setLoading(false);
  };

  if (loading) return <div>Loading History...</div>;

  return (
    <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: 0, color: '#1e293b' }}>Warehouse Billing History</h3>
            <p style={{ margin: '5px 0 0', color: '#64748b', fontSize: '14px' }}>Showing last 100 billed transactions</p>
        </div>
        <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                        <th style={{ padding: '15px' }}>Billed Date</th>
                        <th style={{ padding: '15px' }}>Client</th>
                        <th style={{ padding: '15px' }}>Invoice</th>
                        <th style={{ padding: '15px' }}>Labor Math</th>
                        <th style={{ padding: '15px' }}>Total Billed</th>
                        <th style={{ padding: '15px' }}>Entered By</th>
                    </tr>
                </thead>
                <tbody>
                    {history.length === 0 ? (
                        <tr><td colSpan="6" style={{padding:'40px', textAlign:'center', color: '#94a3b8'}}>No history found.</td></tr>
                    ) : history.map(h => (
                        <tr key={h.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '15px' }}>{h.billedDate?.toDate().toLocaleDateString()}</td>
                            <td style={{ padding: '15px', fontWeight: '500' }}>{h.client}</td>
                            <td style={{ padding: '15px', fontWeight: '600', color: '#3b82f6' }}>{h.billingInvoiceNumber || '-'}</td>
                            <td style={{ padding: '15px', fontSize: '13px', color: '#64748b' }}>
                                {h.hoursSpent} hrs × {h.peopleCount} ppl <br/>
                                <span style={{ fontSize: '11px', color: '#94a3b8' }}>@ ${h.hourlyRate}/hr</span>
                            </td>
                            <td style={{ padding: '15px', color: '#059669', fontWeight: 'bold' }}>${(h.totalAmount || 0).toFixed(2)}</td>
                            <td style={{ padding: '15px', fontSize:'12px', color:'#64748b' }}>{h.createdByName}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
  );
};

export default PastBills;