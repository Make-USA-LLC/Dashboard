import React, { useState } from 'react';
import { db } from '../firebase_config';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export default function SampleForm({ setShowSampleForm, styles }) {
    const [sampleCompany, setSampleCompany] = useState('');
    const [sampleProject, setSampleProject] = useState('');
    const [sampleIngredients, setSampleIngredients] = useState([
        { name: 'B40 190 Proof', percentage: '' },
        { name: 'DI Water', percentage: '' },
        { name: 'Fragrance Oil', percentage: '', isOil: true }
    ]);

    const handleCreateSample = async () => {
        if (!sampleCompany || !sampleProject) return alert("Enter both Company and Project names.");

        const totalRaw = sampleIngredients.reduce((sum, ing) => sum + Number(ing.percentage || 0), 0);
        const roundedTotal = Math.round(totalRaw * 10000) / 10000; 
        if (roundedTotal !== 100) {
            return alert(`Error: Sample percentages must equal exactly 100%. Current total is ${roundedTotal}%.`);
        }

        await addDoc(collection(db, "blending_samples"), {
            company: sampleCompany,
            project: sampleProject,
            ingredients: sampleIngredients,
            status: "pending",
            createdAt: serverTimestamp()
        });
        
        setSampleCompany('');
        setSampleProject('');
        setSampleIngredients([{ name: 'B40 190 Proof', percentage: '' }, { name: 'DI Water', percentage: '' }, { name: 'Fragrance Oil', percentage: '', isOil: true }]);
        setShowSampleForm(false);
    };

    return (
        <div style={{...styles.card, background: '#f8fafc', border: '1px solid #cbd5e1'}}>
            <h3>New Sample Formula</h3>
            <div style={{display: 'flex', gap: '15px', marginBottom: '15px'}}>
                <input style={styles.input} placeholder="Company Name" value={sampleCompany} onChange={e => setSampleCompany(e.target.value)} />
                <input style={styles.input} placeholder="Project Name/ID" value={sampleProject} onChange={e => setSampleProject(e.target.value)} />
            </div>
            
            {sampleIngredients.map((ing, idx) => (
                <div key={idx} style={{display:'flex', gap:'10px', marginBottom:'10px'}}>
                    {idx === 0 ? (
                        <select style={styles.input} value={ing.name} onChange={e => {
                            const newIng = [...sampleIngredients]; newIng[idx].name = e.target.value; setSampleIngredients(newIng);
                        }}>
                            <option value="B40 190 Proof">B40 190 Proof</option>
                            <option value="B40 200 Proof">B40 200 Proof</option>
                        </select>
                    ) : (
                        <input style={styles.input} value={ing.name} readOnly={idx < 3} onChange={e => {
                            const newIng = [...sampleIngredients]; newIng[idx].name = e.target.value; setSampleIngredients(newIng);
                        }} />
                    )}
                    <input type="number" step="0.001" style={styles.input} placeholder="%" value={ing.percentage} onChange={e => {
                        const newIng = [...sampleIngredients]; newIng[idx].percentage = e.target.value; setSampleIngredients(newIng);
                    }} />
                </div>
            ))}
            <button onClick={() => setSampleIngredients([...sampleIngredients, {name:'', percentage:''}])} style={{background:'none', border:'none', color:'#2563eb', cursor:'pointer', marginBottom: '15px'}}>+ Add Ingredient</button>
            <br/>
            <button onClick={handleCreateSample} style={styles.btn}>Save Sample to Queue</button>
        </div>
    );
}