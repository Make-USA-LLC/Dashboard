import React, { useState, useEffect, useRef } from 'react';
import './Dashboard.css';
import Sortable from 'sortablejs';
import { useNavigate } from 'react-router-dom'; 
import Loader from '../components/Loader';
import { db, newIpadDefaults } from './firebase_config'; 
import { doc, collection, onSnapshot, serverTimestamp, setDoc, deleteDoc } from 'firebase/firestore';
import { useRole } from './hooks/useRole'; // <-- Imported centralized hook

const BASE = "/dashboard";

const getSortScore = (ipad) => {
    const isActive = ipad.secondsRemaining !== 0;
    if (isActive && !ipad.isPaused) return 3; // Running
    if (isActive && ipad.isPaused) return 2;  // Paused
    return 1; // Idle
};

const Dashboard = () => {
  const navigate = useNavigate(); 
  
  // --- 1. USE THE HOOK ---
  const { user, role, isReadOnly, hasPerm, loading: roleLoading } = useRole();
  
  const [liveIpads, setLiveIpads] = useState([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [newIpadId, setNewIpadId] = useState('');
  const [now, setNow] = useState(Date.now()); 
  const [hasCustomLayout, setHasCustomLayout] = useState(false);

  const gridRef = useRef(null);
  const sortableInstance = useRef(null);

  // --- 2. STREAMLINED INITIALIZATION ---
  useEffect(() => {
    if (roleLoading) return;
    if (!user) {
        navigate('/'); 
        return;
    }
    
    const storageKey = `makeusa_layout_${user.email}`;
    const savedOrder = JSON.parse(localStorage.getItem(storageKey));
    if (savedOrder && Array.isArray(savedOrder) && savedOrder.length > 0) {
        setHasCustomLayout(true);
    }
  }, [user, roleLoading, navigate]);

  // --- 3. LIVE DATA LISTENERS ---
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(collection(db, "ipads"), (snapshot) => {
      let ipads = [];
      snapshot.forEach((doc) => {
        ipads.push({ id: doc.id, ...doc.data() });
      });

      const storageKey = `makeusa_layout_${user.email}`;
      const savedOrder = JSON.parse(localStorage.getItem(storageKey));

      if (savedOrder && Array.isArray(savedOrder) && savedOrder.length > 0) {
        ipads.sort((a, b) => {
          const idxA = savedOrder.indexOf(a.id);
          const idxB = savedOrder.indexOf(b.id);
          if (idxA === -1 && idxB === -1) return 0;
          if (idxA === -1) return 1;
          if (idxB === -1) return -1;
          return idxA - idxB;
        });
      } else {
        ipads.sort((a, b) => {
            const scoreDiff = getSortScore(b) - getSortScore(a); 
            if (scoreDiff !== 0) return scoreDiff;
            return a.id.localeCompare(b.id); 
        });
      }
      setLiveIpads(ipads);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (sortableInstance.current) return;

    if (gridRef.current && !roleLoading) {
        sortableInstance.current = new Sortable(gridRef.current, {
            animation: 150,
            forceFallback: true, 
            fallbackClass: 'sortable-fallback',
            ghostClass: 'sortable-ghost',
            dragClass: 'sortable-drag',
            delay: 0, 
            disabled: false,
            onEnd: () => {
                const order = Array.from(gridRef.current.children).map(card => card.getAttribute('data-id'));
                const storageKey = `makeusa_layout_${user?.email}`;
                localStorage.setItem(storageKey, JSON.stringify(order));
                setHasCustomLayout(true);
            }
        });
    }
    
    return () => {
       if (sortableInstance.current) {
           sortableInstance.current.destroy();
           sortableInstance.current = null;
       }
    };
  }, [roleLoading, user]);

  const handleCreateIpad = async () => {
    if (!newIpadId.trim()) return alert("Enter ID");
    const data = { ...newIpadDefaults, lastUpdateTime: serverTimestamp() };
    try {
      await setDoc(doc(db, "ipads", newIpadId.trim()), data);
      navigate(`${BASE}/ipad-control/${newIpadId.trim()}`);
      setNewIpadId('');
    } catch (error) {
      alert("Error creating iPad: " + error.message);
    }
  };

  const handleDeleteIpad = async (id, e) => {
    e.stopPropagation();
    if (window.confirm(`Delete ${id}? This cannot be undone.`)) {
      await deleteDoc(doc(db, "ipads", id));
    }
  };

  const handleResetLayout = () => {
    const storageKey = `makeusa_layout_${user?.email}`;
    localStorage.removeItem(storageKey);
    setHasCustomLayout(false);
    
    setLiveIpads(prev => [...prev].sort((a, b) => {
        const scoreDiff = getSortScore(b) - getSortScore(a);
        if (scoreDiff !== 0) return scoreDiff;
        return a.id.localeCompare(b.id);
    }));
  };

  const renderTimer = (ipad) => {
    let seconds = ipad.secondsRemaining || 0;
    if (!ipad.isPaused && ipad.lastUpdateTime && ipad.activeWorkers?.length > 0) {
        const lastUpdate = ipad.lastUpdateTime.seconds * 1000;
        const elapsedWallSecs = Math.floor((now - lastUpdate) / 1000);
        const burnRate = ipad.activeWorkers.length;
        seconds = seconds - (elapsedWallSecs * burnRate);
    }
    
    const isNeg = seconds < 0;
    const absSec = Math.abs(seconds);
    const h = Math.floor(absSec / 3600);
    const m = Math.floor((absSec % 3600) / 60);
    const s = Math.floor(absSec % 60);
    const fmt = (n) => n.toString().padStart(2, '0');
    return `${isNeg ? '-' : ''}${h}:${fmt(m)}:${fmt(s)}`;
  };

  if (roleLoading) return <div style={{height: '100vh', display: 'flex', alignItems: 'center', background: '#f8fafc'}}><Loader message="Loading Workspace..." /></div>;

  // EXPLICITLY check isReadOnly to guarantee visibility for global admins
  const canViewFinance = hasPerm('finance', 'view') || hasPerm('financial_report', 'view') || hasPerm('bonuses', 'view') || hasPerm('queue', 'edit') || hasPerm('admin', 'edit') || hasPerm('commissions', 'view') || hasPerm('prod_input', 'view') || hasPerm('manual_ingest', 'view') || isReadOnly;
  const canViewQueue = hasPerm('queue', 'view') || hasPerm('search', 'view') || hasPerm('summary', 'view') || isReadOnly;
  const canViewIpads = hasPerm('fleet', 'view') || hasPerm('timer', 'view') || isReadOnly;

  return (
    <div className="dashboard-layout">
      <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`} id="mainSidebar">
        <div className="sidebar-header">
            <div className="logo-text">MAKE USA</div>
            <div style={{fontSize:'12px', color:'#7f8c8d', marginTop:'5px'}}>{user?.email}</div>
            <span className="user-role-badge">{role}</span>
        </div>

        <ul className="nav-list">
            <div className="section-header">Management</div>
            
            {(hasPerm('admin', 'view') || isReadOnly) && (
                <li className="nav-item" onClick={() => navigate(`${BASE}/admin`)}>
                    <div className="nav-item-main"><span className="material-icons">admin_panel_settings</span> Admin Panel</div>
                </li>
            )}
             {(hasPerm('workers', 'view') || isReadOnly) && (
                <li className="nav-item" onClick={() => navigate(`${BASE}/workers`)}>
                    <div className="nav-item-main"><span className="material-icons">people</span> Manage Workers</div>
                </li>
            )}
             {(hasPerm('admin', 'edit') || hasPerm('workers', 'edit') || isReadOnly) && (
                <li className="nav-item" onClick={() => navigate(`${BASE}/staff-management`)}>
                    <div className="nav-item-main"><span className="material-icons" style={{color:'#f39c12'}}>manage_accounts</span> Staff Access</div>
                </li>
            )}
             {(hasPerm('admin', 'edit') || hasPerm('finance', 'edit') || isReadOnly) && (
                <li className="nav-item" onClick={() => navigate(`${BASE}/agent-management`)}>
                    <div className="nav-item-main"><span className="material-icons" style={{color:'#8e44ad'}}>support_agent</span> Agent Management</div>
                </li>
            )}

            {/* FINANCE SECTION */}
            {canViewFinance && (
                <>
                    <div className="section-header">Finance & Reporting</div>
                    
                    {(hasPerm('manual_ingest', 'view') || isReadOnly) && (
                         <li className="nav-item" onClick={() => navigate(`${BASE}/manual-ingest`)}>
                            <div className="nav-item-main"><span className="material-icons" style={{color:'#e74c3c'}}>playlist_add</span> Manual Ingest</div>
                        </li>
                    )}

                    {(hasPerm('prod_input', 'view') || isReadOnly) && (
                         <li className="nav-item" onClick={() => navigate(`${BASE}/production-input`)}>
                            <div className="nav-item-main"><span className="material-icons" style={{color:'#3498db'}}>input</span> Production Input</div>
                        </li>
                    )}

                    {(hasPerm('finance', 'view') || isReadOnly) && (
                        <li className="nav-item" onClick={() => navigate(`${BASE}/finance-input`)}>
                            <div className="nav-item-main">
                                <span className="material-icons" style={{color:'#f1c40f'}}>monetization_on</span> 
                                Finance Input
                            </div>
                        </li>
                    )}

                    {(hasPerm('financial_report', 'view') || isReadOnly) && (
                        <li className="nav-item" onClick={() => navigate(`${BASE}/financial-report`)}>
                            <div className="nav-item-main"><span className="material-icons" style={{color:'#2ecc71'}}>assessment</span> Financial Report</div>
                        </li>
                    )}

                    {(hasPerm('bonuses', 'view') || isReadOnly) && (
                        <>
                            <li className="nav-item" onClick={() => navigate(`${BASE}/bonuses`)}>
                                <div className="nav-item-main"><span className="material-icons" style={{color:'#9b59b6'}}>emoji_events</span> Bonuses</div>
                            </li>
                            <li className="nav-item" onClick={() => navigate(`${BASE}/bonus-reports`)}>
                                <div className="nav-item-main"><span className="material-icons" style={{color:'#e91e63'}}>description</span> Bonus Reports</div>
                            </li>
                        </>
                    )}

                    {(hasPerm('commissions', 'view') || isReadOnly) && (
                        <>
                            <li className="nav-item" onClick={() => navigate(`${BASE}/commisions`)}>
                                <div className="nav-item-main"><span className="material-icons" style={{color:'#8e44ad'}}>pie_chart</span> Commisions</div>
                            </li>
                            <li className="nav-item" onClick={() => navigate(`${BASE}/agent-reports`)}>
                                <div className="nav-item-main"><span className="material-icons" style={{color:'#e91e63'}}>summarize</span> Agent Reports</div>
                            </li>
                        </>
                    )}

                    {(hasPerm('finance', 'edit') || isReadOnly) && (
                        <li className="nav-item" onClick={() => navigate(`${BASE}/finance-setup`)}>
                            <div className="nav-item-main">
                                <span className="material-icons" style={{color:'#3498db'}}>settings</span> 
                                Finance Setup
                            </div>
                        </li>
                    )}
                </>
            )}

            {/* PROJECT ARCHIVE */}
            {(hasPerm('search', 'view') || isReadOnly) && (
                <li className="nav-item" onClick={() => navigate(`${BASE}/project-search`)}>
                    <div className="nav-item-main"><span className="material-icons" style={{color:'#e67e22'}}>history</span> Project Archive</div>
                </li>
            )}

            {/* QUEUE SECTION */}
            {canViewQueue && (
                <>
                    <div className="section-header">Production Planning</div>
                    {(hasPerm('queue', 'view') || isReadOnly) && (
                         <li className="nav-item" onClick={() => navigate(`${BASE}/upcoming-projects`)}>
                            <div className="nav-item-main"><span className="material-icons" style={{color:'#3498db'}}>queue</span> Project Queue</div>
                        </li>
                    )}
                     {(hasPerm('summary', 'view') || isReadOnly) && (
                         <li className="nav-item" onClick={() => navigate(`${BASE}/project-summary`)}>
                            <div className="nav-item-main"><span className="material-icons" style={{color:'#8e44ad'}}>summarize</span> Production Summary</div>
                        </li>
                    )}
                    {(hasPerm('queue', 'edit') || isReadOnly) && (
                            <li className="nav-item" onClick={() => navigate(`${BASE}/project-options`)}>
                            <div className="nav-item-main"><span className="material-icons" style={{color:'#16a085'}}>list_alt</span> Edit Dropdowns</div>
                        </li>
                    )}
                </>
            )}
            
            {/* IPAD SIDEBAR LIST */}
            {canViewIpads && (
                <>
                    <div className="section-header">Production iPads</div>
                    {liveIpads.map(ipad => {
                        const lastHb = ipad.lastUpdateTime?.seconds * 1000 || 0;
                        const isLive = (Date.now() - lastHb < 75000);
                        return (
                            <li key={ipad.id} className="nav-item">
                                <div className="nav-item-main" onClick={() => navigate(`${BASE}/ipad-control/${ipad.id}`)}>
                                    <span className={`status-dot ${isLive ? 'dot-green' : 'dot-gray'}`}></span>
                                    <span style={{fontWeight:500}}>{ipad.id}</span>
                                </div>
                                <div className="action-group">
                                    <span className="material-icons icon-btn" onClick={() => navigate(`${BASE}/ipad-control/${ipad.id}`)}>edit</span>
                                    {hasPerm('fleet', 'edit') && (
                                        <span className="material-icons icon-btn delete" onClick={(e) => handleDeleteIpad(ipad.id, e)}>delete</span>
                                    )}
                                </div>
                            </li>
                        )
                    })}
                </>
            )}
        </ul>

        <div className="sidebar-footer">
            {hasPerm('fleet', 'edit') && (
                <div className="control-stack">
                    <input 
                        type="text" 
                        value={newIpadId}
                        onChange={(e) => setNewIpadId(e.target.value)}
                        className="login-input" 
                        style={{background:'#1a252f', borderColor:'#2c3e50', color:'white'}} 
                        placeholder="New iPad ID" 
                    />
                    <button className="btn-green" onClick={handleCreateIpad}>+ Add iPad</button>
                </div>
            )}
        </div>
      </div>

      <div className="main-content">
        <div className="top-bar">
            <div style={{display:'flex', alignItems:'center'}}>
                <span className="material-icons mobile-toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>menu</span>
                <h1 style={{margin:0, fontSize: '20px', color:'#2c3e50'}}>iPad Dashboard</h1>
            </div>
            {(hasPerm('timer', 'view') || isReadOnly) && hasCustomLayout && (
                <button className="btn-small" onClick={handleResetLayout}>Reset View</button>
            )}
        </div>

        <div className="content-area">
            {liveIpads.length === 0 && (
                <div className="empty-state">
                    <span className="material-icons" style={{fontSize: '60px'}}>device_hub</span>
                    <h1>Production Command</h1>
                    <p>Select an iPad from the menu to view status.</p>
                </div>
            )}

            <div id="ipadGrid" className="ipad-grid" ref={gridRef} style={{display: liveIpads.length > 0 ? 'grid' : 'none'}}>
                {liveIpads.map(ipad => {
                     let seconds = ipad.secondsRemaining || 0;
                     if (!ipad.isPaused && ipad.lastUpdateTime && (ipad.activeWorkers || []).length > 0) {
                        const lastUpdate = ipad.lastUpdateTime.seconds * 1000;
                        const elapsedWallSecs = Math.floor((now - lastUpdate) / 1000);
                        const burnRate = ipad.activeWorkers.length;
                        seconds = seconds - (elapsedWallSecs * burnRate);
                     }
                     const isNegative = seconds < 0;

                     const isActive = ipad.secondsRemaining !== 0;
                     const isPaused = ipad.isPaused === true;
                     
                     let statusClass = 'st-idle';
                     let statusText = 'IDLE';
                     let timerClass = 'timer-idle';

                     if (isActive) {
                         if (isPaused) {
                             statusClass = 'st-paused';
                             statusText = 'PAUSED';
                             timerClass = isNegative ? 'timer-negative' : 'timer-paused';
                         } else {
                             statusClass = 'st-active';
                             statusText = 'RUNNING';
                             timerClass = isNegative ? 'timer-negative' : 'timer-running';
                         }
                     }

                     return (
                        <div key={ipad.id} className="ipad-card" data-id={ipad.id} onClick={(e) => {
                             if (!e.currentTarget.classList.contains('sortable-drag')) navigate(`${BASE}/ipad-control/${ipad.id}`);
                        }}>
                             <div className="card-header">
                                <div className="card-id">{ipad.id}</div>
                                <div className={`card-status ${statusClass}`}>{statusText}</div>
                            </div>
                            <div className="card-body">
                                <div className="card-company">{ipad.companyName || 'No Company'}</div>
                                <div className="card-project" title={ipad.projectName}>{ipad.projectName || 'No Project'}</div>
                                <hr style={{border:0, borderTop:'1px solid #eee', margin:'10px 0'}} />
                                <div className="card-stat-row">
                                    <span className="stat-label">Line Leader</span>
                                    <span className="stat-val">{ipad.lineLeaderName || '-'}</span>
                                </div>
                                <div className="card-stat-row">
                                    <span className="stat-label">Clocked In</span>
                                    <span className="stat-val">{ipad.activeWorkers ? ipad.activeWorkers.length : 0}</span>
                                </div>
                            </div>
                            <div className={`card-timer ${timerClass}`}>
                                {renderTimer(ipad)}
                            </div>
                        </div>
                      );
                })}
            </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
