import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config'; 
import { collection, updateDoc, doc, onSnapshot, query } from 'firebase/firestore';
import { styles } from './utils';
import UnlinkedBlendForm from './UnlinkedBlendForm';
import Loader from '../components/Loader';

export default function ProductionQueue({ setProcessingItem, setViewingItem, printTicket, markAsFinishedInline, deleteBlend }) {
    const [fullBlends, setFullBlends] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showUnlinkedForm, setShowUnlinkedForm] = useState(false);
    
    // States for Inline Editing
    const [addingFormulaItem, setAddingFormulaItem] = useState(null);
    const [formulaIngredients, setFormulaIngredients] = useState([]);
    const [editingInfoItem, setEditingInfoItem] = useState(null);
    const [editInfoData, setEditInfoData] = useState({ company: '', project: '' });

    useEffect(() => {
        const qProd = query(collection(db, "blending_queue"));
        const unsub = onSnapshot(qProd, (snap) => {
            setFullBlends(snap.docs.map(d => ({ id: d.id, ...d.data(), type: 'production' })));
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const handleToggleEditInfo = (job) => {
        if (editingInfoItem && editingInfoItem.id === job.id) {
            if (window.confirm("You have unsaved changes. Are you sure you want to close without saving?")) setEditingInfoItem(null);
            return;
        }
        if ((editingInfoItem || addingFormulaItem) && !window.confirm("You have another editor open. Close without saving?")) return;
        
        setAddingFormulaItem(null);
        setEditingInfoItem(job);
        setEditInfoData({ company: job.company || '', project: job.project || job.name || '' });
    };

    const handleToggleEditFormula = (job) => {
        if (addingFormulaItem && addingFormulaItem.id === job.id) {
            if (window.confirm("You have unsaved changes. Are you sure you want to close without saving?")) setAddingFormulaItem(null);
            return;
        }
        if ((editingInfoItem || addingFormulaItem) && !window.confirm("You have another editor open. Close without saving?")) return;
        
        setEditingInfoItem(null);
        setAddingFormulaItem(job);
        setFormulaIngredients(job.ingredients?.length > 0 ? job.ingredients : [
            { name: 'B40 190 Proof', percentage: '' }, 
            { name: 'DI Water', percentage: '' }, 
            { name: 'Fragrance Oil', percentage: '', isOil: true }
        ]);
    };

    const handleCancelEditor = () => {
        if (window.confirm("You have unsaved changes. Are you sure you want to close without saving?")) {
            setAddingFormulaItem(null);
            setEditingInfoItem(null);
        }
    };

    const handleSaveFormula = async (jobId) => {
        const totalRaw = formulaIngredients.reduce((sum, ing) => sum + Number(ing.percentage || 0), 0);
        const roundedTotal = Math.round(totalRaw * 10000) / 10000; 
        if (roundedTotal !== 100) return alert(`Error: Formula must equal exactly 100%. Current total is ${roundedTotal}%.`);

        const validIngredients = formulaIngredients.filter(ing => ing.percentage !== '');

        try {
            await updateDoc(doc(db, "blending_queue", jobId), { ingredients: validIngredients });
            alert("Formula saved successfully!");
            setAddingFormulaItem(null);
        } catch (error) {
            console.error("Error saving formula:", error);
            alert("Failed to save formula.");
        }
    };

    const handleSaveInfo = async (jobId) => {
        if (!editInfoData.company || !editInfoData.project) return alert("Company and Project names cannot be empty.");
        try {
            await updateDoc(doc(db, "blending_queue", jobId), { 
                company: editInfoData.company, 
                project: editInfoData.project 
            });
            alert("Blend info updated successfully!");
            setEditingInfoItem(null);
        } catch (error) {
            console.error("Error updating info:", error);
            alert("Failed to update info.");
        }
    };

    if (loading) return <Loader message="Loading Production Queue..." />;

    return (
        <div>
            <button onClick={() => setShowUnlinkedForm(!showUnlinkedForm)} style={{...styles.btn, marginBottom: '20px', background: '#10b981', color: 'white'}}>+ Create Production Blend</button>
            {showUnlinkedForm && <UnlinkedBlendForm setShowUnlinkedForm={setShowUnlinkedForm} styles={styles} />}

            {fullBlends.length === 0 && <p>No production jobs require blending right now.</p>}
            {fullBlends.map(job => {
                const missingFormula = (!job.ingredients || job.ingredients.length === 0 || job.ingredients[0].percentage === '');

                return (
                <div key={job.id} style={{...styles.card, borderLeft: missingFormula ? '5px solid #ef4444' : '1px solid #e0e0e0'}}>
                    <div style={{marginBottom: '15px'}}>
                        <h3 style={{margin:'0 0 5px 0'}}>
                            {job.project}
                            {job.calculatedIngredients && <span style={{fontSize: '12px', color: '#047857', background: '#d1fae5', padding: '3px 8px', borderRadius: '10px', marginLeft: '10px'}}>Ready to Finish</span>}
                            {missingFormula && <span style={{fontSize: '12px', color: '#b91c1c', background: '#fee2e2', padding: '3px 8px', borderRadius: '10px', marginLeft: '10px'}}>Needs Formula</span>}
                        </h3>
                        <p style={{margin: 0, color:'#666'}}>{job.company !== 'TBD' ? job.company : 'Company TBD'} {job.quantity ? `• ${job.quantity} units` : ''}</p>
                        
                        {job.notes && (
                            <div style={{marginTop: '10px', padding: '8px 12px', background: '#fef3c7', borderLeft: '4px solid #f59e0b', borderRadius: '4px', fontSize: '13px', color: '#92400e'}}>
                                <strong>📝 Note:</strong> {job.notes}
                            </div>
                        )}
                    </div>
                    
                    <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
                        {/* Primary Action Button */}
                        {missingFormula ? (
                            <button onClick={() => handleToggleEditFormula(job)} style={{...styles.btn, background: '#3b82f6', color: 'white'}}>➕ Add Percentages</button>
                        ) : !job.calculatedIngredients ? (
                            <button onClick={() => setProcessingItem(job)} style={{...styles.btn, background: '#3b82f6', color: 'white'}}>➕ Enter Blend Info</button>
                        ) : (
                            <button onClick={() => setProcessingItem(job)} style={{...styles.btn, background: '#f59e0b', padding: '8px 12px'}}>✏️ Edit Blend Info</button>
                        )}

                        {/* Universal Edit Buttons */}
                        <button onClick={() => handleToggleEditInfo(job)} style={{...styles.btn, background: '#64748b', color: 'white', padding: '8px 12px'}}>✏️ Edit Info</button>
                        
                        {!missingFormula && (
                            <button onClick={() => handleToggleEditFormula(job)} style={{...styles.btn, background: '#8b5cf6', color: 'white', padding: '8px 12px'}}>✏️ Edit Formula</button>
                        )}

                        {/* Completion Actions */}
                        {job.calculatedIngredients && (
                            <>
                                <button onClick={() => setViewingItem(job)} style={{...styles.btn, background: '#3b82f6', color: 'white', padding: '8px 12px'}}>👀 View Excel</button>
                                <button onClick={() => printTicket(job)} style={{...styles.btn, background: '#475569', color: 'white', padding: '8px 12px'}}>🖨️ Print</button>
                                <button onClick={() => markAsFinishedInline(job)} style={{...styles.btn, background: '#10b981', color: 'white', padding: '8px 12px'}}>✅ Finish</button>
                            </>
                        )}

                        {/* Delete Action */}
                        <button onClick={() => deleteBlend(job)} style={{...styles.btn, background: '#ef4444', color: 'white', padding: '8px 12px'}}>🗑️ Delete</button>
                    </div>

                    {/* Inline Editor for Info (Company & Project) */}
                    {editingInfoItem && editingInfoItem.id === job.id && (
                        <div style={{background: '#f8fafc', padding: '15px', marginTop: '15px', borderRadius: '5px', border: '1px solid #cbd5e1'}}>
                            <h4 style={{ margin: '0 0 10px 0', color: '#334155' }}>Edit Details</h4>
                            <div style={{display: 'flex', gap: '10px', marginBottom: '10px'}}>
                                <input style={styles.input} value={editInfoData.company} onChange={e => setEditInfoData({...editInfoData, company: e.target.value})} placeholder="Company Name" />
                                <input style={styles.input} value={editInfoData.project} onChange={e => setEditInfoData({...editInfoData, project: e.target.value})} placeholder="Project Name" />
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button onClick={handleCancelEditor} style={{...styles.btn, background: '#e2e8f0', color: '#333'}}>Cancel</button>
                                <button onClick={() => handleSaveInfo(job.id)} style={{...styles.btn, background: '#10b981', color: 'white'}}>💾 Save Info</button>
                            </div>
                        </div>
                    )}

                    {/* Inline Editor for Formula */}
                    {addingFormulaItem && addingFormulaItem.id === job.id && (
                        <div style={{background: '#f8fafc', padding: '15px', marginTop: '15px', borderRadius: '5px', border: '1px solid #cbd5e1'}}>
                            <h4 style={{ margin: '0 0 10px 0', color: '#334155' }}>Enter Formula for {job.project}</h4>
                            
                            {formulaIngredients.map((ing, idx) => (
                                <div key={idx} style={{display:'flex', gap:'10px', marginBottom:'10px'}}>
                                    {idx === 0 ? (
                                        <select style={styles.input} value={ing.name} onChange={e => { const newIng = [...formulaIngredients]; newIng[idx].name = e.target.value; setFormulaIngredients(newIng); }}>
                                            <option value="B40 190 Proof">B40 190 Proof</option>
                                            <option value="B40 200 Proof">B40 200 Proof</option>
                                        </select>
                                    ) : (
                                        <input style={styles.input} value={ing.name} readOnly={idx < 3} placeholder="Ingredient Name" onChange={e => { const newIng = [...formulaIngredients]; newIng[idx].name = e.target.value; setFormulaIngredients(newIng); }} />
                                    )}
                                    <input type="number" step="0.001" style={styles.input} placeholder="%" value={ing.percentage} onChange={e => { const newIng = [...formulaIngredients]; newIng[idx].percentage = e.target.value; setFormulaIngredients(newIng); }} />
                                    {idx >= 3 && ( <button onClick={() => setFormulaIngredients(formulaIngredients.filter((_, i) => i !== idx))} style={{ background: 'none', border: 'none', color: 'red', cursor: 'pointer' }}>✖</button> )}
                                </div>
                            ))}
                            <button onClick={() => setFormulaIngredients([...formulaIngredients, {name:'', percentage:''}])} style={{background:'none', border:'none', color:'#2563eb', cursor:'pointer', marginBottom: '15px', fontWeight: 'bold'}}>+ Add Ingredient</button>
                            
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button onClick={handleCancelEditor} style={{...styles.btn, background: '#e2e8f0', color: '#333'}}>Cancel</button>
                                <button onClick={() => handleSaveFormula(job.id)} style={{...styles.btn, background: '#10b981', color: 'white'}}>💾 Save Formula</button>
                            </div>
                        </div>
                    )}
                </div>
            )})}
        </div>
    );
}