import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config'; 
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { styles } from './utils';
import SampleForm from './SampleForm';
import Loader from '../components/Loader';

export default function SampleQueue({ setProcessingItem, setViewingItem, printTicket, markAsFinishedInline }) {
    const [pendingSamples, setPendingSamples] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showSampleForm, setShowSampleForm] = useState(false);

    useEffect(() => {
        const qSamples = query(collection(db, "blending_samples"), where("status", "==", "pending"));
        const unsub = onSnapshot(qSamples, (snap) => {
            setPendingSamples(snap.docs.map(d => ({ id: d.id, ...d.data(), type: 'sample' })));
            setLoading(false);
        });
        return () => unsub();
    }, []);

    if (loading) return <Loader message="Loading Samples Queue..." />;

    return (
        <div>
            <button onClick={() => setShowSampleForm(!showSampleForm)} style={{...styles.btn, marginBottom: '20px', background: '#2563eb', color: 'white'}}>+ New Sample</button>
            {showSampleForm && <SampleForm setShowSampleForm={setShowSampleForm} styles={styles} />}

            {pendingSamples.length === 0 && <p>No pending samples.</p>}
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
                            <button onClick={() => setProcessingItem(sample)} style={{...styles.btn, background: '#3b82f6', color: 'white'}}>➕ Add Information</button>
                        ) : (
                            <>
                                <button onClick={() => setProcessingItem(sample)} style={{...styles.btn, background: '#f59e0b', padding: '8px 12px'}}>✏️ Edit Info</button>
                                <button onClick={() => setViewingItem(sample)} style={{...styles.btn, background: '#3b82f6', color: 'white', padding: '8px 12px'}}>👀 View Excel</button>
                                <button onClick={() => printTicket(sample)} style={{...styles.btn, background: '#475569', color: 'white', padding: '8px 12px'}}>🖨️ Print</button>
                                <button onClick={() => markAsFinishedInline(sample)} style={{...styles.btn, background: '#10b981', color: 'white', padding: '8px 12px'}}>✅ Finish</button>
                            </>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}