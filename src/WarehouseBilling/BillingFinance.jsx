import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase_config';
import { collection, query, where, getDocs, doc, serverTimestamp, writeBatch } from 'firebase/firestore';

const BillingFinance = ({ canBill = true }) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [billingInvoice, setBillingInvoice] = useState('');
  
  // NEW: Filter State
  const [clientFilter, setClientFilter] = useState('');

  useEffect(() => {
    fetchUnbilled();
  }, []);

  const fetchUnbilled = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "warehouse_billing"), where("status", "==", "Unbilled"));
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a,b) => new Date(b.date) - new Date(a.date));
      setEntries(data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  // Derive unique clients for the dropdown
  const uniqueClients = [...new Set(entries.map(e => e.client))].sort();

  // Filter the entries based on the dropdown selection
  const displayedEntries = clientFilter 
    ? entries.filter(e => e.client === clientFilter) 
    : entries;

  const handleSelect = (id) => {
    if (!canBill) return;
    if (selected.includes(id)) setSelected(selected.filter(s => s !== id));
    else setSelected([...selected, id]);
  };

  const handleSelectAll = () => {
    if (!canBill) return;
    // Only select ALL from the currently displayed/filtered list
    if (selected.length === displayedEntries.length) {
        setSelected([]);
    } else {
        setSelected(displayedEntries.map(s => s.id));
    }
  };

  const handleMarkBilled = async () => {
    if (!canBill) return;
    if (selected.length === 0) return;
    
    if (!billingInvoice.trim()) {
        return alert("You must enter a Billing Invoice # to proceed.");
    }

    if (!window.confirm(`Mark ${selected.length} items as BILLED under Invoice #${billingInvoice.trim()}?`)) return;

    try {
      const batch = writeBatch(db);
      selected.forEach(id => {
        const ref = doc(db, "warehouse_billing", id);
        batch.update(ref, {
          status: 'Billed',
          billedDate: serverTimestamp(),
          billedBy: auth.currentUser.email,
          billedByName: auth.currentUser.displayName || auth.currentUser.email,
          billingInvoiceNumber: billingInvoice.trim()
        });
      });
      await batch.commit();
      alert("Success!");
      setSelected([]);
      setBillingInvoice('');
      fetchUnbilled();
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  const globalTotalAmount = entries.reduce((sum, item) => sum + (item.totalAmount || 0), 0);
  
  // Calculate total ONLY for the items Finance has checkmarked
  const selectedTotalAmount = entries
    .filter(e => selected.includes(e.id))
    .reduce((sum, item) => sum + (item.totalAmount || 0), 0);

  if (loading) return <div style={{padding: '40px', color: '#64748b'}}>Loading Queue...</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
          <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', borderLeft: `5px solid #3b82f6`, minWidth: '200px' }}>
            <div style={{ fontSize: '13px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Global Unbilled Revenue</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e293b', marginTop: '5px' }}>${globalTotalAmount.toFixed(2)}</div>
          </div>

          <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', borderLeft: `5px solid #10b981`, minWidth: '200px', opacity: selectedTotalAmount > 0 ? 1 : 0.5 }}>
            <div style={{ fontSize: '13px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Invoice Total (Selected)</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981', marginTop: '5px' }}>${selectedTotalAmount.toFixed(2)}</div>
          </div>
      </div>

      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <div style={{ padding: '15px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <h3 style={{ margin: 0, color: '#1e293b' }}>Ready to Bill</h3>
                <select 
                    value={clientFilter}
                    onChange={(e) => {
                        setClientFilter(e.target.value);
                        setSelected([]); // Clear selections when changing filters to prevent cross-client billing by accident
                    }}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', cursor: 'pointer' }}
                >
                    <option value="">-- All Clients --</option>
                    {uniqueClients.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>
            
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input 
                    placeholder="Enter Invoice # (Required)" 
                    value={billingInvoice}
                    onChange={(e) => setBillingInvoice(e.target.value)}
                    style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', width: '220px', fontSize: '14px' }}
                    disabled={!canBill}
                />
                <button 
                    onClick={handleMarkBilled} 
                    disabled={selected.length === 0 || !canBill}
                    style={{ 
                        background: selected.length > 0 && canBill ? '#10b981' : '#e2e8f0', 
                        color: selected.length > 0 && canBill ? 'white' : '#94a3b8', 
                        border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', 
                        cursor: selected.length > 0 && canBill ? 'pointer' : 'not-allowed',
                        transition: 'background 0.2s'
                    }}
                >
                    Mark {selected.length} as Billed
                </button>
            </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                <th style={{ padding: '15px', width: '40px' }}>
                    <input 
                        type="checkbox" 
                        onChange={handleSelectAll} 
                        checked={displayedEntries.length > 0 && selected.length === displayedEntries.length} 
                        disabled={!canBill || displayedEntries.length === 0} 
                    />
                </th>
                <th style={{ padding: '15px' }}>Date</th>
                <th style={{ padding: '15px' }}>Client</th>
                <th style={{ padding: '15px' }}>Labor Math</th>
                <th style={{ padding: '15px' }}>Description</th>
                <th style={{ padding: '15px' }}>Total Amount</th>
                </tr>
            </thead>
            <tbody>
                {displayedEntries.length === 0 ? (
                    <tr><td colSpan="6" style={{padding:'40px', textAlign:'center', color: '#94a3b8'}}>No unbilled entries for this selection.</td></tr>
                ) : displayedEntries.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9', background: selected.includes(s.id) ? '#f0fdf4' : 'white' }}>
                    <td style={{ padding: '15px' }}>
                        <input 
                            type="checkbox" 
                            checked={selected.includes(s.id)} 
                            onChange={() => handleSelect(s.id)} 
                            disabled={!canBill} 
                        />
                    </td>
                    <td style={{ padding: '15px' }}>{s.date}</td>
                    <td style={{ padding: '15px', fontWeight: '600' }}>{s.client}</td>
                    <td style={{ padding: '15px', fontSize: '13px', color: '#64748b' }}>
                        {s.hoursSpent} hrs × {s.peopleCount} ppl <br/>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>@ ${s.hourlyRate}/hr</span>
                    </td>
                    <td style={{ padding: '15px', color: '#64748b', fontSize: '13px' }}>{s.description || '-'}</td>
                    <td style={{ padding: '15px', color: '#059669', fontWeight: '600' }}>${(s.totalAmount || 0).toFixed(2)}</td>
                </tr>
                ))}
            </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};

export default BillingFinance;