import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { logAudit } from '../utils/logger'; // <--- IMPORT

export default function ChecklistSettings() {
  const [loading, setLoading] = useState(true);
  
  // The 4 Master Lists
  const [templates, setTemplates] = useState({
    salaryOnboarding: [],
    salaryOffboarding: [],
    hourlyOnboarding: [],
    hourlyOffboarding: []
  });

  // Load from Database
  useEffect(() => {
    const fetchTemplates = async () => {
      const docRef = doc(db, "settings", "checklists");
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        setTemplates(docSnap.data());
      } else {
        // Initialize Default Data if it doesn't exist
        const defaults = {
            salaryOnboarding: ["Signed Contract", "Setup Email", "Slack Invite"],
            salaryOffboarding: ["Exit Interview", "Revoke Email Access"],
            hourlyOnboarding: ["W4 Form", "Safety Briefing", "Uniform Issue"],
            hourlyOffboarding: ["Collect Uniform", "Final Timesheet Sign-off"]
        };
        await setDoc(docRef, defaults);
        setTemplates(defaults);
      }
      setLoading(false);
    };
    fetchTemplates();
  }, []);

  // Helper: Add Item
  const addItem = async (category, text) => {
    if (!text) return;
    const newList = [...(templates[category] || []), text];
    const newTemplates = { ...templates, [category]: newList };
    
    setTemplates(newTemplates);
   await updateDoc(doc(db, "settings", "checklists"), newTemplates);
    logAudit("Update Checklist", category, `Added item: ${text}`);
  };

  // Helper: Remove Item
  const removeItem = async (category, index) => {
    const newList = templates[category].filter((_, i) => i !== index);
    const newTemplates = { ...templates, [category]: newList };
    
    setTemplates(newTemplates);
    await updateDoc(doc(db, "settings", "checklists"), newTemplates);
    logAudit("Update Checklist", category, `Removed item index ${index}`);
  };

  // Sub-Component for a single list
  const ListEditor = ({ title, category, color }) => {
    const [input, setInput] = useState("");
    return (
      <div className="card" style={{ borderTop: `4px solid ${color}` }}>
        <h3>{title}</h3>
        <ul style={{ paddingLeft: 20, marginBottom: 15 }}>
          {(templates[category] || []).map((item, i) => (
            <li key={i} style={{ marginBottom: 5 }}>
              {item} 
              <button 
                className="text-only" 
                style={{ color: 'red', marginLeft: 10, cursor: 'pointer', border: 'none', background: 'none' }} 
                onClick={() => removeItem(category, i)}
              >
                (remove)
              </button>
            </li>
          ))}
        </ul>
        <div style={{ display: 'flex', gap: 5 }}>
            <input 
                placeholder="Add new task..." 
                value={input} 
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Enter') { addItem(category, input); setInput(""); }
                }}
            />
            <button className="primary" onClick={() => { addItem(category, input); setInput(""); }}>Add</button>
        </div>
      </div>
    );
  };

  if (loading) return <div style={{padding: 20}}>Loading Templates...</div>;

  return (
    <div>
      <h2>Checklist Templates</h2>
      <p style={{ color: '#64748b' }}>Edit the default lists for new employees.</p>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
        <ListEditor title="Salary Onboarding" category="salaryOnboarding" color="#3b82f6" />
        <ListEditor title="Salary Offboarding" category="salaryOffboarding" color="#ef4444" />
        <ListEditor title="Hourly Onboarding" category="hourlyOnboarding" color="#10b981" />
        <ListEditor title="Hourly Offboarding" category="hourlyOffboarding" color="#f59e0b" />
      </div>
    </div>
  );
}