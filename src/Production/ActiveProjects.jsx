import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { styles } from './styles';
import Loader from '../components/Loader';

const ActiveProjects = () => {
    const [pipelineJobs, setPipelineJobs] = useState([]);
    const [queueJobs, setQueueJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Search, Filter, and Sort State
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('All');
    const [sortBy, setSortBy] = useState('newest');

    useEffect(() => {
        const qPipe = query(collection(db, "production_pipeline"));
        const unsubPipe = onSnapshot(qPipe, (snap) => {
            setPipelineJobs(snap.docs.map(d => ({ id: d.id, ...d.data(), source: 'pipeline' })));
        });

        const qQueue = query(collection(db, "project_queue"));
        const unsubQueue = onSnapshot(qQueue, (snap) => {
            setQueueJobs(snap.docs.map(d => ({ id: d.id, ...d.data(), source: 'queue' })));
        });

        setTimeout(() => setLoading(false), 800);

        return () => { unsubPipe(); unsubQueue(); };
    }, []);

    if (loading) return <Loader message="Loading Active Projects..." />;

    // Dynamic Display Rules
    const getDisplayStatus = (job) => {
        if (job.source === 'queue') return "Ready (iPad Queue)";
        if (job.status === 'qc_pending') return "QC Pending";
        if (job.status === 'production' && !job.componentsArrived) return "Waiting for Components";
        return "Production"; 
    };

    const getStatusColor = (statusText) => {
        switch(statusText) {
            case "Ready (iPad Queue)": return { bg: '#dcfce7', text: '#166534', border: '#22c55e' }; 
            case "QC Pending": return { bg: '#f3e8ff', text: '#6b21a8', border: '#a855f7' }; 
            case "Waiting for Components": return { bg: '#fef3c7', text: '#92400e', border: '#f59e0b' }; 
            case "Production": return { bg: '#dbeafe', text: '#1e3a8a', border: '#3b82f6' }; 
            default: return { bg: '#e2e8f0', text: '#334155', border: '#94a3b8' }; 
        }
    };

    const getDisplayHours = (job) => {
        if (job.seconds) return (job.seconds / 3600).toFixed(1) + " hrs";
        const rev = (parseFloat(job.quantity) || 0) * (parseFloat(job.price) || 0);
        const hrs = rev / 60;
        return hrs > 0 ? hrs.toFixed(1) + " hrs (est)" : "N/A";
    };

    const showDbInfo = (job) => {
        const collectionName = job.source === 'pipeline' ? 'production_pipeline' : 'project_queue';
        alert(`Document ID: ${job.id}\nDatabase Collection: ${collectionName}`);
    };

    // Combine, Filter, and Sort
    const allProjects = [...pipelineJobs, ...queueJobs];
    
    const filteredProjects = allProjects.filter(job => {
        const matchesSearch = (job.project || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                              (job.company || '').toLowerCase().includes(searchTerm.toLowerCase());
        const statusText = getDisplayStatus(job);
        const matchesStatus = filterStatus === 'All' || statusText === filterStatus;
        return matchesSearch && matchesStatus;
    });

    const sortedProjects = filteredProjects.sort((a, b) => {
        if (sortBy === 'newest') return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
        if (sortBy === 'oldest') return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
        if (sortBy === 'project') return (a.project || '').localeCompare(b.project || '');
        if (sortBy === 'company') return (a.company || '').localeCompare(b.company || '');
        if (sortBy === 'status') return getDisplayStatus(a).localeCompare(getDisplayStatus(b));
        return 0;
    });

    return (
        <div>
            {/* Toolbar: Search, Filter, Sort */}
            <div style={{ marginBottom: '20px', display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center', background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ flex: '1 1 250px' }}>
                    <input 
                        type="text" 
                        placeholder="🔍 Search Project or Company..." 
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)} 
                        style={{ padding: '8px 12px', borderRadius: '5px', border: '1px solid #cbd5e1', width: '100%', boxSizing: 'border-box', outline: 'none' }}
                    />
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <label style={{ fontWeight: 'bold', fontSize: '13px', color: '#334155' }}>Filter Status:</label>
                    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', outline: 'none', cursor: 'pointer' }}>
                        <option value="All">All Statuses</option>
                        <option value="Waiting for Components">Waiting for Components</option>
                        <option value="Production">Production</option>
                        <option value="Ready (iPad Queue)">Ready (iPad Queue)</option>
                        <option value="QC Pending">QC Pending</option>
                    </select>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <label style={{ fontWeight: 'bold', fontSize: '13px', color: '#334155' }}>Sort By:</label>
                    <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', outline: 'none', cursor: 'pointer' }}>
                        <option value="newest">Date Created (Newest)</option>
                        <option value="oldest">Date Created (Oldest)</option>
                        <option value="project">Project Name (A-Z)</option>
                        <option value="company">Company (A-Z)</option>
                        <option value="status">Status Grouping</option>
                    </select>
                </div>
            </div>

            {sortedProjects.length === 0 ? <p>No matching projects found.</p> : null}
            
            {sortedProjects.map(job => {
                const statusText = getDisplayStatus(job);
                const colors = getStatusColor(statusText);

                return (
                    <div key={job.id} style={{...styles.card, borderLeft: `5px solid ${colors.border}`}}>
                        <div style={{display:'flex', justifyContent:'space-between'}}>
                            <div>
                                <h3 style={{margin:'0 0 5px 0', display: 'flex', alignItems: 'center'}}>
                                    {job.project} 
                                    <span style={{fontSize: '11px', background: colors.bg, color: colors.text, padding: '3px 8px', borderRadius: '10px', marginLeft: '10px', textTransform: 'uppercase', fontWeight: 'bold'}}>
                                        Status: {statusText}
                                    </span>
                                    <button 
                                        onClick={() => showDbInfo(job)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', marginLeft: '5px', opacity: '0.6' }}
                                        title="View Database Info"
                                    >
                                        ℹ️
                                    </button>
                                </h3>
                                <div style={{color:'#666'}}>
                                    {job.company} • {job.quantity || job.expectedUnits || 'N/A'} units
                                </div>
                                
                                {/* Show arrived components if any were checked off */}
                                {job.requiredComponents && job.requiredComponents.filter(c => c.arrived).length > 0 && (
                                    <div style={{fontSize: '12px', color: '#047857', marginTop: '6px', background: '#ecfdf5', padding: '4px 8px', borderRadius: '4px', display: 'inline-block'}}>
                                        📦 <strong>Arrived:</strong> {job.requiredComponents.filter(c => c.arrived).map(c => c.name).join(', ')}
                                    </div>
                                )}
                            </div>
                            <div style={{textAlign: 'right'}}>
                                <div style={{fontSize: '12px', color: '#555', background: '#f8fafc', padding: '5px 10px', borderRadius: '5px', border: '1px solid #e2e8f0'}}>
                                    ⏱️ Allotted: <strong>{getDisplayHours(job)}</strong>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default ActiveProjects;