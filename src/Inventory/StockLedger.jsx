import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { collection, onSnapshot } from 'firebase/firestore';
import { MapPin, Search } from 'lucide-react';

const StockLedger = () => {
    const [items, setItems] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const unsub = onSnapshot(collection(db, "inv_items"), (snap) => {
            setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsub();
    }, []);

    const filtered = items.filter(i => 
        i.sku.toLowerCase().includes(searchTerm.toLowerCase()) || 
        i.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}><MapPin size={20}/> Global Stock & Bins</h3>
                <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', padding: '8px 15px', borderRadius: '8px', width: '300px' }}>
                    <Search size={18} color="#64748b" />
                    <input 
                        placeholder="Search SKU or Name..." 
                        value={searchTerm} 
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{ border: 'none', background: 'transparent', outline: 'none', marginLeft: '10px', width: '100%' }}
                    />
                </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead style={{ background: '#f8fafc', color: '#475569', fontSize: '14px' }}>
                    <tr>
                        <th style={thStyle}>SKU</th>
                        <th style={thStyle}>Item Name</th>
                        <th style={thStyle}>Total Stock</th>
                        <th style={thStyle}>Bin Locations</th>
                    </tr>
                </thead>
                <tbody>
                    {filtered.map(item => {
                        const locations = item.locations || {};
                        const binKeys = Object.keys(locations).filter(k => locations[k] !== 0); // Hide empty bins

                        return (
                            <tr key={item.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                <td style={{...tdStyle, fontWeight: 'bold'}}>{item.sku}</td>
                                <td style={tdStyle}>{item.name}</td>
                                <td style={{...tdStyle, fontSize: '16px', fontWeight: 'bold', color: (item.totalQuantity || 0) < item.reorderPoint ? '#ef4444' : '#16a34a'}}>
                                    {item.totalQuantity || 0} {item.uom}
                                </td>
                                <td style={tdStyle}>
                                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                        {binKeys.map(bin => (
                                            <span key={bin} style={{ background: '#f1f5f9', padding: '4px 8px', borderRadius: '6px', fontSize: '13px', border: '1px solid #cbd5e1' }}>
                                                <strong>{bin}:</strong> {locations[bin]}
                                            </span>
                                        ))}
                                        {binKeys.length === 0 && <span style={{color: '#94a3b8', fontSize: '13px'}}>No specific bin allocated</span>}
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

const thStyle = { padding: '15px', borderBottom: '2px solid #e2e8f0' };
const tdStyle = { padding: '15px', color: '#334155', verticalAlign: 'top' };

export default StockLedger;