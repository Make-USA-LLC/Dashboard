import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase_config';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

import Loader from '../components/Loader';
import Generator from './Generator';
import Logs from './Logs';
import Admin from './Admin';

export default function WifiApp() {
    const [activeTab, setActiveTab] = useState('generate');
    const [loading, setLoading] = useState(true);
    
    // Default permissions (safest setting)
    const [perms, setPerms] = useState({ create: false, logs: false, revoke: false, admin: false });

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                const email = user.email.toLowerCase();
                
                // 1. Check Master Admin
                const adminSnap = await getDoc(doc(db, "master_admin_access", email));
                if (adminSnap.exists() || email === 'daniel.s@makeit.buzz') {
                    setPerms({ create: true, logs: true, revoke: true, admin: true });
                } else {
                    // 2. Fetch standard user's assigned role name
                    const roleSnap = await getDoc(doc(db, "wifi_access", email));
                    if (roleSnap.exists()) {
                        const roleName = roleSnap.data().role;
                        
                        // 3. Fetch what that role is actually allowed to do from config
                        const configSnap = await getDoc(doc(db, "config", "wifi_roles"));
                        if (configSnap.exists() && configSnap.data()[roleName]) {
                            setPerms(configSnap.data()[roleName]);
                        } else {
                            // Failsafe if role was deleted
                            setPerms({ create: true, logs: false, revoke: false, admin: false });
                        }
                    }
                }
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    if (loading) return <Loader message="Loading Wi-Fi Management..." />;

    return (
        <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'sans-serif' }}>
            
            {/* Navigation Tabs based on Granular Permissions */}
            <div className="no-print" style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
                
                {perms.create && (
                    <button onClick={() => setActiveTab('generate')} style={{ padding: '10px 20px', fontWeight: 'bold', background: activeTab === 'generate' ? '#1e293b' : '#e2e8f0', color: activeTab === 'generate' ? 'white' : '#333', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                        Generate Guest Code
                    </button>
                )}
                
                {/* Note: If they have either 'logs' OR 'revoke' access, show the tab */}
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

            {/* Active Tab Rendering */}
            {activeTab === 'generate' && perms.create && <Generator />}
            
            {/* We pass the revoke permission down into the Logs component! */}
            {activeTab === 'logs' && (perms.logs || perms.revoke) && <Logs canRevoke={perms.revoke} />}
            
            {activeTab === 'admin' && perms.admin && <Admin />}
        </div>
    );
}