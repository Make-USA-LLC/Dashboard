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
      // Trying to fetch last 100 billed items. 
      // Note: If an index error occurs, we fallback to client-side sort
      const q = query(
          collection(db, "shipments"), 
          where("status", "==", "Billed"),
          orderBy("billedDate", "desc"),
          limit(100)
      );
      const snap = await getDocs(q);
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.warn("Index missing, falling back to manual sort", err);
      try {
         const q2 = query(collection(db, "shipments"), where("status", "==", "Billed"));
         const snap2 = await getDocs(q2);
         const all = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
         // Manual sort
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
            <h3 style={{ margin: 0, color: '#1e293b' }}>Billing History</h3>
            <p style={{ margin: '5px 0 0', color: '#64748b', fontSize: '14px' }}>Showing last 100 billed transactions</p>
        </div>
        <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                        <th style={{ padding: '15px' }}>Billed Date</th>
                        <th style={{ padding: '15px' }}>Vendor</th>
                        <th style={{ padding: '15px' }}>Invoice</th>
                        <th style={{ padding: '15px' }}>Duties</th>
                        <th style={{ padding: '15px' }}>Shipping</th>
                        <th style={{ padding: '15px' }}>Billed By</th>
                    </tr>
                </thead>
                <tbody>
                    {history.map(h => (
                        <tr key={h.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '15px' }}>
                                {h.billedDate?.toDate().toLocaleDateString()}
                            </td>
                            <td style={{ padding: '15px', fontWeight: '500' }}>{h.vendor}</td>
                            <td style={{ padding: '15px' }}>{h.billingInvoiceNumber || '-'}</td>
                            <td style={{ padding: '15px' }}>${(h.dutiesAmount || 0).toFixed(2)}</td>
                            <td style={{ padding: '15px' }}>${(h.shippingCost || 0).toFixed(2)}</td>
                            <td style={{ padding: '15px', color: '#64748b' }}>{h.billedBy}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
  );
};

export default PastBills;