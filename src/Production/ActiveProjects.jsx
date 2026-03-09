import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { styles } from './styles';
import Loader from '../components/Loader';

const ActiveProjects = () => {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Querying for all projects that are currently active across departments
        const q = query(collection(db, "production_pipeline"), where("status", "in", ["production", "qc_pending", "dashboard", "unlinked_blend"]));
        
        const unsubscribe = onSnapshot(q, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            // Sort newest first
            list.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setProjects(list);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    if (loading) return <Loader />;

    return (
        <div>
            {projects.length === 0 ? <p>No active projects found.</p> : null}
            {projects.map(job => (
                <div key={job.id} style={{...styles.card, borderLeft: '5px solid #3b82f6'}}>
                    <div style={{display:'flex', justifyContent:'space-between'}}>
                        <div>
                            <h3 style={{margin:'0 0 5px 0'}}>
                                {job.project} 
                                <span style={{fontSize: '11px', background: '#e2e8f0', padding: '3px 8px', borderRadius: '10px', marginLeft: '10px', textTransform: 'uppercase'}}>
                                    Status: {job.status.replace('_', ' ')}
                                </span>
                            </h3>
                            <div style={{color:'#666'}}>{job.company} • {job.quantity || 'N/A'} units</div>
                        </div>
                        <div style={{textAlign: 'right'}}>
                            <div style={{fontSize: '12px', color: '#555'}}>
                                Blending: <strong style={{color: job.blendingStatus === 'completed' ? '#166534' : '#b45309'}}>{job.blendingStatus || 'N/A'}</strong>
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default ActiveProjects;