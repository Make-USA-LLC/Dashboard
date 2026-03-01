import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { parseSizeFromText } from './utils';

export default function ProcessingModal({ processingItem, setProcessingItem, styles }) {
    const [calcMode, setCalcMode] = useState('auto'); 
    const [fillWeight, setFillWeight] = useState('');
    const [fillUnit, setFillUnit] = useState('ml');
    const [errorMargin, setErrorMargin] = useState(3);
    const [fragranceGrams, setFragranceGrams] = useState('');
    const [overrideGrams, setOverrideGrams] = useState('');

    useEffect(() => {
        if (processingItem.calcParams) {
            setCalcMode(processingItem.calcParams.mode || 'auto');
            setFillWeight(processingItem.calcParams.fillWeight || '');
            setFillUnit(processingItem.calcParams.fillUnit || 'ml');
            setErrorMargin(processingItem.calcParams.errorMargin || 3);
            setFragranceGrams(processingItem.calcParams.fragranceGrams || '');
            setOverrideGrams(processingItem.calcParams.overrideGrams || '');
        } else {
            const autoParsed = parseSizeFromText(processingItem.size) || 
                               parseSizeFromText(processingItem.volume) || 
                               parseSizeFromText(processingItem.project) || 
                               parseSizeFromText(processingItem.name) || 
                               parseSizeFromText(processingItem.sku);

            setCalcMode(processingItem.type === 'sample' ? 'fragrance' : 'auto');
            setErrorMargin(3);
            setFragranceGrams('');
            setOverrideGrams('');

            if (autoParsed) {
                setFillWeight(autoParsed.weight);
                setFillUnit(autoParsed.unit);
            } else {
                setFillWeight('');
                setFillUnit('ml');
            }
        }
    }, [processingItem]);

    let previewCalculations = null;
    let previewTotalGrams = 0;
    
    if (processingItem && processingItem.ingredients) {
        if (calcMode === 'auto' && fillWeight && !isNaN(fillWeight)) {
            const units = processingItem.quantity ? Number(processingItem.quantity) : 1;
            const weight = Number(fillWeight);
            let multiplier = 1;
            if (fillUnit === 'oz') multiplier = 28.3495;
            if (fillUnit === 'gal') multiplier = 3785.41;
            
            const baseGrams = units * weight * multiplier;
            previewTotalGrams = baseGrams * (1 + (Number(errorMargin) / 100));
            
            previewCalculations = processingItem.ingredients.map(ing => {
                const ingDec = Number(ing.percentage) / 100;
                return { ...ing, calculatedGrams: (previewTotalGrams * ingDec).toFixed(2) };
            });
            
        } else if (calcMode === 'fragrance' && fragranceGrams && !isNaN(fragranceGrams)) {
            const oilVal = Number(fragranceGrams);
            const oilIng = processingItem.ingredients.find(i => i.isOil || i.name.toLowerCase().includes('fragrance'));
            if (oilIng && oilIng.percentage) {
                const percentageDecimal = Number(oilIng.percentage) / 100;
                previewTotalGrams = oilVal / percentageDecimal;
                previewCalculations = processingItem.ingredients.map(ing => {
                    const ingDec = Number(ing.percentage) / 100;
                    return { ...ing, calculatedGrams: (previewTotalGrams * ingDec).toFixed(2) };
                });
            }
        } else if (calcMode === 'override' && overrideGrams && !isNaN(overrideGrams)) {
            previewTotalGrams = Number(overrideGrams);
            previewCalculations = processingItem.ingredients.map(ing => {
                const ingDec = Number(ing.percentage) / 100;
                return { ...ing, calculatedGrams: (previewTotalGrams * ingDec).toFixed(2) };
            });
        }
    }

    const saveInformation = async () => {
        if (!previewCalculations) return alert("Please complete the required calculation fields.");

        const updatePayload = {
            calculatedIngredients: previewCalculations,
            totalBatchGrams: previewTotalGrams.toFixed(2),
            calcParams: { mode: calcMode, fillWeight, fillUnit, errorMargin, fragranceGrams, overrideGrams },
            lastSavedAt: serverTimestamp()
        };

        const collectionName = processingItem.type === 'sample' ? "blending_samples" : "production_pipeline";
        await updateDoc(doc(db, collectionName, processingItem.id), updatePayload);
        setProcessingItem(null);
    };

    return (
        <div style={{position: 'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex: 1000}}>
            <div style={{background:'white', padding:'30px', borderRadius:'10px', width:'700px', maxWidth:'90%', maxHeight: '90vh', overflowY: 'auto'}}>
                <h2>Add Information: {processingItem.project || processingItem.name}</h2>
                
                <div style={{marginBottom: '20px', padding: '15px', background: '#f1f5f9', borderRadius: '8px'}}>
                    <label style={{fontWeight:'bold', display:'block', marginBottom:'8px'}}>Calculation Method:</label>
                    <select style={{...styles.input, borderColor: '#94a3b8'}} value={calcMode} onChange={e => setCalcMode(e.target.value)}>
                        <option value="auto">Auto-Calculate (Units × Fill Weight + Waste %)</option>
                        <option value="fragrance">Base on Fragrance Oil target (g)</option>
                        <option value="override">Manual Total Batch Override (g)</option>
                    </select>
                </div>

                {calcMode === 'auto' && (
                    <div style={{display: 'flex', gap: '15px', marginBottom: '25px', flexWrap: 'wrap', alignItems: 'flex-end'}}>
                        <div style={{flex: 1, minWidth: '80px'}}>
                            <label style={{display:'block', fontSize:'13px', color:'#555', fontWeight:'bold'}}>Units</label>
                            <input type="number" style={{...styles.input, background:'#e2e8f0'}} value={processingItem.quantity || 1} readOnly title="Units are pulled from the Job Ticket" />
                        </div>
                        <div style={{flex: 1, minWidth: '100px'}}>
                            <label style={{display:'block', fontSize:'13px', color:'#555', fontWeight:'bold'}}>Fill Weight</label>
                            <input type="number" style={styles.input} value={fillWeight} onChange={e => setFillWeight(e.target.value)} placeholder="e.g. 100" autoFocus />
                        </div>
                        <div style={{flex: 1, minWidth: '80px'}}>
                            <label style={{display:'block', fontSize:'13px', color:'#555', fontWeight:'bold'}}>Unit</label>
                            <select style={styles.input} value={fillUnit} onChange={e => setFillUnit(e.target.value)}>
                                <option value="ml">ml</option>
                                <option value="oz">oz</option>
                                <option value="gal">gal</option>
                            </select>
                        </div>
                        <div style={{flex: 1, minWidth: '80px'}}>
                            <label style={{display:'block', fontSize:'13px', color:'#555', fontWeight:'bold'}}>Waste %</label>
                            <input type="number" style={styles.input} value={errorMargin} onChange={e => setErrorMargin(e.target.value)} />
                        </div>
                    </div>
                )}

                {calcMode === 'fragrance' && (
                    <div style={{margin: '20px 0'}}>
                        <label style={{fontWeight:'bold', display:'block', marginBottom:'5px'}}>Target Fragrance Oil (g):</label>
                        <input type="number" style={{...styles.input, fontSize: '18px', padding: '12px'}} value={fragranceGrams} onChange={e => setFragranceGrams(e.target.value)} autoFocus />
                    </div>
                )}

                {calcMode === 'override' && (
                    <div style={{margin: '20px 0'}}>
                        <label style={{fontWeight:'bold', display:'block', marginBottom:'5px'}}>Target Total Batch Target (g):</label>
                        <input type="number" style={{...styles.input, fontSize: '18px', padding: '12px'}} value={overrideGrams} onChange={e => setOverrideGrams(e.target.value)} autoFocus />
                    </div>
                )}

                {previewCalculations && (
                    <div style={{marginBottom: '25px'}}>
                        <h3 style={{margin: '0 0 10px 0', color: '#334155'}}>Formula Preview</h3>
                        <p style={{margin: '0 0 10px 0', color: '#64748b'}}>Calculated Batch Target: <strong>{previewTotalGrams.toFixed(2)}g</strong></p>
                        <table style={styles.table}>
                            <thead>
                                <tr>
                                    <th style={styles.th}>Formula</th>
                                    <th style={styles.th}>%</th>
                                    <th style={styles.th}>gr</th>
                                </tr>
                            </thead>
                            <tbody>
                                {previewCalculations.map((ing, idx) => (
                                    <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f8f9fa' }}>
                                        <td style={styles.td}>{ing.name}</td>
                                        <td style={styles.td}>{ing.percentage}</td>
                                        <td style={{...styles.td, fontWeight: 'bold', color: '#0f172a'}}>{ing.calculatedGrams}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div style={{display:'flex', gap:'10px', justifyContent:'flex-end'}}>
                    <button onClick={() => setProcessingItem(null)} style={{...styles.btn, background: '#94a3b8'}}>Cancel</button>
                    <button 
                        onClick={saveInformation} 
                        disabled={!previewCalculations} 
                        style={{...styles.btn, background: previewCalculations ? '#2563eb' : '#cbd5e1', cursor: previewCalculations ? 'pointer' : 'not-allowed'}}
                    >
                        💾 Save Information
                    </button>
                </div>
            </div>
        </div>
    );
}