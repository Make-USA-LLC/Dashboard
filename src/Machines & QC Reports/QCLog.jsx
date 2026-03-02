import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { db } from '../firebase_config';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { Search, Download, CheckCircle, XCircle, Hash } from 'lucide-react';

export default function QCLog() {
    const [reports, setReports] = useState([]);
    const [filtered, setFiltered] = useState([]);
    const [search, setSearch] = useState('');
    
    useEffect(() => {
        const fetch = async () => {
            const q = query(collection(db, "reports"), orderBy("completedAt", "desc"));
            const snap = await getDocs(q);
            const list = snap.docs.map(doc => {
                const d = doc.data();
                const finished = d.completedAt?.toDate ? d.completedAt.toDate() : new Date(d.completedAt);
                const checked = d.qcDate?.toDate ? d.qcDate.toDate() : (d.qcDate ? new Date(d.qcDate) : null);
                
                // Calculate actual wait time if checked, otherwise it's 0 (Auto-Pass)
                let lag = 0;
                if (finished && checked) {
                    lag = (checked - finished) / (1000 * 60 * 60);
                }

                // RESOLVE QC STATUS:
                // If the project doesn't have a result yet, it's a PASS by default.
                const hasExplicitQC = !!d.qcResult;
                const result = hasExplicitQC ? d.qcResult.toLowerCase() : 'passed';
                const finalLag = hasExplicitQC ? lag : 0;

                return {
                    id: doc.id,
                    finished,
                    checked,
                    lag: finalLag,
                    project: d.project,
                    company: d.company,
                    leader: d.leader,
                    result,
                    defect: d.defectReason || '',
                    qcBy: d.qcBy || (hasExplicitQC ? '' : 'Auto-Passed')
                };
            });

            // Filter out old/invalid test data
            const cleanList = list.filter(r => r.finished.getFullYear() > 2020);
            setReports(cleanList);
            setFiltered(cleanList);
        };
        fetch();
    }, []);

    useEffect(() => {
        const lower = search.toLowerCase();
        setFiltered(reports.filter(r => 
            (r.project || '').toLowerCase().includes(lower) || 
            (r.company || '').toLowerCase().includes(lower) || 
            (r.leader || '').toLowerCase().includes(lower)
        ));
    }, [search, reports]);

    const handleViewID = (id) => {
        prompt("Firebase Document ID:", id);
    };

    const handleExport = () => {
        const ws = XLSX.utils.json_to_sheet(filtered.map(r => ({
            ID: r.id,
            Run_Date: r.finished.toLocaleDateString(),
            Project: r.project,
            Company: r.company,
            Status: r.result.toUpperCase(),
            QC_Downtime_Hrs: r.lag.toFixed(2),
            Defect_Notes: r.defect,
            QC_Technician: r.qcBy
        })));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "QC_Reports");
        XLSX.writeFile(wb, "QC_Production_Reports.xlsx");
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-fade-in">
            <div className="p-4 border-b bg-slate-50 flex flex-wrap gap-4 justify-between items-center">
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                    <input 
                        type="text" 
                        placeholder="Search project, company..." 
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-10 pr-4 py-2 border rounded-lg text-sm w-64 focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                </div>
                <button onClick={handleExport} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-sm">
                    <Download size={16} /> Export Excel
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[11px] tracking-wider border-b">
                        <tr>
                            <th className="p-4">Finished Date</th>
                            <th className="p-4">Project Info</th>
                            <th className="p-4">Line Leader</th>
                            <th className="p-4 text-center">Status</th>
                            <th className="p-4 text-right">QC Downtime</th>
                            <th className="p-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filtered.map(r => (
                            <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                                <td className="p-4 whitespace-nowrap">
                                    <div className="font-bold text-slate-700">{r.finished.toLocaleDateString()}</div>
                                    <div className="text-[11px] text-slate-400">{r.finished.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                                </td>
                                <td className="p-4">
                                    <div className="font-bold text-blue-600">{r.project}</div>
                                    <div className="text-[11px] text-slate-500">{r.company}</div>
                                </td>
                                <td className="p-4 text-slate-600">{r.leader}</td>
                                <td className="p-4 text-center">
                                    {r.result === 'failed' || r.result === 'fail' ? (
                                        <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 px-2 py-1 rounded text-[10px] font-black uppercase">
                                            <XCircle size={12}/> Defect
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2 py-1 rounded text-[10px] font-black uppercase">
                                            <CheckCircle size={12}/> Pass
                                        </span>
                                    )}
                                </td>
                                <td className={`p-4 text-right font-mono font-bold ${r.lag > 0 ? 'text-orange-600' : 'text-slate-400'}`}>
                                    {r.lag > 0 ? `${r.lag.toFixed(1)}h` : '0.0h'}
                                </td>
                                <td className="p-4 text-right">
                                    <button 
                                        onClick={() => handleViewID(r.id)}
                                        className="p-1.5 hover:bg-slate-200 rounded text-slate-300 hover:text-slate-600 transition-colors"
                                        title="View Document ID"
                                    >
                                        <Hash size={14} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}