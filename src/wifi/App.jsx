import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { doc, getDoc } from 'firebase/firestore';
import { useRole } from '../hooks/useRole'; 

import Loader from '../components/loader';
import Generator from './Generator';
import Logs from './Logs';
import Admin from './Admin';

export default function WifiApp() {
    // FIX: Using access.readOnly directly from the hook!
    const { access, loading: roleLoading } = useRole();
    
    const [activeTab, setActiveTab] = useState('generate');
    const [pageLoading, setPageLoading] = useState(true);
    const [perms, setPerms] = useState({ create: false, logs: false, revoke: false, admin: false });

    useEffect(() => {
        if (roleLoading) return;

        const fetchPerms = async () => {
            // 1. Master Admin Check
            if (access.master) {
                setPerms({ create: true, logs: true, revoke: true, admin: true });
            } 
            // 2. Global Read-Only Check: Give them VIEW access to tabs, but NO revoke powers
            else if (access.readOnly) {
                setPerms({ create: true, logs: true, revoke: false, admin: true });
            } 
            // 3. Standard Wi-Fi Role Check
            else if (access.wifi) {
                try {
                    const configSnap = await getDoc(doc(db, "config", "wifi_roles"));
                    if (configSnap.exists() && configSnap.data()[access.wifi]) {
                        const rolePerms = configSnap.data()[access.wifi];
                        setPerms(rolePerms);
                        
                        if (!rolePerms.create && (rolePerms.logs || rolePerms.revoke)) setActiveTab('logs');
                        else if (!rolePerms.create && !rolePerms.logs && rolePerms.admin) setActiveTab('admin');
                    }
                } catch (e) {
                    console.error("Error fetching Wi-Fi config:", e);
                }
            }
            setPageLoading(false);
        };
        
        fetchPerms();
    }, [access, roleLoading]);

    if (roleLoading || pageLoading) return <Loader message="Loading Wi-Fi Management..." />;

    const hasNoAccess = !perms.create && !perms.logs && !perms.revoke && !perms.admin;

    if (hasNoAccess) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', marginTop: '50px', fontFamily: 'sans-serif' }}>
                <div style={{ background: 'white', padding: '40px', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', display: 'inline-block' }}>
                    <span className="material-icons" style={{fontSize: '48px', color: '#e74c3c', marginBottom: '10px'}}>gpp_bad</span>
                    <h2 style={{ color: '#0f172a', margin: '0 0 10px 0' }}>Access Denied</h2>
                    <p style={{ color: '#64748b', margin: 0 }}>You do not have permission to view the Wi-Fi portal.</p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'sans-serif' }}>
            
            <div className="no-print" style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
                {perms.create && (
                    <button onClick={() => setActiveTab('generate')} style={{ padding: '10px 20px', fontWeight: 'bold', background: activeTab === 'generate' ? '#1e293b' : '#e2e8f0', color: activeTab === 'generate' ? 'white' : '#333', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                        Generate Guest Code
                    </button>
                )}
                
                {(perms.logs || perms.revoke) && (
                    <button onClick={() => setActiveTab('logs')} style={{ padding: '10px 20px', fontWeight: 'bold', background: activeTab === 'logs' ? '#1e293b' : '#e2e8f0', color: activeTab === 'logs' ? 'white' : '#333', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                        Access Logs
                    </button>
                )}

                {perms.admin && (
                    <button onClick={() => setActiveTab('admin')} style={{ padding: '10px 20px', fontWeight: 'bold', background: activeTab === 'admin' ? '#1e293b' : '#e2e8f0', color: activeTab === 'admin' ? 'white' : '#333', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                        Admin Settings
                    </button>
                )}
            </div>

            {/* We pass down access.readOnly so the child components lock their inputs! */}
            {activeTab === 'generate' && perms.create && <Generator isReadOnly={access.readOnly} />}
            {activeTab === 'logs' && (perms.logs || perms.revoke) && <Logs canRevoke={perms.revoke && !access.readOnly} />}
            {activeTab === 'admin' && perms.admin && <Admin isReadOnly={access.readOnly} />}
        </div>
    );
}