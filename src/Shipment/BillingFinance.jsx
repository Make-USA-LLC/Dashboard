import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase_config';
import { collection, query, where, getDocs, doc, serverTimestamp, writeBatch, updateDoc } from 'firebase/firestore';
import { Filter, XCircle, Check, X } from 'lucide-react';

const BillingFinance = () => {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  
  // Filter State
  const [vendorFilter, setVendorFilter] = useState('ALL');

  // Billing State
  const [billingInvoice, setBillingInvoice] = useState('');

  // Edit State
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    fetchUnbilled();
  }, []);

  const fetchUnbilled = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "shipments"), where("status", "==", "Unbilled"));
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // Hide Pending Vendor items from Finance View
      const readyToBill = data.filter(d => d.vendor && d.vendor.trim() !== "");
      
      readyToBill.sort((a,b) => new Date(b.date) - new Date(a.date));
      setShipments(readyToBill);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  // 1. FILTER LOGIC
  const getUniqueVendors = () => {
    const v = new Set(shipments.map(s => s.vendor));
    return Array.from(v).sort();
  };

  const filteredShipments = vendorFilter === 'ALL' 
    ? shipments 
    : shipments.filter(s => s.vendor === vendorFilter);

  // 2. SELECTION LOGIC
  const handleSelect = (id) => {
    if (selected.includes(id)) setSelected(selected.filter(s => s !== id));
    else setSelected([...selected, id]);
  };

  const handleSelectAll = () => {
    if (selected.length === filteredShipments.length) setSelected([]);
    else setSelected(filteredShipments.map(s => s.id));
  };

  const handleMarkBilled = async () => {
    if (selected.length === 0) return;
    
    // --- UPDATED: BLOCK IF NO INVOICE NUMBER ---
    if (!billingInvoice.trim()) {
        alert("You must enter a Billing Invoice # to proceed.");
        return;
    }

    if (!window.confirm(`Mark ${selected.length} items as BILLED under Invoice #${billingInvoice.trim()}?`)) return;

    try {
      const batch = writeBatch(db);
      selected.forEach(id => {
        const ref = doc(db, "shipments", id);
        batch.update(ref, {
          status: 'Billed',
          billedDate: serverTimestamp(),
          billedBy: auth.currentUser.email,
          billedMonth: new Date().toISOString().slice(0, 7),
          billingInvoiceNumber: billingInvoice.trim() // Save the input value
        });
      });
      await batch.commit();
      alert("Success!");
      setSelected([]);
      setBillingInvoice(''); // Clear input
      fetchUnbilled();
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  // 3. VENDOR EDIT LOGIC
  const startEdit = (shipment) => {
    setEditingId(shipment.id);
    setEditValue(shipment.vendor || '');
  };

  const saveVendor = async (id) => {
    if (!editValue.trim()) return alert("Vendor cannot be empty");
    try {
        await updateDoc(doc(db, "shipments", id), { vendor: editValue.trim() });
        setShipments(prev => prev.map(s => s.id === id ? { ...s, vendor: editValue.trim() } : s));
        setEditingId(null);
    } catch (e) {
        alert("Save failed: " + e.message);
    }
  };

  // 4. STATS
  const totalDuties = filteredShipments.reduce((sum, item) => sum + (item.dutiesAmount || 0), 0);
  const totalShipping = filteredShipments.reduce((sum, item) => sum + (item.shippingCost || 0), 0);
  const grandTotal = totalDuties + totalShipping;

  if (loading) return <div>Loading Queue...</div>;

  return (
    <div>
      {/* FILTER BAR */}
      <div style={{ marginBottom: '20px', display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', minWidth: '250px' }}>
            <Filter size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
            <select 
                value={vendorFilter} 
                onChange={(e) => { setVendorFilter(e.target.value); setSelected([]); }}
                style={{ width: '100%', padding: '10px 10px 10px 38px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', appearance: 'none', background: 'white', cursor: 'pointer' }}
            >
                <option value="ALL">Show All Vendors</option>
                {getUniqueVendors().map(v => (
                    <option key={v} value={v}>{v}</option>
                ))}
            </select>
        </div>
        {vendorFilter !== 'ALL' && (
            <button onClick={() => setVendorFilter('ALL')} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#fee2e2', color: '#ef4444', border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                <XCircle size={14} /> Clear Filter
            </button>
        )}
      </div>

      {/* STATS CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '25px' }}>
         <StatCard label={vendorFilter === 'ALL' ? "Total Pending Items" : `${vendorFilter} Items`} value={filteredShipments.length} color="#3b82f6" />
         <StatCard label="Duties Payable" value={`$${totalDuties.toFixed(2)}`} color="#f59e0b" />
         <StatCard label="Shipping Payable" value={`$${totalShipping.toFixed(2)}`} color="#10b981" />
         <StatCard label={vendorFilter === 'ALL' ? "Total Outstanding" : `${vendorFilter} Total`} value={`$${grandTotal.toFixed(2)}`} color="#6366f1" />
      </div>

      {/* TABLE */}
      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <div style={{ padding: '15px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, color: '#1e293b' }}>
                {vendorFilter === 'ALL' ? 'Billing Queue' : `Billing Queue: ${vendorFilter}`}
            </h3>
            
            {/* ACTION GROUP */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input 
                    placeholder="Enter Billing Invoice # (Required)" 
                    value={billingInvoice}
                    onChange={(e) => setBillingInvoice(e.target.value)}
                    style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', width: '220px', fontSize: '14px' }}
                />
                <button 
                    onClick={handleMarkBilled} 
                    disabled={selected.length === 0}
                    style={{ 
                        background: selected.length > 0 ? '#10b981' : '#e2e8f0', 
                        color: selected.length > 0 ? 'white' : '#94a3b8', 
                        border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: selected.length > 0 ? 'pointer' : 'not-allowed',
                        whiteSpace: 'nowrap'
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
                <th style={{ padding: '15px', width: '40px' }}><input type="checkbox" onChange={handleSelectAll} checked={filteredShipments.length > 0 && selected.length === filteredShipments.length} /></th>
                <th style={{ padding: '15px' }}>Date</th>
                <th style={{ padding: '15px' }}>Vendor</th>
                <th style={{ padding: '15px' }}>Reference</th>
                <th style={{ padding: '15px' }}>Duties</th>
                <th style={{ padding: '15px' }}>Shipping</th>
                <th style={{ padding: '15px' }}>Details</th>
                <th style={{ padding: '15px' }}>Entered By</th>
                </tr>
            </thead>
            <tbody>
                {filteredShipments.length === 0 ? (
                    <tr><td colSpan="8" style={{padding:'40px', textAlign:'center', color: '#94a3b8'}}>No items ready for billing.</td></tr>
                ) : filteredShipments.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9', background: selected.includes(s.id) ? '#f0fdf4' : 'white' }}>
                    <td style={{ padding: '15px' }}><input type="checkbox" checked={selected.includes(s.id)} onChange={() => handleSelect(s.id)} /></td>
                    <td style={{ padding: '15px' }}>{s.date}</td>
                    <td style={{ padding: '15px' }}>
                        {editingId === s.id ? (
                            <div style={{display:'flex', gap:'5px'}}>
                                <input autoFocus value={editValue} onChange={e=>setEditValue(e.target.value)} style={{width:'100px', padding:'4px', fontSize:'13px'}} />
                                <Check size={16} style={{cursor:'pointer', color:'green'}} onClick={()=>saveVendor(s.id)} />
                                <X size={16} style={{cursor:'pointer', color:'red'}} onClick={()=>setEditingId(null)} />
                            </div>
                        ) : (
                            <div onClick={() => startEdit(s)} style={{cursor:'pointer', fontWeight: '600', color: '#334155', display:'flex', alignItems:'center', gap:'5px'}}>
                                {s.vendor}
                            </div>
                        )}
                    </td>
                    <td style={{ padding: '15px' }}>
                        <div style={{fontWeight: '500'}}>{s.carrier}</div>
                        <div style={{fontSize:'12px', color:'#94a3b8'}}>{s.invoiceNumber || s.trackingNumber}</div>
                    </td>
                    <td style={{ padding: '15px', color: '#d97706', fontWeight: '600' }}>${(s.dutiesAmount || 0).toFixed(2)}</td>
                    <td style={{ padding: '15px', color: '#059669', fontWeight: '600' }}>${(s.shippingCost || 0).toFixed(2)}</td>
                    <td style={{ padding: '15px', fontSize:'12px', color:'#64748b' }}>{s.description}</td>
                    <td style={{ padding: '15px', fontSize:'12px', color:'#64748b' }}>{s.createdByName}</td>
                </tr>
                ))}
            </tbody>
            {/* FOOTER TOTALS */}
            {filteredShipments.length > 0 && (
                <tfoot>
                    <tr style={{ background: '#f1f5f9', fontWeight: 'bold', borderTop: '2px solid #cbd5e1' }}>
                        <td colSpan="4" style={{ padding: '15px', textAlign: 'right', color:'#1e293b' }}>
                            Totals {vendorFilter !== 'ALL' && `(${vendorFilter})`}:
                        </td>
                        <td style={{ padding: '15px', color: '#d97706' }}>${totalDuties.toFixed(2)}</td>
                        <td style={{ padding: '15px', color: '#059669' }}>${totalShipping.toFixed(2)}</td>
                        <td colSpan="2" style={{ padding: '15px', color: '#2563eb', fontSize: '15px' }}>
                            Grand Total: ${grandTotal.toFixed(2)}
                        </td>
                    </tr>
                </tfoot>
            )}
            </table>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ label, value, color }) => (
    <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', borderLeft: `5px solid ${color}` }}>
        <div style={{ fontSize: '13px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e293b', marginTop: '5px' }}>{value}</div>
    </div>
);

export default BillingFinance;