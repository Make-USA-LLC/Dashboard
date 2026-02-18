import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase_config';
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { Save, AlertCircle, Check } from 'lucide-react';

const ShipmentInput = () => {
  const [loading, setLoading] = useState(false);
  const [missingVendorItems, setMissingVendorItems] = useState([]);
  
  // Form State
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    carrier: 'UPS',
    trackingNumber: '',
    vendor: '',
    description: '',
    dutiesAmount: '',
    shippingCost: '',
    invoiceNumber: '',
    notes: ''
  });

  // Listen for items with missing vendors
  useEffect(() => {
    const q = query(collection(db, "shipments"), where("vendor", "==", ""));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort by newest first
      items.sort((a,b) => b.createdAt?.seconds - a.createdAt?.seconds);
      setMissingVendorItems(items);
    });
    return () => unsubscribe();
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await addDoc(collection(db, "shipments"), {
        ...formData,
        vendor: formData.vendor.trim(), // Ensure empty string if blank
        dutiesAmount: parseFloat(formData.dutiesAmount) || 0,
        shippingCost: parseFloat(formData.shippingCost) || 0,
        status: 'Unbilled',
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser.email,
        createdByName: auth.currentUser.displayName || auth.currentUser.email
      });
      
      alert("Shipment Added Successfully");
      setFormData(prev => ({
        ...prev,
        trackingNumber: '',
        vendor: '', // Reset vendor
        description: '',
        dutiesAmount: '',
        shippingCost: '',
        invoiceNumber: '',
        notes: ''
      }));
    } catch (error) {
      console.error("Error adding shipment:", error);
      alert("Error adding shipment: " + error.message);
    }
    setLoading(false);
  };

  // Helper component for the mini-cards
  const MissingVendorCard = ({ item }) => {
    const [localVendor, setLocalVendor] = useState('');
    
    const handleSave = async () => {
        if(!localVendor.trim()) return;
        try {
            await updateDoc(doc(db, "shipments", item.id), { vendor: localVendor.trim() });
        } catch(e) { alert("Error saving vendor: " + e.message); }
    };

    return (
        <div style={{ background: 'white', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{display:'flex', justifyContent:'space-between', fontSize:'12px', color:'#64748b'}}>
                <span>{item.date}</span>
                <span style={{fontWeight:'600'}}>{item.carrier}</span>
            </div>
            <div style={{fontWeight:'500', color:'#1e293b', fontSize:'14px'}}>
                {item.trackingNumber || 'No Tracking'}
            </div>
            <div style={{fontSize:'12px', color:'#475569', fontStyle:'italic'}}>
                {item.description || 'No description'}
            </div>
            <div style={{ marginTop: '5px', display: 'flex', gap: '5px' }}>
                <input 
                    placeholder="Assign Vendor..." 
                    value={localVendor}
                    onChange={(e) => setLocalVendor(e.target.value)}
                    style={{ flex: 1, padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize:'13px' }}
                />
                <button onClick={handleSave} disabled={!localVendor.trim()} style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', padding: '0 10px', cursor: 'pointer' }}>
                    <Check size={16} />
                </button>
            </div>
        </div>
    );
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      
      {/* MAIN INPUT FORM */}
      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', overflow: 'hidden', marginBottom: '30px' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <h3 style={{ margin: 0, color: '#1e293b' }}>New Shipment Entry</h3>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '30px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Vendor / Supplier <span style={{fontWeight:'400', color:'#94a3b8'}}>(Optional - leave blank to add below)</span></label>
            <input 
              style={inputStyle}
              name="vendor"
              value={formData.vendor}
              onChange={handleChange}
              placeholder="e.g. Uline"
            />
          </div>

          <div>
            <label style={labelStyle}>Date Received</label>
            <input required type="date" style={inputStyle} name="date" value={formData.date} onChange={handleChange} />
          </div>

          <div>
            <label style={labelStyle}>Carrier</label>
            <select style={inputStyle} name="carrier" value={formData.carrier} onChange={handleChange}>
              <option value="UPS">UPS</option>
              <option value="FedEx">FedEx</option>
              <option value="DHL">DHL</option>
              <option value="USPS">USPS</option>
              <option value="Freight">Freight / Other</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Tracking Number</label>
            <input style={inputStyle} name="trackingNumber" value={formData.trackingNumber} onChange={handleChange} placeholder="Tracking #" />
          </div>

          <div>
          </div>

          <div style={{ background: '#fffbeb', padding: '15px', borderRadius: '8px', border: '1px solid #fcd34d' }}>
            <label style={{...labelStyle, color: '#b45309'}}>Duties / Tax Amount ($)</label>
            <input type="number" step="0.01" style={{...inputStyle, borderColor: '#fcd34d'}} name="dutiesAmount" value={formData.dutiesAmount} onChange={handleChange} placeholder="0.00" />
          </div>

          <div style={{ background: '#fffbeb', padding: '15px', borderRadius: '8px', border: '1px solid #fcd34d' }}>
            <label style={{...labelStyle, color: '#b45309'}}>Shipping Cost ($)</label>
            <input type="number" step="0.01" style={{...inputStyle, borderColor: '#fcd34d'}} name="shippingCost" value={formData.shippingCost} onChange={handleChange} placeholder="0.00" />
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Description / Contents</label>
            <textarea rows="3" style={{...inputStyle, fontFamily: 'inherit'}} name="description" value={formData.description} onChange={handleChange} placeholder="Brief description of goods..." />
          </div>

          <div style={{ gridColumn: '1 / -1', paddingTop: '10px' }}>
             <button disabled={loading} type="submit" style={btnStyle}>
                <Save size={18} />
                {loading ? 'Saving...' : 'Save Shipment Record'}
             </button>
          </div>
        </form>
      </div>

      {/* PENDING VENDOR SECTION */}
      {missingVendorItems.length > 0 && (
        <div style={{ marginTop: '30px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                <AlertCircle size={20} color="#f59e0b" />
                <h3 style={{ margin: 0, color: '#475569' }}>Pending Vendor Assignment ({missingVendorItems.length})</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '15px' }}>
                {missingVendorItems.map(item => (
                    <MissingVendorCard key={item.id} item={item} />
                ))}
            </div>
        </div>
      )}

    </div>
  );
};

const labelStyle = { display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '14px', color: '#475569' };
const inputStyle = { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' };
const btnStyle = { 
  width: '100%', padding: '12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', 
  fontSize: '16px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
};

export default ShipmentInput;