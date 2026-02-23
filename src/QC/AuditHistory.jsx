import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';

const styles = {
    card: { background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', marginBottom: '20px' },
    table: { width: '100%', borderCollapse: 'collapse', marginTop: '10px' },
    th: { background: '#f8fafc', padding: '12px', textAlign: 'left', borderBottom: '2px solid #ccc', cursor: 'pointer' },
    td: { padding: '12px', borderBottom: '1px solid #eee' },
    btn: { padding: '6px 12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' },
    printBtn: { padding: '10px 20px', background: '#10b981', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', marginBottom: '15px' },
    backBtn: { padding: '10px 20px', background: '#64748b', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', marginBottom: '15px', marginRight: '10px' }
};

const AuditHistory = () => {
    const [audits, setAudits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
    const [selectedAudit, setSelectedAudit] = useState(null);

    useEffect(() => {
        const fetchAudits = async () => {
            const q = query(collection(db, "five_s_audits"), orderBy("timestamp", "desc"));
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => {
                const docData = doc.data();
                
                // Calculate total score dynamically based on saved points
                let totalScore = 0;
                if (docData.results) {
                    Object.values(docData.results).forEach(res => {
                        if (res.points !== undefined && res.points !== "") {
                            totalScore += parseInt(res.points);
                        }
                    });
                }
                
                return {
                    id: doc.id,
                    ...docData,
                    totalScore,
                    date: docData.timestamp ? new Date(docData.timestamp.seconds * 1000) : new Date()
                };
            });
            setAudits(data);
            setLoading(false);
        };
        fetchAudits();
    }, []);

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
        setSortConfig({ key, direction });
    };

    const sortedAudits = [...audits].sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
        if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    const handlePrint = () => {
        window.print();
    };

    if (loading) return <div style={styles.card}>Loading audit history...</div>;

    // --- DETAILED PRINT VIEW ---
    if (selectedAudit) {
        return (
            <div style={styles.card} className="print-area">
                <style>
                    {`
                    @media print {
                        body * { visibility: hidden; }
                        .print-area, .print-area * { visibility: visible; }
                        .print-area { position: absolute; left: 0; top: 0; width: 100%; }
                        .no-print { display: none !important; }
                    }
                    `}
                </style>
                <div className="no-print">
                    <button style={styles.backBtn} onClick={() => setSelectedAudit(null)}>← Back to List</button>
                    <button style={styles.printBtn} onClick={handlePrint}>🖨️ Print Audit Report</button>
                </div>
                
                <h2 style={{ color: '#2c3e50' }}>📋 5S Audit Report - {selectedAudit.date.toLocaleDateString()}</h2>
                <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', display: 'inline-block', marginBottom: '20px' }}>
                    <p style={{ margin: '0 0 5px 0' }}><strong>Total Points Scored:</strong> <span style={{fontSize: '18px', color: '#8e44ad', fontWeight: 'bold'}}>{selectedAudit.totalScore}</span></p>
                    <p style={{ margin: 0 }}><strong>Status:</strong> <span style={{color: 'green', fontWeight: 'bold'}}>{selectedAudit.status.toUpperCase()}</span></p>
                </div>

                <h3 style={{ borderBottom: '2px solid #8e44ad', paddingBottom: '5px' }}>Action Items & Scores</h3>
                <table style={styles.table}>
                    <thead>
                        <tr>
                            <th style={styles.th}>Question</th>
                            <th style={styles.th}>Score</th>
                            <th style={styles.th}>Action Required</th>
                            <th style={styles.th}>Due Date</th>
                            <th style={styles.th}>Assigned Owner</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Object.entries(selectedAudit.results || {}).map(([key, data]) => {
                            // Determine if score is "bad". Since scales can vary, 
                            // we generally flag 0, 1, or 2 as red if they exist.
                            const scoreNum = parseInt(data.points);
                            const isLowScore = !isNaN(scoreNum) && scoreNum < 3;

                            return (
                                <tr key={key}>
                                    {/* Uses data.question text! Fallback to key if it's an old audit */}
                                    <td style={styles.td}>{data.question || `Question ID: ${key}`}</td>
                                    
                                    <td style={{...styles.td, fontWeight: 'bold', color: isLowScore ? '#ef4444' : '#10b981'}}>
                                        {data.points !== undefined && data.points !== "" ? data.points : '-'}
                                    </td>
                                    <td style={styles.td}>{data.action || '-'}</td>
                                    <td style={styles.td}>{data.dueDate || '-'}</td>
                                    <td style={styles.td}>{data.owner || '-'}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    }

    // --- LIST VIEW ---
    return (
        <div style={styles.card}>
            <h2 style={{ color: '#8e44ad', marginTop: 0 }}>🗄️ Audit History</h2>
            <p style={{ fontSize: '13px', color: '#64748b' }}>Click on a column header to sort.</p>

            <table style={styles.table}>
                <thead>
                    <tr>
                        <th style={styles.th} onClick={() => handleSort('date')}>
                            Date {sortConfig.key === 'date' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                        </th>
                        <th style={styles.th} onClick={() => handleSort('totalScore')}>
                            Total Score {sortConfig.key === 'totalScore' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                        </th>
                        <th style={styles.th} onClick={() => handleSort('status')}>
                            Status {sortConfig.key === 'status' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                        </th>
                        <th style={styles.th}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {sortedAudits.map(audit => (
                        <tr key={audit.id}>
                            <td style={styles.td}>{audit.date.toLocaleDateString()} at {audit.date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                            <td style={{...styles.td, fontWeight: 'bold', color: '#334155'}}>{audit.totalScore}</td>
                            <td style={styles.td}>
                                <span style={{ background: '#dcfce7', color: '#166534', padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }}>
                                    {audit.status.toUpperCase()}
                                </span>
                            </td>
                            <td style={styles.td}>
                                <button style={styles.btn} onClick={() => setSelectedAudit(audit)}>View & Print</button>
                            </td>
                        </tr>
                    ))}
                    {sortedAudits.length === 0 && (
                        <tr><td colSpan="4" style={{textAlign: 'center', padding: '30px', color: '#666'}}>No audits found.</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default AuditHistory;