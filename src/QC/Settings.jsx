import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const styles = {
    card: { background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', marginBottom: '20px' },
    input: { padding: '8px', marginRight: '10px', border: '1px solid #ccc', borderRadius: '4px', flex: 1 },
    numberInput: { padding: '8px', border: '1px solid #ccc', borderRadius: '4px', width: '60px', textAlign: 'center' },
    btnPrimary: { padding: '8px 15px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' },
    btnDanger: { padding: '5px 10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' },
    btnSuccess: { padding: '10px 20px', background: '#10b981', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', width: '100%', marginTop: '20px' },
    list: { listStyle: 'none', padding: 0 },
    categoryBox: { border: '1px solid #e2e8f0', padding: '15px', borderRadius: '5px', marginBottom: '15px', background: '#f8fafc' }
};

// Default array now includes minScore and maxScore for each category
const defaultAuditData = [
    { name: "General cleanliness", minScore: 0, maxScore: 4, questions: ["All required PPE is used and accessible.", "The production floor is clean & organized.", "Surfaces and conveyor belts are clean.", "Trash bins are emptied.", "Cleaning equipment is stored properly."] },
    { name: "Machinery", minScore: 0, maxScore: 4, questions: ["Only required tools are in work area.", "Locations for tools are clearly marked.", "Machine books are updated.", "Infrequently used items stored properly.", "No broken equipment laying around."] },
    { name: "Efficiency", minScore: 0, maxScore: 4, questions: ["Movement of components minimized.", "Frequently used items within reach.", "No bottle necks.", "Pallets are accessible.", "Employees positioned comfortably."] },
    { name: "Quality control", minScore: 0, maxScore: 4, questions: ["Prior job components removed.", "Work order/quality standard visible.", "QC forms filled continuously."] },
    { name: "Warehouse", minScore: 0, maxScore: 4, questions: ["No food/drink on pallets.", "Unused pallets wrapped.", "No broken pallets visible.", "Pallets by dumpster tidy.", "Finished pallets removed timely."] },
    { name: "Sustain", minScore: 0, maxScore: 4, questions: ["Owners assigned to last 5s audit.", "Results of previous audit posted.", "Repeated issues from last week addressed."] }
];

const Settings = () => {
    const [owners, setOwners] = useState([]);
    const [newName, setNewName] = useState('');
    const [newEmail, setNewEmail] = useState('');
    
    const [categories, setCategories] = useState([]);
    const [alertThreshold, setAlertThreshold] = useState(3);
    const [isSaving, setIsSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const ownersSnap = await getDoc(doc(db, "qc_settings", "owners"));
                if (ownersSnap.exists()) setOwners(ownersSnap.data().list || []);

                const configSnap = await getDoc(doc(db, "qc_settings", "five_s_config"));
                if (configSnap.exists() && configSnap.data().categories) {
                    setCategories(configSnap.data().categories);
                    setAlertThreshold(configSnap.data().alertThreshold || 3);
                } else {
                    setCategories(defaultAuditData);
                }
            } catch (err) {
                console.error(err);
                setErrorMsg("Could not load from database. Loading defaults.");
                setCategories(defaultAuditData);
            }
        };
        fetchSettings();
    }, []);

    // ... (Owner Management functions stay exactly the same: addOwner, removeOwner) ...
    const addOwner = async () => {
        if (!newName || !newEmail) return;
        const updatedList = [...owners, { name: newName, email: newEmail }];
        try {
            await setDoc(doc(db, "qc_settings", "owners"), { list: updatedList });
            setOwners(updatedList);
            setNewName('');
            setNewEmail('');
        } catch (e) { alert("Permission Denied."); }
    };

    const removeOwner = async (index) => {
        if (!window.confirm("Remove this owner?")) return;
        const updatedList = owners.filter((_, i) => i !== index);
        try {
            await setDoc(doc(db, "qc_settings", "owners"), { list: updatedList });
            setOwners(updatedList);
        } catch (e) { alert("Permission Denied."); }
    };

    // --- AUDIT CONFIG MANAGEMENT ---
    const updateCategoryField = (catIndex, field, value) => {
        const newCats = [...categories];
        // Parse min/max as integers so they don't break the rendering loop later
        newCats[catIndex][field] = (field === 'minScore' || field === 'maxScore') ? parseInt(value) || 0 : value;
        setCategories(newCats);
    };

    const updateQuestion = (catIndex, qIndex, newText) => {
        const newCats = [...categories];
        newCats[catIndex].questions[qIndex] = newText;
        setCategories(newCats);
    };

    const addQuestion = (catIndex) => {
        const newCats = [...categories];
        newCats[catIndex].questions.push("New Question");
        setCategories(newCats);
    };

    const removeQuestion = (catIndex, qIndex) => {
        const newCats = [...categories];
        newCats[catIndex].questions.splice(qIndex, 1);
        setCategories(newCats);
    };

    const addCategory = () => {
        setCategories([...categories, { name: "New Category", minScore: 1, maxScore: 5, questions: ["New Question"] }]);
    };

    const removeCategory = (catIndex) => {
        if (!window.confirm("Are you sure you want to delete this entire category?")) return;
        const newCats = [...categories];
        newCats.splice(catIndex, 1);
        setCategories(newCats);
    };

    const saveAuditConfig = async () => {
        setIsSaving(true);
        try {
            await setDoc(doc(db, "qc_settings", "five_s_config"), { 
                categories,
                alertThreshold: parseInt(alertThreshold)
            });
            alert("Audit Configuration Saved Successfully!");
            setErrorMsg('');
        } catch (error) {
            alert("Error saving config: " + error.message);
        }
        setIsSaving(false);
    };

    return (
        <div style={{ paddingBottom: '50px' }}>
            {errorMsg && <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '10px', borderRadius: '5px', marginBottom: '15px' }}>⚠️ {errorMsg}</div>}

            {/* OWNERS SECTION */}
            <div style={styles.card}>
                <h3 style={{ borderBottom: '2px solid #2563eb', paddingBottom: '10px' }}>👥 Manage Alert Recipients</h3>
                <div style={{ marginBottom: '15px', display: 'flex', gap: '10px' }}>
                    <input style={styles.input} placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)} />
                    <input style={styles.input} placeholder="Email" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
                    <button style={styles.btnPrimary} onClick={addOwner}>Add Owner</button>
                </div>
                <ul style={styles.list}>
                    {owners.map((owner, idx) => (
                        <li key={idx} style={{ padding: '10px', background: '#f8fafc', marginBottom: '5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '4px' }}>
                            <span><strong>{owner.name}</strong> - {owner.email}</span>
                            <button onClick={() => removeOwner(idx)} style={styles.btnDanger}>Remove</button>
                        </li>
                    ))}
                </ul>
            </div>
            
            <div style={styles.card}>
                <h3>⚙️ Global Grading Rules & Alerts</h3>
                <div style={{ padding: '15px', background: '#fffbeb', borderLeft: '4px solid #f59e0b', marginBottom: '20px' }}>
                    <label style={{ fontWeight: 'bold' }}>Email assigned owner if ANY score is LESS THAN: </label>
                    <input type="number" style={styles.numberInput} value={alertThreshold} onChange={(e) => setAlertThreshold(e.target.value)} />
                    <span style={{ fontSize: '12px', marginLeft: '10px', color: '#666' }}>(Applies globally to all categories, regardless of scale)</span>
                </div>

                <h3 style={{ borderBottom: '2px solid #8e44ad', paddingBottom: '10px', color: '#8e44ad' }}>📋 5S Audit Questionnaire Builder</h3>

                {categories && categories.map((category, cIdx) => (
                    <div key={cIdx} style={styles.categoryBox}>
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <input 
                                style={{ ...styles.input, fontWeight: 'bold', fontSize: '16px', color: '#334155', minWidth: '250px' }} 
                                value={category.name} 
                                onChange={(e) => updateCategoryField(cIdx, 'name', e.target.value)} 
                            />
                            
                            {/* NEW: Grading Scale Inputs */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#e2e8f0', padding: '5px 10px', borderRadius: '5px' }}>
                                <label style={{fontSize: '12px', fontWeight: 'bold'}}>Scale: Min</label>
                                <input type="number" style={styles.numberInput} value={category.minScore ?? 0} onChange={(e) => updateCategoryField(cIdx, 'minScore', e.target.value)} />
                                <label style={{fontSize: '12px', fontWeight: 'bold'}}>Max</label>
                                <input type="number" style={styles.numberInput} value={category.maxScore ?? 4} onChange={(e) => updateCategoryField(cIdx, 'maxScore', e.target.value)} />
                            </div>

                            <button onClick={() => removeCategory(cIdx)} style={styles.btnDanger}>Delete Category</button>
                        </div>

                        {category.questions && category.questions.map((question, qIdx) => (
                            <div key={qIdx} style={{ display: 'flex', gap: '10px', marginBottom: '8px', paddingLeft: '20px' }}>
                                <input 
                                    style={styles.input} 
                                    value={question} 
                                    onChange={(e) => updateQuestion(cIdx, qIdx, e.target.value)} 
                                />
                                <button onClick={() => removeQuestion(cIdx, qIdx)} style={{...styles.btnDanger, background: '#cbd5e1', color: '#334155'}}>X</button>
                            </div>
                        ))}
                        
                        <button onClick={() => addQuestion(cIdx)} style={{ ...styles.btnPrimary, background: '#f1f5f9', color: '#3b82f6', marginTop: '10px', marginLeft: '20px', fontSize: '12px', padding: '5px 10px' }}>
                            + Add Question
                        </button>
                    </div>
                ))}

                <button onClick={addCategory} style={{ ...styles.btnPrimary, background: '#e0e7ff', color: '#4f46e5', width: '100%' }}>
                    + Add New Category
                </button>

                <button onClick={saveAuditConfig} disabled={isSaving} style={styles.btnSuccess}>
                    {isSaving ? "Saving..." : "💾 Save Audit Configuration"}
                </button>
            </div>
        </div>
    );
};

export default Settings;