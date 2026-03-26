import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase_config';
import { collection, onSnapshot, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { Wrench, Save, Plus, Trash2, Search, AlertTriangle } from 'lucide-react';

const BuildEngine = () => {
    const [items, setItems] = useState([]);
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(false);

    // Multi-Input (Components Consumed - Auto Allocated)
    const [inputs, setInputs] = useState([{ skuInput: '', qtyUsed: '', allocations: [] }]);
    // Multi-Output (Finished Goods Produced - Manual Bin)
    const [outputs, setOutputs] = useState([{ skuInput: '', qtyProduced: '', destinationLocation: '' }]);

    useEffect(() => {
        const unsub1 = onSnapshot(collection(db, "inv_items"), snap => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        const unsub2 = onSnapshot(collection(db, "inv_locations"), snap => setLocations(snap.docs.map(d => d.data().fullName)));
        return () => { unsub1(); unsub2(); }
    }, []);

    // --- Auto Allocation Engine ---
    const allocateBins = (sku, qtyString, itemsList) => {
        const qty = Number(qtyString) || 0;
        if (qty <= 0 || !sku) return [];
        
        const item = itemsList.find(i => i.sku === sku);
        if (!item) return [];

        let remaining = qty;
        const allocs = [];
        const bins = Object.entries(item.locations || {})
            .filter(([b, q]) => q > 0)
            .sort((a, b) => b[1] - a[1]); 

        for (let [b, q] of bins) {
            if (remaining <= 0) break;
            const pull = Math.min(remaining, q);
            allocs.push({ bin: b, qty: pull });
            remaining -= pull;
        }
        
        if (remaining > 0) {
            allocs.push({ bin: 'Insufficient Stock', qty: remaining, error: true });
        }
        return allocs;
    };

    const handleLineChange = (type, index, field, value) => {
        if (type === 'in') {
            const newLines = [...inputs]; 
            newLines[index][field] = value; 
            newLines[index].allocations = allocateBins(newLines[index].skuInput, newLines[index].qtyUsed, items);
            setInputs(newLines);
        } else {
            const newLines = [...outputs]; 
            newLines[index][field] = value; 
            setOutputs(newLines);
        }
    };

    const addLine = (type) => type === 'in' ? setInputs([...inputs, { skuInput: '', qtyUsed: '', allocations: [] }]) : setOutputs([...outputs, { skuInput: '', qtyProduced: '', destinationLocation: '' }]);
    const removeLine = (type, index) => type === 'in' ? setInputs(inputs.filter((_, i) => i !== index)) : setOutputs(outputs.filter((_, i) => i !== index));

    const executeBuild = async (e) => {
        e.preventDefault();
        
        // Validation
        const validateLine = (line, isOutput) => {
            const match = items.find(i => i.sku === line.skuInput);
            if (!match) throw new Error(`SKU "${line.skuInput}" not found in system.`);
            if (isOutput && !line.destinationLocation) throw new Error("Please specify Destination Bins for all outputs.");
            return { ...line, itemId: match.id, name: match.name };
        };

        setLoading(true);
        try {
            const parsedInputs = inputs.map(l => validateLine(l, false));
            const parsedOutputs = outputs.map(l => validateLine({ ...l, qty: l.qtyProduced }, true));

            // Check Overdrawn
            if (parsedInputs.some(i => i.allocations.some(a => a.error))) {
                throw new Error("Insufficient stock for one or more components. Check allocations.");
            }

            const batch = writeBatch(db);
            const buildId = `MFG-${Date.now()}`;

            // 1. DEDUCT Inputs (Write one transaction per allocated bin)
            parsedInputs.forEach(input => {
                input.allocations.forEach(alloc => {
                    batch.set(doc(collection(db, "inv_transactions")), {
                        type: "BUILD_CONSUMPTION", buildId,
                        itemId: input.itemId, sku: input.skuInput,
                        locationId: alloc.bin, qtyChange: -Math.abs(Number(alloc.qty)), 
                        user: auth.currentUser?.email || 'System', timestamp: serverTimestamp()
                    });
                });
            });

            // 2. ADD Outputs (Manual destination)
            parsedOutputs.forEach(output => {
                batch.set(doc(collection(db, "inv_transactions")), {
                    type: "BUILD_PRODUCTION", buildId,
                    itemId: output.itemId, sku: output.skuInput,
                    locationId: output.destinationLocation, qtyChange: Math.abs(Number(output.qty)), 
                    user: auth.currentUser?.email || 'System', timestamp: serverTimestamp()
                });
            });

            // 3. Log Master Record
            batch.set(doc(db, "inv_build_reports", buildId), {
                buildId,
                inputsConsumed: parsedInputs.map(i => ({ sku: i.skuInput, qty: i.qtyUsed, allocations: i.allocations })),
                outputsProduced: parsedOutputs.map(o => ({ sku: o.skuInput, qty: o.qtyProduced, location: o.destinationLocation })),
                executedBy: auth.currentUser?.email || 'System',
                timestamp: serverTimestamp()
            });

            await batch.commit();
            alert("Manufacturing Run Logged! Stock Deducted & Created.");
            setInputs([{ skuInput: '', qtyUsed: '', allocations: [] }]);
            setOutputs([{ skuInput: '', qtyProduced: '', destinationLocation: '' }]);
        } catch (error) { alert("Build failed: " + error.message); }
        setLoading(false);
    };

    return (
        <div style={{ maxWidth: '1000px', background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', padding: '30px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '25px', borderBottom: '2px solid #e2e8f0', paddingBottom: '15px' }}>
                <Wrench color="#2563eb" size={28} />
                <h2 style={{ margin: 0, color: '#0f172a' }}>Dynamic Manufacturing Floor</h2>
            </div>

            <datalist id="item-skus">{items.map(i => <option key={i.id} value={i.sku}>{i.name}</option>)}</datalist>
            <datalist id="location-list">{locations.map(l => <option key={l} value={l} />)}</datalist>

            <form onSubmit={executeBuild}>
                
                {/* INPUTS (COMPONENTS) - AUTO ALLOCATED */}
                <div style={{ background: '#fef2f2', padding: '20px', borderRadius: '8px', border: '1px solid #fecaca', marginBottom: '30px' }}>
                    <h4 style={{ margin: '0 0 15px', color: '#991b1b' }}>1. Components Consumed (Auto-Deducted from Stock)</h4>
                    {inputs.map((line, index) => (
                        <div key={index} style={{ marginBottom: '15px', paddingBottom: '10px', borderBottom: '1px dashed #fca5a5' }}>
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
                                <div style={{position: 'relative', flex: 3}}>
                                    <Search size={16} color="#94a3b8" style={{position: 'absolute', top: '12px', left: '10px'}} />
                                    <input list="item-skus" required placeholder="Type Component SKU..." value={line.skuInput} onChange={e => handleLineChange('in', index, 'skuInput', e.target.value)} style={{...inp, paddingLeft: '35px'}} />
                                </div>
                                <input type="number" required min="1" placeholder="Total Qty Used" value={line.qtyUsed} onChange={e => handleLineChange('in', index, 'qtyUsed', e.target.value)} style={{...inp, flex: 1}} />
                                {index > 0 && <button type="button" onClick={() => removeLine('in', index)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={18}/></button>}
                            </div>
                            
                            {/* Show Auto-Allocated Bins */}
                            {line.allocations.length > 0 && (
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingLeft: '35px' }}>
                                    {line.allocations.map((alloc, i) => (
                                        <span key={i} style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '4px', background: alloc.error ? '#fecaca' : '#fee2e2', color: alloc.error ? '#b91c1c' : '#991b1b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            {alloc.error && <AlertTriangle size={12}/>}
                                            Pull <strong>{alloc.qty}</strong> from <strong>{alloc.bin}</strong>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                    <button type="button" onClick={() => addLine('in')} style={{ background: 'none', border: 'none', color: '#dc2626', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}><Plus size={16}/> Add Component</button>
                </div>

                {/* OUTPUTS (FINISHED GOODS) - MANUAL BIN */}
                <div style={{ background: '#f0fdf4', padding: '20px', borderRadius: '8px', border: '1px solid #bbf7d0', marginBottom: '30px' }}>
                    <h4 style={{ margin: '0 0 15px', color: '#166534' }}>2. Finished Goods Produced (Adds to Selected Bin)</h4>
                    {outputs.map((line, index) => (
                        <div key={index} style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                            <div style={{position: 'relative', flex: 2}}>
                                <Search size={16} color="#94a3b8" style={{position: 'absolute', top: '12px', left: '10px'}} />
                                <input list="item-skus" required placeholder="Type Finished Good SKU..." value={line.skuInput} onChange={e => handleLineChange('out', index, 'skuInput', e.target.value)} style={{...inp, paddingLeft: '35px'}} />
                            </div>
                            <input type="number" required min="1" placeholder="Qty Produced" value={line.qtyProduced} onChange={e => handleLineChange('out', index, 'qtyProduced', e.target.value)} style={{...inp, flex: 1}} />
                            <input list="location-list" required placeholder="Send to Bin" value={line.destinationLocation} onChange={e => handleLineChange('out', index, 'destinationLocation', e.target.value)} style={{...inp, flex: 1}} />
                            {index > 0 && <button type="button" onClick={() => removeLine('out', index)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={18}/></button>}
                        </div>
                    ))}
                    <button type="button" onClick={() => addLine('out')} style={{ background: 'none', border: 'none', color: '#16a34a', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '10px' }}><Plus size={16}/> Add Output</button>
                </div>

                <button disabled={loading} type="submit" style={btnSubmit}><Save size={20} /> {loading ? 'Processing...' : 'Execute Manufacturing Run'}</button>
            </form>
        </div>
    );
};

const inp = { padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', width: '100%', boxSizing: 'border-box' };
const btnSubmit = { background: '#2563eb', color: 'white', border: 'none', padding: '15px', width: '100%', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' };

export default BuildEngine;