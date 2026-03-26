import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { collection, onSnapshot, addDoc, doc, updateDoc } from 'firebase/firestore';
import { Plus, Search, Edit2, Package } from 'lucide-react';

const ItemMaster = ({ isManager }) => {
    const [items, setItems] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    
    // Removed 'cost'
    const [formData, setFormData] = useState({
        sku: '', name: '', type: 'Raw Material', uom: 'Each', reorderPoint: 0
    });

    useEffect(() => {
        const unsub = onSnapshot(collection(db, "inv_items"), (snap) => {
            setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsub();
    }, []);

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            await addDoc(collection(db, "inv_items"), {
                ...formData,
                reorderPoint: parseInt(formData.reorderPoint) || 0,
                createdAt: new Date()
            });
            setShowModal(false);
            setFormData({ sku: '', name: '', type: 'Raw Material', uom: 'Each', reorderPoint: 0 });
        } catch (error) { alert(error.message); }
    };

    const filtered = items.filter(i => 
        i.sku.toLowerCase().includes(searchTerm.toLowerCase()) || 
        i.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Package color="#2563eb" size={24}/>
                    <h2 style={{ margin: 0, color: '#0f172a', fontSize: '18px' }}>Item Catalog</h2>
                </div>
                <div style={{ display: 'flex', gap: '15px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', padding: '8px 15px', borderRadius: '8px', width: '300px' }}>
                        <Search size={18} color="#64748b" />
                        <input 
                            placeholder="Search SKU or Name..." 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{ border: 'none', background: 'transparent', outline: 'none', marginLeft: '10px', width: '100%' }}
                        />
                    </div>
                    {isManager && <button onClick={() => setShowModal(true)} style={btnPrimary}><Plus size={18} /> New Item</button>}
                </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead style={{ background: '#f8fafc', color: '#475569', fontSize: '14px' }}>
                    <tr>
                        <th style={thStyle}>SKU</th>
                        <th style={thStyle}>Item Name</th>
                        <th style={thStyle}>Type</th>
                        <th style={thStyle}>UoM</th>
                    </tr>
                </thead>
                <tbody>
                    {filtered.map(item => (
                        <tr key={item.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{...tdStyle, fontWeight: 'bold'}}>{item.sku}</td>
                            <td style={tdStyle}>{item.name}</td>
                            <td style={tdStyle}>
                                <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '12px', background: item.type === 'Finished Good' ? '#dcfce7' : '#e0f2fe', color: item.type === 'Finished Good' ? '#166534' : '#0369a1' }}>
                                    {item.type}
                                </span>
                            </td>
                            <td style={tdStyle}>{item.uom}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* QUICK MODAL */}
            {showModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <form onSubmit={handleSave} style={{ background: 'white', padding: '30px', borderRadius: '12px', width: '500px' }}>
                        <h3 style={{marginTop: 0}}>Create Master Item</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                            <div><label style={lbl}>SKU</label><input required value={formData.sku} onChange={e=>setFormData({...formData, sku: e.target.value})} style={inp} /></div>
                            <div><label style={lbl}>Type</label>
                                <select value={formData.type} onChange={e=>setFormData({...formData, type: e.target.value})} style={inp}>
                                    <option>Raw Material</option>
                                    <option>Component</option>
                                    <option>Finished Good</option>
                                </select>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Item Name</label><input required value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} style={inp} /></div>
                            <div><label style={lbl}>UoM (Unit of Measure)</label><input required value={formData.uom} onChange={e=>setFormData({...formData, uom: e.target.value})} style={inp} placeholder="Each, ml, kg" /></div>
                            <div><label style={lbl}>Low Stock Alert Level</label><input type="number" value={formData.reorderPoint} onChange={e=>setFormData({...formData, reorderPoint: e.target.value})} style={inp} /></div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button type="button" onClick={() => setShowModal(false)} style={{ padding: '10px 20px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer' }}>Cancel</button>
                            <button type="submit" style={btnPrimary}>Save Item</button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

const thStyle = { padding: '15px', borderBottom: '2px solid #e2e8f0' };
const tdStyle = { padding: '15px', color: '#334155' };
const lbl = { display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#64748b', marginBottom: '5px' };
const inp = { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' };
const btnPrimary = { background: '#2563eb', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' };

export default ItemMaster;