import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { styles } from './styles';
import Loader from '../components/Loader';

const ActiveProjects = () => {
    const [pipelineJobs, setPipelineJobs] = useState([]);
    const [queueJobs, setQueueJobs] = useState([]);
    const [loading, setLoading] = useState(true);

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

    // Combine both database lists and sort by newest first
    const allProjects = [...pipelineJobs, ...queueJobs].sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    // Dynamic Display Rules
    const getDisplayStatus = (job) => {
        if (job.source === 'queue') return "Ready (iPad Queue)";
        if (job.status === 'qc_pending') return "QC Pending";
        if (job.status === 'production' && !job.componentsArrived) return "Waiting for Components";
        return "Production"; 
    };

    const getDisplayHours = (job) => {
        // If it's already on the iPad Queue, it has hard calculated seconds
        if (job.seconds) return (job.seconds / 3600).toFixed(1) + " hrs";
        
        // If it's in Production/QC, simulate the math ($60/hr standard rate)
        const rev = (parseFloat(job.quantity) || 0) * (parseFloat(job.price) || 0);
        const hrs = rev / 60;
        return hrs > 0 ? hrs.toFixed(1) + " hrs (est)" : "N/A";
    };

    return (
        <div>
            {allProjects.length === 0 ? <p>No active projects found.</p> : null}
            {allProjects.map(job => (
                <div key={job.id} style={{...styles.card, borderLeft: '5px solid #3b82f6'}}>
                    <div style={{display:'flex', justifyContent:'space-between'}}>
                        <div>
                            <h3 style={{margin:'0 0 5px 0'}}>
                                {job.project} 
                                <span style={{fontSize: '11px', background: '#e2e8f0', padding: '3px 8px', borderRadius: '10px', marginLeft: '10px', textTransform: 'uppercase'}}>
                                    Status: {getDisplayStatus(job)}
                                </span>
                            </h3>
                            <div style={{color:'#666'}}>{job.company} • {job.quantity || job.expectedUnits || 'N/A'} units</div>
                        </div>
                        <div style={{textAlign: 'right'}}>
                            <div style={{fontSize: '12px', color: '#555', background: '#f8fafc', padding: '5px 10px', borderRadius: '5px', border: '1px solid #e2e8f0'}}>
                                ⏱️ Allotted: <strong>{getDisplayHours(job)}</strong>
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default ActiveProjects;