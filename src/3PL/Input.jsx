import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase_config';
import { collection, addDoc, serverTimestamp, getDoc, doc, onSnapshot } from 'firebase/firestore';
import { Save, Link as LinkIcon } from 'lucide-react';
import { useRole } from '../hooks/useRole';
import { useSharePointExcel } from './useSharePointExcel';

const Input = ({ canEdit = true }) => {
  const [loading, setLoading] = useState(false);
  const [rates, setRates] = useState(null);
  const [clients, setClients] = useState([]);
  
  const { roleData } = useRole();
  const isAdmin = roleData?.tpl === 'Admin' || roleData?.master === true;
  
  // Extracting the new connect methods
  const { appendToExcelAndUpload, msalLoading, connectSharePoint, isConnected } = useSharePointExcel();

  const [formData, setFormData] = useState({
    client: '',
    serviceType: 'order', // order, admin, storage, cancellation
    date: new Date().toISOString().split('T')[0],
    orderNumber: '',
    site: 'Shopify',
    totalItems: 1, 
    adminHours: '',
    pallets: '',
    description: ''
  });

  useEffect(() => {
    getDoc(doc(db, "config", "tpl_billing")).then(snap => {
        if(snap.exists()) setRates(snap.data());
    });

    const unsub = onSnapshot(collection(db, "tpl_clients"), (snap) => {
        setClients(snap.docs.map(d => ({id: d.id, name: d.data().name})));
    });
    return () => unsub();
  }, []);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const calculateTotal = () => {
      if(!rates) return 0;
      
      if(formData.serviceType === 'order') {
          const items = Number(formData.totalItems);
          if (items <= 0) return 0;
          return rates.firstItem + ((items - 1) * rates.additionalItem);
      }
      
      if(formData.serviceType === 'admin') return Number(formData.adminHours) * rates.adminHour;
      if(formData.serviceType === 'storage') return Number(formData.pallets) * rates.palletStorage;
      if(formData.serviceType === 'cancellation') return rates.cancellation;
      return 0;
  };

  const calculateQuantity = () => {
      if(formData.serviceType === 'order') return Number(formData.totalItems);
      if(formData.serviceType === 'admin') return Number(formData.adminHours);
      if(formData.serviceType === 'storage') return Number(formData.pallets);
      if(formData.serviceType === 'cancellation') return 1;
      return 0;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canEdit) return alert("Read-Only Access: Cannot add entries.");
    if (!formData.client.trim()) return alert("Please select a client.");

    setLoading(true);
    const totalPrice = calculateTotal();
    const totalQuantity = calculateQuantity();

    try {
      // 1. Upload to SharePoint if it's an Order
      if(formData.serviceType === 'order') {
          await appendToExcelAndUpload(formData.client, {
              date: formData.date,
              site: formData.site,
              orderNumber: formData.orderNumber,
              totalQuantity: totalQuantity,
              totalPrice: totalPrice,
              description: formData.description || 'Fulfillment'
          });
      }

      // 2. Save to Firebase
      await addDoc(collection(db, "tpl_billing_history"), {
        ...formData,
        totalPrice,
        totalQuantity,
        status: 'Unbilled',
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser.email,
        createdByName: auth.currentUser.displayName || auth.currentUser.email
      });
      
      alert("Entry Processed & Added to Excel!");
      setFormData(p => ({
        ...p,
        orderNumber: '',
        totalItems: 1, 
        adminHours: '',
        pallets: '',
        description: ''
      }));
    } catch (error) {
      alert("Error processing entry: " + error.message);
    }
    setLoading(false);
  };

  if(!rates) return <div>Loading Rates...</div>;

  const currentTotal = calculateTotal();

  // Determine if the submit button should be disabled (preventing un-connected orders)
  const isSubmitDisabled = loading || msalLoading || (!isConnected && formData.serviceType === 'order');

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
      <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', background: '#fffbeb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, color: '#b45309' }}>New 3PL Service Log</h3>
          {isAdmin && <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Live Calc: <strong>${currentTotal.toFixed(2)}</strong></p>}
        </div>
      </div>

      {/* NEW CONNECTION BANNER */}
      {!isConnected && (
          <div style={{ margin: '20px', padding: '15px 20px', background: '#fee2e2', color: '#991b1b', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: '500' }}>You must connect to SharePoint to sync Order logs.</span>
              <button 
                  type="button" 
                  onClick={connectSharePoint} 
                  style={{ background: '#b91c1c', color: 'white', padding: '10px 15px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                  Connect SharePoint
              </button>
          </div>
      )}

      <form onSubmit={handleSubmit} style={{ padding: '30px', paddingTop: isConnected ? '30px' : '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        
        <div>
          <label style={labelStyle}>Client Name</label>
          <select required style={inputStyle} name="client" value={formData.client} onChange={handleChange}>
              <option value="">Select Client...</option>
              {clients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Date</label>
          <input required type="date" style={inputStyle} name="date" value={formData.date} onChange={handleChange} />
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Service Type</label>
            <div style={{display:'flex', gap:'10px'}}>
                {['order', 'admin', 'storage', 'cancellation'].map(type => (
                    <label key={type} style={{display:'flex', alignItems:'center', gap:'5px', cursor:'pointer', padding:'8px 12px', background: formData.serviceType===type ? '#fef3c7' : '#f8fafc', border: formData.serviceType===type ? '1px solid #d97706' : '1px solid #e2e8f0', borderRadius:'6px'}}>
                        <input type="radio" name="serviceType" value={type} checked={formData.serviceType === type} onChange={handleChange} style={{margin:0}}/>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                    </label>
                ))}
            </div>
        </div>

        {formData.serviceType === 'order' && (
            <>
                <div>
                    <label style={labelStyle}>Order Number</label>
                    <input required style={inputStyle} name="orderNumber" value={formData.orderNumber} onChange={handleChange} />
                </div>
                <div>
                    <label style={labelStyle}>Source Site</label>
                    <input style={inputStyle} name="site" value={formData.site} onChange={handleChange} placeholder="e.g. Shopify" />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>Total Items Processed</label>
                    <input required type="number" min="1" style={inputStyle} name="totalItems" value={formData.totalItems} onChange={handleChange} />
                    <p style={{ margin: '5px 0 0', fontSize: '12px', color: '#64748b' }}>
                        1st item billed at ${rates.firstItem.toFixed(2)}. Remaining {(Math.max(0, formData.totalItems - 1))} item(s) billed at ${rates.additionalItem.toFixed(2)} each.
                    </p>
                </div>
            </>
        )}

        {formData.serviceType === 'admin' && (
            <div>
                <label style={labelStyle}>Admin Hours Spent</label>
                <input required type="number" step="0.25" style={inputStyle} name="adminHours" value={formData.adminHours} onChange={handleChange} />
            </div>
        )}

        {formData.serviceType === 'storage' && (
            <div>
                <label style={labelStyle}>Number of Pallets</label>
                <input required type="number" step="0.5" style={inputStyle} name="pallets" value={formData.pallets} onChange={handleChange} />
            </div>
        )}

        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Details / Items Description</label>
          <input style={inputStyle} name="description" value={formData.description} onChange={handleChange} placeholder="e.g. Discovery Set + 2ml" />
        </div>

        {canEdit && (
            <div style={{ gridColumn: '1 / -1', paddingTop: '10px' }}>
               <button disabled={isSubmitDisabled} type="submit" style={{...btnStyle, background: isSubmitDisabled ? '#94a3b8' : '#d97706', cursor: isSubmitDisabled ? 'not-allowed' : 'pointer'}}>
                  {msalLoading ? <LinkIcon size={18} className="spin" /> : <Save size={18} />}
                  {loading || msalLoading ? 'Syncing to SharePoint...' : `Log $${currentTotal.toFixed(2)} Entry`}
               </button>
            </div>
        )}
      </form>
    </div>
  );
};

const labelStyle = { display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '14px', color: '#475569' };
const inputStyle = { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' };
const btnStyle = { width: '100%', padding: '12px', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' };

export default Input;