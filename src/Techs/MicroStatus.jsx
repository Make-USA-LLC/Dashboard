import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, query, orderBy, collectionGroup, limit, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase_config";

export default function MicroStatus() {
  const [lines, setLines] = useState([]);
  const [urgentList, setUrgentList] = useState([]);
  const [globalLogs, setGlobalLogs] = useState([]);
  
  // CONFIG STATE
  const [defaultInterval, setDefaultInterval] = useState(90); // Fallback
  const [showSettings, setShowSettings] = useState(false);
  const [newDefault, setNewDefault] = useState(90);

  useEffect(() => {
    // 0. Fetch Global Config (Techs)
    const unsubConfig = onSnapshot(doc(db, "config", "techs"), (docSnap) => {
        if (docSnap.exists()) {
            setDefaultInterval(docSnap.data().defaultMicroInterval || 90);
            setNewDefault(docSnap.data().defaultMicroInterval || 90);
        }
    });

    // 1. Fetch All Lines (Live Status)
    const q = query(collection(db, "lines"), orderBy("name"));
    const unsubLines = onSnapshot(q, (snapshot) => {
       // We need to process lines inside this callback, but we need the LATEST defaultInterval.
       // To ensure reactivity, we'll store the raw docs and process in a separate effect or use a ref.
       // For simplicity, we will trigger a re-calc when lines or defaultInterval changes.
       // However, since onSnapshot is async, we'll just parse the data here and let the React Render handle the logic 
       // by passing the raw data to state, OR (simpler) just assume the interval is passed in the line object 
       // and fallback to a variable we have access to. 
       
       // actually, let's map it here but we need access to 'defaultInterval'. 
       // The cleaner React way is to store rawLines and process in a generic useEffect.
       const raw = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
       setRawLines(raw);
    });

    // 2. Fetch Global History Reports
    const qLogs = query(collectionGroup(db, "logs"), orderBy("date", "desc"), limit(100));
    const unsubLogs = onSnapshot(qLogs, (snap) => {
        const list = [];
        snap.forEach(d => {
            const data = d.data();
            if (data.type === 'micro') {
                list.push({ id: d.id, ...data });
            }
        });
        setGlobalLogs(list);
    });

    return () => { unsubConfig(); unsubLines(); unsubLogs(); };
  }, []);

  const [rawLines, setRawLines] = useState([]);

  // PROCESS DATA WHENEVER LINES OR DEFAULT INTERVAL CHANGES
  useEffect(() => {
    const processed = rawLines.map(line => {
        let status = "Unknown";
        let daysUntilDue = null;
        let dueDate = null;
        
        // USE GLOBAL DEFAULT IF MACHINE HAS NO SPECIFIC INTERVAL
        const interval = line.microInterval ? parseInt(line.microInterval) : defaultInterval;

        if (line.lastMicroTestDate) {
          const lastDate = new Date(line.lastMicroTestDate);
          dueDate = new Date(lastDate);
          dueDate.setDate(lastDate.getDate() + interval);
          
          const now = new Date();
          const diffTime = dueDate - now;
          daysUntilDue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (daysUntilDue < 0) status = "Overdue";
          else if (daysUntilDue <= 14) status = "Due Soon";
          else status = "OK";
        } else {
            status = "Never Tested";
        }

        return { ...line, status, daysUntilDue, dueDate, usedInterval: interval };
      });

      setLines(processed);

      // Filter Urgent
      const urgent = processed.filter(l => l.status === "Overdue" || l.status === "Due Soon" || l.status === "Never Tested");
      setUrgentList(urgent);

  }, [rawLines, defaultInterval]);

  const saveSettings = async () => {
      try {
          await setDoc(doc(db, "config", "techs"), { defaultMicroInterval: parseInt(newDefault) }, { merge: true });
          setShowSettings(false);
      } catch (e) {
          alert("Error saving settings: " + e.message);
      }
  };

  const getStatusColor = (s) => {
    if (s === "Overdue") return "#ef4444"; // Red
    if (s === "Due Soon") return "#f59e0b"; // Orange
    if (s === "Never Tested") return "#64748b"; // Grey
    return "#16a34a"; // Green
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString() : "-";

  const handleExport = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Date,Machine,User,Type,Result,Notes\n";
    
    globalLogs.forEach(row => {
        const dateStr = row.date ? new Date(row.date).toLocaleDateString() : "";
        const cleanNotes = (row.notes || "").replace(/,/g, " ");
        const rowStr = `${dateStr},${row.lineName || ""},${row.user || ""},SWAB,${row.result || "Pending"},${cleanNotes}`;
        csvContent += rowStr + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "swab_reports.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="page">
      <div className="header-flex">
        <div>
             <Link to="/techs" className="back-link">← Back to Dashboard</Link>
             <h1>Micro & Usage Status</h1>
        </div>
        <button onClick={() => setShowSettings(true)} style={{background:'none', border:'1px solid #cbd5e1', borderRadius:4, padding:'5px 10px', cursor:'pointer', fontSize:'1.2rem'}} title="Settings">
            ⚙️
        </button>
      </div>

      {/* URGENT NOTICE */}
      <div className="card" style={{borderLeft: '5px solid #ef4444', marginBottom: 24, background:'#fff1f2'}}>
        <h3 style={{color:'#991b1b'}}>⚠️ Notice: Upcoming Swabs (Due within 2 Weeks)</h3>
        {urgentList.length === 0 ? (
           <p style={{color:'#16a34a', fontWeight:'bold'}}>All machines are up to date! ✅</p>
        ) : (
           <table style={{width:'100%', borderCollapse:'collapse', marginTop: 15, background:'white', borderRadius:4}}>
             <thead>
               <tr style={{textAlign:'left', color:'#64748b', fontSize:'0.9rem'}}>
                 <th style={{padding:8}}>Machine</th>
                 <th style={{padding:8}}>Last Swab</th>
                 <th style={{padding:8}}>Due Date</th>
                 <th style={{padding:8}}>Status</th>
                 <th style={{padding:8}}>Action</th>
               </tr>
             </thead>
             <tbody>
               {urgentList.map(l => (
                 <tr key={l.id} style={{borderBottom:'1px solid #e2e8f0'}}>
                   <td style={{padding: 8, fontWeight:'bold'}}>{l.name}</td>
                   <td style={{padding: 8}}>{fmtDate(l.lastMicroTestDate)}</td>
                   <td style={{padding: 8, color:'#ef4444', fontWeight:'bold'}}>{fmtDate(l.dueDate)}</td>
                   <td style={{padding: 8}}>
                     <span style={{
                       background: getStatusColor(l.status), color: 'white', 
                       padding: '3px 8px', borderRadius: 4, fontSize: '0.8rem', fontWeight:'bold'
                     }}>
                       {l.status}
                     </span>
                   </td>
                   <td style={{padding: 8}}>
                     <Link to={`/techs/line/${l.id}`} style={{color:'#2563eb', textDecoration:'none', fontWeight:'bold'}}>Update</Link>
                   </td>
                 </tr>
               ))}
             </tbody>
           </table>
        )}
      </div>

      {/* ALL MACHINES SUMMARY */}
      <div className="card" style={{marginBottom: 24}}>
        <h3>Current Status (All Machines)</h3>
        <p style={{fontSize:'0.8rem', color:'#64748b'}}>Default Frequency: <strong>{defaultInterval} Days</strong></p>
        <table style={{width:'100%', borderCollapse:'collapse', marginTop: 15}}>
             <thead>
               <tr style={{textAlign:'left', color:'#64748b', borderBottom:'2px solid #e2e8f0'}}>
                 <th style={{padding: 10}}>Machine</th>
                 <th style={{padding: 10}}>Last Usage</th>
                 <th style={{padding: 10}}>Last Swab</th>
                 <th style={{padding: 10}}>Next Due</th>
                 <th style={{padding: 10}}>Freq</th>
                 <th style={{padding: 10}}>Status</th>
               </tr>
             </thead>
             <tbody>
               {lines.map(l => (
                 <tr key={l.id} style={{borderBottom:'1px solid #f1f5f9'}}>
                   <td style={{padding: 10}}>
                     <Link to={`/techs/line/${l.id}`} style={{color:'#1e293b', fontWeight:'bold', textDecoration:'none'}}>
                       {l.name}
                     </Link>
                   </td>
                   <td style={{padding: 10}}>{fmtDate(l.lastUsageDate)}</td>
                   <td style={{padding: 10}}>{fmtDate(l.lastMicroTestDate)}</td>
                   <td style={{padding: 10}}>{l.dueDate ? fmtDate(l.dueDate) : '-'}</td>
                   <td style={{padding: 10, fontSize:'0.8rem', color:'#64748b'}}>
                       {l.usedInterval}d
                       {l.microInterval && <span title="Custom Override">*</span>}
                   </td>
                   <td style={{padding: 10}}>
                     <span style={{
                       color: getStatusColor(l.status), fontWeight:'bold', fontSize:'0.9rem'
                     }}>
                       {l.status}
                     </span>
                   </td>
                 </tr>
               ))}
             </tbody>
        </table>
      </div>

      {/* HISTORY TABLE */}
      <div className="card">
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <h3>📄 Global Swab Report History</h3>
            <button onClick={handleExport} style={{background:'#2563eb', color:'white', border:'none', padding:'8px 12px', borderRadius:4, cursor:'pointer', fontWeight:'bold'}}>
                Export CSV
            </button>
        </div>
        <p style={{fontSize:'0.85rem', color:'#64748b', marginBottom:15}}>Showing the last 100 reports across all machines.</p>
        
        <table style={{width:'100%', borderCollapse:'collapse'}}>
            <thead>
                <tr style={{textAlign:'left', color:'#64748b', background:'#f8fafc'}}>
                    <th style={{padding:10}}>Report Date</th>
                    <th style={{padding:10}}>Machine</th>
                    <th style={{padding:10}}>User</th>
                    <th style={{padding:10}}>Result</th>
                    <th style={{padding:10}}>Notes</th>
                </tr>
            </thead>
            <tbody>
                {globalLogs.length === 0 ? (
                    <tr><td colSpan="5" style={{padding:20, textAlign:'center', fontStyle:'italic', color:'#cbd5e1'}}>No reports found.</td></tr>
                ) : (
                    globalLogs.map(log => {
                        let badgeBg = '#dcfce7'; // Green
                        let badgeColor = '#166534';
                        let displayResult = log.result || "Pass";

                        if (log.result === 'Fail') {
                            badgeBg = '#fee2e2'; badgeColor = '#b91c1c';
                        } else if (log.result === 'Pending') {
                            badgeBg = '#fef9c3'; badgeColor = '#a16207';
                        }

                        return (
                            <tr key={log.id} style={{borderBottom:'1px solid #f1f5f9'}}>
                                <td style={{padding:10}}>{fmtDate(log.date)}</td>
                                <td style={{padding:10, fontWeight:'bold'}}>{log.lineName || "Unknown Machine"}</td>
                                <td style={{padding:10}}>{log.user}</td>
                                <td style={{padding:10}}>
                                    <span style={{
                                        background: badgeBg,
                                        color: badgeColor,
                                        padding:'2px 8px', borderRadius:4, fontSize:'0.75rem', fontWeight:'bold'
                                    }}>
                                        {displayResult}
                                    </span>
                                </td>
                                <td style={{padding:10, fontSize:'0.85rem', color:'#64748b'}}>{log.notes}</td>
                            </tr>
                        );
                    })
                )}
            </tbody>
        </table>
      </div>

      {/* SETTINGS MODAL */}
      {showSettings && (
          <div className="modal-overlay">
              <div className="modal-box">
                  <button className="close-modal" onClick={() => setShowSettings(false)}>×</button>
                  <h2>Global Settings</h2>
                  <div className="form-row">
                      <label>Default Swab Frequency (Days)</label>
                      <input 
                        type="number" 
                        value={newDefault} 
                        onChange={e => setNewDefault(e.target.value)} 
                        style={{width:'100%', padding:8, marginTop:5}}
                      />
                  </div>
                  <p style={{fontSize:'0.8rem', color:'#64748b', marginTop:10}}>
                      This applies to all machines that do not have a specific custom frequency set.
                  </p>
                  <button onClick={saveSettings} className="save-btn" style={{marginTop:20}}>Save Global Default</button>
              </div>
          </div>
      )}

    </div>
  );
}