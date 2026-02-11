import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import './Admin.css';

const MasterAdmin = () => {
    const [roles, setRoles] = useState({});
    const [selectedRole, setSelectedRole] = useState(null);
    const [activeTab, setActiveTab] = useState('ipad'); // Default tab
    const [loading, setLoading] = useState(true);

    // Grouping all permissions by System
    const PERMISSION_GROUPS = {
        ipad: [
            { id: 'access', label: 'Login Access' },
            { id: 'timer', label: 'Live Timer View' },
            { id: 'fleet', label: 'Fleet Management' },
            { id: 'queue', label: 'Project Queue' },
            { id: 'workers', label: 'Worker Database' }
        ],
        hr: [
            { id: 'employees', label: 'Staff Directory' },
            { id: 'schedule', label: 'Scheduling' },
            { id: 'reviews', label: 'Performance Reviews' },
            { id: 'assets_hardware', label: 'Hardware Tracking' },
            { id: 'assets_keys', label: 'Key Inventory' },
            { id: 'assets_lockers', label: 'Locker Management' }
        ],
        techs: [
            { id: 'tech_inventory', label: 'Tech Inventory' },
            { id: 'lines', label: 'Line Maintenance' }
        ],
        production: [
            { id: 'shed', label: 'Shed Inventory' },
            { id: 'qc', label: 'QC Approvals' },
            { id: 'finance', label: 'Finance Setup' }
        ]
    };

    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, "config", "roles"), (snap) => {
            if (snap.exists()) {
                setRoles(snap.data());
                // Auto-select first role if none selected
                if (!selectedRole) setSelectedRole(Object.keys(snap.data())[0]);
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const togglePerm = async (feature, type) => {
        const key = `${feature}_${type}`;
        const updatedRoles = { ...roles };
        const currentVal = updatedRoles[selectedRole][key] || false;
        updatedRoles[selectedRole][key] = !currentVal;

        await setDoc(doc(db, "config", "roles"), updatedRoles);
    };

    if (loading) return <div className="admin-loading">Loading Master Permissions...</div>;

    return (
        <div className="master-admin-layout">
            {/* SIDEBAR: ROLE SELECTION */}
            <div className="admin-sidebar">
                <h3>System Roles</h3>
                {Object.keys(roles).map(roleName => (
                    <div 
                        key={roleName} 
                        className={`role-item ${selectedRole === roleName ? 'active' : ''}`}
                        onClick={() => setSelectedRole(roleName)}
                    >
                        {roleName.replace('_', ' ')}
                    </div>
                ))}
            </div>

            {/* MAIN CONTENT: SYSTEM TABS */}
            <div className="admin-main">
                <div className="admin-header">
                    <h2>Permissions for: <span className="highlight">{selectedRole}</span></h2>
                </div>

                <div className="admin-tabs">
                    <button className={activeTab === 'ipad' ? 'active' : ''} onClick={() => setActiveTab('ipad')}>📱 iPad Dashboard</button>
                    <button className={activeTab === 'hr' ? 'active' : ''} onClick={() => setActiveTab('hr')}>👥 HR Suite</button>
                    <button className={activeTab === 'techs' ? 'active' : ''} onClick={() => setActiveTab('techs')}>🔧 Technicians</button>
                    <button className={activeTab === 'production' ? 'active' : ''} onClick={() => setActiveTab('production')}>🏗️ Production (QC/Shed)</button>
                </div>

                <div className="permission-grid">
                    <div className="grid-header">Feature</div>
                    <div className="grid-header">View</div>
                    <div className="grid-header">Edit</div>

                    {PERMISSION_GROUPS[activeTab].map(feature => (
                        <React.Fragment key={feature.id}>
                            <div className="feature-label">{feature.label}</div>
                            <div className="checkbox-cell">
                                <input 
                                    type="checkbox" 
                                    checked={roles[selectedRole][`${feature.id}_view`] || false} 
                                    onChange={() => togglePerm(feature.id, 'view')}
                                />
                            </div>
                            <div className="checkbox-cell">
                                <input 
                                    type="checkbox" 
                                    checked={roles[selectedRole][`${feature.id}_edit`] || false} 
                                    onChange={() => togglePerm(feature.id, 'edit')}
                                />
                            </div>
                        </React.Fragment>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default MasterAdmin;