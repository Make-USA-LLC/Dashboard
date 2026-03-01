import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { collection, query, orderBy, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore'; // Added doc, updateDoc, serverTimestamp

const AuditHistory = () => {
    const [audits, setAudits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
    const [selectedAudit, setSelectedAudit] = useState(null);
    const [resending, setResending] = useState(false); // NEW STATE

    useEffect(() => {
        const fetchAudits = async () => {
            const q = query(collection(db, "five_s_audits"), orderBy("timestamp", "desc"));
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(docSnap => {
                const docData = docSnap.data();
                let totalScore = 0;
                if (docData.results) {
                    Object.values(docData.results).forEach(res => {
                        if (res.points !== undefined && res.points !== "") {
                            totalScore += parseInt(res.points);
                        }
                    });
                }
                return {
                    id: docSnap.id,
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

    const handlePrint = () => window.print();

    // --- NEW RESEND LOGIC ---
    const handleResend = async () => {
        if (!confirm("Resend email alerts to owners for failed items?")) return;
        setResending(true);
        try {
            await updateDoc(doc(db, "five_s_audits", selectedAudit.id), {
                resendTimestamp: serverTimestamp()
            });
            alert("Resend request triggered! Emails are firing in the background.");
        } catch (err) {
            console.error("Error updating audit:", err);
            alert("Failed to resend alerts.");
        } finally {
            setResending(false);
        }
    };

    if (loading) return <div className="p-10 text-center text-slate-400">Loading audit history...</div>;

    // --- DETAILED PRINT VIEW ---
    if (selectedAudit) {
        return (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 print-area relative">
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
                <div className="no-print flex flex-wrap gap-3 mb-6">
                    <button className="px-4 py-2 bg-slate-500 hover:bg-slate-600 text-white rounded-lg font-bold" onClick={() => setSelectedAudit(null)}>← Back to List</button>
                    <button className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold" onClick={handlePrint}>🖨️ Print Report</button>
                    <button 
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-all disabled:opacity-50 flex items-center gap-2"
                        onClick={handleResend}
                        disabled={resending}
                    >
                        {resending ? 'Sending...' : '📧 Resend Alerts'}
                    </button>
                </div>
                
                <h2 className="text-2xl font-bold text-slate-800 mb-4">📋 5S Audit Report - {selectedAudit.date.toLocaleDateString()}</h2>
                
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 inline-block mb-6">
                    <p className="mb-1 text-slate-600"><strong>Total Points Scored:</strong> <span className="text-xl text-purple-600 font-bold ml-2">{selectedAudit.totalScore}</span></p>
                    <p className="m-0 text-slate-600"><strong>Status:</strong> <span className="text-emerald-600 font-bold ml-2">{selectedAudit.status.toUpperCase()}</span></p>
                </div>

                <h3 className="text-lg font-bold border-b-2 border-purple-500 pb-2 mb-4 text-slate-700">Action Items & Scores</h3>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-3 font-bold">Question</th>
                                <th className="px-6 py-3 font-bold text-center">Score</th>
                                <th className="px-6 py-3 font-bold">Action Required</th>
                                <th className="px-6 py-3 font-bold">Due Date</th>
                                <th className="px-6 py-3 font-bold">Assigned Owner</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {Object.entries(selectedAudit.results || {}).map(([key, data]) => {
                                const scoreNum = parseInt(data.points);
                                const isLowScore = !isNaN(scoreNum) && scoreNum < 3;

                                return (
                                    <tr key={key} className="hover:bg-slate-50">
                                        <td className="px-6 py-4">{data.question || `Question ID: ${key}`}</td>
                                        <td className={`px-6 py-4 text-center font-bold ${isLowScore ? 'text-red-500' : 'text-emerald-500'}`}>
                                            {data.points !== undefined && data.points !== "" ? data.points : '-'}
                                        </td>
                                        <td className="px-6 py-4">{data.action || '-'}</td>
                                        <td className="px-6 py-4">{data.dueDate || '-'}</td>
                                        <td className="px-6 py-4">{data.owner || '-'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    // --- LIST VIEW ---
    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100">
                <h2 className="text-xl font-bold text-purple-700 m-0">🗄️ Audit History</h2>
                <p className="text-sm text-slate-500 mt-1">Click on a column header to sort.</p>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
                        <tr>
                            <th className="px-6 py-3 font-bold cursor-pointer hover:bg-slate-100" onClick={() => handleSort('date')}>
                                Date {sortConfig.key === 'date' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                            </th>
                            <th className="px-6 py-3 font-bold cursor-pointer hover:bg-slate-100" onClick={() => handleSort('totalScore')}>
                                Total Score {sortConfig.key === 'totalScore' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                            </th>
                            <th className="px-6 py-3 font-bold cursor-pointer hover:bg-slate-100" onClick={() => handleSort('status')}>
                                Status {sortConfig.key === 'status' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                            </th>
                            <th className="px-6 py-3 font-bold">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {sortedAudits.map(audit => (
                            <tr key={audit.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap text-slate-600 font-medium">
                                    {audit.date.toLocaleDateString()} <span className="text-slate-400 ml-1">at {audit.date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                </td>
                                <td className="px-6 py-4 font-black text-slate-700">
                                    {audit.totalScore}
                                </td>
                                <td className="px-6 py-4">
                                    <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-bold tracking-wide">
                                        {audit.status.toUpperCase()}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <button 
                                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs font-bold transition-colors"
                                        onClick={() => setSelectedAudit(audit)}
                                    >
                                        View & Print
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {sortedAudits.length === 0 && (
                            <tr>
                                <td colSpan="4" className="px-6 py-10 text-center text-slate-400 italic">No audits found.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AuditHistory;