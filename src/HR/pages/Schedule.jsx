import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, getDoc, writeBatch, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../firebase';
import { useRole } from '../hooks/useRole';
import { logAudit } from '../utils/logger';

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
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().split('T')[0];
};
const formatDateShort = (dateObj) => {
    return dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
};
const getDayName = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long' }); 
};
const formatDateRange = (start, end) => {
    const s = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const e = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${s} - ${e}`;
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
// NEW: Helper to add opacity to hex colors
const hexToRgba = (hex, alpha) => {
    if (!hex || typeof hex !== 'string' || hex[0] !== '#') return hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export default function Schedule() {
  const { checkAccess } = useRole();
  const canEdit = checkAccess('schedule', 'edit');
  const canSeeMoney = checkAccess('financials', 'view');

  const [employees, setEmployees] = useState([]);
  const [schedule, setSchedule] = useState({});
  const [lunchDed, setLunchDed] = useState(30); 
  
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("All"); 
  const [deptFilter, setDeptFilter] = useState("All"); 
  const [showWeekend, setShowWeekend] = useState(false); 

  const [currentStart, setCurrentStart] = useState(getSunday(new Date()));
  const [weekDates, setWeekDates] = useState([]); 

  const [areas, setAreas] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [departments, setDepartments] = useState([]); 
  const [shiftColorRules, setShiftColorRules] = useState([]); 

  const [isMouseDown, setIsMouseDown] = useState(false);
  const [paintArea, setPaintArea] = useState("");
  const [paintTime, setPaintTime] = useState("");
  const [isEraser, setIsEraser] = useState(false);
  const [editingCell, setEditingCell] = useState(null); 

  const [isQuickOpen, setIsQuickOpen] = useState(false);
  const [quickForm, setQuickForm] = useState({
      targetIds: [], 
      startDate: toLocalISO(new Date()),
      endDate: toLocalISO(addDays(new Date(), 4)), 
      area: "",
      time: "",
      mode: "range"
  });
  
  const [recurDays, setRecurDays] = useState({
      Monday: true, Tuesday: true, Wednesday: true, Thursday: true, Friday: true, Saturday: false, Sunday: false
  });

  useEffect(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
        days.push(addDays(currentStart, i));
    }
    setWeekDates(days);

    const fetchSchedule = async () => {
        const newSched = {};
        await Promise.all(days.map(async (d) => {
            const dateStr = toLocalISO(d);
            const snap = await getDoc(doc(db, "schedules", dateStr));
            if (snap.exists()) newSched[dateStr] = snap.data().allocations || {};
            else newSched[dateStr] = {};
        }));
        setSchedule(newSched);
    };
    fetchSchedule();
  }, [currentStart]);

  useEffect(() => {
      getDoc(doc(db, "settings", "global_options")).then(snap => {
          if(snap.exists()) {
              const data = snap.data();
              setAreas(data.scheduleAreas || []);
              setShifts(data.shiftBlocks || []);
              setDepartments(data.departments || []);
              if(data.lunchDuration) setLunchDed(data.lunchDuration);
              setShiftColorRules(data.shiftColorRules || []); 
          }
      });
      const unsub = onSnapshot(collection(db, "employees"), (snap) => {
          const list = snap.docs.map(d => ({id: d.id, ...d.data()})).filter(e => e.status !== 'Inactive');
          list.sort((a,b) => a.lastName.localeCompare(b.lastName));
          setEmployees(list);
      });
      return () => unsub();
  }, []);

  const filteredEmployees = employees.filter(e => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = e.firstName.toLowerCase().includes(term) || e.lastName.toLowerCase().includes(term);
      const matchesType = typeFilter === "All" || e.type === typeFilter;
      const matchesDept = deptFilter === "All" || e.department === deptFilter;
      return matchesSearch && matchesType && matchesDept;
  });

  const changeWeek = (offset) => {
      setCurrentStart(addDays(currentStart, offset * 7));
  };

  const getCellData = (dateStr, emp) => {
      const override = schedule[dateStr]?.[emp.id];
      if (override) return override;
      if (emp.defaultSchedule) {
          const dayName = getDayName(dateStr); 
          if (emp.defaultSchedule[dayName]) return emp.defaultSchedule[dayName];
      }
      return {};
  };

  const getNetHours = (timeStr) => {
      const gross = parseShiftHours(timeStr);
      if (gross > 5) {
          const deduction = lunchDed / 60; 
          return Math.max(0, gross - deduction);
      }
      return gross;
  };

  // UPDATED: Check Area Matches Logic
  const getShiftColor = (timeStr, areaStr) => {
    if (!timeStr || !shiftColorRules.length) return null;
    
    // Parse Start Time
    const clean = timeStr.split(/[-–—]/)[0].replace(/\s+/g, '').toUpperCase();
    const match = clean.match(/^(\d{1,2})(?::(\d{2}))?(AM|PM)?$/);
    
    if (!match) return null;

    let h = parseInt(match[1], 10);
    const m = match[2] ? parseInt(match[2], 10) : 0;
    const mer = match[3];

    if (mer === 'PM' && h < 12) h += 12;
    if (mer === 'AM' && h === 12) h = 0;
    
    const startDecimal = h + (m / 60);

    // Check rules
    const rule = shiftColorRules.find(r => {
        const timeMatch = startDecimal >= r.start && startDecimal < r.end;
        
        // If the rule has specific areas listed, the current cell area must be in that list.
        // If the rule has NO areas listed, it applies to everyone (backward compatibility/default).
        const areaMatch = !r.areas || r.areas.length === 0 || (areaStr && r.areas.includes(areaStr));
        
        return timeMatch && areaMatch;
    });

    return rule ? rule.color : null;
  };

  const calculateDailyCost = (dateStr) => {
      if (!canSeeMoney) return 0;
      let total = 0;
      employees.forEach(emp => {
          const cell = getCellData(dateStr, emp);
          if (cell.time) {
              const hours = getNetHours(cell.time);
              const rate = parseFloat(emp.compensation) || 0;
              const hourlyRate = emp.type === "Salary" ? (rate / 2080) : rate;
              total += (hourlyRate * hours);
          }
      });
      return total;
  };

  const applyChange = async (dateStr, empId, area, time, isDelete) => {
      if (!canEdit) return;
      
      const emp = employees.find(e => e.id === empId);
      const empName = emp ? `${emp.firstName} ${emp.lastName}` : empId;

      setSchedule(prev => {
          const dayData = { ...(prev[dateStr] || {}) };
          if (isDelete) { delete dayData[empId]; } 
          else { dayData[empId] = { area, time }; }
          return { ...prev, [dateStr]: dayData };
      });
      
      const docRef = doc(db, "schedules", dateStr);
      
      if (isDelete) {
          try { 
              await updateDoc(docRef, { [`allocations.${empId}`]: deleteField() }); 
              logAudit("Schedule Change", dateStr, `Removed shift for ${empName}`); 
          } catch (e) { }
      } else {
          const payload = { allocations: {} };
          payload.allocations[empId] = { area, time };
          await setDoc(docRef, payload, { merge: true });
          logAudit("Schedule Change", dateStr, `Set ${area} @ ${time} for ${empName}`); 
      }
  };

  const onMouseDown = (dateStr, empId) => { 
      if (!canEdit) return;
      const isPaintMode = paintArea || paintTime || isEraser;
      if (isPaintMode) {
          setIsMouseDown(true); 
          applyChange(dateStr, empId, paintArea, paintTime, isEraser);
      } else {
          const current = getCellData(dateStr, employees.find(e => e.id === empId));
          setEditingCell({
              dateStr, empId, 
              name: employees.find(e => e.id === empId)?.firstName,
              area: current.area || "", time: current.time || ""
          });
      }
  };

  const onMouseEnter = (dateStr, empId) => { 
      if (isMouseDown && canEdit && (paintArea || paintTime || isEraser)) {
          applyChange(dateStr, empId, paintArea, paintTime, isEraser);
      }
  };

  const onMouseUp = () => setIsMouseDown(false);

  const handleModalSave = async () => {
      if(!editingCell) return;
      await applyChange(editingCell.dateStr, editingCell.empId, editingCell.area, editingCell.time, false);
      setEditingCell(null);
  };

  const handleModalDelete = async () => {
      if(!editingCell) return;
      await applyChange(editingCell.dateStr, editingCell.empId, "", "", true);
      setEditingCell(null);
  };

  const handleQuickAssign = async (e) => {
      e.preventDefault();
      if (!quickForm.area && !quickForm.time) return alert("Select an Area or Time");
      const targets = quickForm.targetIds === 'ALL' ? filteredEmployees.map(e => e.id) : quickForm.targetIds;
      if (targets.length === 0) return alert("No employees selected");

      const batch = writeBatch(db);

      if (quickForm.mode === 'indefinite') {
          const daysToSet = Object.keys(recurDays).filter(d => recurDays[d]);
          if (daysToSet.length === 0) return alert("Select at least one day.");
          targets.forEach(empId => {
              const empRef = doc(db, "employees", empId);
              daysToSet.forEach(dayName => {
                  if (quickForm.area === "CLEAR" || quickForm.time === "CLEAR") {
                      batch.update(empRef, { [`defaultSchedule.${dayName}`]: null });
                  } else {
                      batch.update(empRef, { [`defaultSchedule.${dayName}`]: { area: quickForm.area, time: quickForm.time } });
                  }
              });
          });
          await batch.commit();
          logAudit("Schedule Recurring", "Bulk Update", `Updated recurring schedule for ${targets.length} staff`);
          window.location.reload(); 
          return;
      }

      let start = new Date(quickForm.startDate + 'T12:00:00');
      let end = new Date(quickForm.endDate + 'T12:00:00');
      const datesToUpdate = [];
      while (start <= end) {
          datesToUpdate.push(toLocalISO(start));
          start.setDate(start.getDate() + 1);
      }

      for (const dateStr of datesToUpdate) {
          const docRef = doc(db, "schedules", dateStr);
          let currentAlloc = {}; 
          targets.forEach(empId => {
              if (!currentAlloc[empId]) currentAlloc[empId] = {};
              if (quickForm.area) currentAlloc[empId].area = quickForm.area;
              if (quickForm.time) currentAlloc[empId].time = quickForm.time;
          });
          batch.set(docRef, { allocations: currentAlloc }, { merge: true });
      }
      await batch.commit();
      logAudit("Schedule Range", "Bulk Update", `Updated schedule for ${targets.length} staff (${quickForm.startDate} to ${quickForm.endDate})`);
      window.location.reload();
  };

  const visibleDates = weekDates.filter((d, i) => {
      if (showWeekend) return true;
      return i !== 0 && i !== 6; 
  });

  const printStyle = `
    @media print {
        body * { visibility: hidden; }
        .schedule-container, .schedule-container * { visibility: visible; }
        .schedule-container { position: absolute; left: 0; top: 0; width: 100vw; font-size: 10px; }
        .no-print { display: none !important; }
        .no-shift-row { display: none !important; }
        th, td { border: 1px solid #000 !important; color: black !important; padding: 2px !important; }
        th { background-color: #eee !important; -webkit-print-color-adjust: exact; }
    }
  `;

  return (
    <div className="animate-fade schedule-container" onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
      <style>{printStyle}</style>

      {/* HEADER */}
      <div className="no-print" style={{marginBottom: 20, background:'white', padding: '10px 20px', borderRadius: 8, boxShadow:'0 2px 4px rgba(0,0,0,0.05)', display:'flex', alignItems:'center', gap: 15, flexWrap:'wrap'}}>
          <div style={{display:'flex', alignItems:'center', gap: 10, borderRight:'1px solid #e2e8f0', paddingRight: 15}}>
              <h2 style={{margin:0, fontSize:'20px', color:'#1e293b'}}>Schedule</h2>
              <div style={{display:'flex', alignItems:'center', background:'#f8fafc', border:'1px solid #cbd5e1', borderRadius: 6}}>
                  <button onClick={() => changeWeek(-1)} style={{border:'none', background:'transparent', padding:'4px 8px', cursor:'pointer', fontWeight:'bold'}}>&lt;</button>
                  <span style={{fontSize:'13px', fontWeight:'600', color:'#334155', minWidth: 110, textAlign:'center'}}>{weekDates.length > 0 ? formatDateRange(weekDates[0], weekDates[6]) : "Loading..."}</span>
                  <button onClick={() => changeWeek(1)} style={{border:'none', background:'transparent', padding:'4px 8px', cursor:'pointer', fontWeight:'bold'}}>&gt;</button>
              </div>
          </div>
          <div style={{display:'flex', gap: 8, flex: 1, alignItems:'center'}}>
              <input placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{padding: '6px', borderRadius: 4, border:'1px solid #cbd5e1', width: 120, fontSize:'13px'}} />
              <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} style={{padding: '6px', borderRadius: 4, border:'1px solid #cbd5e1', fontSize:'13px', maxWidth: 110}}><option value="All">All Depts</option>{departments.map(d => <option key={d} value={d}>{d}</option>)}</select>
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{padding: '6px', borderRadius: 4, border:'1px solid #cbd5e1', fontSize:'13px', width: 90}}><option value="All">All Types</option><option value="Hourly">Hourly</option><option value="Salary">Salary</option></select>
              <label style={{display:'flex', alignItems:'center', gap: 5, fontSize:'12px', cursor:'pointer', marginLeft: 5, userSelect:'none'}}><input type="checkbox" checked={showWeekend} onChange={e => setShowWeekend(e.target.checked)} /> Wknd</label>
          </div>
          <div style={{display:'flex', gap: 10}}>
              {canEdit && <button onClick={() => { setQuickForm({ ...quickForm, targetIds: [], startDate: toLocalISO(addDays(currentStart, 1)), endDate: toLocalISO(addDays(currentStart, 5)) }); setIsQuickOpen(true); }} className="primary" style={{padding:'6px 12px', fontSize:'13px'}}>⚡ Quick Add</button>}
              <button onClick={() => window.print()} style={{background:'white', border:'1px solid #cbd5e1', cursor:'pointer', padding:'6px 12px', borderRadius:4, fontWeight:'bold', fontSize:'13px'}}>🖨 Print</button>
          </div>
      </div>

      {/* TOOLBAR */}
      {canEdit && (
          <div className="no-print" style={{marginBottom: 10, background:'#eff6ff', padding: '8px 15px', borderRadius: 6, border:'1px solid #bfdbfe', display:'flex', alignItems:'center', gap: 15}}>
              <div 
                onClick={() => { setPaintArea(""); setPaintTime(""); setIsEraser(false); }}
                style={{
                    display:'flex', alignItems:'center', gap: 5, cursor:'pointer',
                    background: (!paintArea && !paintTime && !isEraser) ? '#2563eb' : 'white',
                    color: (!paintArea && !paintTime && !isEraser) ? 'white' : '#1e40af',
                    padding: '5px 10px', borderRadius: 4, border: '1px solid #2563eb', fontWeight:'bold', fontSize:'12px'
                }}
              >
                  <span>👆 Select / Edit</span>
              </div>
              <div style={{height: 20, width: 1, background:'#bfdbfe'}}></div>
              <span style={{fontSize:'12px', fontWeight:'bold', color:'#1e40af', textTransform:'uppercase'}}>Paint:</span>
              <select value={paintArea} onChange={e => {setPaintArea(e.target.value); setIsEraser(false);}} style={{padding: '5px', borderRadius: 4, border:'1px solid #93c5fd', fontSize:'13px'}}><option value="">-- Area --</option>{areas.map(a => <option key={a} value={a}>{a}</option>)}</select>
              <select value={paintTime} onChange={e => {setPaintTime(e.target.value); setIsEraser(false);}} style={{padding: '5px', borderRadius: 4, border:'1px solid #93c5fd', fontSize:'13px'}}><option value="">-- Shift --</option>{shifts.map(s => <option key={s} value={s}>{s}</option>)}</select>
              <button onClick={() => setIsEraser(!isEraser)} style={{background: isEraser ? '#ef4444' : 'white', color: isEraser ? 'white' : '#ef4444', border:'1px solid #ef4444', padding:'4px 10px', borderRadius:4, cursor:'pointer', fontWeight:'bold', fontSize:'12px'}}>{isEraser ? "Eraser ON" : "Eraser"}</button>
          </div>
      )}

      {/* GRID */}
      <div style={{overflowX: 'auto', background:'white', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border:'1px solid #e2e8f0'}}>
          <table style={{width:'100%', borderCollapse:'collapse', fontSize:'13px'}}>
              <thead>
                  <tr style={{background:'#f8fafc', borderBottom:'2px solid #e2e8f0'}}>
                      <th style={{padding: '10px 15px', textAlign:'left', minWidth: 200, position:'sticky', left:0, background:'#f8fafc', zIndex: 10, color:'#475569'}}>Employee</th>
                      {visibleDates.map(d => (<th key={d.toString()} style={{padding: '10px', textAlign:'center', minWidth: 110, borderLeft:'1px solid #e2e8f0', color:'#475569'}}>{formatDateShort(d)}</th>))}
                      <th style={{padding: '10px', minWidth: 60, textAlign:'center', borderLeft:'2px solid #e2e8f0', color:'#475569'}}>Hrs</th>
                  </tr>
              </thead>
              <tbody>
                  {filteredEmployees.map(emp => {
                      let totalHrs = 0;
                      let hasAnyShift = false;
                      const hasDefault = emp.defaultSchedule && Object.keys(emp.defaultSchedule).length > 0;
                      
                      const rowCells = visibleDates.map(d => {
                          const dateStr = toLocalISO(d);
                          const cell = getCellData(dateStr, emp);
                          if(cell.time || cell.area) hasAnyShift = true;
                          if(cell.time) totalHrs += getNetHours(cell.time);
                          return { dateStr, cell };
                      });

                      return (
                          <tr key={emp.id} className={hasAnyShift ? "" : "no-shift-row"} style={{borderBottom:'1px solid #f1f5f9'}}>
                              <td style={{padding: '10px 15px', background:'white', position:'sticky', left:0, zIndex: 5, borderRight:'1px solid #f1f5f9'}}>
                                  <div style={{fontWeight:'bold', color:'#1e293b'}}>{emp.lastName}, {emp.firstName}</div>
                                  <div style={{fontSize:'11px', color:'#64748b', display:'flex', gap: 6, alignItems:'center'}}>{emp.department && <span>{emp.department}</span>}<span style={{background: emp.type === 'Hourly' ? '#f0fdf4' : '#eff6ff', color: emp.type === 'Hourly' ? '#166534' : '#1e40af', padding: '0 4px', borderRadius: 3, fontSize: '9px', fontWeight:'bold', border: emp.type === 'Hourly' ? '1px solid #bbf7d0' : '1px solid #bfdbfe'}}>{emp.type === 'Hourly' ? 'H' : 'S'}</span></div>
                                  {hasDefault && <div style={{fontSize:'9px', color:'#2563eb', marginTop: 2, fontWeight:'bold'}}>↻ Recurring</div>}
                              </td>
                              {rowCells.map(({dateStr, cell}) => {
                                  const isOverride = schedule[dateStr]?.[emp.id];
                                  const hasOverrideData = isOverride && (isOverride.area || isOverride.time);
                                  const isDefault = !isOverride && cell.time;
                                  
                                  // NEW: Calculate dynamic color with 50% opacity (0.5)
                                  // Pass the cell area to the color function
                                  const ruleColor = getShiftColor(cell.time, cell.area);
                                  const bgColor = ruleColor ? hexToRgba(ruleColor, 0.5) : (hasOverrideData ? '#eff6ff' : (isDefault ? '#f8fafc' : 'white'));
                                  
                                  return (
                                      <td 
                                        key={dateStr} 
                                        onMouseDown={() => onMouseDown(dateStr, emp.id)}
                                        onMouseEnter={() => onMouseEnter(dateStr, emp.id)}
                                        style={{padding: 0, height: 50, borderLeft:'1px solid #f1f5f9', textAlign:'center', verticalAlign:'middle', cursor: canEdit ? 'cell' : 'default', background: bgColor, userSelect: 'none'}}
                                      >
                                          {cell.area || cell.time ? (<div style={{fontSize:'12px', display:'flex', flexDirection:'column', gap: 2, pointerEvents:'none'}}>{cell.area && <div style={{fontWeight:'600', color:'#0f172a'}}>{cell.area}</div>}{cell.time && <div style={{color:'#64748b', fontSize:'11px'}}>{cell.time}</div>}</div>) : <span style={{color:'#e2e8f0'}}>-</span>}
                                      </td>
                                  );
                              })}
                              <td style={{textAlign:'center', borderLeft:'2px solid #f1f5f9'}}><span style={{fontWeight:'bold', color: isNaN(totalHrs) ? '#94a3b8' : (totalHrs > 40 ? '#b91c1c' : '#15803d'), background: totalHrs > 40 ? '#fef2f2' : 'transparent', padding: totalHrs > 40 ? '2px 6px' : 0, borderRadius: 4}}>{isNaN(totalHrs) ? '0' : totalHrs.toFixed(1)}</span></td>
                          </tr>
                      )
                  })}
                  {canSeeMoney && (<tr className="no-print" style={{background:'#f0fdf4', borderTop:'2px solid #bbf7d0'}}><td style={{padding: '10px 15px', fontWeight:'bold', color:'#166534', textAlign:'right', position:'sticky', left:0, background:'#f0fdf4'}}>Daily Cost</td>{visibleDates.map(d => {const cost = calculateDailyCost(toLocalISO(d)); return <td key={d} style={{textAlign:'center', fontSize:'12px', fontWeight:'bold', color:'#14532d', borderLeft:'1px solid #dcfce7'}}>${cost.toFixed(2)}</td>})}<td></td></tr>)}
              </tbody>
          </table>
      </div>
      
      {/* ... [Rest of the existing code for MODALS] ... */}
      
      {/* CLICK EDIT MODAL */}
      {editingCell && (
          <div className="modal-overlay" onClick={(e) => { if(e.target.className === 'modal-overlay') setEditingCell(null) }}>
              <div className="modal" style={{maxWidth:'300px'}}>
                  <h4 style={{marginTop:0, marginBottom: 5}}>{editingCell.name}</h4>
                  <div style={{fontSize:'12px', color:'#64748b', marginBottom: 15}}>{editingCell.dateStr}</div>
                  <label style={{display:'block', fontSize:'12px', marginBottom: 5}}>Area</label>
                  <select value={editingCell.area} onChange={e => setEditingCell({...editingCell, area: e.target.value})} style={{width:'100%', marginBottom: 10, padding: 8}}><option value="">-- None --</option>{areas.map(a => <option key={a} value={a}>{a}</option>)}</select>
                  <label style={{display:'block', fontSize:'12px', marginBottom: 5}}>Shift</label>
                  <select value={editingCell.time} onChange={e => setEditingCell({...editingCell, time: e.target.value})} style={{width:'100%', marginBottom: 20, padding: 8}}><option value="">-- None --</option>{shifts.map(s => <option key={s} value={s}>{s}</option>)}</select>
                  <div style={{display:'flex', gap: 10}}>
                      <button onClick={() => setEditingCell(null)} style={{flex:1, padding: 8}}>Cancel</button>
                      <button onClick={handleModalSave} className="primary" style={{flex:1, padding: 8}}>Save</button>
                  </div>
                  <button onClick={handleModalDelete} style={{width:'100%', marginTop: 10, border:'none', background:'transparent', color:'red', cursor:'pointer', fontSize:'12px'}}>Clear / Delete Shift</button>
              </div>
          </div>
      )}

      {/* QUICK ASSIGN MODAL */}
      {isQuickOpen && (
          <div className="modal-overlay" onClick={(e) => { if(e.target.className === 'modal-overlay') setIsQuickOpen(false) }}>
              <div className="modal" style={{maxWidth:'500px'}}>
                  <h3 style={{marginTop:0}}>⚡ Quick Schedule</h3>
                  <select style={{width:'100%', marginBottom: 15, padding: 10}} value={quickForm.targetIds === 'ALL' ? 'ALL' : (quickForm.targetIds.length === 1 ? quickForm.targetIds[0] : '')} onChange={(e) => { const val = e.target.value; if (val === 'ALL') setQuickForm({...quickForm, targetIds: 'ALL'}); else setQuickForm({...quickForm, targetIds: [val]}); }}>
                      <option value="">-- Select One --</option>
                      <option value="ALL">All Visible Employees ({filteredEmployees.length})</option>
                      {filteredEmployees.map(e => <option key={e.id} value={e.id}>{e.lastName}, {e.firstName}</option>)}
                  </select>
                  <div style={{display:'flex', gap: 10, marginBottom: 15}}>
                      <label style={{flex:1, cursor:'pointer', border: quickForm.mode === 'range' ? '2px solid #2563eb' : '1px solid #e2e8f0', padding: 10, borderRadius: 6, background: quickForm.mode === 'range' ? '#eff6ff' : 'white'}}><input type="radio" name="mode" value="range" checked={quickForm.mode === 'range'} onChange={() => setQuickForm({...quickForm, mode: 'range'})} style={{marginRight: 5}} /> Range</label>
                      <label style={{flex:1, cursor:'pointer', border: quickForm.mode === 'indefinite' ? '2px solid #2563eb' : '1px solid #e2e8f0', padding: 10, borderRadius: 6, background: quickForm.mode === 'indefinite' ? '#eff6ff' : 'white'}}><input type="radio" name="mode" value="indefinite" checked={quickForm.mode === 'indefinite'} onChange={() => setQuickForm({...quickForm, mode: 'indefinite'})} style={{marginRight: 5}} /> Recurring</label>
                  </div>
                  {quickForm.mode === 'range' ? (
                      <div style={{display:'flex', gap: 15, marginBottom: 15}}>
                          <div style={{flex:1}}><label style={{display:'block', fontSize:'12px', marginBottom: 5}}>From</label><input type="date" value={quickForm.startDate} onChange={e => setQuickForm({...quickForm, startDate: e.target.value})} style={{width:'100%', padding: 10}} /></div>
                          <div style={{flex:1}}><label style={{display:'block', fontSize:'12px', marginBottom: 5}}>To</label><input type="date" value={quickForm.endDate} onChange={e => setQuickForm({...quickForm, endDate: e.target.value})} style={{width:'100%', padding: 10}} /></div>
                      </div>
                  ) : (
                      <div style={{marginBottom: 20}}>
                          <label style={{display:'block', fontSize:'12px', marginBottom: 8}}>Recurring Days</label>
                          <div style={{display:'flex', gap: 5, flexWrap:'wrap'}}>
                              {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(day => (
                                  <label key={day} style={{display:'flex', alignItems:'center', background: recurDays[day] ? '#2563eb' : '#f1f5f9', color: recurDays[day] ? 'white' : '#64748b', padding:'5px 10px', borderRadius:20, fontSize:'12px', cursor:'pointer', border: '1px solid #e2e8f0'}}>
                                      <input type="checkbox" checked={recurDays[day]} onChange={() => setRecurDays({...recurDays, [day]: !recurDays[day]})} style={{display:'none'}} /> {day.substring(0,3)}
                                  </label>
                              ))}
                          </div>
                      </div>
                  )}
                  <div style={{display:'flex', gap: 15, marginBottom: 25}}>
                      <div style={{flex:1}}><label style={{display:'block', fontSize:'12px', marginBottom: 5}}>Area</label><select value={quickForm.area} onChange={e => setQuickForm({...quickForm, area: e.target.value})} style={{width:'100%', padding: 10}}><option value="">-- No Change --</option><option value="CLEAR" style={{color:'red'}}>Clear</option>{areas.map(a => <option key={a} value={a}>{a}</option>)}</select></div>
                      <div style={{flex:1}}><label style={{display:'block', fontSize:'12px', marginBottom: 5}}>Shift</label><select value={quickForm.time} onChange={e => setQuickForm({...quickForm, time: e.target.value})} style={{width:'100%', padding: 10}}><option value="">-- No Change --</option><option value="CLEAR" style={{color:'red'}}>Clear</option>{shifts.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                  </div>
                  <div style={{display:'flex', gap: 10}}>
                      <button onClick={() => setIsQuickOpen(false)} style={{flex:1, padding: 12}}>Cancel</button>
                      <button onClick={handleQuickAssign} className="primary" style={{flex:1, padding: 12}}>{quickForm.mode === 'indefinite' ? "Set Defaults" : "Apply"}</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}