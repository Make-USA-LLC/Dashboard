import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';

export default function Logs({ canRevoke }) {
    const [logs, setLogs] = useState([]);
    const [processing, setProcessing] = useState(null);

    useEffect(() => {
        const q = query(collection(db, 'guest_wifi_logs'), orderBy('generatedAt', 'desc'));
        const unsubLogs = onSnapshot(q, (snapshot) => {
            setLogs(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsubLogs();
    }, []);

    const handleRevoke = async (id, name) => {
        if (!window.confirm(`Are you sure you want to kill network access for ${name}?`)) return;
        setProcessing(id);
        try {
            await updateDoc(doc(db, 'guest_wifi_logs', id), { status: 'revoke_pending' });
        } catch (e) {
            alert("Error sending revoke command: " + e.message);
            setProcessing(null);
        }
    };

    return (
        <div style={{ background: 'white', padding: '25px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ marginTop: 0 }}>Access Logs {canRevoke && "& Kill Switch"}</h3>
            {canRevoke && <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '14px' }}>Revoking a voucher will instantly kick the user off the network and destroy their access code.</p>}
            
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '700px' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#64748b', fontSize: '13px', textTransform: 'uppercase' }}>
                            <th style={{ padding: '12px' }}>Created</th>
                            <th style={{ padding: '12px' }}>Guest Info</th>
                            <th style={{ padding: '12px' }}>Duration</th>
                            <th style={{ padding: '12px' }}>Devices</th>
                            <th style={{ padding: '12px' }}>Status / Code</th>
                            {canRevoke && <th style={{ padding: '12px', textAlign: 'right' }}>Action</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {logs.map(log => {
                            const isRevoked = log.status === 'revoked';
                            const isFailed = log.status === 'revoke_failed';
                            const isPending = log.status === 'revoke_pending' || processing === log.id;
                            
                            // Format duration nicely (Days vs Hours)
                            const durationMins = log.duration || 720;
                            const durationDisplay = durationMins >= 1440 
                                ? `${(durationMins / 1440).toFixed(1).replace('.0', '')} Days` 
                                : `${(durationMins / 60).toFixed(1).replace('.0', '')} Hrs`;

                            return (
                                <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: isRevoked ? 0.6 : 1 }}>
                                    <td style={{ padding: '12px', fontSize: '14px', color: '#334155' }}>
                                        {log.generatedAt?.seconds ? new Date(log.generatedAt.seconds * 1000).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Just now'}
                                    </td>
                                    
                                    <td style={{ padding: '12px' }}>
                                        <div style={{ fontWeight: 'bold', color: '#0f172a' }}>{log.firstName} {log.lastName}</div>
                                        <div style={{ fontSize: '12px', color: '#64748b' }}>{log.email}</div>
                                    </td>
                                    
                                    <td style={{ padding: '12px', fontSize: '14px', color: '#334155' }}>{durationDisplay}</td>
                                    <td style={{ padding: '12px', fontSize: '14px', color: '#334155' }}>{log.devices || 1}</td>
                                    
                                    <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: '16px', color: isRevoked ? '#ef4444' : '#0f172a', textDecoration: isRevoked ? 'line-through' : 'none' }}>
                                        {log.code || log.status.toUpperCase()}
                                    </td>
                                    
                                    {canRevoke && (
                                        <td style={{ padding: '12px', textAlign: 'right' }}>
                                            {isRevoked && <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '13px' }}>REVOKED</span>}
                                            {isFailed && <span style={{ color: '#b91c1c', fontSize: '12px' }}>Kill Failed</span>}
                                            {isPending && !isRevoked && !isFailed && <span style={{ color: '#eab308', fontSize: '13px', fontWeight: 'bold' }}>Killing...</span>}
                                            
                                            {log.status === 'completed' && !processing && (
                                                <button 
                                                    onClick={() => handleRevoke(log.id, `${log.firstName} ${log.lastName}`)}
                                                    style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', transition: 'background 0.2s' }}
                                                >
                                                    Kill Access
                                                </button>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}