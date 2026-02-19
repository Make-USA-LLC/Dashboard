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
    table: { width: '100%', borderCollapse: 'collapse', marginTop: '10px', fontSize: '15px' },
    th: { background: '#e2efda', color: '#375623', borderBottom: '2px solid #8ea9db', padding: '10px', textAlign: 'left', fontWeight: 'bold' },
    td: { padding: '10px', borderBottom: '1px solid #d0d7e5' },
    printArea: { display: 'none' }
};

export default function BlendingApp() {
    const [activeTab, setActiveTab] = useState('samples_pending'); 
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

    // Active Processing & Viewing States
    const [processingItem, setProcessingItem] = useState(null);
    const [viewingItem, setViewingItem] = useState(null);
    const [oilGrams, setOilGrams] = useState('');

    // --- Search and Sort States ---
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

    const openProcessing = (item) => {
        setProcessingItem(item);
        setOilGrams(item.savedOilGrams || '');
    };

    let previewCalculations = null;
    let previewTotalGrams = 0;
    
    if (processingItem && oilGrams && !isNaN(oilGrams) && Number(oilGrams) > 0) {
        const oilVal = Number(oilGrams);
        const oilIng = processingItem.ingredients?.find(i => i.isOil);
        if (oilIng && oilIng.percentage) {
            const percentageDecimal = Number(oilIng.percentage) / 100;
            previewTotalGrams = oilVal / percentageDecimal;
            previewCalculations = processingItem.ingredients.map(ing => {
                const ingDec = Number(ing.percentage) / 100;
                const calculatedGrams = ing.isOil ? oilVal : (previewTotalGrams * ingDec);
                return { ...ing, calculatedGrams: calculatedGrams.toFixed(2) };
            });
        }
    }

    const saveInformation = async () => {
        if (!previewCalculations) return alert("Enter Fragrance Oil grams to calculate the formula.");

        const updatePayload = {
            calculatedIngredients: previewCalculations,
            totalBatchGrams: previewTotalGrams.toFixed(2),
            savedOilGrams: oilGrams,
            lastSavedAt: serverTimestamp()
        };

        if (processingItem.type === 'sample') {
            await updateDoc(doc(db, "blending_samples", processingItem.id), updatePayload);
        } else {
            await updateDoc(doc(db, "production_pipeline", processingItem.id), updatePayload);
        }

        setProcessingItem(null);
        setOilGrams('');
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

    const emailFinishedBlend = (item) => {
        let csvContent = "Formula,%,gr\n";
        item.calculatedIngredients.forEach(ing => {
            csvContent += `"${ing.name}","${ing.percentage}","${ing.calculatedGrams}"\n`;
        });
        csvContent += `\n"Total","","${item.totalBatchGrams}"`;

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        
        const safeName = item.type === 'sample' ? `Sample_${item.name}` : `${item.company || 'Production'}_${item.project}`;
        const cleanFileName = safeName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        link.setAttribute("download", `${cleanFileName}_formula.csv`);
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        const subjectName = item.type === 'sample' ? `Sample: ${item.name}` : `${item.company || ''} ${item.project || ''}`.trim();
        const subject = encodeURIComponent(`Blending Complete - ${subjectName}`);
        
        let bodyText = `Hi Nimrod,\n\nBlending has been completed for the following batch:\n\n`;
        bodyText += `Batch: ${subjectName}\n`;
        bodyText += `Total Batch Size: ${item.totalBatchGrams}g\n\n`;
        bodyText += `I have attached the Excel report for this batch to this email.\n`;
        
        const body = encodeURIComponent(bodyText);
        
        window.location.href = `mailto:nimrod@makeit.buzz?subject=${subject}&body=${body}`;
    };

    const printTicket = (item) => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return alert("Please allow pop-ups for this site to print tickets.");

        const title = item.type === 'sample' ? `Sample: ${item.name}` : `Production: ${item.company || ''} ${item.project ? `- ${item.project}` : ''}`;
        
        let finishDate = "N/A";
        if (item.completedAt && item.completedAt.seconds) {
            finishDate = new Date(item.completedAt.seconds * 1000).toLocaleString();
        } else {
            finishDate = new Date().toLocaleString(); 
        }
        
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
            <h2>${title}</h2>
            <div class="meta-info">
                <p><strong>Total Batch Size:</strong> ${item.totalBatchGrams} g</p>
                <p><strong>Finished On:</strong> ${finishDate}</p>
            </div>
            <table>
                <tr><th>Formula (Ingredient)</th><th>%</th><th>gr</th></tr>
                ${item.calculatedIngredients.map(ing => `
                    <tr>
                        <td>${ing.name}</td>
                        <td>${ing.percentage}</td>
                        <td><strong>${ing.calculatedGrams}</strong></td>
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

    // --- Filter and Sort Logic ---
    const processedFinishedBlends = finishedBlends
        .filter(item => {
            const searchLower = searchTerm.toLowerCase();
            const itemName = (item.name || item.project || '').toLowerCase();
            const itemCompany = (item.company || '').toLowerCase();
            return itemName.includes(searchLower) || itemCompany.includes(searchLower) || item.type.includes(searchLower);
        })
        .sort((a, b) => {
            if (sortOption === 'dateDesc') {
                return (b.completedAt?.seconds || 0) - (a.completedAt?.seconds || 0);
            } else if (sortOption === 'dateAsc') {
                return (a.completedAt?.seconds || 0) - (b.completedAt?.seconds || 0);
            } else if (sortOption === 'nameAsc') {
                const nameA = (a.name || a.project || '').toLowerCase();
                const nameB = (b.name || b.project || '').toLowerCase();
                return nameA.localeCompare(nameB);
            } else if (sortOption === 'nameDesc') {
                const nameA = (a.name || a.project || '').toLowerCase();
                const nameB = (b.name || b.project || '').toLowerCase();
                return nameB.localeCompare(nameA);
            } else if (sortOption === 'sizeDesc') {
                return Number(b.totalBatchGrams || 0) - Number(a.totalBatchGrams || 0);
            } else if (sortOption === 'sizeAsc') {
                return Number(a.totalBatchGrams || 0) - Number(b.totalBatchGrams || 0);
            }
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
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px'}}>
                                <h3 style={{margin: 0}}>
                                    {sample.name} 
                                    {sample.savedOilGrams && <span style={{fontSize: '12px', color: '#047857', background: '#d1fae5', padding: '3px 8px', borderRadius: '10px', marginLeft: '10px'}}>Ready to Finish</span>}
                                </h3>
                            </div>
                            
                            <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
                                {!sample.savedOilGrams ? (
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
                                    {job.savedOilGrams && <span style={{fontSize: '12px', color: '#047857', background: '#d1fae5', padding: '3px 8px', borderRadius: '10px', marginLeft: '10px'}}>Ready to Finish</span>}
                                </h3>
                                <p style={{margin: 0, color:'#666'}}>{job.company} • {job.quantity} units</p>
                            </div>
                            
                            <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
                                {!job.savedOilGrams ? (
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

            {/* ADD INFORMATION OVERLAY */}
            {processingItem && (
                <div style={{position: 'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex: 1000}}>
                    <div style={{background:'white', padding:'30px', borderRadius:'10px', width:'700px', maxWidth:'90%', maxHeight: '90vh', overflowY: 'auto'}}>
                        <h2>Add Information: {processingItem.name || processingItem.project}</h2>
                        <p>Enter the exact grams of <strong>Fragrance Oil</strong> being used. The formula will be calculated instantly below.</p>
                        
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

                        {previewCalculations && (
                            <div style={{marginBottom: '25px'}}>
                                <h3 style={{margin: '0 0 10px 0', color: '#334155'}}>Formula Preview</h3>
                                <p style={{margin: '0 0 10px 0', color: '#64748b'}}>Total Batch Size: <strong>{previewTotalGrams.toFixed(2)}g</strong></p>
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
                            <button onClick={() => { setProcessingItem(null); setOilGrams(''); }} style={{...styles.btn, background: '#94a3b8'}}>Cancel</button>
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

                    {processedFinishedBlends.map(item => (
                        <div key={item.id} style={{...styles.card, borderLeft: '5px solid #10b981', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                            <div>
                                <h3 style={{margin:'0 0 5px 0'}}>{item.name || item.project} <span style={{fontSize:'12px', background:'#eee', padding:'3px 8px', borderRadius:'10px'}}>{item.type}</span></h3>
                                <p style={{margin:0, color:'#666'}}>Total Batch: {item.totalBatchGrams}g</p>
                            </div>
                            <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
                                <button onClick={() => setViewingItem(item)} style={{...styles.btn, background: '#3b82f6', padding: '8px 12px'}}>👀 View Excel</button>
                                <button onClick={() => printTicket(item)} style={{...styles.btn, background: '#475569', padding: '8px 12px'}}>🖨️ Print</button>
                                <button onClick={() => emailFinishedBlend(item)} style={{...styles.btn, background: '#8b5cf6', padding: '8px 12px'}}>✉️ Email</button>
                            </div>
                        </div>
                    ))}
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
                            {viewingItem.type === 'sample' ? `Sample: ${viewingItem.name}` : `${viewingItem.company || 'Production'} - ${viewingItem.project}`}
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
                                </tr>
                            </thead>
                            <tbody>
                                {viewingItem.calculatedIngredients?.map((ing, idx) => (
                                    <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f8f9fa' }}>
                                        <td style={styles.td}>{ing.name}</td>
                                        <td style={styles.td}>{ing.percentage}</td>
                                        <td style={{...styles.td, fontWeight: 'bold', color: '#0f172a'}}>{ing.calculatedGrams}</td>
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
        </div>
    );
}