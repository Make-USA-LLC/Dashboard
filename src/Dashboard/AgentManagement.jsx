import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './AgentManagement.css';
import { db } from './firebase_config.jsx';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import Loader from '../components/loader'; 
import { useRole } from './hooks/useRole'; // <-- Imported centralized hook

const AgentManagement = () => {
    const navigate = useNavigate();
    
    // --- 1. USE THE HOOK ---
    const { user, role, isReadOnly, hasPerm, loading: roleLoading } = useRole();
    
    // The original requirement was admin_edit or finance_edit to view this page
    const canView = hasPerm('admin', 'edit') || hasPerm('finance', 'edit') || isReadOnly;
    const canEdit = (hasPerm('admin', 'edit') || hasPerm('finance', 'edit')) && !isReadOnly;
    const isAdmin = role === 'admin';

    const [pageLoading, setPageLoading] = useState(true);
    const [financeConfig, setFinanceConfig] = useState({ agents: [] });
    const [impersonateTarget, setImpersonateTarget] = useState('');

    // --- 2. STREAMLINED INITIALIZATION ---
    useEffect(() => {
        if (roleLoading) return; 

        if (!user || !canView) {
            navigate('/dashboard');
            return;
        }

        loadAgents();
    }, [user, canView, roleLoading, navigate]);

    const loadAgents = async () => {
        try {
            const snap = await getDoc(doc(db, "config", "finance"));
            if (snap.exists()) {
                setFinanceConfig(snap.data());
            }
            setPageLoading(false);
        } catch (error) {
            console.error("Failed to load agents:", error);
            setPageLoading(false);
        }
    };

    // --- 3. PROTECTED ACTIONS ---
    const handleEmailChange = (index, newVal) => {
        if (!canEdit) return;
        const updatedAgents = [...financeConfig.agents];
        updatedAgents[index].email = newVal;
        setFinanceConfig({ ...financeConfig, agents: updatedAgents });
    };

    const handleSaveEmail = async (index) => {
        if (!canEdit) return alert("Read-Only Access");
        try {
            const agentToSave = financeConfig.agents[index];
            if(!agentToSave) return;
            await setDoc(doc(db, "config", "finance"), { agents: financeConfig.agents }, { merge: true });
            alert(`Saved email for ${agentToSave.name}`);
        } catch (e) {
            alert("Error saving: " + e.message);
        }
    };

    const handleImpersonate = () => {
        if (!impersonateTarget) return alert("Please select an agent.");
        
        const url = `/dashboard/agent-portal?viewAs=${encodeURIComponent(impersonateTarget)}`;
        window.open(url, '_blank');
    };

    if (roleLoading || pageLoading) return <div style={{height: '100vh', display: 'flex', alignItems: 'center', background: '#f8fafc'}}><Loader message="Loading Agent Management..." /></div>;
    if (!canView) return null;

    return (
        <div className="agent-page-wrapper">
            <div className="agent-top-bar">
                <button onClick={() => navigate('/dashboard')} style={{background:'none', border:'none', fontSize:'16px', fontWeight:'bold', cursor:'pointer', color:'#2c3e50'}}>&larr; Dashboard</button>
                <div style={{fontWeight:'bold', color:'#8e44ad'}}>Agent Management</div>
            </div>

            <div className="agent-container">
                {isAdmin && (
                    <div className="admin-box">
                        <div>
                            <strong style={{color:'#8e44ad', display:'block'}}>Admin Access</strong>
                            <span style={{fontSize:'12px', color:'#666'}}>View portal as agent:</span>
                        </div>
                        <select value={impersonateTarget} onChange={(e) => setImpersonateTarget(e.target.value)}>
                            <option value="">Select an Agent...</option>
                            {financeConfig.agents?.map((a, i) => (
                                <option key={i} value={a.name}>{a.name}</option>
                            ))}
                        </select>
                        <button className="btn btn-purple" onClick={handleImpersonate}>Open Portal &rarr;</button>
                    </div>
                )}

                <div className="agent-card">
                    <h2>Link Emails to Agents</h2>
                    <table className="agent-table">
                        <thead><tr><th>Agent / Company</th><th>Authorized Email</th><th style={{width:'100px'}}>Action</th></tr></thead>
                        <tbody>
                            {financeConfig.agents?.map((agent, index) => (
                                <tr key={index}>
                                    <td><span className="agent-name">{agent.name}</span> <span className="comm-rate">{agent.comm}%</span></td>
                                    <td>
                                        <input 
                                            type="email" 
                                            className="agent-input" 
                                            value={agent.email || ''} 
                                            onChange={(e) => handleEmailChange(index, e.target.value)} 
                                            placeholder="agent@company.com"
                                            disabled={!canEdit}
                                        />
                                    </td>
                                    <td>
                                        {canEdit && (
                                            <button className="btn btn-green" onClick={() => handleSaveEmail(index)}>Save</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AgentManagement;