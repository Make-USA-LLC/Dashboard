import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { collection, query, where, getDocs, updateDoc, doc, onSnapshot } from 'firebase/firestore';
import { CheckCircle, Search, DollarSign } from 'lucide-react';

const BillingFinance = ({ canBill }) => {
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    // Default to current month "YYYY-MM"
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Fetch available clients
    const unsub = onSnapshot(collection(db, "tpl_clients"), (snap) => {
        setClients(snap.docs.map(d => d.data().name));
    });
    return () => unsub();
  }, []);

  const handleSearch = async () => {
      if (!selectedClient) return alert("Please select a client.");
      if (!selectedMonth) return alert("Please select a month.");
      
      setLoading(true);
      try {
          const q = query(collection(db, "tpl_billing_history"), where("client", "==", selectedClient));
          const snap = await getDocs(q);
          
          // Filter dynamically by the user-inputted 'date' field checking if it starts with "YYYY-MM"
          const fetchedEntries = snap.docs
              .map(doc => ({ id: doc.id, ...doc.data() }))
              .filter(entry => entry.date && entry.date.startsWith(selectedMonth))
              .sort((a, b) => new Date(a.date) - new Date(b.date));

          setEntries(fetchedEntries);
      } catch (error) {
          alert("Error fetching billing: " + error.message);
      }
      setLoading(false);
  };

  const handleMarkBilled = async () => {
    if (!canBill) return alert("You do not have permission to execute billing.");
    
    const unbilledEntries = entries.filter(e => e.status !== 'Billed');
    if (unbilledEntries.length === 0) return alert("No unbilled entries found for this month.");

    if (!window.confirm(`Mark ${unbilledEntries.length} entries as Billed?`)) return;

    setLoading(true);
    try {
      const promises = unbilledEntries.map(entry => 
        updateDoc(doc(db, "tpl_billing_history", entry.id), { status: 'Billed' })
      );
      await Promise.all(promises);
      alert("Entries marked as Billed successfully!");
      handleSearch(); // Refresh list
    } catch (error) {
      alert("Error marking as billed: " + error.message);
    }
    setLoading(false);
  };

  // Calculations
  const totalAmount = entries.reduce((sum, e) => sum + (parseFloat(e.totalPrice) || 0), 0);
  const totalQty = entries.reduce((sum, e) => sum + (parseFloat(e.totalQuantity) || 0), 0);
  const unbilledCount = entries.filter(e => e.status !== 'Billed').length;

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        
        {/* FILTERS */}
        <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginBottom: '20px', display: 'flex', gap: '15px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#64748b', marginBottom: '6px' }}>Select Client</label>
                <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)} style={inpStyle}>
                    <option value="">-- Choose Client --</option>
                    {clients.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>
            
            <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#64748b', marginBottom: '6px' }}>Billing Month</label>
                <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={inpStyle} />
            </div>

            <button onClick={handleSearch} disabled={loading} style={{ background: '#0f172a', color: 'white', border: 'none', padding: '12px 25px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
                <Search size={18} /> {loading ? 'Searching...' : 'Pull Records'}
            </button>
        </div>

        {/* RESULTS */}
        {entries.length > 0 && (
            <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                <div style={{ padding: '20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h3 style={{ margin: 0, color: '#0f172a' }}>{selectedClient} - {selectedMonth}</h3>
                        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Processed <strong>{totalQty}</strong> items | Total Cost: <strong>${totalAmount.toFixed(2)}</strong></p>
                    </div>

                    {canBill && unbilledCount > 0 && (
                        <button onClick={handleMarkBilled} disabled={loading} style={{ background: '#16a34a', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
                            <CheckCircle size={18} /> Mark {unbilledCount} Unbilled as Complete
                        </button>
                    )}
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                        <thead style={{ background: '#f1f5f9' }}>
                            <tr>
                                <th style={thStyle}>Date</th>
                                <th style={thStyle}>Order #</th>
                                <th style={thStyle}>Service</th>
                                <th style={thStyle}>Details</th>
                                <th style={thStyle}>Qty</th>
                                <th style={thStyle}>Price</th>
                                <th style={thStyle}>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map(entry => (
                                <tr key={entry.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                    <td style={tdStyle}>{entry.date}</td>
                                    <td style={{...tdStyle, fontWeight: 'bold'}}>{entry.orderNumber || '-'}</td>
                                    <td style={tdStyle}><span style={{ textTransform: 'capitalize', background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>{entry.serviceType}</span></td>
                                    <td style={tdStyle}>{entry.description || '-'}</td>
                                    <td style={tdStyle}>{entry.totalQuantity}</td>
                                    <td style={{...tdStyle, color: '#16a34a', fontWeight: 'bold'}}>${parseFloat(entry.totalPrice).toFixed(2)}</td>
                                    <td style={tdStyle}>
                                        <span style={{ 
                                            background: entry.status === 'Billed' ? '#dcfce7' : '#fef9c3', 
                                            color: entry.status === 'Billed' ? '#166534' : '#a16207', 
                                            padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' 
                                        }}>
                                            {entry.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {entries.length === 0 && selectedClient && !loading && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                <DollarSign size={40} style={{ opacity: 0.2, marginBottom: '10px' }} />
                <h3>No records found</h3>
                <p>No billing entries found for {selectedClient} in {selectedMonth}.</p>
            </div>
        )}
    </div>
  );
};

const inpStyle = { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' };
const thStyle = { padding: '12px 15px', color: '#475569', fontWeight: '600' };
const tdStyle = { padding: '12px 15px', color: '#334155' };

export default BillingFinance;