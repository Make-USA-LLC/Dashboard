import React from 'react';
import { getGallons } from './utils';

export default function ViewingModal({ viewingItem, setViewingItem, emailFinishedBlend, printTicket, styles }) {
    if (!viewingItem) return null;

    return (
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
    );
}