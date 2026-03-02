import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { db } from '../firebase_config';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';

export default function Reports() {
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

        // 2. Resolve Machine Name
        let machine = data.machine || data.lineName || data.leader || "Unknown Machine";
        if (machine && typeof machine === 'string' && machine.startsWith("Setup: ")) {
            machine = machine.replace("Setup: ", "");
        }

        // 3. Resolve Technician(s) - SHOW ALL (No Deduplication)
        let techList = [];

        // CHECK WORKER LOG (Primary)
        if (data.workerLog) {
            const processWorker = (w) => {
                if (!w) return;
                // Prefer Name, fallback to ID, fallback to 'Unknown'
                if (w.name && w.name !== "Unknown") {
                    techList.push(w.name);
                } else if (w.id) {
                    techList.push(`ID:${w.id}`);
                }
            };

            // Case A: Standard Array
            if (Array.isArray(data.workerLog)) {
                data.workerLog.forEach(processWorker);
            } 
            // Case B: Object/Map (Firestore fallback)
            else if (typeof data.workerLog === 'object') {
                Object.values(data.workerLog).forEach(processWorker);
            }
        }

        // CHECK LEGACY FIELDS (Only if list is empty to prevent duplicates mixed with log)
        if (techList.length === 0) {
            if (data.technician) techList.push(data.technician);
            else if (data.user) techList.push(data.user);
        }

        // Fallback
        if (techList.length === 0) techList.push("Unknown");

        // Join ALL names (Allow duplicates to ensure visibility)
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
            technician, 
            techList, // Array of names
            techCount: techList.length,
            hours        
        };
    };

    // --- INITIAL LOAD ---
    useEffect(() => {
        const initData = async () => {
            setLoading(true);
            setErrorMsg('');

            // 1. FETCH CONFIG
            try {
                const configSnap = await getDoc(doc(db, "config", "finance"));
                if (configSnap.exists()) {
                    setGlobalRate(configSnap.data().costPerHour || 0);
                }
            } catch (e) { console.warn("Could not load finance config", e); }

            // 2. FETCH EMPLOYEES
            try {
                const empSnap = await getDocs(collection(db, "employees"));
                const empMap = {};
                empSnap.forEach(d => {
                    const data = d.data();
                    const name = `${data.firstName || ''} ${data.lastName || ''}`.trim();
                    let rate = parseFloat(data.compensation) || 0;
                    if (data.type === 'Salary') rate = rate / 2080;
                    if (name) empMap[name] = { rate, type: data.type };
                    if (data.firstName) empMap[data.firstName] = { rate, type: data.type };
                });
                setEmployees(empMap);
            } catch (e) {
                console.warn("Could not load employees.", e);
            }

            // 3. FETCH REPORTS
            try {
                const snap = await getDocs(collection(db, "machine_setup_reports"));
                
                // Debugging: Capture raw data structure with focus on workerLog
                setRawDocs(snap.docs.map(d => ({ 
                    id: d.id, 
                    date: new Date(d.data().completedAt?.seconds * 1000).toLocaleString(),
                    workerLogType: Array.isArray(d.data().workerLog) ? 'Array' : typeof d.data().workerLog,
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

    if (loading) return <div style={{textAlign:'center', marginTop:50, color:'#64748b'}}>Loading Machine Reports...</div>;

    const totalPeriodCost = filteredReports.reduce((sum, r) => sum + calculateCost(r), 0);

    return (
        <div>
            {/* ERROR ALERT */}
            {errorMsg && (
                <div style={{padding:'15px', background:'#fee2e2', color:'#dc2626', borderRadius:'8px', marginBottom:'20px', border:'1px solid #fecaca'}}>
                    <strong>Error Loading Data:</strong> {errorMsg}
                </div>
            )}

            {/* CONTROLS CARD */}
            <div style={{background:'white', padding:'20px', borderRadius:'12px', boxShadow:'0 2px 5px rgba(0,0,0,0.05)', marginBottom:'20px', display:'flex', flexWrap:'wrap', gap:'20px', alignItems:'flex-end'}}>
                
                {/* DEBUG TOGGLE */}
                <div style={{width:'100%', display:'flex', justifyContent:'flex-end'}}>
                    <button onClick={() => setShowDebug(!showDebug)} style={{fontSize:'12px', color:'#64748b', background:'none', border:'none', cursor:'pointer', textDecoration:'underline'}}>
                        {showDebug ? 'Hide Debug Data' : 'Show Debug Data'}
                    </button>
                </div>

                {/* DEBUG VIEW */}
                {showDebug && (
                    <div style={{width:'100%', background:'#1e293b', color:'#10b981', padding:'15px', borderRadius:'8px', fontSize:'12px', overflowX:'auto', marginBottom:'15px'}}>
                        <strong>Raw Log Data (Check 'workerLogContent'):</strong>
                        <pre>{JSON.stringify(rawDocs.slice(0, 5), null, 2)}</pre>
                    </div>
                )}

                {/* Cost Settings */}
                <div style={{flex:1, minWidth:'250px'}}>
                    <label style={{display:'block', fontSize:'12px', fontWeight:'bold', color:'#64748b', marginBottom:'5px'}}>COST CALCULATION BASIS</label>
                    <div style={{display:'flex', gap:'10px'}}>
                        <select 
                            value={costMode} 
                            onChange={e => setCostMode(e.target.value)}
                            style={{flex:1, padding:'10px', borderRadius:'6px', border:'1px solid #cbd5e1', fontWeight:'bold', color:'#0f172a'}}
                        >
                            <option value="global">Global Rate (${globalRate.toFixed(2)}/hr)</option>
                            <option value="employee">Employee Specific Rate</option>
                            <option value="custom">Custom Rate</option>
                        </select>
                        {costMode === 'custom' && (
                            <input 
                                type="number" 
                                placeholder="$0.00"
                                value={customRate}
                                onChange={e => setCustomRate(e.target.value)}
                                style={{width:'80px', padding:'10px', borderRadius:'6px', border:'1px solid #cbd5e1'}}
                            />
                        )}
                    </div>
                </div>

                {/* Date Filters */}
                <div>
                    <label style={{display:'block', fontSize:'12px', fontWeight:'bold', color:'#64748b', marginBottom:'5px'}}>DATE RANGE</label>
                    <div style={{display:'flex', gap:'5px'}}>
                        <input type="date" value={dateRange.start} onChange={e => setDateRange({...dateRange, start:e.target.value})} style={{padding:'8px', border:'1px solid #cbd5e1', borderRadius:'6px'}} />
                        <span style={{alignSelf:'center', color:'#94a3b8'}}>-</span>
                        <input type="date" value={dateRange.end} onChange={e => setDateRange({...dateRange, end:e.target.value})} style={{padding:'8px', border:'1px solid #cbd5e1', borderRadius:'6px'}} />
                    </div>
                </div>

                {/* Search */}
                <div style={{flex:1}}>
                     <label style={{display:'block', fontSize:'12px', fontWeight:'bold', color:'#64748b', marginBottom:'5px'}}>SEARCH</label>
                     <input 
                        placeholder="Search machine, tech..." 
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        style={{width:'100%', padding:'10px', border:'1px solid #cbd5e1', borderRadius:'6px'}} 
                     />
                </div>

                <div style={{textAlign:'right'}}>
                    <div style={{fontSize:'12px', color:'#64748b', fontWeight:'bold'}}>TOTAL PERIOD COST</div>
                    <div style={{fontSize:'24px', color:'#16a34a', fontWeight:'bold'}}>${totalPeriodCost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                </div>
            </div>

            {/* TABLE */}
            <div style={{background:'white', borderRadius:'12px', boxShadow:'0 2px 5px rgba(0,0,0,0.05)', overflow:'hidden'}}>
                <div style={{padding:'15px', borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                    <h3 style={{margin:0, fontSize:'16px', color:'#334155'}}>Setup Reports ({filteredReports.length})</h3>
                    <button onClick={handleExport} style={{background:'#10b981', color:'white', border:'none', padding:'8px 15px', borderRadius:'6px', cursor:'pointer', fontWeight:'bold'}}>Download Excel</button>
                </div>
                
                <table style={{width:'100%', borderCollapse:'collapse', fontSize:'14px'}}>
                    <thead style={{background:'#f8fafc', color:'#475569', textAlign:'left'}}>
                        <tr>
                            <th style={{padding:'12px'}}>Date</th>
                            <th style={{padding:'12px'}}>Machine / Line</th>
                            <th style={{padding:'12px'}}>Technician(s)</th>
                            <th style={{padding:'12px', textAlign:'right'}}>Duration</th>
                            <th style={{padding:'12px', textAlign:'right'}}>Rate</th>
                            <th style={{padding:'12px', textAlign:'right'}}>Cost</th>
                            <th style={{padding:'12px'}}>Notes</th>
                            <th style={{padding:'12px'}}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredReports.length === 0 ? (
                            <tr><td colSpan="8" style={{padding:'30px', textAlign:'center', color:'#94a3b8'}}>No reports match your filters.</td></tr>
                        ) : (
                            filteredReports.map(r => {
                                const rate = getHourlyRate(r);
                                const cost = r.hours * rate;
                                return (
                                    <tr key={r.id} style={{borderBottom:'1px solid #f1f5f9'}}>
                                        <td style={{padding:'12px'}}>
                                            {r.dateObj.toLocaleDateString()} <span style={{fontSize:'12px', color:'#94a3b8'}}>{r.dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                        </td>
                                        <td style={{padding:'12px', fontWeight:'bold', color:'#0f172a'}}>{r.machine}</td>
                                        <td style={{padding:'12px'}}>
                                            {r.techCount > 1 && (
                                                <span style={{display:'inline-block', background:'#e0f2fe', color:'#0284c7', fontSize:'10px', padding:'2px 6px', borderRadius:'10px', marginRight:'5px', fontWeight:'bold'}}>
                                                    {r.techCount}
                                                </span>
                                            )}
                                            {r.technician}
                                        </td>
                                        <td style={{padding:'12px', textAlign:'right'}}>
                                            {r.hours.toFixed(2)} hrs
                                            <div style={{fontSize:'10px', color:'#94a3b8'}}>{Math.round(r.hours * 60)} mins</div>
                                        </td>
                                        <td style={{padding:'12px', textAlign:'right', color:'#64748b'}}>${rate.toFixed(2)}</td>
                                        <td style={{padding:'12px', textAlign:'right', fontWeight:'bold', color:'#16a34a'}}>${cost.toFixed(2)}</td>
                                        <td style={{padding:'12px', color:'#475569', maxWidth:'300px'}}>{r.notes}</td>
                                        <td style={{padding:'12px', textAlign:'right'}}>
                                            <button 
                                                onClick={() => handleViewID(r.id)} 
                                                style={{
                                                    background:'#f1f5f9', 
                                                    border:'1px solid #cbd5e1', 
                                                    cursor:'pointer', 
                                                    color:'#64748b', 
                                                    fontSize:'10px', 
                                                    padding:'4px 8px', 
                                                    borderRadius:'4px', 
                                                    fontWeight:'bold'
                                                }}
                                                title="View/Copy ID"
                                            >
                                                ID
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
    );
}