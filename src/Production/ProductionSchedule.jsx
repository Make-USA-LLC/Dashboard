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
    
    // Variable Workers State
    const [isVariable, setIsVariable] = useState(false);
    const [phases, setPhases] = useState([{ name: '', workers: 1, hours: 0 }]);
    
    const fetchedDatesCache = useRef(new Set()); 

    // ==========================================
    // 1. DATA FETCHING
    // ==========================================
    useEffect(() => {
        // Safe Merge for Settings to prevent undefined arrays crashing maps
        getDoc(doc(db, "settings", "production_schedule")).then(snap => {
            if (snap.exists()) {
                const data = snap.data();
                setSettings(prev => ({ 
                    ...prev, 
                    ...data,
                    shiftOptions: data.shiftOptions || prev.shiftOptions || []
                }));
            }
        });
        
        getDoc(doc(db, "config", "finance")).then(snap => {
            if (snap.exists() && snap.data().costPerHour) setFinanceCostPerHour(parseFloat(snap.data().costPerHour) || 0);
        });

        const unsubProSchedule = onSnapshot(collection(db, "pro_schedule"), (snap) => {
            const schedMap = {};
            snap.docs.forEach(d => { schedMap[d.id] = { ...d.data(), proSchedId: d.id }; });
            setSchedulesDb(schedMap);
        });

        let pipelineJobs = [];
        let ipadJobs = [];

        const updateAllJobs = () => { setAllJobs([...pipelineJobs, ...ipadJobs]); };

        const unsubPipeline = onSnapshot(collection(db, "production_pipeline"), (snap) => {
            pipelineJobs = snap.docs.map(d => {
                const data = d.data() || {};
                return { 
                    id: d.id, 
                    _source: 'production_pipeline', 
                    ...data,
                    project: data.project || data.projectName || '',
                    company: data.company || data.companyName || '',
                    quantity: data.quantity || data.expectedUnits || 0,
                    price: data.price || data.pricePerUnit || 0
                };
            });
            updateAllJobs();
        });

        const unsubIpad = onSnapshot(collection(db, "project_queue"), (snap) => {
            ipadJobs = snap.docs.map(d => {
                const data = d.data() || {};
                return { 
                    id: d.id, 
                    _source: 'project_queue', 
                    ...data,
                    project: data.project || data.projectName || '',
                    company: data.company || data.companyName || '',
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
    }, [schedule, employees, lunchDed, isSchedLoaded, isEmpLoaded, calBaseDate, calView]);

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
    
    const getActiveDates = (startStr, totalHrsStr, workersStr, allowSat, allowSun, forceDays = null) => {
        let daysNeeded = forceDays;
        
        if (daysNeeded === null) {
            const totalHrs = parseFloat(totalHrsStr) || 0;
            const workers = parseInt(workersStr, 10) || 1; 
            if (!startStr || totalHrs <= 0 || workers <= 0) return [];
            const dailyCapacity = workers * (settings.shiftHours || 8);
            daysNeeded = Math.ceil(totalHrs / dailyCapacity); 
        }
        
        if (!startStr || isNaN(daysNeeded) || daysNeeded <= 0) return [];
        
        const dates = [];
        let currentDate = new Date(startStr + 'T12:00:00');
        let daysAdded = 0;
        let maxLoops = daysNeeded * 5; 
        
        while (daysAdded < daysNeeded && maxLoops > 0) { 
            maxLoops--;
            const dayOfWeek = currentDate.getDay();
            let skip = false;
            
            if (dayOfWeek === 0 && !allowSun) skip = true;
            if (dayOfWeek === 6 && !allowSat) skip = true;
            
            if (!skip) {
                dates.push(toLocalISO(currentDate));
                daysAdded++;
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
        return dates;
    };

    const currentTotalHours = parseFloat(form.totalHours) || 0;
    let currentDailyManHours = 0;
    if (isVariable && Array.isArray(phases)) {
        currentDailyManHours = phases.reduce((sum, p) => sum + ((parseFloat(p.workers)||0) * (parseFloat(p.hours)||0)), 0);
    } else {
        const w = parseInt(form.workers, 10) || 1;
        currentDailyManHours = w * (settings.shiftHours || 8);
    }
    
    const calcShiftsNum = currentDailyManHours > 0 ? (currentTotalHours / currentDailyManHours) : 0;
    const calcDays = Math.ceil(calcShiftsNum);
    
    let previewDates = [];
    if (form.startDate && calcDays > 0) {
        previewDates = getActiveDates(form.startDate, null, null, form.allowSaturday, form.allowSunday, calcDays);
    }
    const endDateStr = previewDates.length > 0 ? new Date(previewDates[previewDates.length-1] + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD';

    const handleSchedule = async () => {
        try {
            if (!form.startDate || !form.shiftTime) return alert("Missing required fields");
            if (currentTotalHours <= 0) return alert("Total Project Hours must be greater than 0.");
            if (currentDailyManHours <= 0) return alert("You must assign workers to generate Daily Hours.");
            
            const activeDatesArray = getActiveDates(form.startDate, null, null, form.allowSaturday, form.allowSunday, calcDays);
            const targetDocId = activeJob.proSchedId || activeJob.id;

            let finalMaxConcurrent = 0;
            if(isVariable && Array.isArray(phases)) {
                finalMaxConcurrent = Math.max(0, ...phases.map(p => parseInt(p.workers, 10)||0));
            } else {
                finalMaxConcurrent = parseInt(form.workers, 10) || 1;
            }

            await setDoc(doc(db, "pro_schedule", targetDocId), {
                jobId: activeJob.jobId || activeJob.id,
                sourceQueue: activeJob._source || "unknown",
                project: activeJob.project || "Unnamed",
                company: activeJob.company || "Unknown",
                quantity: String(activeJob.quantity || 0),
                price: String(activeJob.price || 0),
                category: activeJob.category || "",
                size: activeJob.size || "",
                startDate: form.startDate,
                workerCount: finalMaxConcurrent,
                estimatedTotalHours: currentTotalHours,
                shiftTime: form.shiftTime,
                activeDates: activeDatesArray,
                calculatedEndDate: endDateStr,
                durationDays: activeDatesArray.length,
                allowSaturday: form.allowSaturday,
                allowSunday: form.allowSunday,
                isVariableWorkers: isVariable,
                phases: isVariable ? (phases || []) : [],
                dailyManHours: currentDailyManHours,
                maxConcurrentWorkers: finalMaxConcurrent
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
        const initWorkers = job.workerCount ? String(Math.max(1, parseInt(job.workerCount, 10) || 1)) : '1';
        let autoHrs = 0;
        if (financeCostPerHour > 0) {
            const q = parseFloat(String(job.quantity).replace(/[^0-9.]/g, '')) || 0;
            const p = parseFloat(String(job.price).replace(/[^0-9.]/g, '')) || 0;
            autoHrs = (q * p) / financeCostPerHour;
        }
        const sysSeconds = Number(job.originalSeconds || job.seconds || 0);
        if (sysSeconds > 0 && autoHrs === 0) autoHrs = sysSeconds / 3600;
        const initHours = Number(job.estimatedTotalHours || 0) > 0 ? Number(job.estimatedTotalHours) : autoHrs;
        
        const defaultShift = settings.shiftOptions && settings.shiftOptions.length > 0 ? settings.shiftOptions[0] : '';

        setActiveJob(job); 
        
        if (job.isVariableWorkers) {
            setIsVariable(true);
            setPhases(job.phases?.length > 0 ? job.phases : [{ name: '', workers: 1, hours: 0 }]);
        } else {
            setIsVariable(false);
            setPhases([{ name: '', workers: 1, hours: 0 }]);
        }

        setForm({
            startDate: presetDate || job.startDate || '', 
            workers: initWorkers, 
            totalHours: initHours > 0 ? Number(initHours.toFixed(2)).toString() : '',
            shiftTime: job.shiftTime || defaultShift,
            allowSaturday: job.allowSaturday || false,
            allowSunday: job.allowSunday || false
        }); 
    };

    const handleWorkersChange = (val) => {
        const w = parseInt(val, 10) || 1;
        setForm(prev => ({ ...prev, workers: String(w) }));
    };

    // ==========================================
    // 5. DRAG & DROP CALENDAR LOGIC
    // ==========================================
    const handleDragStart = (e, job) => { e.dataTransfer.setData("jobId", job.id); };

    const handleDropOnDate = (e, dateObj) => {
        e.preventDefault();
        if (!dateObj) return;
        const jobId = e.dataTransfer.getData("jobId");
        const job = allJobs.find(j => j.id === jobId);
        if (job) openScheduleModal(job, toLocalISO(dateObj));
    };

    const renderCalendarGrid = () => {
        let daysToRender = [];
        let gridCols = 'repeat(7, 1fr)';

        if (calView === '5day') {
            const sow = getSunday(calBaseDate);
            for(let i=1; i<=5; i++) daysToRender.push(addDays(sow, i)); 
            gridCols = 'repeat(5, 1fr)';
        } else if (calView === 'week') {
            const sow = getSunday(calBaseDate);
            for(let i=0; i<7; i++) daysToRender.push(addDays(sow, i));
        } else if (calView === '2week') {
            const sow = getSunday(calBaseDate);
            for(let i=0; i<14; i++) daysToRender.push(addDays(sow, i));
        } else if (calView === 'month') {
            const som = new Date(calBaseDate.getFullYear(), calBaseDate.getMonth(), 1);
            const startDay = som.getDay();
            const numDays = new Date(calBaseDate.getFullYear(), calBaseDate.getMonth() + 1, 0).getDate();
            for(let i=0; i<startDay; i++) daysToRender.push(null); 
            for(let i=0; i<numDays; i++) daysToRender.push(addDays(som, i));
        }
        
        return (
            <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: '10px', marginTop: '15px' }}>
                {daysToRender.map((dateObj, index) => {
                    if (!dateObj) return <div key={`pad-${index}`} style={{background: '#f8fafc', borderRadius: '6px', border: '1px dashed #e2e8f0'}} />;
                    
                    const dateStr = toLocalISO(dateObj);
                    const isToday = dateStr === toLocalISO(new Date());
                    const dayJobs = scheduled.filter(j => j.activeDates && j.activeDates.includes(dateStr));
                    
                    const jobsByShift = {};
                    dayJobs.forEach(j => {
                        const s = j.shiftTime || 'Unassigned Shift';
                        if (!jobsByShift[s]) jobsByShift[s] = [];
                        jobsByShift[s].push(j);
                    });

                    return (
                        <div 
                            key={dateStr}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => handleDropOnDate(e, dateObj)}
                            onClick={() => setSelectedDayObj(dateObj)} 
                            style={{ 
                                background: isToday ? '#eff6ff' : 'white', 
                                border: isToday ? '2px solid #3b82f6' : '1px solid #cbd5e1', 
                                borderRadius: '8px', 
                                minHeight: '250px', 
                                display: 'flex', flexDirection: 'column',
                                overflow: 'hidden',
                                cursor: 'pointer',
                                transition: 'all 0.1s ease-in-out'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'}
                            onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
                        >
                            <div style={{ 
                                background: isToday ? '#3b82f6' : '#f1f5f9', 
                                color: isToday ? 'white' : '#475569', 
                                padding: '6px 10px', 
                                fontSize: '13px', 
                                fontWeight: 'bold', 
                                borderBottom: '1px solid #e2e8f0', 
                                textAlign: 'center',
                                lineHeight: '1.4'
                            }}>
                                <div>{dateObj.toLocaleDateString('en-US', { weekday: 'short' })},</div>
                                <div>{dateObj.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}</div>
                            </div>
                            
                            <div style={{ padding: '6px', flex: 1, overflowY: 'auto' }}>
                                {Object.keys(jobsByShift).length === 0 && <div style={{fontSize:'10px', color:'#94a3b8', textAlign:'center', marginTop:'20px'}}>Drop jobs here</div>}
                                
                                {Object.keys(jobsByShift).map(shift => {
                                    // SAFELY mapped Required Math
                                    const totalDailyManHours = jobsByShift[shift].reduce((sum, j) => sum + (parseFloat(j.dailyManHours) || 0), 0);
                                    const workersArr = jobsByShift[shift].map(j => parseInt(j.maxConcurrentWorkers || j.workerCount || 0, 10) || 0);
                                    const maxConcurrent = workersArr.length > 0 ? Math.max(0, ...workersArr) : 0;
                                    const required = Math.max(maxConcurrent, Math.ceil(totalDailyManHours / (settings.shiftHours || 8)));

                                    return (
                                        <div key={shift} style={{ border: '1px solid #e2e8f0', borderRadius: '4px', padding: '4px', marginBottom: '6px', background: '#f8fafc' }}>
                                            <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#475569', marginBottom: '4px', lineHeight: '1.1' }}>{shift}</div>
                                            
                                            <div style={{ fontSize: '10px', color: '#0f172a', fontWeight: 'bold', marginBottom: '4px' }}>
                                                Required Workers: {required}
                                            </div>
                                            
                                            {(jobsByShift[shift] || []).map(job => (
                                                <div 
                                                    key={job.id} 
                                                    onClick={(e) => { e.stopPropagation(); openScheduleModal(job); }} 
                                                    style={{ background: '#3b82f6', color: 'white', padding: '4px 6px', borderRadius: '3px', fontSize: '11px', cursor: 'pointer', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                                    title={job.project}
                                                >
                                                    {job.project}
                                                </div>
                                            ))}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    // ==========================================
    // 6. BASE RENDER LOGIC & FINANCIALS
    // ==========================================
    let viewStart = getSunday(calBaseDate);
    let viewEnd = addDays(viewStart, 6);
    
    if (calView === '5day' || calView === 'week') {
        viewStart = getSunday(calBaseDate);
        viewEnd = addDays(viewStart, 6);
    } else if (calView === '2week') {
        viewStart = getSunday(calBaseDate);
        viewEnd = addDays(viewStart, 13);
    } else if (calView === 'month') {
        viewStart = new Date(calBaseDate.getFullYear(), calBaseDate.getMonth(), 1);
        viewEnd = new Date(calBaseDate.getFullYear(), calBaseDate.getMonth() + 1, 0);
    }

    viewStart.setHours(0,0,0,0);
    viewEnd.setHours(23,59,59,999);

    const visibleDateStrings = [];
    let curDate = new Date(viewStart);
    while (curDate <= viewEnd) {
        visibleDateStrings.push(toLocalISO(curDate));
        curDate.setDate(curDate.getDate() + 1);
    }

    const jobsEndingInView = scheduled.filter(j => {
        if (!j.activeDates || j.activeDates.length === 0) return false;
        const lastDateStr = j.activeDates[j.activeDates.length - 1];
        return visibleDateStrings.includes(lastDateStr);
    });

    const totalBilling = jobsEndingInView.reduce((sum, j) => {
        const cleanQuantity = parseFloat(String(j.quantity).replace(/[^0-9.]/g, '')) || 0;
        const cleanPrice = parseFloat(String(j.price).replace(/[^0-9.]/g, '')) || 0;
        return sum + (cleanQuantity * cleanPrice);
    }, 0);

    const maxLaborBudget = totalBilling * 0.50;
    const isOverBudget = hrSpend > maxLaborBudget;

    return (
        <div style={{ padding: '20px', maxWidth: '1600px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ margin: 0, color: '#1e293b' }}>🗓️ Production Command Center</h2>
                <button onClick={() => setShowSettings(true)} style={{...styles.btn, background: '#e2e8f0', color: '#334155', border: '1px solid #cbd5e1'}}>⚙️ Settings</button>
            </div>
            
            <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
                <div style={{ ...styles.card, flex: 1, background: '#f8fafc', borderTop: '4px solid #0ea5e9', padding: '15px' }}>
                    <h4 style={{ margin: '0 0 5px 0', color: '#64748b' }}>Expected Billing (Finishing in View)</h4>
                    <h2 style={{ margin: 0, color: '#0369a1' }}>${totalBilling.toLocaleString(undefined, {minimumFractionDigits: 2})}</h2>
                </div>
                <div style={{ ...styles.card, flex: 1, background: '#f8fafc', borderTop: '4px solid #10b981', padding: '15px' }}>
                    <h4 style={{ margin: '0 0 5px 0', color: '#64748b' }}>Max Labor Budget (50%)</h4>
                    <h2 style={{ margin: 0, color: '#047857' }}>${maxLaborBudget.toLocaleString(undefined, {minimumFractionDigits: 2})}</h2>
                </div>
                <div style={{ ...styles.card, flex: 1, background: isOverBudget && totalBilling > 0 ? '#fef2f2' : '#f0fdf4', borderTop: `4px solid ${isOverBudget && totalBilling > 0 ? '#ef4444' : '#22c55e'}`, padding: '15px' }}>
                    <h4 style={{ margin: '0 0 5px 0', color: '#64748b' }}>HR Spend for View (Hourly Only)</h4>
                    <h2 style={{ color: isOverBudget && totalBilling > 0 ? '#b91c1c' : '#15803d', margin: 0 }}>
                        ${hrSpend.toLocaleString(undefined, {minimumFractionDigits: 2})}
                    </h2>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '25px', alignItems: 'flex-start' }}>
                {/* QUEUE */}
                <div style={{ width: '320px', background: '#f1f5f9', padding: '15px', borderRadius: '8px', minHeight: '600px', flexShrink: 0 }}>
                    <h3 style={{ marginTop: 0, color: '#334155', borderBottom: '2px solid #cbd5e1', paddingBottom: '10px', fontSize: '16px' }}>📥 Waiting ({unscheduled.length})</h3>
                    <p style={{fontSize: '11px', color: '#64748b', marginTop: '-5px', marginBottom: '15px'}}>Drag items onto the calendar to schedule.</p>
                    
                    <div style={{display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '800px', overflowY: 'auto', paddingRight: '5px'}}>
                        {(unscheduled || []).map(job => (
                            <div 
                                key={job.id} 
                                draggable
                                onDragStart={(e) => handleDragStart(e, job)}
                                onClick={() => openScheduleModal(job)}
                                style={{ background: 'white', padding: '12px', borderRadius: '6px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: `4px solid ${job._source === 'project_queue' ? '#8b5cf6' : '#f59e0b'}`, cursor: 'grab' }}
                            >
                                <h4 style={{ margin: '0 0 4px 0', color: '#0f172a', fontSize: '14px' }}>{job.project}</h4>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>{job.company} • {job.quantity || 0} units</div>
                                <div style={{ fontSize: '9px', marginTop: '6px', background: '#e2e8f0', display: 'inline-block', padding: '2px 6px', borderRadius: '4px', color: '#475569' }}>
                                    {job._source === 'project_queue' ? '📱 iPad' : '💻 Pipeline'}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* CALENDAR */}
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '10px 15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={() => setCalBaseDate(addDays(calBaseDate, calView==='month'?-30:-7))} style={{...styles.btn, padding: '6px 12px'}}>&larr; Prev</button>
                            <button onClick={() => setCalBaseDate(new Date())} style={{...styles.btn, padding: '6px 12px', background: 'white'}}>Today</button>
                            <button onClick={() => setCalBaseDate(addDays(calBaseDate, calView==='month'?30:7))} style={{...styles.btn, padding: '6px 12px'}}>Next &rarr;</button>
                        </div>
                        
                        <h3 style={{ margin: 0, color: '#1e293b' }}>
                            {calBaseDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </h3>

                        <div style={{ display: 'flex', gap: '5px' }}>
                            {['5day', 'week', '2week', 'month'].map(view => (
                                <button 
                                    key={view} 
                                    onClick={() => setCalView(view)} 
                                    style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid #cbd5e1', background: calView === view ? '#2563eb' : 'white', color: calView === view ? 'white' : '#475569', cursor: 'pointer', fontWeight: calView === view ? 'bold' : 'normal', fontSize: '12px', textTransform: 'capitalize' }}
                                >
                                    {view}
                                </button>
                            ))}
                        </div>
                    </div>

                    {renderCalendarGrid()}
                </div>
            </div>

            {/* --- DAY VIEW MODAL --- */}
            {selectedDayObj && !activeJob && (
                <div className="modal-overlay" style={{position:'fixed', top:0, left:0, width:'100vw', height:'100vh', background:'rgba(0,0,0,0.6)', zIndex:90, display:'flex', justifyContent:'center', alignItems:'center'}}>
                    <div style={{background: '#f8fafc', padding: '30px', borderRadius: '12px', width: '900px', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.2)'}}>
                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'2px solid #cbd5e1', paddingBottom:'15px', marginBottom:'20px'}}>
                            <div>
                                <h2 style={{margin: 0, color: '#1e293b'}}>
                                    {selectedDayObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                                </h2>
                                <span style={{color: '#64748b', fontSize: '14px'}}>Daily Production Plan</span>
                            </div>
                            <button onClick={() => setSelectedDayObj(null)} style={{background:'#e2e8f0', border:'none', padding:'8px 15px', borderRadius:'6px', cursor:'pointer', fontWeight:'bold', color:'#334155'}}>Close</button>
                        </div>

                        {(() => {
                            const dateStr = toLocalISO(selectedDayObj);
                            const dayJobs = scheduled.filter(j => j.activeDates && j.activeDates.includes(dateStr));
                            
                            if (dayJobs.length === 0) {
                                return <div style={{textAlign:'center', color:'#94a3b8', padding:'40px 0', fontSize:'16px'}}>No projects scheduled for this day.</div>;
                            }

                            const jobsByShift = {};
                            dayJobs.forEach(j => {
                                const s = j.shiftTime || 'Unassigned Shift';
                                if (!jobsByShift[s]) jobsByShift[s] = [];
                                jobsByShift[s].push(j);
                            });

                            return Object.keys(jobsByShift).map(shift => {
                                const totalDailyManHours = jobsByShift[shift].reduce((sum, j) => sum + (parseFloat(j.dailyManHours) || 0), 0);
                                const workersArr = jobsByShift[shift].map(j => parseInt(j.maxConcurrentWorkers || j.workerCount || 0, 10) || 0);
                                const maxConcurrent = workersArr.length > 0 ? Math.max(0, ...workersArr) : 0;
                                const required = Math.max(maxConcurrent, Math.ceil(totalDailyManHours / (settings.shiftHours || 8)));

                                return (
                                    <div key={shift} style={{marginBottom: '25px'}}>
                                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', background:'#e2e8f0', padding:'10px 15px', borderRadius:'8px 8px 0 0', border:'1px solid #cbd5e1', borderBottom:'none'}}>
                                            <h3 style={{margin:0, color:'#334155', fontSize:'16px'}}>{shift}</h3>
                                            
                                            <div style={{background: '#f8fafc', color: '#334155', padding:'4px 10px', borderRadius:'20px', fontSize:'13px', fontWeight:'bold', border: `1px solid #cbd5e1`}}>
                                                Required Workers: {required}
                                            </div>
                                        </div>
                                        <div style={{background:'white', border:'1px solid #cbd5e1', borderRadius:'0 0 8px 8px', overflow:'hidden'}}>
                                            <table style={{width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px'}}>
                                                <thead>
                                                    <tr style={{background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569'}}>
                                                        <th style={{padding: '12px 15px'}}>Project</th>
                                                        <th style={{padding: '12px 15px'}}>Company</th>
                                                        <th style={{padding: '12px 15px'}}>Staffing Details</th>
                                                        <th style={{padding: '12px 15px', textAlign:'right'}}>Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(jobsByShift[shift] || []).map((job, idx) => (
                                                        <tr key={job.id} style={{borderBottom: idx === jobsByShift[shift].length - 1 ? 'none' : '1px solid #e2e8f0'}}>
                                                            <td style={{padding: '12px 15px', fontWeight: 'bold', color: '#0f172a'}}>{job.project}</td>
                                                            <td style={{padding: '12px 15px', color: '#475569'}}>{job.company}</td>
                                                            <td style={{padding: '12px 15px'}}>
                                                                {job.isVariableWorkers && job.phases?.length > 0 ? (
                                                                    <div style={{fontSize: '12px'}}>
                                                                        {(job.phases || []).map((p, i) => (
                                                                            <div key={i} style={{background:'#f1f5f9', padding:'2px 6px', borderRadius:'4px', marginBottom:'2px', display:'inline-block', marginRight:'4px'}}>
                                                                                {p.name || `Phase ${i+1}`}: <strong>{p.workers}</strong> workers for <strong>{p.hours}h</strong>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <div style={{fontSize: '12px', background:'#f1f5f9', padding:'2px 6px', borderRadius:'4px', display:'inline-block'}}>
                                                                        <strong>{job.workerCount}</strong> workers (Standard)
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td style={{padding: '12px 15px', textAlign:'right'}}>
                                                                <button onClick={() => openScheduleModal(job)} style={{background:'#3b82f6', color:'white', border:'none', padding:'6px 12px', borderRadius:'4px', cursor:'pointer', fontSize:'12px', fontWeight:'bold'}}>Edit</button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                );
                            });
                        })()}
                    </div>
                </div>
            )}

            {/* --- SCHEDULING MODAL --- */}
            {activeJob && (
                <div className="modal-overlay" style={{position:'fixed', top:0, left:0, width:'100vw', height:'100vh', background:'rgba(0,0,0,0.7)', zIndex:110, display:'flex', justifyContent:'center', alignItems:'center'}}>
                    <div style={{background: 'white', padding: '25px', borderRadius: '8px', width: '600px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.2)'}}>
                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                            <h3 style={{marginTop: 0, color: '#1e293b', marginBottom:'20px'}}>Schedule: {activeJob.project}</h3>
                            
                            {(activeJob.proSchedId || activeJob.activeDates) && (
                                <button onClick={() => handleUnschedule(activeJob.proSchedId || activeJob.id)} style={{background:'#fef2f2', color:'#ef4444', border:'1px solid #fca5a5', borderRadius:'4px', padding:'4px 8px', cursor:'pointer', fontSize:'12px', fontWeight:'bold'}}>
                                    Unschedule
                                </button>
                            )}
                        </div>

                        <div style={{display: 'flex', gap: '15px', marginBottom: '15px'}}>
                            <div style={{flex: 1}}>
                                <label style={{display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '5px'}}>Start Date</label>
                                <input type="date" value={form.startDate} onChange={e=>setForm({...form, startDate: e.target.value})} style={{width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #cbd5e1', boxSizing: 'border-box'}} />
                            </div>
                            <div style={{flex: 1.5}}>
                                <label style={{display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '5px'}}>Target Shift</label>
                                <select value={form.shiftTime} onChange={e=>setForm({...form, shiftTime: e.target.value})} style={{width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #cbd5e1', boxSizing: 'border-box', background: 'white'}}>
                                    <option value="">-- Select Shift --</option>
                                    {(settings.shiftOptions || []).map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div style={{flex: 1}}>
                                <label style={{display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '5px'}}>Total Project Hrs</label>
                                <input type="number" step="0.01" min="0" value={form.totalHours} onChange={e=>setForm({...form, totalHours: e.target.value})} style={{width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #cbd5e1', boxSizing: 'border-box', background: '#f8fafc', fontWeight: 'bold'}} />
                            </div>
                        </div>

                        <div style={{marginBottom: '20px', background: isVariable ? '#f0fdf4' : '#f8fafc', padding: '15px', borderRadius: '6px', border: `1px solid ${isVariable ? '#86efac' : '#cbd5e1'}`}}>
                            <label style={{display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', color: '#166534', cursor: 'pointer', marginBottom: isVariable ? '15px' : '0'}}>
                                <input type="checkbox" checked={isVariable} onChange={e => setIsVariable(e.target.checked)} style={{width:'16px', height:'16px'}} />
                                Variable workers per day (e.g. Cello vs Filling)
                            </label>

                            {isVariable ? (
                                <div>
                                    <div style={{display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 20px', gap: '10px', marginBottom: '5px', fontSize: '11px', fontWeight: 'bold', color: '#475569', paddingRight: '10px'}}>
                                        <div>Phase Name</div>
                                        <div>Workers</div>
                                        <div>Hours</div>
                                        <div></div>
                                    </div>
                                    
                                    <div style={{ maxHeight: '180px', overflowY: 'auto', overflowX: 'hidden', paddingRight: '5px', marginBottom: '10px' }}>
                                        {(phases || []).map((p, i) => (
                                            <div key={i} style={{display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 20px', gap: '10px', marginBottom: '8px', alignItems: 'center'}}>
                                                <input type="text" placeholder="e.g. Filling" value={p.name} onChange={e => { const newP = [...phases]; newP[i].name = e.target.value; setPhases(newP); }} style={{width:'100%', padding:'6px', borderRadius:'4px', border:'1px solid #cbd5e1'}} />
                                                <input type="number" placeholder="0" min="1" value={p.workers} onChange={e => { const newP = [...phases]; newP[i].workers = e.target.value; setPhases(newP); }} style={{width:'100%', padding:'6px', borderRadius:'4px', border:'1px solid #cbd5e1'}} />
                                                <input type="number" placeholder="0.0" step="0.5" value={p.hours} onChange={e => { const newP = [...phases]; newP[i].hours = e.target.value; setPhases(newP); }} style={{width:'100%', padding:'6px', borderRadius:'4px', border:'1px solid #cbd5e1'}} />
                                                {phases.length > 1 ? (
                                                    <button onClick={() => setPhases(phases.filter((_, idx) => idx !== i))} style={{background:'none', border:'none', color:'#ef4444', cursor:'pointer', fontSize:'16px', padding:0}}>×</button>
                                                ) : <div></div>}
                                            </div>
                                        ))}
                                    </div>
                                    
                                    <button onClick={() => setPhases([...phases, { name: '', workers: 1, hours: 0 }])} style={{background:'#e2e8f0', color:'#334155', border:'none', padding:'6px 12px', borderRadius:'4px', fontSize:'11px', fontWeight:'bold', cursor:'pointer'}}>+ Add Phase</button>
                                </div>
                            ) : (
                                <div style={{display: 'flex', gap: '15px', marginTop: '15px'}}>
                                    <div style={{flex: 1}}>
                                        <label style={{display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '5px'}}>Standard Workers Assigned</label>
                                        <input type="number" min="1" step="1" value={form.workers} onChange={e => setForm({...form, workers: e.target.value})} style={{width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #cbd5e1', boxSizing: 'border-box'}} />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div style={{background: '#f1f5f9', padding: '10px', borderRadius: '6px', marginBottom: '20px', border: '1px solid #e2e8f0'}}>
                            <div style={{fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '8px'}}>Overtime Rules (Ignore Weekends)</div>
                            <div style={{display: 'flex', gap: '20px'}}>
                                <label style={{fontSize: '13px', cursor: 'pointer'}}><input type="checkbox" checked={form.allowSaturday} onChange={e=>setForm({...form, allowSaturday: e.target.checked})} /> Allow Saturday</label>
                                <label style={{fontSize: '13px', cursor: 'pointer'}}><input type="checkbox" checked={form.allowSunday} onChange={e=>setForm({...form, allowSunday: e.target.checked})} /> Allow Sunday</label>
                            </div>
                        </div>

                        {form.startDate && currentTotalHours > 0 && currentDailyManHours > 0 && (
                            <div style={{background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '15px', borderRadius: '6px', marginBottom: '20px', color: '#166534'}}>
                                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '10px', borderBottom: '1px solid #bbf7d0', paddingBottom: '10px'}}>
                                    <div><strong>Daily Effort:</strong> {currentDailyManHours.toFixed(2)} hrs/day</div>
                                    <div><strong>Exact Shifts:</strong> {calcShiftsNum.toFixed(2)}</div>
                                </div>
                                <div style={{textAlign: 'center'}}>
                                    <div style={{fontSize: '14px', marginBottom: '5px'}}>Calendar Days Needed: <strong>{calcDays}</strong></div>
                                    <div style={{fontSize: '15px'}}>Target End Date: <strong>{endDateStr}</strong></div>
                                </div>
                            </div>
                        )}

                        <div style={{display: 'flex', gap: '10px'}}>
                            <button onClick={() => setActiveJob(null)} style={{flex: 1, padding: '10px', background: 'transparent', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer'}}>Cancel</button>
                            <button onClick={handleSchedule} style={{flex: 1, padding: '10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'}}>Save to Schedule</button>
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