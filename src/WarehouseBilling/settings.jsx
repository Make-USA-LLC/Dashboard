import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Save } from 'lucide-react';

const WarehouseSettings = () => {
  const [rate, setRate] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      const snap = await getDoc(doc(db, "config", "warehouse_billing"));
      if (snap.exists()) {
        setRate(snap.data().hourlyRate || 0);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      await setDoc(doc(db, "config", "warehouse_billing"), {
        hourlyRate: parseFloat(rate)
      }, { merge: true });
      alert("Settings Saved!");
    } catch (error) {
      alert("Error saving settings: " + error.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', background: 'white', padding: '30px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
      <h3 style={{ margin: '0 0 20px', color: '#1e293b' }}>Warehouse Billing Settings</h3>
      
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#475569' }}>Global Hourly Charge Rate ($/hr)</label>
        <input 
          type="number" 
          step="0.01"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px' }}
        />
        <p style={{ fontSize: '13px', color: '#64748b', marginTop: '8px' }}>
          This rate will automatically be applied to new entries when calculating total billable amounts (Hours x People x Rate).
        </p>
      </div>

      <button 
        onClick={handleSave} 
        disabled={loading}
        style={{ width: '100%', padding: '12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '600', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
      >
        <Save size={18} /> {loading ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  );
};

export default WarehouseSettings;