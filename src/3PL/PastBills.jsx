import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { collection, query, getDocs, orderBy, limit } from 'firebase/firestore';

const PastBills = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      // Pulling ALL entries (Unbilled and Billed), sorted by when they were entered
      const q = query(
          collection(db, "tpl_billing_history"), 
          orderBy("createdAt", "desc"),
          limit(200)
      );
      const snap = await getDocs(q);
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      // Fallback if the index hasn't built yet
      try {
         const q2 = query(collection(db, "tpl_billing_history"));
         const snap2 = await getDocs(q2);
         const all = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
         all.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
         setHistory(all.slice(0, 200));
      } catch (e2) { console.error(e2); }
    }
    setLoading(false);
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
                        <th style={{ padding: '15px', textAlign: 'right' }}>Qty</th>
                        <th style={{ padding: '15px', textAlign: 'right' }}>Total Price</th>
                        <th style={{ padding: '15px', textAlign: 'center' }}>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {history.length === 0 ? (
                        <tr><td colSpan="8" style={{padding:'40px', textAlign:'center', color: '#94a3b8'}}>No history found.</td></tr>
                    ) : history.map(h => {
                        // Format the timestamp if it exists
                        const enteredDateStr = h.createdAt 
                            ? new Date(h.createdAt.seconds * 1000).toLocaleDateString() 
                            : 'N/A';

                        return (
                            <tr key={h.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '15px', color: '#64748b', fontSize: '13px' }}>{enteredDateStr}</td>
                                <td style={{ padding: '15px', fontWeight: '500', color: '#0f172a' }}>{h.client}</td>
                                <td style={{ padding: '15px', color: '#475569' }}>{h.date}</td>
                                <td style={{ padding: '15px', fontWeight: '500' }}>{h.orderNumber || '-'}</td>
                                <td style={{ padding: '15px' }}>
                                    <span style={{ textTransform: 'capitalize', background: '#e0f2fe', color: '#0369a1', padding: '3px 8px', borderRadius: '4px', fontSize: '12px' }}>
                                        {h.serviceType}
                                    </span>
                                </td>
                                <td style={{ padding: '15px', textAlign: 'right' }}>{h.totalQuantity}</td>
                                <td style={{ padding: '15px', textAlign: 'right', color: '#059669', fontWeight: 'bold' }}>
                                    ${parseFloat(h.totalPrice || 0).toFixed(2)}
                                </td>
                                <td style={{ padding: '15px', textAlign: 'center' }}>
                                    <span style={{ 
                                        background: h.status === 'Billed' ? '#dcfce7' : '#fef9c3', 
                                        color: h.status === 'Billed' ? '#166534' : '#a16207', 
                                        padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' 
                                    }}>
                                        {h.status || 'Unbilled'}
                                    </span>
                                    {h.invoiceNumber && (
                                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                            Inv: {h.invoiceNumber}
                                        </div>
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