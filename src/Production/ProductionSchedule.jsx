import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase_config';
import { collection, onSnapshot, query, doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { styles } from './styles';

// --- HELPER FUNCTIONS ---
const getSunday = (date) => {
  const d = new Date(date);
  const day = d.getDay(); 
  const diff = d.getDate() - day; 
  return new Date(d.setDate(diff));
};
const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};
const toLocalISO = (date) => {
    if (!date) return '';
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().split('T')[0];
};
const getDayName = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long' }); 
};
const parseShiftHours = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const clean = timeStr.replace(/\s+/g, '').toUpperCase();
    const parts = clean.split(/[-–—]/); 
    if (parts.length !== 2) return 0;
    const toDecimal = (t) => {
        const match = t.match(/^(\d{1,2})(?::(\d{2}))?(AM|PM)?$/);
        if (!match) return null;
        let h = parseInt(match[1], 10);
        let m = match[2] ? parseInt(match[2], 10) : 0;
        const mer = match[3];
        if (mer === 'PM' && h < 12) h += 12;
        if (mer === 'AM' && h === 12) h = 0;
        return h + (m / 60);
    };
    let start = toDecimal(parts[0]);
    let end = toDecimal(parts[1]);
    if (start === null || end === null) return 0;
    if (end < start && parts[1].indexOf('AM') === -1 && parts[1].indexOf('PM') === -1) end += 12;
    let diff = end - start;
    if (diff < 0) diff += 24; 
    return diff;
};

export default function ProductionSchedule() {
    // --- STATE ---
    const [allJobs, setAllJobs] = useState([]);
    const [schedulesDb, setSchedulesDb] = useState({}); 
    const [calView, setCalView] = useState('week'); 
    const [calBaseDate, setCalBaseDate] = useState(new Date());
    const [selectedDayObj, setSelectedDayObj] = useState(null); 
    const [employees, setEmployees] = useState([]);
    const [schedule, setSchedule] = useState({});
    const [lunchDed, setLunchDed] = useState(30);
    const [hrSpend, setHrSpend] = useState(0);
    const [isSchedLoaded, setIsSchedLoaded] = useState(false);
    const [isEmpLoaded, setIsEmpLoaded] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [settings, setSettings] = useState({ shiftHours: 8, skipWeekends: true, shiftOptions: ["7:00 AM - 3:30 PM"] });
    const [newShift, setNewShift] = useState(''); 
    const [financeCostPerHour, setFinanceCostPerHour] = useState(0); 
    const [activeJob, setActiveJob] = useState(null);
    const [form, setForm] = useState({ startDate: '', workers: '1', totalHours: '', shifts: '', shiftTime: '', allowSaturday: false, allowSunday: false });
    const fetchedDatesCache = useRef(new Set()); 

    // ==========================================
    // 1. DATA FETCHING (MERGED SOURCES)
    // ==========================================
    useEffect(() => {
        getDoc(doc(db, "settings", "production_schedule")).then(snap => {
            if (snap.exists()) setSettings(snap.data());
        });
        getDoc(doc(db, "config", "finance")).then(snap => {
            if (snap.exists() && snap.data().costPerHour) setFinanceCostPerHour(parseFloat(snap.data().costPerHour));
        });

        const unsubProSchedule = onSnapshot(collection(db, "pro_schedule"), (snap) => {
            const schedMap = {};
            snap.docs.forEach(d => { schedMap[d.id] = { ...d.data(), proSchedId: d.id }; });
            setSchedulesDb(schedMap);
        });

        let pipelineJobs = [];
        let ipadJobs = [];

        const updateAllJobs = () => {
            setAllJobs([...pipelineJobs, ...ipadJobs]);
        };

        const unsubPipeline = onSnapshot(collection(db, "production_pipeline"), (snap) => {
            pipelineJobs = snap.docs.map(d => {
                const data = d.data();
                return { 
                    id: d.id, 
                    _source: 'production_pipeline', 
                    ...data,
                    project: data.project || data.projectName || '',
                    company: data.company || data.companyName || '',
                    // 🚨 NORMALIZATION FOR UNITS AND PRICE
                    quantity: data.quantity || data.expectedUnits || 0,
                    price: data.price || data.pricePerUnit || 0
                };
            });
            updateAllJobs();
        });

        const unsubIpad = onSnapshot(collection(db, "project_queue"), (snap) => {
            ipadJobs = snap.docs.map(d => {
                const data = d.data();
                return { 
                    id: d.id, 
                    _source: 'project_queue', 
                    ...data,
                    project: data.project || data.projectName || '',
                    company: data.company || data.companyName || '',
                    // 🚨 NORMALIZATION FOR UNITS AND PRICE
                    quantity: data.quantity || data.expectedUnits || 0,
                    price: data.price || data.pricePerUnit || 0
                };
            });
            updateAllJobs();
        });

        return () => { unsubPipeline(); unsubIpad(); unsubProSchedule(); };
    }, []);

    // ==========================================
    // 2. HR & FINANCIAL ENGINE
    // ==========================================
    useEffect(() => {
        let viewStart = getSunday(calBaseDate);
        let daysToCalculate = calView === 'month' ? 31 : (calView === '2week' ? 14 : 7);
        const days = [];
        for (let i = 0; i < daysToCalculate; i++) { days.push(addDays(viewStart, i)); }

        const fetchSchedule = async () => {
            const newSched = {};
            let fetchedAny = false;
            await Promise.all(days.map(async (d) => {
                const dateStr = toLocalISO(d);
                if (!fetchedDatesCache.current.has(dateStr)) {
                    const snap = await getDoc(doc(db, "schedules", dateStr));
                    newSched[dateStr] = snap.exists() ? snap.data().allocations || {} : {};
                    fetchedDatesCache.current.add(dateStr);
                    fetchedAny = true;
                }
            }));
            if (fetchedAny) setSchedule(prev => ({ ...prev, ...newSched }));
            setIsSchedLoaded(true);
        };
        fetchSchedule();

        const unsub = onSnapshot(collection(db, "employees"), (snap) => {
            const list = snap.docs.map(d => ({id: d.id, ...d.data()})).filter(e => e.status !== 'Inactive');
            setEmployees(list);
            setIsEmpLoaded(true);
        });
        return () => unsub();
    }, [calBaseDate, calView]);

    useEffect(() => {
        if (!isSchedLoaded || !isEmpLoaded) return;
        const filteredEmployees = employees.filter(e => e.type === "Hourly");
        let totalSpend = 0;
        let viewStart = getSunday(calBaseDate);
        let daysToCalculate = calView === 'month' ? 31 : (calView === '2week' ? 14 : 7);
        const viewDatesLocal = [];
        for (let i = 0; i < daysToCalculate; i++) viewDatesLocal.push(addDays(viewStart, i));

        viewDatesLocal.forEach(d => {
            const dateStr = toLocalISO(d);
            filteredEmployees.forEach(emp => {
                const cell = (schedule[dateStr]?.[emp.id]) || (emp.defaultSchedule?.[new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' })]) || {};
                if (cell.time) {
                    const hrs = parseShiftHours(cell.time);
                    const net = hrs > 5 ? Math.max(0, hrs - (lunchDed / 60)) : hrs;
                    totalSpend += (net * (parseFloat(emp.compensation) || 0));
                }
            });
        });
        setHrSpend(totalSpend);
    }, [schedule, employees, calBaseDate, calView]);

    // ==========================================
    // 3. THE MASTER ARRAYS
    // ==========================================
    
    const scheduled = Object.values(schedulesDb).map(sched => {
        const live = allJobs.find(j => 
            j.id === sched.jobId || 
            (j.project === sched.project && j.company === sched.company)
        ) || {};
        return { ...live, ...sched };
    });

    const unscheduled = allJobs.filter(j => {
        if (!j.project) return false;

        const isAlreadyScheduled = Object.values(schedulesDb).some(s => 
            (s.jobId === j.id) || (s.project === j.project && s.company === j.company)
        );
        if (isAlreadyScheduled) return false;

        const status = (j.status || '').toLowerCase();
        if (['completed', 'shipped', 'archived', 'delivered', 'done'].includes(status)) return false;

        return true; 
    });

    // ==========================================
    // 4. SCHEDULING LOGIC
    // ==========================================
    const getActiveDates = (startStr, totalHrsStr, workersStr, allowSat, allowSun) => {
        const totalHrs = parseFloat(totalHrsStr) || 0;
        const workers = parseInt(workersStr, 10) || 1; 
        if (!startStr || totalHrs <= 0) return [];
        const dailyCapacity = workers * (settings.shiftHours || 8);
        const daysNeeded = Math.ceil(totalHrs / dailyCapacity); 
        const dates = [];
        let cur = new Date(startStr + 'T12:00:00');
        while (dates.length < daysNeeded) { 
            const day = cur.getDay();
            if ((day === 0 && !allowSun) || (day === 6 && !allowSat)) { cur.setDate(cur.getDate() + 1); continue; }
            dates.push(toLocalISO(cur));
            cur.setDate(cur.getDate() + 1);
        }
        return dates;
    };

    const handleSchedule = async () => {
        try {
            const th = parseFloat(form.totalHours) || 0;
            const w = parseInt(form.workers, 10) || 1;
            if (!form.startDate || th <= 0 || !form.shiftTime) return alert("Missing required fields");
            
            const activeDates = getActiveDates(form.startDate, th, w, form.allowSaturday, form.allowSunday);
            const targetId = activeJob.proSchedId || activeJob.id;

            await setDoc(doc(db, "pro_schedule", targetId), {
                jobId: activeJob.jobId || activeJob.id,
                project: activeJob.project,
                company: activeJob.company,
                quantity: activeJob.quantity || 0,
                price: activeJob.price || 0,
                startDate: form.startDate,
                workerCount: w,
                estimatedTotalHours: th,
                shiftTime: form.shiftTime,
                activeDates: activeDates,
                calculatedEndDate: activeDates.length > 0 ? new Date(activeDates[activeDates.length-1] + 'T12:00:00').toLocaleDateString() : '',
                allowSaturday: form.allowSaturday,
                allowSunday: form.allowSunday
            });
            setActiveJob(null);
            setSelectedDayObj(null);
        } catch (e) { alert(e.message); }
    };

    const handleUnschedule = async (id) => {
        if (confirm("Remove from schedule?")) {
            await deleteDoc(doc(db, "pro_schedule", id));
            setActiveJob(null);
            setSelectedDayObj(null);
        }
    };

    const openScheduleModal = (job, presetDate = '') => {
        const initWorkers = job.workerCount ? String(parseInt(job.workerCount, 10)) : '1';
        let autoHrs = 0;
        if (financeCostPerHour > 0) {
            const q = parseFloat(String(job.quantity).replace(/[^0-9.]/g, '')) || 0;
            const p = parseFloat(String(job.price).replace(/[^0-9.]/g, '')) || 0;
            autoHrs = (q * p) / financeCostPerHour;
        }
        const initHours = parseFloat(job.estimatedTotalHours) || autoHrs;
        
        setActiveJob(job); 
        setForm({
            startDate: presetDate || job.startDate || '', 
            workers: initWorkers, 
            totalHours: initHours > 0 ? Number(initHours.toFixed(2)).toString() : '',
            shifts: job.shifts || '',
            shiftTime: job.shiftTime || (settings.shiftOptions?.[0] || ''),
            allowSaturday: job.allowSaturday || false,
            allowSunday: job.allowSunday || false
        }); 
    };

    // --- RENDER ---
    const viewStartStr = toLocalISO(calView === 'month' ? new Date(calBaseDate.getFullYear(), calBaseDate.getMonth(), 1) : getSunday(calBaseDate));
    const viewEndStr = toLocalISO(addDays(new Date(viewStartStr + 'T12:00:00'), calView === 'month' ? 34 : (calView === '2week' ? 13 : 6)));

    const jobsEndingInView = scheduled.filter(j => {
        if (!j.activeDates?.length) return false;
        const last = j.activeDates[j.activeDates.length - 1];
        return last >= viewStartStr && last <= viewEndStr;
    });

    const totalBilling = jobsEndingInView.reduce((sum, j) => {
        const q = parseFloat(String(j.quantity).replace(/[^0-9.]/g, '')) || 0;
        const p = parseFloat(String(j.price).replace(/[^0-9.]/g, '')) || 0;
        return sum + (q * p);
    }, 0);

    const maxBudget = totalBilling * 0.5;

    return (
        <div style={{ padding: '20px', maxWidth: '1600px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ margin: 0 }}>🗓️ Production Command Center</h2>
                <button onClick={() => setShowSettings(true)} style={{...styles.btn, background: '#e2e8f0', color: '#334155'}}>⚙️ Settings</button>
            </div>

            {/* Dashboard */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '25px' }}>
                <div style={{ ...styles.card, borderTop: '4px solid #0ea5e9' }}>
                    <small>Expected Billing (Ends in View)</small>
                    <h2 style={{ margin: 0 }}>${totalBilling.toLocaleString(undefined, {minimumFractionDigits: 2})}</h2>
                </div>
                <div style={{ ...styles.card, borderTop: '4px solid #10b981' }}>
                    <small>Max Labor Budget (50%)</small>
                    <h2 style={{ margin: 0 }}>${maxBudget.toLocaleString(undefined, {minimumFractionDigits: 2})}</h2>
                </div>
                <div style={{ ...styles.card, borderTop: `4px solid ${hrSpend > maxBudget && totalBilling > 0 ? '#ef4444' : '#22c55e'}` }}>
                    <small>HR Spend for View</small>
                    <h2 style={{ margin: 0, color: hrSpend > maxBudget && totalBilling > 0 ? '#dc2626' : 'inherit' }}>
                        ${hrSpend.toLocaleString(undefined, {minimumFractionDigits: 2})}
                    </h2>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '25px', alignItems: 'flex-start' }}>
                {/* QUEUE */}
                <div style={{ width: '320px', background: '#f1f5f9', padding: '15px', borderRadius: '8px', minHeight: '600px' }}>
                    <h3 style={{marginTop:0}}>📥 Waiting ({unscheduled.length})</h3>
                    {unscheduled.map(j => (
                        <div key={j.id} draggable onDragStart={e => handleDragStart(e, j)} onClick={() => openScheduleModal(j)} style={{ background: 'white', padding: '12px', borderRadius: '6px', marginBottom: '10px', cursor: 'grab', borderLeft: `4px solid ${j._source === 'project_queue' ? '#8b5cf6' : '#f59e0b'}`, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                            <div style={{fontWeight:'bold', fontSize:'14px'}}>{j.project}</div>
                            <small style={{color:'#64748b'}}>{j.company} • {j.quantity} units</small>
                            <div style={{ fontSize: '9px', marginTop: '6px', background: '#e2e8f0', display: 'inline-block', padding: '2px 6px', borderRadius: '4px', color: '#475569' }}>
                                {j._source === 'project_queue' ? '📱 iPad' : '💻 Pipeline'}
                            </div>
                        </div>
                    ))}
                </div>

                {/* CALENDAR */}
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                        <div>
                            <button onClick={() => setCalBaseDate(addDays(calBaseDate, -7))} style={styles.btn}>&larr;</button>
                            <button onClick={() => setCalBaseDate(new Date())} style={{...styles.btn, margin:'0 5px'}}>Today</button>
                            <button onClick={() => setCalBaseDate(addDays(calBaseDate, 7))} style={styles.btn}>&rarr;</button>
                        </div>
                        <div style={{display:'flex', gap:'5px'}}>
                            {['5day', 'week', '2week', 'month'].map(v => (
                                <button key={v} onClick={() => setCalView(v)} style={{...styles.btn, background: calView === v ? '#2563eb' : 'white', color: calView === v ? 'white' : '#475569'}}>{v}</button>
                            ))}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${calView === '5day' ? 5 : 7}, 1fr)`, gap: '10px' }}>
                        {(() => {
                            const days = [];
                            const start = calView === '5day' ? addDays(getSunday(calBaseDate), 1) : (calView === 'month' ? new Date(calBaseDate.getFullYear(), calBaseDate.getMonth(), 1) : getSunday(calBaseDate));
                            const count = calView === 'month' ? 35 : (calView === '2week' ? 14 : (calView === '5day' ? 5 : 7));
                            for (let i = 0; i < count; i++) days.push(addDays(start, i));

                            return days.map(d => {
                                const dStr = toLocalISO(d);
                                const dayJobs = scheduled.filter(j => j.activeDates?.includes(dStr));
                                return (
                                    <div key={dStr} onClick={() => setSelectedDayObj(d)} onDragOver={e=>e.preventDefault()} onDrop={e=>handleDropOnDate(e, d)} style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', minHeight: '250px', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ background: '#f1f5f9', padding: '8px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', borderBottom: '1px solid #e2e8f0', lineHeight: '1.4' }}>
                                            <div>{d.toLocaleDateString('en-US', { weekday: 'short' })},</div>
                                            <div>{d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}</div>
                                        </div>
                                        <div style={{ padding: '5px', flex: 1, overflowY: 'auto' }}>
                                            {dayJobs.map(j => (
                                                <div key={j.id} onClick={e => { e.stopPropagation(); openScheduleModal(j); }} style={{ background: '#3b82f6', color: 'white', padding: '4px 6px', borderRadius: '4px', fontSize: '11px', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {j.project}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            });
                        })()}
                    </div>
                </div>
            </div>

            {/* MODALS */}
            {activeJob && (
                <div className="modal-overlay" style={{position:'fixed', top:0, left:0, width:'100vw', height:'100vh', background:'rgba(0,0,0,0.7)', zIndex:110, display:'flex', justifyContent:'center', alignItems:'center'}}>
                    <div style={{background: 'white', padding: '25px', borderRadius: '8px', width: '500px'}}>
                        <div style={{display:'flex', justifyContent:'space-between', marginBottom:'20px'}}>
                            <h3 style={{margin:0}}>Schedule: {activeJob.project}</h3>
                            {activeJob.proSchedId && <button onClick={() => handleUnschedule(activeJob.proSchedId)} style={{background:'#fef2f2', color:'#ef4444', border:'1px solid #fca5a5', padding:'4px 8px', borderRadius:'4px', cursor:'pointer'}}>Unschedule</button>}
                        </div>

                        <label>Start Date</label>
                        <input type="date" value={form.startDate} onChange={e=>setForm({...form, startDate: e.target.value})} style={{width:'100%', marginBottom:'10px', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px'}}/>
                        
                        <label>Shift</label>
                        <select value={form.shiftTime} onChange={e=>setForm({...form, shiftTime: e.target.value})} style={{width:'100%', marginBottom:'10px', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px'}}>
                            <option value="">Select Shift</option>
                            {settings.shiftOptions.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        
                        <div style={{display:'flex', gap:'10px', marginBottom:'20px'}}>
                            <div style={{flex: 1}}>
                                <label>Workers</label>
                                <input type="number" value={form.workers} onChange={e=>setForm({...form, workers: e.target.value})} style={{width:'100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px'}}/>
                            </div>
                            <div style={{flex: 1}}>
                                <label>Total Hours</label>
                                <input type="number" value={form.totalHours} onChange={e=>setForm({...form, totalHours: e.target.value})} style={{width:'100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px'}}/>
                            </div>
                        </div>

                        <div style={{display:'flex', gap:'10px'}}>
                            <button onClick={() => setActiveJob(null)} style={{flex:1, padding: '10px', background: 'transparent', border: '1px solid #cbd5e1', borderRadius: '4px'}}>Cancel</button>
                            <button onClick={handleSchedule} style={{flex:1, background:'#2563eb', color:'white', padding:'10px', borderRadius:'4px', border: 'none'}}>Save</button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Settings Modal */}
            {showSettings && (
                <div className="modal-overlay" style={{position:'fixed', top:0, left:0, width:'100vw', height:'100vh', background:'rgba(0,0,0,0.5)', zIndex:120, display:'flex', justifyContent:'center', alignItems:'center'}}>
                    <div style={{background: 'white', padding: '25px', borderRadius: '8px', width: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)'}}>
                        <h3 style={{marginTop: 0, color: '#1e293b'}}>⚙️ Production Settings</h3>
                        
                        <label style={{display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '5px'}}>Default Hours per Shift</label>
                        <input type="number" value={settings.shiftHours} onChange={e=>setSettings({...settings, shiftHours: parseFloat(e.target.value) || 8})} style={{width: '100%', padding: '10px', marginBottom: '20px', borderRadius: '4px', border: '1px solid #cbd5e1', boxSizing: 'border-box'}} />

                        <label style={{display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '5px'}}>Production Shift Options</label>
                        <div style={{marginBottom: '10px'}}>
                            {(settings.shiftOptions || []).map((shift, idx) => (
                                <div key={idx} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f1f5f9', padding: '6px 10px', borderRadius: '4px', marginBottom: '5px', fontSize: '13px', border: '1px solid #e2e8f0'}}>
                                    <span>{shift}</span>
                                    <button onClick={() => {
                                        const newOptions = [...settings.shiftOptions];
                                        newOptions.splice(idx, 1);
                                        setSettings({...settings, shiftOptions: newOptions});
                                    }} style={{background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold'}}>&times;</button>
                                </div>
                            ))}
                        </div>
                        
                        <div style={{display: 'flex', gap: '10px', marginBottom: '25px'}}>
                            <input 
                                type="text" 
                                value={newShift} 
                                onChange={e => setNewShift(e.target.value)} 
                                placeholder="e.g. 7:00 AM - 3:30 PM" 
                                style={{flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '13px'}} 
                            />
                            <button onClick={() => {
                                if(newShift.trim()) {
                                    setSettings({...settings, shiftOptions: [...(settings.shiftOptions || []), newShift.trim()]});
                                    setNewShift('');
                                }
                            }} style={{background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', padding: '0 15px', cursor: 'pointer', fontWeight: 'bold'}}>+</button>
                        </div>

                        <label style={{display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: '#334155', marginBottom: '25px', cursor: 'pointer'}}>
                            <input type="checkbox" checked={settings.skipWeekends} onChange={e=>setSettings({...settings, skipWeekends: e.target.checked})} style={{width: '18px', height: '18px'}} />
                            Skip weekends in calculations
                        </label>

                        <div style={{display: 'flex', gap: '10px'}}>
                            <button onClick={() => setShowSettings(false)} style={{flex: 1, padding: '10px', background: 'transparent', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer'}}>Close</button>
                            <button onClick={async () => { await setDoc(doc(db, "settings", "production_schedule"), settings); setShowSettings(false); alert("Saved!"); }} style={{flex: 1, padding: '10px', background: '#0f172a', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'}}>Save Settings</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// DRAG HELPERS
const handleDragStart = (e, job) => { e.dataTransfer.setData("jobId", job.id); };
const handleDropOnDate = (e, dateObj) => { e.preventDefault(); };