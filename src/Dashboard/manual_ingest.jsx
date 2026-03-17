import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './manual_ingest.css';
import Loader from '../components/loader';
import { db } from './firebase_config.jsx';
import { collection, addDoc, getDocs } from 'firebase/firestore';
import { useRole } from './hooks/useRole'; // <-- Imported centralized hook

const ManualIngest = () => {
    const navigate = useNavigate();
    
    // --- 1. USE THE HOOK ---
    const { user, hasPerm, isReadOnly, loading: roleLoading } = useRole();
    const canView = hasPerm('manual_ingest', 'view') || hasPerm('admin', 'view') || isReadOnly;
    const canEdit = (hasPerm('manual_ingest', 'edit') || hasPerm('admin', 'edit')) && !isReadOnly;

    const [pageLoading, setPageLoading] = useState(true);
    const [rawText, setRawText] = useState('');
    const [parsedData, setParsedData] = useState(null);
    const [status, setStatus] = useState({ type: '', msg: '' });
    const [workersMap, setWorkersMap] = useState({});
    
    // Interactive State for Preview
    const [selectedLeader, setSelectedLeader] = useState('');

    // --- 2. STREAMLINED INITIALIZATION ---
    useEffect(() => {
        if (roleLoading) return;

        if (!user || !canView) {
            navigate('/dashboard');
            return;
        }

        const initialize = async () => {
            await fetchWorkers();
            setPageLoading(false);
        };
        initialize();
    }, [user, canView, roleLoading, navigate]);

    const fetchWorkers = async () => {
        try {
            const snap = await getDocs(collection(db, "workers"));
            const map = {};
            snap.forEach(d => {
                const w = d.data();
                const name = w.name || `${w.firstName} ${w.lastName}`;
                if(w.workerId) map[w.workerId] = name; 
                map[name] = name; 
            });
            setWorkersMap(map);
        } catch(e) { console.error("Worker fetch error", e); }
    };

    // --- PARSING LOGIC ---
    const parseReportText = (input) => {
        let text = input.replace(/\u00A0/g, ' '); 

        const extract = (key) => {
            const regex = new RegExp(`${key}:\\s*(.*)`, 'i');
            const match = text.match(regex);
            return match ? match[1].trim() : null;
        };

        const timeToSec = (str) => {
            if(!str) return 0;
            const parts = str.split(':').map(Number);
            if(parts.length !== 3) return 0;
            return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
        };

        const safeDateParse = (dateStr) => {
            if(!dateStr) return null;
            let clean = dateStr.replace(/ at /i, ' ').trim(); 
            clean = clean.replace(/^\[+|\]+$/g, '');
            let d = new Date(clean);
            return isNaN(d.getTime()) ? null : d;
        };

        const company = extract('Company Name') || "Unknown";
        const project = extract('Project Name') || "Unknown";
        const leaderRaw = extract('Line Leader') || "";
        const category = extract('Category') || "";
        const size = extract('Project Size') || "";
        const originalSeconds = timeToSec(extract('Time Given'));
        const currentSeconds = timeToSec(extract('Time Remaining'));
        const finalSeconds = currentSeconds; 

        const lines = text.split('\n');
        let workerCalculations = {};
        let allScanIds = new Set();
        let historyMatchCount = 0;
        
        const badIds = [(new Date().getFullYear()).toString(), (new Date().getFullYear()+1).toString()];
        const knownNames = Object.keys(workersMap).filter(k => isNaN(k));

        lines.forEach(line => {
            const cleanLine = line.trim();
            if(!cleanLine) return;

            if (cleanLine.includes('Clocked In') || cleanLine.includes('Clocked Out')) {
                const parts = cleanLine.split(']:');
                if (parts.length >= 2) {
                    const timePart = parts[0];
                    const dataPart = parts[1];
                    const dataSplit = dataPart.split('-');
                    
                    if (dataSplit.length >= 2) {
                        const workerId = dataSplit[0].trim();
                        const action = dataSplit[1].trim().toLowerCase();
                        const eventTime = safeDateParse(timePart);

                        if (workerId && eventTime && !badIds.includes(workerId)) {
                            historyMatchCount++;
                            if (!workerCalculations[workerId]) {
                                workerCalculations[workerId] = { startTime: null, totalSeconds: 0 };
                            }

                            if (action.includes('clocked in')) {
                                workerCalculations[workerId].startTime = eventTime;
                            } else if (action.includes('clocked out')) {
                                if (workerCalculations[workerId].startTime) {
                                    const diffMs = eventTime - workerCalculations[workerId].startTime;
                                    const diffSec = diffMs / 1000;
                                    if (diffSec > 0 && diffSec < 86400) {
                                        workerCalculations[workerId].totalSeconds += diffSec;
                                    }
                                    workerCalculations[workerId].startTime = null;
                                }
                            }
                            allScanIds.add(workerId);
                        }
                    }
                }
            }
            else if (/^\d{4,15}$/.test(cleanLine)) {
                if (!badIds.includes(cleanLine)) {
                    allScanIds.add(cleanLine);
                }
            } 
            else {
                const matchedName = knownNames.find(name => 
                    name.toLowerCase() === cleanLine.toLowerCase()
                );
                if (matchedName) {
                    allScanIds.add(matchedName);
                }
            }
        });

        const workerLog = Array.from(allScanIds).map(id => {
            const calc = workerCalculations[id];
            const secs = calc ? calc.totalSeconds : 0;
            const mins = secs > 0 ? (secs / 60) : 0;
            const name = workersMap[id] || `Unknown (${id})`; 
            return { cardId: id, name, minutes: mins };
        });

        const genDateStr = extract('Generated');
        let timestamp = safeDateParse(genDateStr) || new Date();

        return {
            company, project, leader: leaderRaw, category, size,
            originalSeconds, finalSeconds,
            workerCountAtFinish: workerLog.length,
            workerLog,
            completedAt: timestamp,
            financeStatus: "pending_production",
            totalScans: parseInt(extract('Total Scans')) || 0,
            importedVia: 'manual_text_ingest',
            _debugHistoryCount: historyMatchCount
        };
    };

    const handlePreview = () => {
        setStatus({ type: '', msg: '' });
        try {
            const result = parseReportText(rawText);
            setParsedData(result);
            
            const raw = (result.leader || '').toLowerCase();
            const allNames = Object.values(workersMap).sort();
            const match = allNames.find(n => n.toLowerCase().includes(raw) && raw.length > 2);
            setSelectedLeader(match || result.leader); 
        } catch (e) {
            console.error(e);
            setStatus({ type: 'error', msg: "Error Parsing: " + e.message });
            setParsedData(null);
        }
    };

    const handleSubmit = async () => {
        if (!canEdit) return alert("Read-Only Access: Cannot import data.");
        if(!parsedData) return;
        
        const finalData = { ...parsedData, leader: selectedLeader };
        delete finalData._debugHistoryCount; 

        try {
            await addDoc(collection(db, "reports"), finalData);
            setStatus({ type: 'success', msg: "Success! Report imported. Check 'Production Input'." });
            setParsedData(null);
            setRawText('');
        } catch (e) {
            setStatus({ type: 'error', msg: "Firestore Error: " + e.message });
        }
    };

    if (roleLoading || pageLoading) return <div style={{height: '100vh', display: 'flex', alignItems: 'center', background: '#f8fafc'}}><Loader message="Loading..." /></div>;
    if (!canView) return null;

    return (
        <div className="manual-ingest-wrapper">
            <div className="mi-top-bar">
                <button onClick={() => navigate('/dashboard')} style={{background:'none', border:'none', fontSize:'16px', fontWeight:'bold', cursor:'pointer', color:'#2c3e50'}}>&larr; Dashboard</button>
                <div style={{fontWeight:'bold'}}>Raw Data Ingest</div>
                
            </div>

            <div className="manual-ingest-container">
                <div className="mi-card">
                    <h2 style={{marginTop:0}}>Paste Project Report</h2>
                    <p style={{color:'#7f8c8d', fontSize:'14px'}}>Paste the full text from the "Project Finished Report" below.</p>
                    
                    <textarea 
                        className="mi-textarea" 
                        placeholder="Paste report text here..." 
                        value={rawText}
                        onChange={(e) => setRawText(e.target.value)}
                    ></textarea>

                    <button className="btn btn-blue" onClick={handlePreview}>Preview Data</button>

                    {status.msg && (
                        <div className={`status-msg ${status.type === 'error' ? 'status-error' : 'status-success'}`}>
                            {status.msg}
                        </div>
                    )}

                    {parsedData && (
                        <div className="preview-box">
                            <h4 style={{marginTop:0}}>Parsed Data Preview</h4>
                            
                            <div className="preview-row"><span className="preview-label">Company:</span> <span>{parsedData.company}</span></div>
                            <div className="preview-row"><span className="preview-label">Project:</span> <span>{parsedData.project}</span></div>
                            
                            <div className="preview-row">
                                <span className="preview-label" style={{color:'#3498db'}}>Line Leader:</span> 
                                <select 
                                    className="mi-select" 
                                    value={selectedLeader} 
                                    onChange={(e) => setSelectedLeader(e.target.value)}
                                    disabled={!canEdit}
                                >
                                    <option value={parsedData.leader}>{parsedData.leader} (Raw)</option>
                                    {Object.values(workersMap).sort().map((name, i) => (
                                        <option key={i} value={name}>{name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="preview-row"><span className="preview-label">Labor Hours:</span> <span>{((parsedData.originalSeconds - parsedData.finalSeconds)/3600).toFixed(2)} hrs</span></div>
                            <div className="preview-row"><span className="preview-label">Workers Found:</span> <span>{parsedData.workerLog.length}</span></div>

                            <div className="worker-list-box">
                                <div className="preview-label" style={{marginBottom:'5px', borderBottom:'1px solid #eee'}}>Calculated Worker Times:</div>
                                {parsedData.workerLog.sort((a,b) => b.minutes - a.minutes).map((w, i) => (
                                    <div key={i} className="worker-time-row" style={{color: w.minutes===0 ? '#e74c3c' : 'inherit'}}>
                                        <span>{w.name}</span>
                                        <span>{w.minutes===0 && '(0 min) '} <b>{w.minutes.toFixed(2)} mins</b></span>
                                    </div>
                                ))}
                            </div>

                            <div className="debug-info">
                                Debug: Found {parsedData._debugHistoryCount} history events.
                            </div>

                            {canEdit ? (
                                <button className="btn btn-green" onClick={handleSubmit}>Confirm & Import</button>
                            ) : (
                                <div style={{ color: '#999', fontStyle: 'italic', marginTop: '10px' }}>Read-Only Mode: Cannot Import</div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ManualIngest;