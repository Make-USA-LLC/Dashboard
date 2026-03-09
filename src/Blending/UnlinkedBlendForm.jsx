import React, { useState } from 'react';
import { db } from '../firebase_config';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export default function UnlinkedBlendForm({ setShowUnlinkedForm, styles }) {
    const [project, setProject] = useState('');
    const [company, setCompany] = useState('');
    const [notes, setNotes] = useState(''); // Added notes state
    const [ingredients, setIngredients] = useState([
        { name: 'B40 190 Proof', percentage: '' },
        { name: 'DI Water', percentage: '' },
        { name: 'Fragrance Oil', percentage: '', isOil: true }
    ]);

    const handleSave = async () => {
        if (!project || !company) return alert("Both Company and Project Name/Identifier are required.");
        
        const totalRaw = ingredients.reduce((sum, ing) => sum + Number(ing.percentage || 0), 0);
        const roundedTotal = Math.round(totalRaw * 10000) / 10000; 
        if (roundedTotal !== 100) return alert(`Error: Formula must equal exactly 100%. Current total is ${roundedTotal}%.`);

        const validIngredients = ingredients.filter(ing => ing.percentage !== '');

        await addDoc(collection(db, "production_pipeline"), {
            company: company,
            project: project,
            quantity: "", 
            notes: notes, // Save notes to database
            ingredients: validIngredients,
            requiresBlending: true,
            blendingStatus: "pending",
            status: "unlinked_blend", 
            createdAt: serverTimestamp()
        });
        alert("Unlinked Production Blend added to the queue!");
        
        setCompany('');
        setProject('');
        setNotes('');
        setIngredients([{ name: 'B40 190 Proof', percentage: '' }, { name: 'DI Water', percentage: '' }, { name: 'Fragrance Oil', percentage: '', isOil: true }]);
        setShowUnlinkedForm(false);
    };

    return (
        <div style={{...styles.card, background: '#f0fdf4', border: '1px solid #86efac', marginBottom: '20px'}}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <div>
                    <h3 style={{ margin: 0, color: '#166534' }}>+ New Production Blend</h3>
                    <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#15803d' }}>Create a blend formula now. It cannot be finished until linked to a Production job.</p>
                </div>
            </div>

            <div style={{display: 'flex', gap: '15px', marginBottom: '15px'}}>
                <input style={styles.input} placeholder="Company Name (Required)" value={company} onChange={e => setCompany(e.target.value)} />
                <input style={styles.input} placeholder="Project Name / Identifier (Required)" value={project} onChange={e => setProject(e.target.value)} />
            </div>

            <div style={{marginBottom: '15px'}}>
                <textarea 
                    style={{...styles.input, height: '60px', resize: 'vertical'}} 
                    placeholder="Optional Notes for Blending Lab (e.g., Use alternate fragrance, priority rush...)" 
                    value={notes} 
                    onChange={e => setNotes(e.target.value)} 
                />
            </div>
            
            <h4 style={{ margin: '0 0 10px 0' }}>Formulation Percentages</h4>
            {ingredients.map((ing, idx) => (
                <div key={idx} style={{display:'flex', gap:'10px', marginBottom:'10px'}}>
                    {idx === 0 ? (
                        <select style={styles.input} value={ing.name} onChange={e => {
                            const newIng = [...ingredients]; newIng[idx].name = e.target.value; setIngredients(newIng);
                        }}>
                            <option value="B40 190 Proof">B40 190 Proof</option>
                            <option value="B40 200 Proof">B40 200 Proof</option>
                        </select>
                    ) : (
                        <input style={styles.input} value={ing.name} readOnly={idx < 3} placeholder="Ingredient Name" onChange={e => {
                            const newIng = [...ingredients]; newIng[idx].name = e.target.value; setIngredients(newIng);
                        }} />
                    )}
                    <input type="number" step="0.001" style={styles.input} placeholder="%" value={ing.percentage} onChange={e => {
                        const newIng = [...ingredients]; newIng[idx].percentage = e.target.value; setIngredients(newIng);
                    }} />
                    {idx >= 3 && (
                        <button onClick={() => setIngredients(ingredients.filter((_, i) => i !== idx))} style={{ background: 'none', border: 'none', color: 'red', cursor: 'pointer' }}>✖</button>
                    )}
                </div>
            ))}
            <button onClick={() => setIngredients([...ingredients, {name:'', percentage:''}])} style={{background:'none', border:'none', color:'#166534', cursor:'pointer', marginBottom: '15px', fontWeight: 'bold'}}>+ Add Ingredient</button>
            <br/>
            
            <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setShowUnlinkedForm(false)} style={{...styles.btn, background: '#e2e8f0', color: '#333'}}>Cancel</button>
                <button onClick={handleSave} style={{...styles.btn, background: '#10b981', color: 'white'}}>Save Blend</button>
            </div>
        </div>
    );
}