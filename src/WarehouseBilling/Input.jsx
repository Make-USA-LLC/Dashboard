import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase_config';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { Save } from 'lucide-react';

const Input = ({ canEdit = true }) => {
  const [loading, setLoading] = useState(false);
  const [hourlyRate, setHourlyRate] = useState(0);
  
  const [formData, setFormData] = useState({
    client: '',
    date: new Date().toISOString().split('T')[0],
    hoursSpent: '',
    peopleCount: '',
    description: ''
  });

  // Fetch the current hourly rate from settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      const snap = await getDoc(doc(db, "config", "warehouse_billing"));
      if (snap.exists()) setHourlyRate(snap.data().hourlyRate || 0);
    };
    fetchSettings();
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canEdit) return alert("Read-Only Access: Cannot add entries.");

    if (!formData.client.trim() || !formData.hoursSpent || !formData.peopleCount) {
        return alert("Please fill out Client, Hours, and People.");
    }

    setLoading(true);
    
    // Calculate total amount based on current settings rate
    const hrs = parseFloat(formData.hoursSpent) || 0;
    const ppl = parseFloat(formData.peopleCount) || 0;
    const totalAmount = hrs * ppl * hourlyRate;

    try {
      await addDoc(collection(db, "warehouse_billing"), {
        client: formData.client.trim(),
        date: formData.date,
        hoursSpent: hrs,
        peopleCount: ppl,
        description: formData.description,
        hourlyRate: hourlyRate, // Lock in the rate at time of creation
        totalAmount: totalAmount,
        status: 'Unbilled',
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser.email,
        createdByName: auth.currentUser.displayName || auth.currentUser.email
      });
      
      alert("Entry Added Successfully");
      setFormData({
        client: '',
        date: new Date().toISOString().split('T')[0],
        hoursSpent: '',
        peopleCount: '',
        description: ''
      });
    } catch (error) {
      alert("Error adding entry: " + error.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
      <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, color: '#1e293b' }}>New Warehouse Labor Entry</h3>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Current applied rate: <strong>${hourlyRate}/hr</strong></p>
        </div>
        {!canEdit && <span style={{fontSize:'12px', color:'#ef4444', fontWeight:'bold'}}>Read-Only</span>}
      </div>

      <form onSubmit={handleSubmit} style={{ padding: '30px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px', opacity: canEdit ? 1 : 0.7 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Client Name</label>
          <input required style={inputStyle} name="client" value={formData.client} onChange={handleChange} placeholder="e.g. Make USA" disabled={!canEdit} />
        </div>

        <div>
          <label style={labelStyle}>Date Performed</label>
          <input required type="date" style={inputStyle} name="date" value={formData.date} onChange={handleChange} disabled={!canEdit} />
        </div>

        <div style={{ visibility: 'hidden' }}>{/* Spacer for grid */}</div>

        <div>
          <label style={labelStyle}>Hours Spent</label>
          <input required type="number" step="0.25" style={inputStyle} name="hoursSpent" value={formData.hoursSpent} onChange={handleChange} placeholder="e.g. 2.5" disabled={!canEdit} />
        </div>

        <div>
          <label style={labelStyle}>Number of People</label>
          <input required type="number" style={inputStyle} name="peopleCount" value={formData.peopleCount} onChange={handleChange} placeholder="e.g. 3" disabled={!canEdit} />
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Description of Work (Optional)</label>
          <textarea rows="3" style={{...inputStyle, fontFamily: 'inherit'}} name="description" value={formData.description} onChange={handleChange} placeholder="Unloading container, sorting goods..." disabled={!canEdit} />
        </div>

        {canEdit && (
            <div style={{ gridColumn: '1 / -1', paddingTop: '10px' }}>
               <button disabled={loading} type="submit" style={btnStyle}>
                  <Save size={18} />
                  {loading ? 'Saving...' : 'Submit Entry'}
               </button>
            </div>
        )}
      </form>
    </div>
  );
};

const labelStyle = { display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '14px', color: '#475569' };
const inputStyle = { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' };
const btnStyle = { width: '100%', padding: '12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' };

export default Input;