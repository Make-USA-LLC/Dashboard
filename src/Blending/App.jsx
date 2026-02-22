import React, { useState, useEffect } from 'react';
import { db, functions } from '../firebase_config';
import { collection, addDoc, updateDoc, doc, onSnapshot, query, where, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

const styles = {
    container: { padding: '20px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Segoe UI, sans-serif' },
    tabs: { display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #ddd', paddingBottom: '10px' },
    tab: (active) => ({ padding: '10px 20px', cursor: 'pointer', fontWeight: 'bold', border: 'none', background: active ? '#2563eb' : '#eee', color: active ? 'white' : '#333', borderRadius: '5px' }),
    card: { background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)', marginBottom: '15px' },
    input: { padding: '8px', borderRadius: '4px', border: '1px solid #ccc', width: '100%', boxSizing: 'border-box' },
    btn: { padding: '10px 15px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontWeight: 'bold', background: '#27ae60', color: 'white' },
    table: { width: '100%', borderCollapse: 'collapse', marginTop: '10px', fontSize: '15px' },
    th: { background: '#e2efda', color: '#375623', borderBottom: '2px solid #8ea9db', padding: '10px', textAlign: 'left', fontWeight: 'bold' },
    td: { padding: '10px', borderBottom: '1px solid #d0d7e5' },
    printArea: { display: 'none' }
};

const getGallons = (name, grams) => {
    const g = parseFloat(grams);
    if (isNaN(g)) return '-';
    const lowerName = name.toLowerCase();
    
    if (lowerName.includes('water')) return (g / 3785.41).toFixed(4) + ' gal';
    if (lowerName.includes('b40') || lowerName.includes('alcohol')) return (g * 0.000335).toFixed(4) + ' gal';
    
    return '-';
};

const parseSizeFromText = (text) => {
    if (!text) return null;
    const match = String(text).toLowerCase().match(/([\d.]+)\s*(ml|oz|g|gal|gallon)/);
    if (match) {
        let unit = match[2];
        if (unit === 'g') unit = 'ml'; 
        if (unit === 'gallon' || unit === 'gal') unit = 'gal';
        return { weight: match[1], unit: unit };
    }
    return null;
};

export default function BlendingApp() {
    const [activeTab, setActiveTab] = useState('samples_pending'); 
    const [pendingSamples, setPendingSamples] = useState([]);
    const [fullBlends, setFullBlends] = useState([]);
    const [finishedBlends, setFinishedBlends] = useState([]);
    
    // Updated Sample Creation Form States
    const [showSampleForm, setShowSampleForm] = useState(false);
    const [sampleCompany, setSampleCompany] = useState('');
    const [sampleProject, setSampleProject] = useState('');
    const [sampleIngredients, setSampleIngredients] = useState([
        { name: 'B40 190 Proof', percentage: '' },
        { name: 'DI Water', percentage: '' },
        { name: 'Fragrance Oil', percentage: '', isOil: true }
    ]);

    const [processingItem, setProcessingItem] = useState(null);
    const [viewingItem, setViewingItem] = useState(null);
    
    const [calcMode, setCalcMode] = useState('auto'); 
    const [fillWeight, setFillWeight] = useState('');
    const [fillUnit, setFillUnit] = useState('ml');
    const [errorMargin, setErrorMargin] = useState(3);
    const [fragranceGrams, setFragranceGrams] = useState('');
    const [overrideGrams, setOverrideGrams] = useState('');

    const [searchTerm, setSearchTerm] = useState('');
    const [sortOption, setSortOption] = useState('dateDesc'); 

    useEffect(() => {
        const qSamples = query(collection(db, "blending_samples"), where("status", "==", "pending"));
        const unsub1 = onSnapshot(qSamples, (snap) => setPendingSamples(snap.docs.map(d => ({ id: d.id, ...d.data(), type: 'sample' }))));

        const qProd = query(collection(db, "production_pipeline"), where("requiresBlending", "==", true), where("blendingStatus", "==", "pending"));
        const unsub2 = onSnapshot(qProd, (snap) => setFullBlends(snap.docs.map(d => ({ id: d.id, ...d.data(), type: 'production' }))));

        const qFinished = query(collection(db, "blending_samples"), where("status", "==", "completed"));
        const unsub3 = onSnapshot(qFinished, (snap) => {
            const s = snap.docs.map(d => ({ id: d.id, ...d.data(), type: 'sample' }));
            const qProdFin = query(collection(db, "production_pipeline"), where("requiresBlending", "==", true), where("blendingStatus", "==", "completed"));
            onSnapshot(qProdFin, (snap2) => {
                const p = snap2.docs.map(d => ({ id: d.id, ...d.data(), type: 'production' }));
                setFinishedBlends([...s, ...p].sort((a,b) => (b.completedAt?.seconds || 0) - (a.completedAt?.seconds || 0)));
            });
        });

        return () => { unsub1(); unsub2(); unsub3(); };
    }, []);

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

    const openProcessing = (item) => {
        setProcessingItem(item);
        if (item.calcParams) {
            setCalcMode(item.calcParams.mode || 'auto');
            setFillWeight(item.calcParams.fillWeight || '');
            setFillUnit(item.calcParams.fillUnit || 'ml');
            setErrorMargin(item.calcParams.errorMargin || 3);
            setFragranceGrams(item.calcParams.fragranceGrams || '');
            setOverrideGrams(item.calcParams.overrideGrams || '');
        } else {
            const autoParsed = parseSizeFromText(item.size) || 
                               parseSizeFromText(item.volume) || 
                               parseSizeFromText(item.project) || 
                               parseSizeFromText(item.name) || 
                               parseSizeFromText(item.sku);

            setCalcMode(item.type === 'sample' ? 'fragrance' : 'auto');
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
    };

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

        if (processingItem.type === 'sample') await updateDoc(doc(db, "blending_samples", processingItem.id), updatePayload);
        else await updateDoc(doc(db, "production_pipeline", processingItem.id), updatePayload);

        setProcessingItem(null);
    };

    const markAsFinishedInline = async (item) => {
        if (!item.calculatedIngredients) return alert("Please add information to calculate the formula first.");
        const updatePayload = { completedAt: serverTimestamp() };

        if (item.type === 'sample') {
            updatePayload.status = "completed";
            await updateDoc(doc(db, "blending_samples", item.id), updatePayload);
        } else {
            updatePayload.blendingStatus = "completed";
            await updateDoc(doc(db, "production_pipeline", item.id), updatePayload);
        }
    };

    const handleBillItem = async (item) => {
        const invoice = prompt("Enter Invoice Number for Billing:");
        if (!invoice) return; 

        const updatePayload = { billed: true, invoiceNumber: invoice, billedAt: serverTimestamp() };
        if (item.type === 'sample') await updateDoc(doc(db, "blending_samples", item.id), updatePayload);
        else await updateDoc(doc(db, "production_pipeline", item.id), updatePayload);
    };

    const emailFinishedBlend = async (item) => {
        try {
            console.log("Requesting email via Firebase Functions...");
            const sendManualEmail = httpsCallable(functions, 'sendManualEmail');
            await sendManualEmail({ id: item.id, type: item.type });
            alert("Email requested successfully! It should arrive momentarily.");
        } catch (error) {
            console.error("Error calling email function:", error);
            alert("Failed to send email. Check console for details.");
        }
    };

    const printTicket = (item) => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return alert("Please allow pop-ups for this site to print tickets.");

        const title = item.company ? `${item.company} - ${item.project || item.name}` : (item.project || item.name);
        let finishDate = item.completedAt?.seconds ? new Date(item.completedAt.seconds * 1000).toLocaleString() : new Date().toLocaleString(); 
        
        let html = `
            <html><head><title>Batch Ticket</title>
            <style>
                body { font-family: 'Calibri', 'Arial', sans-serif; padding: 20px; color: #333; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 15px; }
                th, td { border: 1px solid #d0d7e5; padding: 10px; text-align: left; }
                th { background-color: #e2efda; color: #375623; border-bottom: 2px solid #8ea9db; font-weight: bold; }
                tr:nth-child(even) { background-color: #f8f9fa; }
                h1 { border-bottom: 2px solid #4472c4; padding-bottom: 10px; color: #4472c4; font-size: 24px; margin-bottom: 10px; }
                h2 { font-size: 18px; margin-bottom: 5px; color: #2c3e50; text-transform: uppercase; }
                .meta-info { font-size: 14px; color: #555; margin-bottom: 20px; }
                .meta-info p { margin: 5px 0; }
            </style>
            </head><body>
            <h1>MakeUSA Blending Ticket</h1>
            <h2>${item.type === 'sample' ? 'Sample: ' : 'Production: '} ${title}</h2>
            <div class="meta-info">
                <p><strong>Total Batch Size:</strong> ${item.totalBatchGrams} g</p>
                <p><strong>Finished On:</strong> ${finishDate}</p>
            </div>
            <table>
                <tr><th>Formula (Ingredient)</th><th>%</th><th>gr</th><th>Gallons</th></tr>
                ${item.calculatedIngredients.map(ing => `
                    <tr>
                        <td>${ing.name}</td>
                        <td>${ing.percentage}</td>
                        <td><strong>${ing.calculatedGrams}</strong></td>
                        <td>${getGallons(ing.name, ing.calculatedGrams)}</td>
                    </tr>
                `).join('')}
            </table>
            <script>
                setTimeout(() => { window.print(); }, 250);
                window.onafterprint = () => { window.close(); };
            </script>
            </body></html>
        `;
        printWindow.document.write(html);
        printWindow.document.close();
    };

    const processedFinishedBlends = finishedBlends
        .filter(item => {
            const searchLower = searchTerm.toLowerCase();
            const itemName = (item.project || item.name || '').toLowerCase();
            const itemCompany = (item.company || '').toLowerCase();
            return itemName.includes(searchLower) || itemCompany.includes(searchLower) || item.type.includes(searchLower);
        })
        .sort((a, b) => {
            if (sortOption === 'dateDesc') return (b.completedAt?.seconds || 0) - (a.completedAt?.seconds || 0);
            if (sortOption === 'dateAsc') return (a.completedAt?.seconds || 0) - (b.completedAt?.seconds || 0);
            if (sortOption === 'nameAsc') return (a.project || a.name || '').toLowerCase().localeCompare((b.project || b.name || '').toLowerCase());
            if (sortOption === 'nameDesc') return (b.project || b.name || '').toLowerCase().localeCompare((a.project || a.name || '').toLowerCase());
            if (sortOption === 'sizeDesc') return Number(b.totalBatchGrams || 0) - Number(a.totalBatchGrams || 0);
            if (sortOption === 'sizeAsc') return Number(a.totalBatchGrams || 0) - Number(b.totalBatchGrams || 0);
            return 0;
        });

    return (
        <div style={styles.container}>
            <h1 style={{color: '#2c3e50'}}>⚗️ Blending Lab</h1>
            
            <div style={styles.tabs}>
                <button style={styles.tab(activeTab === 'samples_pending')} onClick={() => setActiveTab('samples_pending')}>Samples Queue ({pendingSamples.length})</button>
                <button style={styles.tab(activeTab === 'full_blends')} onClick={() => setActiveTab('full_blends')}>Production Queue ({fullBlends.length})</button>
                <button style={styles.tab(activeTab === 'finished')} onClick={() => setActiveTab('finished')}>Finished Blends ({finishedBlends.length})</button>
            </div>

            {/* SAMPLES QUEUE */}
            {activeTab === 'samples_pending' && (
                <div>
                    <button onClick={() => setShowSampleForm(!showSampleForm)} style={{...styles.btn, marginBottom: '20px'}}>+ Create New Sample</button>
                    
                    {showSampleForm && (
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
                    )}

                    {pendingSamples.map(sample => (
                        <div key={sample.id} style={styles.card}>
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px'}}>
                                <div>
                                    <h3 style={{margin: '0 0 5px 0'}}>
                                        {sample.project || sample.name} 
                                        {sample.calculatedIngredients && <span style={{fontSize: '12px', color: '#047857', background: '#d1fae5', padding: '3px 8px', borderRadius: '10px', marginLeft: '10px'}}>Ready to Finish</span>}
                                    </h3>
                                    <p style={{margin: 0, color:'#666'}}>{sample.company}</p>
                                </div>
                            </div>
                            
                            <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
                                {!sample.calculatedIngredients ? (
                                    <button onClick={() => openProcessing(sample)} style={{...styles.btn, background: '#3b82f6'}}>➕ Add Information</button>
                                ) : (
                                    <>
                                        <button onClick={() => openProcessing(sample)} style={{...styles.btn, background: '#f59e0b', padding: '8px 12px'}}>✏️ Edit Info</button>
                                        <button onClick={() => setViewingItem(sample)} style={{...styles.btn, background: '#3b82f6', padding: '8px 12px'}}>👀 View Excel</button>
                                        <button onClick={() => printTicket(sample)} style={{...styles.btn, background: '#475569', padding: '8px 12px'}}>🖨️ Print</button>
                                        <button onClick={() => markAsFinishedInline(sample)} style={{...styles.btn, background: '#10b981', padding: '8px 12px'}}>✅ Finish</button>
                                    </>
                                )}
                            </div>
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
                            <div style={{marginBottom: '15px'}}>
                                <h3 style={{margin:'0 0 5px 0'}}>
                                    {job.project}
                                    {job.calculatedIngredients && <span style={{fontSize: '12px', color: '#047857', background: '#d1fae5', padding: '3px 8px', borderRadius: '10px', marginLeft: '10px'}}>Ready to Finish</span>}
                                </h3>
                                <p style={{margin: 0, color:'#666'}}>{job.company} • {job.quantity} units</p>
                            </div>
                            
                            <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
                                {!job.calculatedIngredients ? (
                                    <button onClick={() => openProcessing(job)} style={{...styles.btn, background: '#3b82f6'}}>➕ Add Information</button>
                                ) : (
                                    <>
                                        <button onClick={() => openProcessing(job)} style={{...styles.btn, background: '#f59e0b', padding: '8px 12px'}}>✏️ Edit Info</button>
                                        <button onClick={() => setViewingItem(job)} style={{...styles.btn, background: '#3b82f6', padding: '8px 12px'}}>👀 View Excel</button>
                                        <button onClick={() => printTicket(job)} style={{...styles.btn, background: '#475569', padding: '8px 12px'}}>🖨️ Print</button>
                                        <button onClick={() => markAsFinishedInline(job)} style={{...styles.btn, background: '#10b981', padding: '8px 12px'}}>✅ Finish</button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ADD INFORMATION OVERLAY WITH SMART CALCULATOR */}
            {processingItem && (
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
            )}

            {/* FINISHED BLENDS */}
            {activeTab === 'finished' && (
                <div>
                    <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
                        <input 
                            type="text" 
                            placeholder="Search by name, project, or company..." 
                            value={searchTerm} 
                            onChange={(e) => setSearchTerm(e.target.value)} 
                            style={{ ...styles.input, flex: 1 }}
                        />
                        <select 
                            value={sortOption} 
                            onChange={(e) => setSortOption(e.target.value)}
                            style={{ ...styles.input, width: '200px' }}
                        >
                            <option value="dateDesc">Newest First</option>
                            <option value="dateAsc">Oldest First</option>
                            <option value="nameAsc">Name (A-Z)</option>
                            <option value="nameDesc">Name (Z-A)</option>
                            <option value="sizeDesc">Largest Batch First</option>
                            <option value="sizeAsc">Smallest Batch First</option>
                        </select>
                    </div>

                    {processedFinishedBlends.length === 0 && (
                        <p style={{ color: '#666', fontStyle: 'italic' }}>No finished blends match your criteria.</p>
                    )}

                    {processedFinishedBlends.map(item => {
                        const isBilled = item.billed;
                        const borderColor = isBilled ? '#10b981' : '#f59e0b'; 

                        return (
                            <div key={item.id} style={{...styles.card, borderLeft: `5px solid ${borderColor}`, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                <div>
                                    <h3 style={{margin:'0 0 5px 0'}}>
                                        {item.project || item.name} 
                                        <span style={{fontSize:'12px', background:'#eee', padding:'3px 8px', borderRadius:'10px', marginLeft: '10px'}}>{item.type}</span>
                                    </h3>
                                    <p style={{margin:0, color:'#666'}}>{item.company} • Batch: {item.totalBatchGrams}g</p>
                                    {isBilled && <p style={{margin: '5px 0 0 0', color: '#10b981', fontSize: '13px', fontWeight: 'bold'}}>✓ Billed (Inv: {item.invoiceNumber})</p>}
                                </div>
                                <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
                                    <button onClick={() => setViewingItem(item)} style={{...styles.btn, background: '#3b82f6', padding: '8px 12px'}}>👀 View Excel</button>
                                    <button onClick={() => printTicket(item)} style={{...styles.btn, background: '#475569', padding: '8px 12px'}}>🖨️ Print</button>
                                    <button onClick={() => emailFinishedBlend(item)} style={{...styles.btn, background: '#8b5cf6', padding: '8px 12px'}}>✉️ Email</button>
                                    {!isBilled && (
                                        <button onClick={() => handleBillItem(item)} style={{...styles.btn, background: '#f59e0b', padding: '8px 12px'}}>💰 Bill</button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* VIEWING SAVED BLEND OVERLAY */}
            {viewingItem && (
                <div style={{position: 'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex: 1000}}>
                    <div style={{background:'white', padding:'30px', borderRadius:'10px', width:'600px', maxWidth:'90%', maxHeight: '90vh', overflowY: 'auto'}}>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #4472c4', paddingBottom: '10px', marginBottom: '20px'}}>
                            <h2 style={{margin: 0, color: '#4472c4'}}>MakeUSA Blending Ticket</h2>
                            <button onClick={() => setViewingItem(null)} style={{background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#666'}}>✖</button>
                        </div>

                        <h3 style={{margin: '0 0 5px 0', color: '#2c3e50', textTransform: 'uppercase'}}>
                            {viewingItem.company ? `${viewingItem.company} - ` : ''}{viewingItem.project || viewingItem.name}
                        </h3>
                        
                        <div style={{marginBottom: '20px', color: '#555'}}>
                            <p style={{margin: '5px 0'}}><strong>Total Batch Size:</strong> {viewingItem.totalBatchGrams} g</p>
                            {viewingItem.completedAt && (
                                <p style={{margin: '5px 0'}}><strong>Finished On:</strong> {new Date(viewingItem.completedAt.seconds * 1000).toLocaleString()}</p>
                            )}
                        </div>

                        <table style={styles.table}>
                            <thead>
                                <tr>
                                    <th style={styles.th}>Formula</th>
                                    <th style={styles.th}>%</th>
                                    <th style={styles.th}>gr</th>
                                    <th style={styles.th}>Gallons</th>
                                </tr>
                            </thead>
                            <tbody>
                                {viewingItem.calculatedIngredients?.map((ing, idx) => (
                                    <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f8f9fa' }}>
                                        <td style={styles.td}>{ing.name}</td>
                                        <td style={styles.td}>{ing.percentage}</td>
                                        <td style={{...styles.td, fontWeight: 'bold', color: '#0f172a'}}>{ing.calculatedGrams}</td>
                                        <td style={styles.td}>{getGallons(ing.name, ing.calculatedGrams)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div style={{display:'flex', gap:'10px', justifyContent:'flex-end', marginTop: '25px'}}>
                            <button onClick={() => emailFinishedBlend(viewingItem)} style={{...styles.btn, background: '#8b5cf6'}}>✉️ Email</button>
                            <button onClick={() => printTicket(viewingItem)} style={{...styles.btn, background: '#475569'}}>🖨️ Print Ticket</button>
                        </div>
                    </div>
                </div>
            )}
            
            <div style={{textAlign: 'center', marginTop: '40px', paddingBottom: '20px', fontSize: '12px', color: '#888'}}>
                
            </div>
        </div>
    );
}