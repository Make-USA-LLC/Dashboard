import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { collection, addDoc, updateDoc, doc, onSnapshot, query, where, serverTimestamp } from 'firebase/firestore';

const styles = {
    container: { padding: '20px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Segoe UI, sans-serif' },
    tabs: { display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #ddd', paddingBottom: '10px' },
    tab: (active) => ({ padding: '10px 20px', cursor: 'pointer', fontWeight: 'bold', border: 'none', background: active ? '#2563eb' : '#eee', color: active ? 'white' : '#333', borderRadius: '5px' }),
    card: { background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)', marginBottom: '15px' },
    input: { padding: '8px', borderRadius: '4px', border: '1px solid #ccc', width: '100%', boxSizing: 'border-box' },
    btn: { padding: '10px 15px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontWeight: 'bold', background: '#27ae60', color: 'white' },
    table: { width: '100%', borderCollapse: 'collapse', marginTop: '10px' },
    th: { background: '#f8fafc', padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd' },
    td: { padding: '10px', borderBottom: '1px solid #eee' },
    printArea: { display: 'none' }
};

export default function BlendingApp() {
    const [activeTab, setActiveTab] = useState('samples_pending'); // samples_pending, full_blends, finished
    const [pendingSamples, setPendingSamples] = useState([]);
    const [fullBlends, setFullBlends] = useState([]);
    const [finishedBlends, setFinishedBlends] = useState([]);
    
    // Sample Creation Form
    const [showSampleForm, setShowSampleForm] = useState(false);
    const [sampleName, setSampleName] = useState('');
    const [sampleIngredients, setSampleIngredients] = useState([
        { name: 'Alcohol', percentage: '' },
        { name: 'DI Water', percentage: '' },
        { name: 'Fragrance Oil', percentage: '', isOil: true }
    ]);

    // Active Processing State
    const [processingItem, setProcessingItem] = useState(null);
    const [oilGrams, setOilGrams] = useState('');

    useEffect(() => {
        // 1. Listen for Pending Samples
        const qSamples = query(collection(db, "blending_samples"), where("status", "==", "pending"));
        const unsub1 = onSnapshot(qSamples, (snap) => setPendingSamples(snap.docs.map(d => ({ id: d.id, ...d.data(), type: 'sample' }))));

        // 2. Listen for Pending Full Blends from Production
        const qProd = query(collection(db, "production_pipeline"), where("requiresBlending", "==", true), where("blendingStatus", "==", "pending"));
        const unsub2 = onSnapshot(qProd, (snap) => setFullBlends(snap.docs.map(d => ({ id: d.id, ...d.data(), type: 'production' }))));

        // 3. Listen for Finished Blends (both types)
        const qFinished = query(collection(db, "blending_samples"), where("status", "==", "completed"));
        const unsub3 = onSnapshot(qFinished, (snap) => {
            const s = snap.docs.map(d => ({ id: d.id, ...d.data(), type: 'sample' }));
            // Get production ones that are done
            const qProdFin = query(collection(db, "production_pipeline"), where("requiresBlending", "==", true), where("blendingStatus", "==", "completed"));
            onSnapshot(qProdFin, (snap2) => {
                const p = snap2.docs.map(d => ({ id: d.id, ...d.data(), type: 'production' }));
                setFinishedBlends([...s, ...p].sort((a,b) => (b.completedAt?.seconds || 0) - (a.completedAt?.seconds || 0)));
            });
        });

        return () => { unsub1(); unsub2(); unsub3(); };
    }, []);

    const handleCreateSample = async () => {
        if (!sampleName) return alert("Enter a sample name.");
        await addDoc(collection(db, "blending_samples"), {
            name: sampleName,
            ingredients: sampleIngredients,
            status: "pending",
            createdAt: serverTimestamp()
        });
        setSampleName('');
        setSampleIngredients([{ name: 'Alcohol', percentage: '' }, { name: 'DI Water', percentage: '' }, { name: 'Fragrance Oil', percentage: '', isOil: true }]);
        setShowSampleForm(false);
    };

    const processBlend = async () => {
        if (!oilGrams || isNaN(oilGrams)) return alert("Please enter valid oil grams.");
        
        const oilVal = Number(oilGrams);
        const oilIng = processingItem.ingredients.find(i => i.isOil);
        if (!oilIng || !oilIng.percentage) return alert("Fragrance Oil percentage missing from formula.");

        // MATH: total = oilGrams / (oilPercentage / 100)
        // If they enter 6 for 6%, division is 0.06
        const percentageDecimal = Number(oilIng.percentage) / 100;
        const totalGrams = oilVal / percentageDecimal;

        const finalCalculations = processingItem.ingredients.map(ing => {
            const ingDec = Number(ing.percentage) / 100;
            const calculatedGrams = ing.isOil ? oilVal : (totalGrams * ingDec);
            return {
                ...ing,
                calculatedGrams: calculatedGrams.toFixed(2)
            };
        });

        const updatePayload = {
            calculatedIngredients: finalCalculations,
            totalBatchGrams: totalGrams.toFixed(2),
            completedAt: serverTimestamp()
        };

        if (processingItem.type === 'sample') {
            updatePayload.status = "completed";
            await updateDoc(doc(db, "blending_samples", processingItem.id), updatePayload);
        } else {
            updatePayload.blendingStatus = "completed";
            await updateDoc(doc(db, "production_pipeline", processingItem.id), updatePayload);
        }

        setProcessingItem(null);
        setOilGrams('');
        setActiveTab('finished');
    };

    const printTicket = (item) => {
        // Create an invisible iframe to print just the ticket data
        const printWindow = window.open('', '_blank');
        const title = item.type === 'sample' ? `Sample: ${item.name}` : `Production: ${item.company} - ${item.project}`;
        
        let html = `
            <html><head><title>Batch Ticket</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #000; padding: 8px; text-align: left; }
                th { background-color: #f2f2f2; }
                h1 { border-bottom: 2px solid #000; padding-bottom: 10px; }
            </style>
            </head><body>
            <h1>MakeUSA Blending Ticket</h1>
            <h2>${title}</h2>
            <p><strong>Total Batch Size:</strong> ${item.totalBatchGrams} g</p>
            <table>
                <tr><th>Ingredient</th><th>Percentage</th><th>Grams Required</th></tr>
                ${item.calculatedIngredients.map(ing => `
                    <tr>
                        <td>${ing.name}</td>
                        <td>${ing.percentage}%</td>
                        <td><strong>${ing.calculatedGrams} g</strong></td>
                    </tr>
                `).join('')}
            </table>
            <br/><br/>
            <p>Technician Signature: _______________________ Date: _________</p>
            <script>window.print(); window.close();</script>
            </body></html>
        `;
        printWindow.document.write(html);
        printWindow.document.close();
    };

    return (
        <div style={styles.container}>
            <h1 style={{color: '#2c3e50'}}>⚗️ Blending Lab</h1>
            
            <div style={styles.tabs}>
                <button style={styles.tab(activeTab === 'samples_pending')} onClick={() => setActiveTab('samples_pending')}>Samples Queue ({pendingSamples.length})</button>
                <button style={styles.tab(activeTab === 'full_blends')} onClick={() => setActiveTab('full_blends')}>Production Queue ({fullBlends.length})</button>
                <button style={styles.tab(activeTab === 'finished')} onClick={() => setActiveTab('finished')}>Finished Blends</button>
            </div>

            {/* SAMPLES QUEUE */}
            {activeTab === 'samples_pending' && (
                <div>
                    <button onClick={() => setShowSampleForm(!showSampleForm)} style={{...styles.btn, marginBottom: '20px'}}>+ Create New Sample</button>
                    
                    {showSampleForm && (
                        <div style={{...styles.card, background: '#f8fafc', border: '1px solid #cbd5e1'}}>
                            <h3>New Sample Formula</h3>
                            <input style={{...styles.input, marginBottom:'15px'}} placeholder="Sample Name/ID" value={sampleName} onChange={e => setSampleName(e.target.value)} />
                            
                            {sampleIngredients.map((ing, idx) => (
                                <div key={idx} style={{display:'flex', gap:'10px', marginBottom:'10px'}}>
                                    <input style={styles.input} value={ing.name} readOnly={idx < 3} onChange={e => {
                                        const newIng = [...sampleIngredients]; newIng[idx].name = e.target.value; setSampleIngredients(newIng);
                                    }} />
                                    <input type="number" step="0.001" style={styles.input} placeholder="%" value={ing.percentage} onChange={e => {
                                        const newIng = [...sampleIngredients]; newIng[idx].percentage = e.target.value; setSampleIngredients(newIng);
                                    }} />
                                </div>
                            ))}
                            <button onClick={() => setSampleIngredients([...sampleIngredients, {name:'', percentage:''}])} style={{background:'none', border:'none', color:'#2563eb', cursor:'pointer', marginBottom: '15px'}}>+ Add Ingredient</button>
                            <br/>
                            <button onClick={handleCreateSample} style={styles.btn}>Save Sample to Queue</button>
                        </div>
                    )}

                    {pendingSamples.map(sample => (
                        <div key={sample.id} style={styles.card}>
                            <h3>{sample.name}</h3>
                            <button onClick={() => setProcessingItem(sample)} style={{...styles.btn, background: '#3b82f6'}}>Process Blend ➔</button>
                        </div>
                    ))}
                </div>
            )}

            {/* PRODUCTION QUEUE */}
            {activeTab === 'full_blends' && (
                <div>
                    {fullBlends.length === 0 ? <p>No production jobs require blending right now.</p> : null}
                    {fullBlends.map(job => (
                        <div key={job.id} style={styles.card}>
                            <h3 style={{margin:'0 0 5px 0'}}>{job.project}</h3>
                            <p style={{margin:'0 0 15px 0', color:'#666'}}>{job.company} • {job.quantity} units</p>
                            <button onClick={() => setProcessingItem(job)} style={{...styles.btn, background: '#3b82f6'}}>Process Full Blend ➔</button>
                        </div>
                    ))}
                </div>
            )}

            {/* PROCESSING OVERLAY */}
            {processingItem && (
                <div style={{position: 'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center'}}>
                    <div style={{background:'white', padding:'30px', borderRadius:'10px', width:'500px', maxWidth:'90%'}}>
                        <h2>Processing: {processingItem.name || processingItem.project}</h2>
                        <p>Enter the exact grams of <strong>Fragrance Oil</strong> being used. All other measurements will be calculated based on the formula percentages.</p>
                        
                        <div style={{margin: '20px 0'}}>
                            <label style={{fontWeight:'bold', display:'block', marginBottom:'5px'}}>Fragrance Oil (g):</label>
                            <input 
                                type="number" 
                                style={{...styles.input, fontSize: '18px', padding: '12px'}} 
                                value={oilGrams} 
                                onChange={e => setOilGrams(e.target.value)} 
                                autoFocus
                            />
                        </div>

                        <div style={{display:'flex', gap:'10px', justifyContent:'flex-end'}}>
                            <button onClick={() => setProcessingItem(null)} style={{...styles.btn, background: '#94a3b8'}}>Cancel</button>
                            <button onClick={processBlend} style={{...styles.btn, background: '#10b981'}}>Calculate & Mark Done</button>
                        </div>
                    </div>
                </div>
            )}

            {/* FINISHED BLENDS */}
            {activeTab === 'finished' && (
                <div>
                    {finishedBlends.map(item => (
                        <div key={item.id} style={{...styles.card, borderLeft: '5px solid #10b981'}}>
                            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                <div>
                                    <h3 style={{margin:'0 0 5px 0'}}>{item.name || item.project} <span style={{fontSize:'12px', background:'#eee', padding:'3px 8px', borderRadius:'10px'}}>{item.type}</span></h3>
                                    <p style={{margin:0, color:'#666'}}>Total Batch: {item.totalBatchGrams}g</p>
                                </div>
                                <button onClick={() => printTicket(item)} style={{...styles.btn, background: '#475569'}}>🖨️ Print Ticket</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}