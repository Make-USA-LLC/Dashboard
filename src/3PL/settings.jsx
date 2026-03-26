import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { doc, getDoc, setDoc, collection, onSnapshot, addDoc, deleteDoc } from 'firebase/firestore';
import { Save, Trash2, Plus } from 'lucide-react';
import { useRole } from '../hooks/useRole'; // <-- Imported useRole

const TPLSettings = () => {
  const { roleData } = useRole();
  const isMaster = roleData?.master === true;
  const myRoleName = roleData?.tpl;

  const [perms, setPerms] = useState({ edit_rates: false, manage_clients: false });

  const [rates, setRates] = useState({
    palletStorage: 45.00,
    firstItem: 3.95,
    additionalItem: 0.85,
    adminHour: 55.00,
    cancellation: 5.00
  });
  
  const [clients, setClients] = useState([]);
  const [newClient, setNewClient] = useState('');
  const [loading, setLoading] = useState(false);

  // 1. Fetch User Permissions natively inside the component
  useEffect(() => {
    if (isMaster) {
        setPerms({ edit_rates: true, manage_clients: true });
        return;
    }
    if (myRoleName) {
        getDoc(doc(db, "tpl_roles", myRoleName)).then(snap => {
            if (snap.exists()) {
                setPerms(snap.data());
            } else {
                // Legacy fallback
                setPerms({
                    edit_rates: myRoleName === 'Finance' || myRoleName === 'Admin',
                    manage_clients: myRoleName === 'Finance' || myRoleName === 'Admin'
                });
            }
        });
    }
  }, [isMaster, myRoleName]);

  // 2. Fetch Settings and Clients
  useEffect(() => {
    const fetchSettings = async () => {
      const snap = await getDoc(doc(db, "config", "tpl_billing"));
      if (snap.exists()) {
        setRates(snap.data());
      }
    };
    fetchSettings();

    const unsub = onSnapshot(collection(db, "tpl_clients"), (snap) => {
        setClients(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  const handleSaveRates = async () => {
    setLoading(true);
    try {
      await setDoc(doc(db, "config", "tpl_billing"), {
        palletStorage: parseFloat(rates.palletStorage),
        firstItem: parseFloat(rates.firstItem),
        additionalItem: parseFloat(rates.additionalItem),
        adminHour: parseFloat(rates.adminHour),
        cancellation: parseFloat(rates.cancellation)
      }, { merge: true });
      alert("Pricing Saved!");
    } catch (error) {
      alert("Error saving settings: " + error.message);
    }
    setLoading(false);
  };

  const handleAddClient = async () => {
      if(!newClient.trim()) return;
      try {
          await addDoc(collection(db, "tpl_clients"), { name: newClient.trim() });
          setNewClient('');
      } catch(e) { alert(e.message); }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        
        {perms.edit_rates ? (
            <div style={{ background: 'white', padding: '30px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', height: 'fit-content' }}>
                <h3 style={{ margin: '0 0 20px', color: '#1e293b' }}>3PL Pricing Tier</h3>
                
                <div style={{ marginBottom: '15px' }}>
                    <label style={lbl}>Shopify Processing + First Item ($/order)</label>
                    <input type="number" step="0.01" value={rates.firstItem} onChange={(e) => setRates({...rates, firstItem: e.target.value})} style={inp} />
                </div>

                <div style={{ marginBottom: '15px' }}>
                    <label style={lbl}>Additional Items in Box ($/item)</label>
                    <input type="number" step="0.01" value={rates.additionalItem} onChange={(e) => setRates({...rates, additionalItem: e.target.value})} style={inp} />
                </div>

                <div style={{ marginBottom: '15px' }}>
                    <label style={lbl}>Storage Rate ($/pallet/month)</label>
                    <input type="number" step="0.01" value={rates.palletStorage} onChange={(e) => setRates({...rates, palletStorage: e.target.value})} style={inp} />
                </div>

                <div style={{ marginBottom: '15px' }}>
                    <label style={lbl}>Admin Work ($/hour)</label>
                    <input type="number" step="0.01" value={rates.adminHour} onChange={(e) => setRates({...rates, adminHour: e.target.value})} style={inp} />
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <label style={lbl}>Order Cancellation ($/cancellation)</label>
                    <input type="number" step="0.01" value={rates.cancellation} onChange={(e) => setRates({...rates, cancellation: e.target.value})} style={inp} />
                </div>

                <button onClick={handleSaveRates} disabled={loading} style={{ width: '100%', padding: '12px', background: '#d97706', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '600', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                    <Save size={18} /> {loading ? 'Saving...' : 'Save Pricing'}
                </button>
            </div>
        ) : <div />}

        {perms.manage_clients ? (
            <div style={{ background: 'white', padding: '30px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', height: 'fit-content' }}>
                <h3 style={{ margin: '0 0 20px', color: '#1e293b' }}>Managed Clients</h3>
                <div style={{display: 'flex', gap: '10px', marginBottom: '20px'}}>
                    <input value={newClient} onChange={e=>setNewClient(e.target.value)} placeholder="New Client Name" style={inp} />
                    <button onClick={handleAddClient} style={{background: '#d97706', color: 'white', border: 'none', padding: '0 20px', borderRadius: '8px', cursor: 'pointer'}}><Plus size={20}/></button>
                </div>

                <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                    {clients.map(c => (
                        <div key={c.id} style={{display:'flex', justifyContent:'space-between', padding:'10px', background:'#f8fafc', borderRadius:'8px', border:'1px solid #e2e8f0'}}>
                            <strong>{c.name}</strong>
                            <button onClick={() => deleteDoc(doc(db, "tpl_clients", c.id))} style={{background:'none', border:'none', color:'#ef4444', cursor:'pointer'}}><Trash2 size={16}/></button>
                        </div>
                    ))}
                    {clients.length === 0 && <p style={{color: '#64748b', fontSize: '14px', textAlign: 'center'}}>No clients added yet.</p>}
                </div>
            </div>
        ) : <div />}
    </div>
  );
};

const lbl = { display: 'block', marginBottom: '8px', fontWeight: '600', color: '#475569', fontSize: '14px' };
const inp = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px' };

export default TPLSettings;