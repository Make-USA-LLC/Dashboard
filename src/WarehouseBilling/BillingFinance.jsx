import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase_config';
import { collection, query, where, getDocs, doc, serverTimestamp, writeBatch } from 'firebase/firestore';

const BillingFinance = ({ canEdit = true }) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [billingInvoice, setBillingInvoice] = useState('');

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

  const handleSelect = (id) => {
    if (!canEdit) return;
    if (selected.includes(id)) setSelected(selected.filter(s => s !== id));
    else setSelected([...selected, id]);
  };

  const handleSelectAll = () => {
    if (!canEdit) return;
    if (selected.length === entries.length) setSelected([]);
    else setSelected(entries.map(s => s.id));
  };

  const handleMarkBilled = async () => {
    if (!canEdit) return;
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

  const totalAmount = entries.reduce((sum, item) => sum + (item.totalAmount || 0), 0);

  if (loading) return <div>Loading Queue...</div>;

  return (
    <div>
      <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', borderLeft: `5px solid #10b981`, marginBottom: '20px', display: 'inline-block' }}>
        <div style={{ fontSize: '13px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Total Outstanding Revenue</div>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e293b', marginTop: '5px' }}>${totalAmount.toFixed(2)}</div>
      </div>

      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <div style={{ padding: '15px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, color: '#1e293b' }}>Ready to Bill</h3>
            
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input 
                    placeholder="Enter Invoice # (Required)" 
                    value={billingInvoice}
                    onChange={(e) => setBillingInvoice(e.target.value)}
                    style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', width: '220px', fontSize: '14px' }}
                    disabled={!canEdit}
                />
                <button 
                    onClick={handleMarkBilled} 
                    disabled={selected.length === 0 || !canEdit}
                    style={{ 
                        background: selected.length > 0 && canEdit ? '#10b981' : '#e2e8f0', 
                        color: selected.length > 0 && canEdit ? 'white' : '#94a3b8', 
                        border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', 
                        cursor: selected.length > 0 && canEdit ? 'pointer' : 'not-allowed'
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
                <th style={{ padding: '15px', width: '40px' }}><input type="checkbox" onChange={handleSelectAll} checked={entries.length > 0 && selected.length === entries.length} disabled={!canEdit} /></th>
                <th style={{ padding: '15px' }}>Date</th>
                <th style={{ padding: '15px' }}>Client</th>
                <th style={{ padding: '15px' }}>Labor Math</th>
                <th style={{ padding: '15px' }}>Description</th>
                <th style={{ padding: '15px' }}>Total Amount</th>
                </tr>
            </thead>
            <tbody>
                {entries.length === 0 ? (
                    <tr><td colSpan="6" style={{padding:'40px', textAlign:'center', color: '#94a3b8'}}>No unbilled entries.</td></tr>
                ) : entries.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9', background: selected.includes(s.id) ? '#f0fdf4' : 'white' }}>
                    <td style={{ padding: '15px' }}><input type="checkbox" checked={selected.includes(s.id)} onChange={() => handleSelect(s.id)} disabled={!canEdit} /></td>
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