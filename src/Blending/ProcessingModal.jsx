import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { parseSizeFromText } from './utils';

export default function ProcessingModal({ processingItem, setProcessingItem, styles }) {
    const [calcMode, setCalcMode] = useState('auto'); 
    const [units, setUnits] = useState('');
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
            setUnits(processingItem.calcParams.units || processingItem.quantity || '');
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
            setUnits(processingItem.quantity || '');

            if (autoParsed) {
                setFillWeight(autoParsed.weight);
                setFillUnit(autoParsed.unit);
            } else {
                setFillWeight('');
                setFillUnit('ml');
            }
        }
    }, [processingItem]);

    // Lock Logic: Lock if it's a real Production job (not unlinked) and the PM provided the value
    const isProdJob = processingItem.type === 'production' && processingItem.status !== 'unlinked_blend';
    const unitsLocked = isProdJob && processingItem.quantity !== "" && processingItem.quantity != null;
    
    // Only lock size if PM provided a size AND our auto-parser successfully read a weight from it
    // If auto-parse failed, we leave it unlocked so the lab can manually fix the weight
    const sizeLocked = isProdJob && processingItem.size !== "" && processingItem.size != null && fillWeight !== "";

    let previewCalculations = null;
    let previewTotalGrams = 0;
    
    if (processingItem && processingItem.ingredients) {
        if (calcMode === 'auto' && fillWeight && !isNaN(fillWeight)) {
            const calcUnits = units ? Number(units) : 1; // Default to 1 if blank to prevent zeroing out preview
            const weight = Number(fillWeight);
            let multiplier = 1;
            if (fillUnit === 'oz') multiplier = 28.3495;
            if (fillUnit === 'gal') multiplier = 3785.41;
            
            const baseGrams = calcUnits * weight * multiplier;
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
            calcParams: { mode: calcMode, fillWeight, fillUnit, errorMargin, fragranceGrams, overrideGrams, units },
            lastSavedAt: serverTimestamp()
        };

        // If the lab edited units on an Unlinked Blend, push that edit to the main pipeline document too
        if (!unitsLocked && calcMode === 'auto') {
            updatePayload.quantity = units;
        }

        const collectionName = processingItem.type === 'sample' ? "blending_samples" : "blending_queue";
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
                            <input 
                                type="number" 
                                style={{...styles.input, background: unitsLocked ? '#e2e8f0' : '#fff', cursor: unitsLocked ? 'not-allowed' : 'text'}} 
                                value={units} 
                                onChange={e => setUnits(e.target.value)}
                                readOnly={unitsLocked} 
                                title={unitsLocked ? "Units are locked from Production" : "Enter Expected Units"} 
                            />
                        </div>
                        <div style={{flex: 1, minWidth: '100px'}}>
                            <label style={{display:'block', fontSize:'13px', color:'#555', fontWeight:'bold'}}>Fill Weight</label>
                            <input 
                                type="number" 
                                style={{...styles.input, background: sizeLocked ? '#e2e8f0' : '#fff', cursor: sizeLocked ? 'not-allowed' : 'text'}} 
                                value={fillWeight} 
                                onChange={e => setFillWeight(e.target.value)} 
                                placeholder="e.g. 100" 
                                autoFocus={!sizeLocked}
                                readOnly={sizeLocked}
                                title={sizeLocked ? `Size locked from Production: ${processingItem.size}` : ""}
                            />
                        </div>
                        <div style={{flex: 1, minWidth: '80px'}}>
                            <label style={{display:'block', fontSize:'13px', color:'#555', fontWeight:'bold'}}>Unit</label>
                            {sizeLocked ? (
                                <input 
                                    type="text" 
                                    style={{...styles.input, background: '#e2e8f0', cursor: 'not-allowed'}} 
                                    value={fillUnit} 
                                    readOnly 
                                    title="Locked from Production"
                                />
                            ) : (
                                <select style={styles.input} value={fillUnit} onChange={e => setFillUnit(e.target.value)}>
                                    <option value="ml">ml</option>
                                    <option value="oz">oz</option>
                                    <option value="gal">gal</option>
                                </select>
                            )}
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