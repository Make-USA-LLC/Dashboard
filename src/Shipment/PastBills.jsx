import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { FileText } from 'lucide-react';

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
         all.sort((a,b) => (b.billedDate?.seconds || 0) - (a.billedDate?.seconds || 0));
         setHistory(all.slice(0, 100));
      } catch (e2) { console.error(e2); }
    }
    setLoading(false);
  };

  const viewId = (id) => {
    window.prompt("Document ID (Copy to clipboard):", id);
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
                        <th style={{ padding: '15px', textAlign: 'center' }}>ID</th>
                    </tr>
                </thead>
                <tbody>
                    {history.map(h => (
                        <tr key={h.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '15px' }}>
                                {h.billedDate?.toDate().toLocaleDateString()}
                            </td>
                            <td style={{ padding: '15px', fontWeight: '500' }}>{h.vendor}</td>
                            <td style={{ padding: '15px', fontWeight: '600', color: '#3b82f6' }}>
                                {h.billingInvoiceNumber || '-'}
                            </td>
                            <td style={{ padding: '15px' }}>${(h.dutiesAmount || 0).toFixed(2)}</td>
                            <td style={{ padding: '15px' }}>${(h.shippingCost || 0).toFixed(2)}</td>
                            <td style={{ padding: '15px', color: '#64748b' }}>{h.billedBy}</td>
                            <td style={{ padding: '15px', textAlign: 'center' }}>
                                <button onClick={() => viewId(h.id)} style={{background:'none', border:'none', cursor:'pointer', color:'#94a3b8'}}>
                                    <FileText size={16} />
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
  );
};

export default PastBills;