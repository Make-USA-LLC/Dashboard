import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Commisions.css';
import { db } from './firebase_config.jsx';
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import Loader from '../components/loader'; 
import { useRole } from './hooks/useRole'; // <-- Imported centralized hook

const Commissions = () => {
    const navigate = useNavigate();
    
    // --- 1. USE THE HOOK ---
    const { user, hasPerm, isReadOnly, loading: roleLoading } = useRole();
    const canView = hasPerm('commissions', 'view') || hasPerm('finance', 'view') || isReadOnly;
    const canEditFinance = (hasPerm('finance', 'edit') || hasPerm('commissions', 'edit')) && !isReadOnly;

    const [pageLoading, setPageLoading] = useState(true);
    const [view, setView] = useState('unpaid');
    const [reports, setReports] = useState([]);
    const [config, setConfig] = useState({});
    const [agentTotals, setAgentTotals] = useState({});
    
    // Modal State
    const [showPayModal, setShowPayModal] = useState(false);
    const [payTargetId, setPayTargetId] = useState(null);
    const [payDate, setPayDate] = useState('');

    // --- 2. STREAMLINED INITIALIZATION ---
    useEffect(() => {
        if (roleLoading) return;

        if (!user || !canView) {
            navigate('/dashboard');
            return;
        }

        const fetchAll = async () => {
            setPageLoading(true);
            const loadedConfig = await loadConfig();
            await loadData(loadedConfig);
            setPageLoading(false);
        };

        fetchAll();
    }, [user, canView, roleLoading, navigate, view]);

    const loadConfig = async () => {
        const cSnap = await getDoc(doc(db, "config", "finance"));
        if(cSnap.exists()) {
            const data = cSnap.data();
            setConfig(data);
            return data;
        }
        return {};
    };

    const loadData = async (currentConfig = config) => {
        const q = query(collection(db, "reports"), where("financeStatus", "==", "complete"));
        const snap = await getDocs(q);
        
        let list = [];
        const totals = {};

        snap.forEach(d => {
            const data = d.data();
            
            // Helper function to process a single agent slot
            const processAgent = (agentName, isSecondary) => {
                if (!agentName) return;

                // We track payment status independently (sort of).
                // Currently the DB only has one 'commissionPaid' flag.
                const isPaid = data.commissionPaid === true;
                
                // Filter View
                if (view === 'unpaid' && isPaid) return;
                if (view === 'paid' && !isPaid) return;

                // Calculate Comm
                let rate = 0;
                if (currentConfig.agents) {
                    const ag = currentConfig.agents.find(a => a.name === agentName);
                    if(ag) rate = parseFloat(ag.comm);
                }
                const invoice = data.invoiceAmount || 0;
                const excluded = data.commissionExcluded || 0;
                const basis = Math.max(0, invoice - excluded);
                const commAmt = basis * (rate / 100);

                // Add to totals
                if(!totals[agentName]) totals[agentName] = 0;
                totals[agentName] += commAmt;

                // Unique Key for the list view
                const uniqueKey = isSecondary ? `${d.id}_2` : d.id;

                list.push({ 
                    id: d.id, 
                    uniqueKey: uniqueKey, // Used for React Key
                    ...data, 
                    displayAgent: agentName, // The specific agent for this row
                    commAmount: commAmt, 
                    rate: rate,
                    basis: basis,
                    excluded: excluded 
                });
            };

            // Process Primary
            processAgent(data.agentName, false);
            // Process Secondary
            processAgent(data.agentName2, true);
        });

        list.sort((a,b) => (b.completedAt?.seconds||0) - (a.completedAt?.seconds||0));
        setReports(list);
        setAgentTotals(totals);
    };

    // --- 3. PROTECTED ACTIONS ---
    const openPayModal = (id) => {
        if (!canEditFinance) return alert("Read-Only Access");
        setPayTargetId(id);
        setPayDate(new Date().toISOString().split('T')[0]);
        setShowPayModal(true);
    };

    const confirmPay = async () => {
        if (!canEditFinance) return alert("Read-Only Access");
        if(!payDate) return alert("Select Date");
        const parts = payDate.split('-');
        const fmtDate = `${parts[1]}/${parts[2]}/${parts[0]}`;

        // Note: This pays the whole report (both agents) because we share the flag.
        await updateDoc(doc(db, "reports", payTargetId), { 
            commissionPaid: true, commissionPaidAt: new Date(), commissionPaidDate: fmtDate 
        });
        setShowPayModal(false);
        loadData(config);
    };

    const undoPay = async (id) => {
        if (!canEditFinance) return alert("Read-Only Access");
        if(!window.confirm("Undo payment status? This affects both agents on this job.")) return;
        await updateDoc(doc(db, "reports", id), { commissionPaid: false, commissionPaidDate: null });
        loadData(config);
    };

    const grandTotal = Object.values(agentTotals).reduce((a,b) => a+b, 0);

    if (roleLoading || pageLoading) return <div style={{height: '100vh', display: 'flex', alignItems: 'center', background: '#f8fafc'}}><Loader message="Loading Commissions..." /></div>;
    if (!canView) return null;

    return (
        <div className="commissions-page-wrapper">
            <div className="commissions-top-bar">
                <button onClick={() => navigate('/dashboard')} style={{border:'none', background:'none', fontWeight:'bold', cursor:'pointer'}}>&larr; Dashboard</button>
                <div className="view-toggle">
                    <button className={`toggle-btn ${view==='unpaid'?'active':''}`} onClick={() => setView('unpaid')}>Pending</button>
                    <button className={`toggle-btn ${view==='paid'?'active paid':''}`} onClick={() => setView('paid')}>History</button>
                </div>
                
            </div>

            <div className="commissions-container">
                {/* BREAKDOWN */}
                {view === 'unpaid' && (
                    <div className="overview-panel">
                        <div className="overview-header">
                            <span>Commission Breakdown</span>
                            <span className="overview-total">${grandTotal.toLocaleString(undefined, {minimumFractionDigits:2})}</span>
                        </div>
                        {Object.keys(agentTotals).sort().map(name => (
                            <div key={name} className="agent-row">
                                <div className="agent-name"><span className="material-icons" style={{fontSize:'16px', color:'#ccc'}}>person</span> {name}</div>
                                <div className="agent-val">${agentTotals[name].toFixed(2)}</div>
                            </div>
                        ))}
                    </div>
                )}

                {/* CARDS */}
                <div className="commissions-grid">
                    {reports.map(r => {
                        const dateStr = r.completedAt ? new Date(r.completedAt.seconds*1000).toLocaleDateString() : 'N/A';
                        
                        return (
                            <div key={r.uniqueKey} className="project-card">
                                <div className="card-header">
                                    <div className="project-name">{r.project}</div>
                                    <div className="project-meta">
                                        <span>{r.company}</span>
                                        <span>{dateStr}</span>
                                    </div>
                                </div>
                                <div className="card-body">
                                    <div className="data-row"><span>Agent</span><span className="data-val">{r.displayAgent}</span></div>
                                    <div className="data-row"><span>Invoice</span><span className="data-val">${r.invoiceAmount?.toLocaleString()}</span></div>
                                    {r.excluded > 0 && (
                                        <div className="data-row" style={{color:'#e67e22', fontSize:'11px'}}>
                                            <span>Less Excluded</span><span>-${r.excluded.toLocaleString()}</span>
                                        </div>
                                    )}
                                    <div className="highlight-row">
                                        <div className="data-row" style={{marginBottom:0, alignItems:'center'}}>
                                            <span>{r.rate}% Comm.</span>
                                            <span className="comm-total">${r.commAmount.toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="card-footer">
                                    {canEditFinance ? (
                                        view === 'unpaid' ? (
                                            <button className="btn-pay" onClick={() => openPayModal(r.id)}>Mark Paid ${r.commAmount.toFixed(2)}</button>
                                        ) : (
                                            <div style={{display:'flex', justifyContent:'flex-end', alignItems:'center', gap:'10px'}}>
                                                <span style={{color:'#27ae60', fontSize:'12px'}}>Paid {r.commissionPaidDate}</span>
                                                <button className="btn-undo" onClick={() => undoPay(r.id)}>Undo</button>
                                            </div>
                                        )
                                    ) : (
                                        <span className={`status-badge ${view==='paid'?'badge-paid':''}`}>
                                            {view==='paid' ? `Paid ${r.commissionPaidDate}` : 'Pending'}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* MODAL */}
            {showPayModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="calc-header">
                            <h3 style={{margin:0}}>Mark Paid</h3>
                            <span style={{cursor:'pointer'}} onClick={() => setShowPayModal(false)}>✕</span>
                        </div>
                        <div className="input-group">
                            <label>PAY DATE</label>
                            <input type="date" className="date-input" value={payDate} onChange={e => setPayDate(e.target.value)} />
                        </div>
                        <p style={{fontSize:'12px', color:'#666', marginTop:'0'}}>* This will mark the entire project (both agents) as paid.</p>
                        <button className="btn-confirm" onClick={confirmPay}>Confirm Payment</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Commissions;