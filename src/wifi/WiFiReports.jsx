import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';

export default function WifiReports() {
    const [logs, setLogs] = useState([]);

    useEffect(() => {
        const q = query(collection(db, 'guest_wifi_logs'), orderBy('generatedAt', 'desc'));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const logData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setLogs(logData);
        });

        return () => unsubscribe();
    }, []);

    return (
        <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'sans-serif' }}>
            <h2>📶 Guest Wi-Fi Access Logs</h2>
            
            <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid #eee' }}>
                            <th style={{ padding: '12px' }}>Date / Time</th>
                            <th style={{ padding: '12px' }}>Name</th>
                            <th style={{ padding: '12px' }}>Email</th>
                            <th style={{ padding: '12px' }}>Voucher Code</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.length === 0 && <tr><td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: '#666' }}>No logs found.</td></tr>}
                        {logs.map(log => (
                            <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '12px' }}>
                                    {log.generatedAt?.seconds ? new Date(log.generatedAt.seconds * 1000).toLocaleString() : 'Pending...'}
                                </td>
                                <td style={{ padding: '12px', fontWeight: 'bold' }}>{log.firstName} {log.lastName}</td>
                                <td style={{ padding: '12px', color: '#475569' }}>{log.email}</td>
                                <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: '16px' }}>{log.code}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}