import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './FinanceSetup.css';
import { db } from './firebase_config.jsx';
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import Loader from '../components/loader'; 
import { useRole } from './hooks/useRole'; // <-- Imported centralized hook

const FinanceSetup = () => {
    const navigate = useNavigate();
    
    // --- 1. USE THE HOOK ---
    const { user, hasPerm, isReadOnly, loading: roleLoading } = useRole();
    const canView = hasPerm('finance', 'view');
    const canEdit = hasPerm('finance', 'edit') && !isReadOnly;

    const [pageLoading, setPageLoading] = useState(true);
    
    // Data State
    const [configData, setConfigData] = useState({
        costPerHour: 0,
        leaderPoolPercent: 0,
        workerPoolPercent: 0,
        leaderPoolPercent_3: 0,
        workerPoolPercent_3: 0,
        leaderPoolPercent_2: 0,
        workerPoolPercent_2: 0,
        workerPoolPercent_1: 0, 
        agents: [],
        projectTypes: [],
        companyMap: {} 
    });

    // Local inputs
    const [newAgentName, setNewAgentName] = useState('');
    const [newAgentComm, setNewAgentComm] = useState('');
    const [newType, setNewType] = useState('');

    // Auto-Assign inputs
    const [availableCompanies, setAvailableCompanies] = useState([]);
    const [assignCompany, setAssignCompany] = useState('');
    const [assignAgent, setAssignAgent] = useState('');
    const [assignAgent2, setAssignAgent2] = useState(''); 

    // --- 2. STREAMLINED INITIALIZATION ---
    useEffect(() => {
        if (roleLoading) return;

        if (!user || !canView) {
            navigate('/dashboard');
            return;
        }

        const fetchCompanies = async () => {
            try {
                const snap = await getDoc(doc(db, "config", "project_options"));
                if (snap.exists()) {
                    setAvailableCompanies(snap.data().companies || []);
                }
            } catch (e) {
                console.error("Error fetching companies:", e);
            }
        };
        fetchCompanies();

        startListener();
    }, [user, canView, roleLoading, navigate]);

    const startListener = () => {
        const configRef = doc(db, "config", "finance");
        const unsubscribe = onSnapshot(configRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setConfigData({
                    costPerHour: data.costPerHour || 0,
                    leaderPoolPercent: data.leaderPoolPercent || 0,
                    workerPoolPercent: data.workerPoolPercent || 0,
                    leaderPoolPercent_3: data.leaderPoolPercent_3 || 0,
                    workerPoolPercent_3: data.workerPoolPercent_3 || 0,
                    leaderPoolPercent_2: data.leaderPoolPercent_2 || 0,
                    workerPoolPercent_2: data.workerPoolPercent_2 || 0,
                    workerPoolPercent_1: data.workerPoolPercent_1 || 0,
                    agents: data.agents || [],
                    projectTypes: data.projectTypes || [],
                    companyMap: data.companyMap || {}
                });
            } else {
                if (canEdit) {
                    setDoc(configRef, { 
                        costPerHour: 0, 
                        leaderPoolPercent: 0, workerPoolPercent: 0,
                        leaderPoolPercent_3: 0, workerPoolPercent_3: 0,
                        leaderPoolPercent_2: 0, workerPoolPercent_2: 0,
                        workerPoolPercent_1: 0,
                        agents: [], projectTypes: [], companyMap: {}
                    });
                }
            }
            setPageLoading(false);
        });

        return () => unsubscribe();
    };

    // --- 3. PROTECTED HANDLERS ---
    const handleSaveConstants = async () => {
        if (!canEdit) return alert("Read-Only Access");
        try {
            const configRef = doc(db, "config", "finance");
            await updateDoc(configRef, {
                costPerHour: parseFloat(configData.costPerHour),
                leaderPoolPercent: parseFloat(configData.leaderPoolPercent),
                workerPoolPercent: parseFloat(configData.workerPoolPercent),
                leaderPoolPercent_3: parseFloat(configData.leaderPoolPercent_3),
                workerPoolPercent_3: parseFloat(configData.workerPoolPercent_3),
                leaderPoolPercent_2: parseFloat(configData.leaderPoolPercent_2),
                workerPoolPercent_2: parseFloat(configData.workerPoolPercent_2),
                workerPoolPercent_1: parseFloat(configData.workerPoolPercent_1),
            });
            alert("Configuration Saved");
        } catch(e) { alert("Error saving: " + e.message); }
    };

    const handleAddAgent = async () => {
        if (!canEdit || !newAgentName) return;
        const configRef = doc(db, "config", "finance");
        const updatedAgents = [...configData.agents, { name: newAgentName, comm: parseFloat(newAgentComm) || 0 }];
        await updateDoc(configRef, { agents: updatedAgents });
        setNewAgentName('');
        setNewAgentComm('');
    };

    const handleDeleteAgent = async (index) => {
        if (!canEdit) return alert("Read-Only Access");
        const configRef = doc(db, "config", "finance");
        const updatedAgents = [...configData.agents];
        updatedAgents.splice(index, 1);
        await updateDoc(configRef, { agents: updatedAgents });
    };

    const handleAddType = async () => {
        if (!canEdit || !newType) return;
        const configRef = doc(db, "config", "finance");
        const updatedTypes = [...configData.projectTypes, newType];
        await updateDoc(configRef, { projectTypes: updatedTypes });
        setNewType('');
    };

    const handleDeleteType = async (index) => {
        if (!canEdit) return alert("Read-Only Access");
        const configRef = doc(db, "config", "finance");
        const updatedTypes = [...configData.projectTypes];
        updatedTypes.splice(index, 1);
        await updateDoc(configRef, { projectTypes: updatedTypes });
    };

    const handleAssignAgent = async () => {
        if (!canEdit) return alert("Read-Only Access");
        if (!assignCompany || !assignAgent) {
            alert("Please select a company and at least a primary agent.");
            return;
        }

        const configRef = doc(db, "config", "finance");
        const assignmentObject = {
            primary: assignAgent,
            secondary: assignAgent2 || ""
        };

        const newMap = { ...configData.companyMap, [assignCompany]: assignmentObject };
        
        try {
            await updateDoc(configRef, { companyMap: newMap });
            setAssignCompany('');
            setAssignAgent('');
            setAssignAgent2('');
        } catch (e) {
            alert("Error saving assignment: " + e.message);
        }
    };

    const handleDeleteAssignment = async (companyName) => {
        if (!canEdit) return alert("Read-Only Access");
        if (!window.confirm(`Remove auto-assignment for ${companyName}?`)) return;

        const configRef = doc(db, "config", "finance");
        const newMap = { ...configData.companyMap };
        delete newMap[companyName];

        try {
            await updateDoc(configRef, { companyMap: newMap });
        } catch (e) {
            alert("Error removing assignment: " + e.message);
        }
    };

    if (roleLoading || pageLoading) return <div style={{height: '100vh', display: 'flex', alignItems: 'center', background: '#f8fafc'}}><Loader message="Loading Setup..." /></div>;
    if (!canView) return null;

    const renderRow = (label, l_field, w_field) => (
        <div className="fs-form-row" style={{borderBottom:'1px solid #eee', paddingBottom:'15px', marginBottom:'15px', alignItems:'center'}}>
            <div style={{width:'150px', fontWeight:'bold', color:'#34495e'}}>{label}</div>
            <div style={{flex:1}}>
                <label className="fs-label" style={{color:'#2980b9'}}>Leader %</label>
                <div className="fs-input-suffix">
                    <input type="number" className="fs-input" step="0.1" 
                        value={configData[l_field]}
                        onChange={(e) => setConfigData({...configData, [l_field]: e.target.value})}
                        disabled={!canEdit}
                    />
                    <span className="fs-suffix-text">%</span>
                </div>
            </div>
            <div style={{flex:1, marginLeft:'15px'}}>
                <label className="fs-label" style={{color:'#27ae60'}}>Pool %</label>
                <div className="fs-input-suffix">
                    <input type="number" className="fs-input" step="0.1" 
                        value={configData[w_field]}
                        onChange={(e) => setConfigData({...configData, [w_field]: e.target.value})}
                        disabled={!canEdit}
                    />
                    <span className="fs-suffix-text">%</span>
                </div>
            </div>
        </div>
    );

    return (
        <div className="fs-wrapper">
            <div className="fs-top-bar">
                <button onClick={() => navigate('/dashboard')} className="btn-back">&larr; Dashboard</button>
                <div style={{fontWeight:'bold'}}>Finance Setup</div>
            </div>

            <div className="fs-container">
                
                {/* GLOBAL COSTS */}
                <div className="fs-card">
                    <h2>Global Costs</h2>
                    <div className="fs-form-row">
                        <div style={{flex:1}}>
                            <label className="fs-label">Cost Per Labor Hour ($)</label>
                            <input 
                                type="number" 
                                className="fs-input" 
                                step="0.01"
                                value={configData.costPerHour}
                                onChange={(e) => setConfigData({...configData, costPerHour: e.target.value})}
                                disabled={!canEdit}
                            />
                        </div>
                    </div>
                </div>

                {/* COMMISSION AGENTS */}
                <div className="fs-card">
                    <h2>Commission Agents</h2>
                    {canEdit && (
                        <div className="fs-form-row">
                            <div style={{flex:2}}>
                                <label className="fs-label">Company/Agent Name</label>
                                <input className="fs-input" value={newAgentName} onChange={e => setNewAgentName(e.target.value)} />
                            </div>
                            <div style={{flex:1}}>
                                <label className="fs-label">Default Comm %</label>
                                <input className="fs-input" type="number" value={newAgentComm} onChange={e => setNewAgentComm(e.target.value)} />
                            </div>
                            <button className="btn btn-green" onClick={handleAddAgent}>Add</button>
                        </div>
                    )}
                    <ul className="fs-list">
                        {configData.agents.map((a, i) => (
                            <li key={i}>
                                <span><b>{a.name}</b> ({a.comm}%)</span>
                                {canEdit && <button className="btn-red-small" onClick={() => handleDeleteAgent(i)}>Del</button>}
                            </li>
                        ))}
                    </ul>
                </div>

                {/* AUTO ASSIGN */}
                <div className="fs-card">
                    <h2>Auto-Assign Agents</h2>
                    <p style={{fontSize:'13px', color:'#7f8c8d'}}>
                        Automatically select agents for new projects based on company.
                    </p>
                    
                    {canEdit && (
                        <div className="fs-form-row" style={{alignItems:'flex-end', background:'#f9f9f9', padding:'10px', borderRadius:'5px'}}>
                            <div style={{flex:1.5}}>
                                <label className="fs-label">Select Company</label>
                                <select 
                                    className="fs-input" 
                                    value={assignCompany} 
                                    onChange={(e) => setAssignCompany(e.target.value)}
                                >
                                    <option value="">- Choose Company -</option>
                                    {availableCompanies.map((c, i) => (
                                        <option key={i} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={{flex:1, marginLeft:'10px'}}>
                                <label className="fs-label">Primary Agent</label>
                                <select 
                                    className="fs-input" 
                                    value={assignAgent} 
                                    onChange={(e) => setAssignAgent(e.target.value)}
                                >
                                    <option value="">- None -</option>
                                    {configData.agents.map((a, i) => (
                                        <option key={i} value={a.name}>{a.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={{flex:1, marginLeft:'10px'}}>
                                <label className="fs-label">Secondary (Opt)</label>
                                <select 
                                    className="fs-input" 
                                    value={assignAgent2} 
                                    onChange={(e) => setAssignAgent2(e.target.value)}
                                >
                                    <option value="">- None -</option>
                                    {configData.agents.map((a, i) => (
                                        <option key={i} value={a.name}>{a.name}</option>
                                    ))}
                                </select>
                            </div>
                            <button className="btn btn-green" style={{marginLeft:'10px'}} onClick={handleAssignAgent}>
                                Assign
                            </button>
                        </div>
                    )}

                    <div style={{marginTop:'15px'}}>
                        <ul className="fs-list">
                            {Object.keys(configData.companyMap).length === 0 && <li style={{color:'#999', fontStyle:'italic'}}>No assignments yet.</li>}
                            
                            {Object.entries(configData.companyMap).map(([comp, val], i) => {
                                let primary = "";
                                let secondary = "";
                                if (typeof val === 'object' && val !== null) {
                                    primary = val.primary;
                                    secondary = val.secondary;
                                } else {
                                    primary = val;
                                }

                                return (
                                    <li key={i}>
                                        <span>
                                            <strong>{comp}</strong> &rarr; 
                                            <span style={{color:'#8e44ad'}}> {primary}</span>
                                            {secondary && <span style={{color:'#2980b9'}}> & {secondary}</span>}
                                        </span>
                                        {canEdit && (
                                            <button className="btn-red-small" onClick={() => handleDeleteAssignment(comp)}>Remove</button>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </div>

                {/* BONUS STRUCTURE */}
                <div className="fs-card" style={{borderLeft: '5px solid #3498db'}}>
                    <h2>Bonus Structure</h2>
                    <div className="fs-section-desc">
                        Define percentages of <strong>Net Profit</strong> based on team size.<br/>
                    </div>
                    
                    {renderRow("4+ Employees", "leaderPoolPercent", "workerPoolPercent")}
                    {renderRow("3 Employees", "leaderPoolPercent_3", "workerPoolPercent_3")}
                    {renderRow("2 Employees", "leaderPoolPercent_2", "workerPoolPercent_2")}

                    <div className="fs-form-row" style={{alignItems:'center'}}>
                        <div style={{width:'150px', fontWeight:'bold', color:'#34495e'}}>1 Employee</div>
                        <div style={{flex:1}}>
                            <label className="fs-label" style={{color:'#2c3e50'}}>Total Bonus %</label>
                            <div className="fs-input-suffix">
                                <input type="number" className="fs-input" step="0.1" 
                                    style={{fontSize:'18px', padding:'10px', fontWeight:'bold'}}
                                    value={configData.workerPoolPercent_1}
                                    onChange={(e) => setConfigData({...configData, workerPoolPercent_1: e.target.value})}
                                    disabled={!canEdit}
                                />
                                <span className="fs-suffix-text" style={{fontSize:'18px'}}>%</span>
                            </div>
                        </div>
                    </div>

                    <p style={{fontSize:'12px', color:'#999', marginTop:'15px'}}>* Worker pool is split based on hours worked by default.</p>
                    {canEdit && (
                        <button className="btn btn-green" style={{width:'100%', marginTop:'10px'}} onClick={handleSaveConstants}>
                            Save Configuration
                        </button>
                    )}
                </div>

                {/* PROJECT TYPES */}
                <div className="fs-card">
                    <h2>Project Types</h2>
                    {canEdit && (
                        <div className="fs-form-row">
                            <div style={{flex:1}}>
                                <label className="fs-label">Type Name</label>
                                <input className="fs-input" value={newType} onChange={e => setNewType(e.target.value)} />
                            </div>
                            <button className="btn btn-green" onClick={handleAddType}>Add</button>
                        </div>
                    )}
                    <ul className="fs-list">
                        {configData.projectTypes.map((t, i) => (
                            <li key={i}>
                                <span>{t}</span>
                                {canEdit && <button className="btn-red-small" onClick={() => handleDeleteType(i)}>Del</button>}
                            </li>
                        ))}
                    </ul>
                </div>

            </div>
        </div>
    );
};

export default FinanceSetup;