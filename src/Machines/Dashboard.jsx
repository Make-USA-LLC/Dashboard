import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase_config';
import { collection, getDocs, query, limit, orderBy } from 'firebase/firestore';
import { Clock, AlertTriangle, CheckCircle, Activity, Hash } from 'lucide-react';

export default function Dashboard() {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ setups: [], qc: [] });

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                // 1. Setups
                const setupsQ = query(collection(db, "machine_setup_reports"), orderBy("completedAt", "desc"), limit(200));
                const setupsSnap = await getDocs(setupsQ);
                const setups = setupsSnap.docs.map(d => {
                    const data = d.data();
                    const hours = data.hours ? parseFloat(data.hours) : (data.durationMinutes / 60) || 0;
                    
                    let machineName = data.machine || data.leader || 'Unknown';
                    if (typeof machineName === 'string' && machineName.startsWith("Setup: ")) {
                        machineName = machineName.replace("Setup: ", "");
                    }

                    return { 
                        id: d.id, 
                        ...data, 
                        hours, 
                        machine: machineName
                    };
                });

                // 2. QC
                const qcQ = query(collection(db, "reports"), orderBy("completedAt", "desc"), limit(200));
                const qcSnap = await getDocs(qcQ);
                const qc = qcSnap.docs.map(d => {
                    const data = d.data();
                    const finished = data.completedAt?.toDate ? data.completedAt.toDate() : new Date(data.completedAt);
                    const checked = data.qcDate?.toDate ? data.qcDate.toDate() : (data.qcDate ? new Date(data.qcDate) : null);
                    
                    // AUTO-PASS LOGIC: If no explicit result exists, it's passed with 0 lag
                    const hasExplicitResult = !!data.qcResult;
                    const result = hasExplicitResult ? data.qcResult.toLowerCase() : 'passed';
                    
                    let lag = 0;
                    if (hasExplicitResult && finished && checked) {
                        lag = (checked - finished) / (1000 * 60 * 60);
                    }

                    return { 
                        id: d.id, 
                        ...data, 
                        lag, 
                        result 
                    };
                });

                setStats({ setups, qc });
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        };
        load();
    }, []);

    const handleViewID = (id) => {
        prompt("Firebase Document ID:", id);
    };

    const machinePerf = useMemo(() => {
        const map = {};
        stats.setups.forEach(s => {
            if (!map[s.machine]) map[s.machine] = { total: 0, count: 0 };
            map[s.machine].total += s.hours;
            map[s.machine].count += 1;
        });
        return Object.entries(map)
            .map(([k,v]) => ({ name: k, avg: v.total/v.count }))
            .sort((a,b) => b.avg - a.avg)
            .slice(0, 6);
    }, [stats.setups]);

    const longestSetups = useMemo(() => {
        return [...stats.setups]
            .sort((a, b) => b.hours - a.hours)
            .slice(0, 5);
    }, [stats.setups]);

    const qcMetrics = useMemo(() => {
        // Now including auto-passed items in the total
        const total = stats.qc.length || 1;
        const passed = stats.qc.filter(q => q.result !== 'failed').length;
        
        // Wait time calculation only for items that were explicitly checked (lag > 0)
        const validWaits = stats.qc.filter(q => q.lag > 0 && q.lag < 100);
        const avgWait = validWaits.reduce((sum, q) => sum + q.lag, 0) / (validWaits.length || 1);

        return { passRate: (passed/total)*100, avgWait, totalCount: total };
    }, [stats.qc]);

    if (loading) return <div className="p-10 text-center text-slate-400">Crunching numbers...</div>;

    return (
        <div className="space-y-6 animate-fade-in">
            {/* KPI ROW */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-blue-500">
                    <div className="text-slate-400 text-xs font-bold uppercase tracking-wider">Avg Setup Time</div>
                    <div className="text-3xl font-bold text-slate-800 mt-1">
                        {(stats.setups.reduce((a,s)=>a+s.hours,0) / (stats.setups.length||1)).toFixed(1)}<span className="text-lg text-slate-400 font-medium">h</span>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-orange-500">
                    <div className="text-slate-400 text-xs font-bold uppercase tracking-wider">Avg QC Wait</div>
                    <div className="text-3xl font-bold text-slate-800 mt-1">
                        {qcMetrics.avgWait.toFixed(1)}<span className="text-lg text-slate-400 font-medium">h</span>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-green-500">
                    <div className="text-slate-400 text-xs font-bold uppercase tracking-wider">Pass Rate</div>
                    <div className="text-3xl font-bold text-green-600 mt-1">
                        {qcMetrics.passRate.toFixed(1)}%
                    </div>
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-purple-500">
                    <div className="text-slate-400 text-xs font-bold uppercase tracking-wider">Total Output</div>
                    <div className="text-3xl font-bold text-slate-800 mt-1">{qcMetrics.totalCount}</div>
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                {/* CHART: SETUP TIMES */}
                <div className="bg-white p-6 rounded-xl shadow-sm">
                    <h3 className="font-bold text-slate-700 mb-6 flex items-center gap-2">
                        <Clock size={20} className="text-blue-500"/> Machine Changeover Times (Avg)
                    </h3>
                    <div className="space-y-4">
                        {machinePerf.map(m => (
                            <div key={m.name}>
                                <div className="flex justify-between text-xs font-bold text-slate-600 mb-1">
                                    <span>{m.name}</span>
                                    <span>{m.avg.toFixed(1)} hrs</span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-3">
                                    <div 
                                        className="bg-blue-500 h-3 rounded-full transition-all duration-1000" 
                                        style={{width: `${Math.min((m.avg/5)*100, 100)}%`}}
                                    ></div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <h3 className="font-bold text-slate-700 mt-10 mb-4 text-sm uppercase tracking-tight flex items-center gap-2">
                        <Activity size={16} className="text-slate-400"/> Longest Individual Setups
                    </h3>
                    <div className="space-y-2">
                        {longestSetups.map(s => (
                            <div key={s.id} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg group">
                                <div className="text-xs">
                                    <span className="font-bold text-slate-700">{s.machine}</span>
                                    <span className="text-slate-400 ml-2">{s.hours.toFixed(1)}h</span>
                                </div>
                                <button 
                                    onClick={() => handleViewID(s.id)}
                                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-blue-500 transition-all"
                                    title="View ID"
                                >
                                    <Hash size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* LIST: RECENT DEFECTS */}
                <div className="bg-white p-6 rounded-xl shadow-sm">
                    <h3 className="font-bold text-slate-700 mb-6 flex items-center gap-2">
                        <AlertTriangle size={20} className="text-red-500"/> Recent QC Defects
                    </h3>
                    <div className="space-y-3">
                        {stats.qc.filter(q => q.result === 'failed' || q.result === 'fail').slice(0,5).map((q, i) => (
                            <div key={i} className="flex gap-3 items-start p-3 bg-red-50 rounded-lg border border-red-100 group">
                                <div className="bg-white p-1 rounded text-red-500 shadow-sm"><AlertTriangle size={16}/></div>
                                <div className="flex-1">
                                    <div className="text-sm font-bold text-slate-800">{q.project}</div>
                                    <div className="text-xs text-red-600 font-medium mt-0.5">{q.defectReason}</div>
                                    <div className="text-xs text-slate-400 mt-1">{q.leader} • {q.company}</div>
                                </div>
                                <button 
                                    onClick={() => handleViewID(q.id)}
                                    className="opacity-0 group-hover:opacity-100 p-1 text-red-200 hover:text-red-500 transition-all"
                                    title="View ID"
                                >
                                    <Hash size={14} />
                                </button>
                            </div>
                        ))}
                        {stats.qc.filter(q => q.result === 'failed' || q.result === 'fail').length === 0 && (
                            <div className="text-center py-10 text-slate-400 italic">No defects recently!</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}