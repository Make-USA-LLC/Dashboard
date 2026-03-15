import React, { useState, useEffect, createContext } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase_config'; 
import { useMsal } from "@azure/msal-react";
import { Lock } from 'lucide-react';

import Dashboard from './Dashboard';
import ClientDetail from './ClientDetail';
import Admin from './Admin';
import SampleManagement from './SampleManagement'; 
import Settings from './Settings';                 

// Exporting the context so Dashboard.jsx and ClientDetail.jsx can use it
export const ClientPermsContext = createContext(null);

export default function ClientApp() {
    const { instance, accounts } = useMsal();
    const [perms, setPerms] = useState(null);
    const [userRole, setUserRole] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fbUser = auth.currentUser;

        // --- 1. DEMO BYPASS ---
        if (import.meta.env.VITE_IS_DEMO === 'true') {
            setUserRole('Master Admin');
            setPerms({
                view_clients: true, edit_client_details: true,
                manage_client_status: true, view_w9: true, upload_w9: true,
                view_legal: true, upload_legal: true,
                view_samples: true, manage_samples: true,
                manage_settings: true, manage_permissions: true
            });
            setLoading(false);
            return;
        }

        if (!fbUser || !fbUser.email) {
            setLoading(false);
            return;
        }

        const email = fbUser.email.toLowerCase();

        // 2. MASTER ADMIN OVERRIDE (Hardcoded)
        if (email === 'daniel.s@makeit.buzz') {
            setUserRole('Master Admin');
            setPerms({
                view_clients: true, edit_client_details: true,
                manage_client_status: true, view_w9: true, upload_w9: true,
                view_legal: true, upload_legal: true,
                view_samples: true, manage_samples: true,
                manage_settings: true, manage_permissions: true
            });
            setLoading(false);
            return;
        }

        // 3. LIVE REAL-TIME LISTENERS
        let unsubAccess = () => {};
        let unsubRole = () => {};

        const unsubMaster = onSnapshot(doc(db, "master_admin_access", email), (mSnap) => {
            if (mSnap.exists()) {
                setUserRole('Master Admin');
                setPerms({
                    view_clients: true, edit_client_details: true,
                    manage_client_status: true, view_w9: true, upload_w9: true,
                    view_legal: true, upload_legal: true,
                    view_samples: true, manage_samples: true,
                    manage_settings: true, manage_permissions: true
                });
                setLoading(false);
            } else {
                unsubAccess = onSnapshot(doc(db, "client_access", email), (aSnap) => {
                    if (aSnap.exists()) {
                        const role = aSnap.data().role;
                        setUserRole(role);
                        
                        unsubRole = onSnapshot(doc(db, "client_roles", role), (rSnap) => {
                            if (rSnap.exists()) {
                                setPerms(rSnap.data()); 
                            } else {
                                setPerms({}); 
                            }
                            setLoading(false);
                        });
                    } else {
                        setPerms(null); // Denied
                        setLoading(false);
                    }
                });
            }
        });

        return () => {
            unsubMaster();
            unsubAccess();
            unsubRole();
        };
    }, []);

    if (loading) return <div className="flex items-center justify-center min-h-screen font-bold text-slate-400 animate-pulse">Verifying Secure Module...</div>;

    // Unauthorized screen (Only shows if NOT in demo and NOT in DB)
    if (!perms) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-50">
                <div className="bg-white p-12 rounded-3xl shadow-xl max-w-md w-full text-center border border-slate-200">
                    <Lock size={60} className="text-red-500 mx-auto mb-6" />
                    <h2 className="text-2xl font-black mb-2 text-slate-900">Access Restricted</h2>
                    <p className="text-slate-500 mb-2 font-medium">{auth.currentUser?.email}</p>
                    <p className="text-slate-400 text-sm">Your account is not authorized to access Client Management.</p>
                </div>
            </div>
        );
    }

    // We no longer block the whole app if (accounts.length === 0)
    // The login will be handled "on-demand" in ClientDetail.jsx

    return (
        <ClientPermsContext.Provider value={{ perms, userRole, accounts, instance }}>
            <div className="client-management-container bg-slate-50 min-h-screen">
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/samples" element={perms.view_samples ? <SampleManagement /> : <Navigate to="/clients" />} />
                    <Route path="/settings" element={perms.manage_settings ? <Settings /> : <Navigate to="/clients" />} />
                    <Route path="/admin" element={perms.manage_permissions ? <Admin /> : <Navigate to="/clients" />} />
                    <Route path="/:clientId" element={<ClientDetail />} />
                </Routes>
            </div>
        </ClientPermsContext.Provider>
    );
}