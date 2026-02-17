import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { db } from '../firebase_config';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { Search, Download, Hash, Activity, Filter, Settings } from 'lucide-react';

export default function SetupLog() {
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState('');
    
    // Data Storage
    const [reports, setReports] = useState([]);
    const [filteredReports, setFilteredReports] = useState([]);
    const [employees, setEmployees] = useState({}); 
    const [globalRate, setGlobalRate] = useState(0);

    // Filter & Config State
    const [costMode, setCostMode] = useState('global'); 
    const [customRate, setCustomRate] = useState(0);
    const [searchText, setSearchText] = useState('');
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    
    // DEBUG MODE
    const [showDebug, setShowDebug] = useState(false);
    const [rawDocs, setRawDocs] = useState([]);

    // --- HELPER: SAFE DATE CONVERSION ---
    const parseDate = (dateVal) => {
        if (!dateVal) return new Date();
        if (typeof dateVal.toDate === 'function') {
            return dateVal.toDate();
        }
        return new Date(dateVal);
    };

    // --- HELPER: DATA NORMALIZATION ---
    const normalizeReport = (docSnapshot) => {
        const data = docSnapshot.data();
        
        // 1. Resolve Date
        const dateObj = parseDate(data.completedAt || data.date);

        // 2. Resolve Machine Name (Cleaning prefix)
        let machine = data.machine || data.lineName || data.leader || "Unknown Machine";
        if (machine && typeof machine === 'string' && machine.startsWith("Setup: ")) {
            machine = machine.replace("Setup: ", "");
        }

        // 3. Resolve Technician(s)
        let techList = [];
        if (data.workerLog) {
            const processWorker = (w) => {
                if (!w) return;
                if (w.name && w.name !== "Unknown") {
                    techList.push(w.name);
                } else if (w.id) {
                    techList.push(`ID:${w.id}`);
                }
            };
            if (Array.isArray(data.workerLog)) {
                data.workerLog.forEach(processWorker);
            } else if (typeof data.workerLog === 'object') {
                Object.values(data.workerLog).forEach(processWorker);
            }
        }

        if (techList.length === 0) {
            if (data.technician) techList.push(data.technician);
            else if (data.user) techList.push(data.user);
        }

        if (techList.length === 0) techList.push("Unknown");
        const technician = techList.join(", ");

        // 4. Resolve Hours
        let hours = 0;
        if (data.hours) {
            hours = parseFloat(data.hours);
        } else if (data.durationMinutes) {
            hours = parseFloat(data.durationMinutes) / 60;
        } else if (data.finalSeconds) {
            hours = parseFloat(data.finalSeconds) / 3600;
        }

        return {
            id: docSnapshot.id,
            ...data,
            dateObj,     
            machine,
            company: data.company || "—", // ADDED
            project: data.project || "—", // ADDED
            technician, 
            techList,
            techCount: techList.length,
            hours        
        };
    };

    // --- INITIAL LOAD ---
    useEffect(() => {
        const initData = async () => {
            setLoading(true);
            setErrorMsg('');

            try {
                const configSnap = await getDoc(doc(db, "config", "finance"));
                if (configSnap.exists()) {
                    setGlobalRate(configSnap.data().costPerHour || 0);
                }

                const empSnap = await getDocs(collection(db, "employees"));
                const empMap = {};
                empSnap.forEach(d => {
                    const data = d.data();
                    const name = `${data.firstName || ''} ${data.lastName || ''}`.trim();
                    let rate = parseFloat(data.compensation) || 0;
                    if (data.type === 'Salary') rate = rate / 2080;
                    if (name) empMap[name] = { rate };
                    if (data.firstName) empMap[data.firstName] = { rate };
                });
                setEmployees(empMap);

                const snap = await getDocs(collection(db, "machine_setup_reports"));
                setRawDocs(snap.docs.map(d => ({ 
                    id: d.id, 
                    date: parseDate(d.data().completedAt || d.data().date).toLocaleString(),
                    workerLogContent: d.data().workerLog
                }))); 

                const list = snap.docs.map(doc => normalizeReport(doc));
                list.sort((a, b) => b.dateObj - a.dateObj);
                
                setReports(list);
                setFilteredReports(list);
            } catch (err) {
                console.error("Error loading reports:", err);
                setErrorMsg(err.message);
            } finally {
                setLoading(false);
            }
        };
        initData();
    }, []);

    // --- CALCULATIONS ---
    const getHourlyRate = (report) => {
        if (costMode === 'custom') return parseFloat(customRate) || 0;
        if (costMode === 'employee') {
            const names = report.techList || [];
            let totalRate = 0;
            let foundAny = false;
            names.forEach(name => {
                 const cleanName = name.trim();
                 const emp = employees[cleanName] || employees[cleanName.split(' ')[0]]; 
                 if (emp) {
                     totalRate += emp.rate;
                     foundAny = true;
                 }
            });
            return foundAny ? totalRate : globalRate; 
        }
        return globalRate;
    };

    const calculateCost = (report) => {
        const rate = getHourlyRate(report);
        return (report.hours * rate);
    };

    // --- FILTERING ---
    useEffect(() => {
        let temp = [...reports];

        if (searchText) {
            const lower = searchText.toLowerCase();
            temp = temp.filter(r => 
                (r.machine || '').toLowerCase().includes(lower) ||
                (r.company || '').toLowerCase().includes(lower) || // ADDED TO SEARCH
                (r.project || '').toLowerCase().includes(lower) || // ADDED TO SEARCH
                (r.technician || '').toLowerCase().includes(lower) ||
                (r.notes || '').toLowerCase().includes(lower)
            );
        }

        if (dateRange.start) {
            const start = new Date(dateRange.start);
            temp = temp.filter(r => r.dateObj >= start);
        }
        if (dateRange.end) {
            const end = new Date(dateRange.end);
            end.setHours(23, 59, 59, 999); 
            temp = temp.filter(r => r.dateObj <= end);
        }

        setFilteredReports(temp);
    }, [searchText, dateRange, reports]);

    const handleViewID = (id) => {
        prompt("Report ID (Copy to clipboard):", id);
    };

    const handleExport = () => {
        const exportData = filteredReports.map(r => {
            const rate = getHourlyRate(r);
            return {
                Date: r.dateObj.toLocaleDateString() + ' ' + r.dateObj.toLocaleTimeString(),
                Machine: r.machine,
                Company: r.company, // ADDED
                Project: r.project, // ADDED
                Technicians: r.technician,
                Count: r.techCount,
                Duration_Hrs: r.hours.toFixed(4),
                Rate_Basis: costMode,
                Hourly_Rate: rate.toFixed(2),
                Total_Cost: (r.hours * rate).toFixed(2),
                Notes: r.notes || ''
            };
        });
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Machine_Setups");
        XLSX.writeFile(wb, "Machine_Setup_Analysis.xlsx");
    };

    if (loading) return <div className="p-10 text-center text-slate-400">Loading Machine Reports...</div>;

    const totalPeriodCost = filteredReports.reduce((sum, r) => sum + calculateCost(r), 0);

    return (
        <div className="space-y-6 animate-fade-in">
            {errorMsg && (
                <div className="p-4 bg-red-100 text-red-700 rounded-xl border border-red-200">
                    <strong>Error:</strong> {errorMsg}
                </div>
            )}

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
                <div className="flex flex-wrap gap-6 items-end">
                    <div className="flex-1 min-w-[280px]">
                        <label className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase mb-2">
                            <Settings size={14}/> Cost Calculation Basis
                        </label>
                        <div className="flex gap-2">
                            <select 
                                value={costMode} 
                                onChange={e => setCostMode(e.target.value)}
                                className="flex-1 p-2.5 border rounded-lg text-sm font-bold bg-slate-50 focus:bg-white transition-colors"
                            >
                                <option value="global">Global Rate (${globalRate.toFixed(2)}/hr)</option>
                                <option value="employee">Employee Specific Rate</option>
                                <option value="custom">Custom Fixed Rate</option>
                            </select>
                            {costMode === 'custom' && (
                                <input 
                                    type="number" 
                                    placeholder="$0.00"
                                    value={customRate}
                                    onChange={e => setCustomRate(e.target.value)}
                                    className="w-24 p-2.5 border rounded-lg text-sm font-bold text-center"
                                />
                            )}
                        </div>
                    </div>

                    <div>
                        <label className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase mb-2">
                            <Filter size={14}/> Date Range
                        </label>
                        <div className="flex items-center gap-2 bg-slate-50 border p-1 rounded-lg">
                            <input type="date" value={dateRange.start} onChange={e => setDateRange({...dateRange, start:e.target.value})} className="bg-transparent text-sm p-1.5 focus:outline-none" />
                            <span className="text-slate-300">-</span>
                            <input type="date" value={dateRange.end} onChange={e => setDateRange({...dateRange, end:e.target.value})} className="bg-transparent text-sm p-1.5 focus:outline-none" />
                        </div>
                    </div>

                    <div className="flex-1 min-w-[200px]">
                        <label className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase mb-2">
                            <Search size={14}/> Search
                        </label>
                        <input 
                            placeholder="Machine, tech, company..." 
                            value={searchText}
                            onChange={e => setSearchText(e.target.value)}
                            className="w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 transition-all" 
                        />
                    </div>

                    <div className="text-right border-l pl-6 border-slate-100">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Period Cost</div>
                        <div className="text-3xl font-black text-green-600">
                            ${totalPeriodCost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </div>
                    </div>
                </div>

                <div className="pt-2 border-t border-slate-50 flex justify-between items-center">
                    <button onClick={() => setShowDebug(!showDebug)} className="text-[10px] uppercase font-bold text-slate-400 hover:text-slate-600 transition-colors">
                        {showDebug ? '[-] Hide Debug Data' : '[+] Show Debug Data'}
                    </button>
                    <button onClick={handleExport} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-sm">
                        <Download size={16}/> Download Excel
                    </button>
                </div>

                {showDebug && (
                    <div className="bg-slate-900 text-emerald-400 p-4 rounded-lg text-[11px] font-mono overflow-auto max-h-60 shadow-inner">
                        <div className="mb-2 border-b border-slate-800 pb-1 text-slate-500 font-bold">Latest 5 Raw Logs:</div>
                        <pre>{JSON.stringify(rawDocs.slice(0, 5), null, 2)}</pre>
                    </div>
                )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2"><Activity size={18} className="text-blue-500"/> Found {filteredReports.length} Setup Reports</h3>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[11px] tracking-wider border-b">
                            <tr>
                                <th className="p-4">Date</th>
                                <th className="p-4">Machine / Line</th>
                                <th className="p-4">Company</th> {/* ADDED COLUMN */}
                                <th className="p-4">Project</th> {/* ADDED COLUMN */}
                                <th className="p-4">Technician(s)</th>
                                <th className="p-4 text-right">Duration</th>
                                <th className="p-4 text-right">Rate</th>
                                <th className="p-4 text-right">Cost</th>
                                
                                <th className="p-4 text-right"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredReports.length === 0 ? (
                                <tr><td colSpan="10" className="p-12 text-center text-slate-400 italic">No reports match your current filters.</td></tr>
                            ) : (
                                filteredReports.map(r => {
                                    const rate = getHourlyRate(r);
                                    const cost = r.hours * rate;
                                    return (
                                        <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-4 whitespace-nowrap">
                                                <div className="font-bold text-slate-700">{r.dateObj.toLocaleDateString()}</div>
                                                <div className="text-[11px] text-slate-400">{r.dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                                            </td>
                                            <td className="p-4 font-black text-blue-600">{r.machine}</td>
                                            <td className="p-4 text-slate-600 font-medium">{r.company}</td> {/* ADDED CELL */}
                                            <td className="p-4 text-slate-500 italic">{r.project}</td> {/* ADDED CELL */}
                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    {r.techCount > 1 && (
                                                        <span className="bg-blue-100 text-blue-700 text-[10px] font-black px-1.5 py-0.5 rounded-full" title={`${r.techCount} technicians`}>
                                                            {r.techCount}
                                                        </span>
                                                    )}
                                                    <span className="text-slate-600 font-medium">{r.technician}</span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-right font-mono font-bold text-slate-700">
                                                {r.hours.toFixed(2)} hrs
                                                <div className="text-[10px] text-slate-400 font-normal">{Math.round(r.hours * 60)} mins</div>
                                            </td>
                                            <td className="p-4 text-right font-mono text-slate-400">${rate.toFixed(2)}</td>
                                            <td className="p-4 text-right font-mono font-black text-green-600">${cost.toFixed(2)}</td>
                                            
                                            <td className="p-4 text-right">
                                                <button 
                                                    onClick={() => handleViewID(r.id)} 
                                                    className="p-2 text-slate-300 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-all"
                                                    title="Copy Firebase ID"
                                                >
                                                    <Hash size={14}/>
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}