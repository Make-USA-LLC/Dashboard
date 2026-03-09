import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config'; 
import { collection, onSnapshot, query, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { styles } from './utils';
import Loader from '../components/Loader';

export default function FinishedProduction({ setViewingItem, printTicket, emailFinishedBlend }) {
    const [finishedProduction, setFinishedProduction] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortOption, setSortOption] = useState('dateDesc'); 

    useEffect(() => {
        const qProd = query(collection(db, "blending_production"));
        const unsub = onSnapshot(qProd, (snap) => {
            setFinishedProduction(snap.docs.map(d => ({ id: d.id, ...d.data(), type: 'production' })));
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const handleBillItem = async (item) => {
        const invoice = prompt("Enter Invoice Number for Billing:");
        if (!invoice) return; 
        await updateDoc(doc(db, "blending_production", item.id), { billed: true, invoiceNumber: invoice, billedAt: serverTimestamp() });
    };

    const processedItems = finishedProduction
        .filter(item => {
            const searchLower = searchTerm.toLowerCase();
            return (item.project || item.name || '').toLowerCase().includes(searchLower) || (item.company || '').toLowerCase().includes(searchLower);
        })
        .sort((a, b) => {
            if (sortOption === 'dateDesc') return (b.completedAt?.seconds || 0) - (a.completedAt?.seconds || 0);
            if (sortOption === 'dateAsc') return (a.completedAt?.seconds || 0) - (b.completedAt?.seconds || 0);
            if (sortOption === 'nameAsc') return (a.project || a.name || '').toLowerCase().localeCompare((b.project || b.name || '').toLowerCase());
            if (sortOption === 'sizeDesc') return Number(b.totalBatchGrams || 0) - Number(a.totalBatchGrams || 0);
            return 0;
        });

    if (loading) return <Loader message="Loading Finished Production..." />;

    return (
        <div>
            <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
                <input type="text" placeholder="Search production runs..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ ...styles.input, flex: 1 }} />
                <select value={sortOption} onChange={(e) => setSortOption(e.target.value)} style={{ ...styles.input, width: '200px' }}>
                    <option value="dateDesc">Newest First</option>
                    <option value="dateAsc">Oldest First</option>
                    <option value="nameAsc">Name (A-Z)</option>
                    <option value="sizeDesc">Largest Batch First</option>
                </select>
            </div>

            {processedItems.length === 0 && <p style={{ color: '#666', fontStyle: 'italic' }}>No finished production blends found.</p>}

            {processedItems.map(item => {
                const isBilled = item.billed;

                return (
                    <div key={item.id} style={{...styles.card, borderLeft: `5px solid ${isBilled ? '#10b981' : '#f59e0b'}`, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                        <div>
                            <h3 style={{margin:'0 0 5px 0'}}>{item.project || item.name}</h3>
                            <p style={{margin:0, color:'#666'}}>{item.company !== 'TBD' ? item.company : 'Company TBD'} • Batch: {item.totalBatchGrams}g</p>
                            {isBilled && <p style={{margin: '5px 0 0 0', color: '#10b981', fontSize: '13px', fontWeight: 'bold'}}>✓ Billed (Inv: {item.invoiceNumber})</p>}
                        </div>
                        <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
                            <button onClick={() => setViewingItem(item)} style={{...styles.btn, background: '#3b82f6', color: 'white', padding: '8px 12px'}}>👀 View Excel</button>
                            <button onClick={() => printTicket(item)} style={{...styles.btn, background: '#475569', color: 'white', padding: '8px 12px'}}>🖨️ Print</button>
                            <button onClick={() => emailFinishedBlend(item)} style={{...styles.btn, background: '#8b5cf6', color: 'white', padding: '8px 12px'}}>✉️ Email</button>
                            {!isBilled && <button onClick={() => handleBillItem(item)} style={{...styles.btn, background: '#f59e0b', padding: '8px 12px'}}>💰 Bill</button>}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}