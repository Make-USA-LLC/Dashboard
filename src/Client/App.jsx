import React, { useState, useEffect, createContext } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase_config'; 
import { useMsal } from "@azure/msal-react";
import { ShieldAlert, Lock } from 'lucide-react';

import Dashboard from './Dashboard';
import ClientDetail from './ClientDetail';
import Admin from './Admin';
import SampleManagement from './SampleManagement'; 
import Settings from './Settings';                 

export const ClientPermsContext = createContext(null);

export default function ClientApp() {
    const { instance, accounts } = useMsal();
    const [perms, setPerms] = useState(null);
    const [userRole, setUserRole] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fbUser = auth.currentUser;
        if (!fbUser || !fbUser.email) {
            setLoading(false);
            return;
        }

        const email = fbUser.email.toLowerCase();

        // 1. MASTER ADMIN OVERRIDE
        if (email === 'daniel.s@makeit.buzz') {
            setUserRole('Master Admin');
            setPerms({
                view_clients: true, edit_client_details: true,
                manage_client_status: true, // <-- NEW PERMISSION
                view_w9: true, upload_w9: true,
                view_legal: true, upload_legal: true,
                view_samples: true, manage_samples: true,
                manage_settings: true, manage_permissions: true
            });
            setLoading(false);
            return;
        }

        // 2. LIVE REAL-TIME LISTENERS
        let unsubAccess = () => {};
        let unsubRole = () => {};

        const unsubMaster = onSnapshot(doc(db, "master_admin_access", email), (mSnap) => {
            if (mSnap.exists()) {
                setUserRole('Master Admin');
                setPerms({
                    view_clients: true, edit_client_details: true,
                    manage_client_status: true,
                    view_w9: true, upload_w9: true,
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

    if (!perms) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-50">
                <div className="bg-white p-12 rounded-3xl shadow-xl max-w-md w-full text-center border border-slate-200">
                    <Lock size={60} className="text-red-500 mx-auto mb-6" />
                    <h2 className="text-2xl font-black mb-2 text-slate-900">Access Restricted</h2>
                    <p className="text-slate-500 mb-2 font-medium">{auth.currentUser?.email}</p>
                    <p className="text-slate-400 text-sm">Your Google account is not authorized to access Client Management.</p>
                </div>
            </div>
        );
    }

    if (accounts.length === 0) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-50">
                <div className="bg-white p-12 rounded-3xl shadow-xl max-w-md w-full text-center border border-slate-200">
                    <ShieldAlert size={60} className="text-blue-600 mx-auto mb-6" />
                    <h2 className="text-2xl font-black mb-4">Connect SharePoint</h2>
                    <p className="text-slate-500 mb-8">You are authorized! Please sign in with your company Microsoft account to enable file uploads.</p>
                    <button onClick={() => instance.loginRedirect({ scopes: ["Sites.ReadWrite.All", "Files.ReadWrite.All"], prompt: "select_account" })} className="w-full bg-[#0078d4] text-white font-bold py-4 rounded-2xl hover:bg-[#005a9e] transition-all shadow-lg shadow-blue-100">Connect Microsoft Account</button>
                </div>
            </div>
        );
    }

    return (
        <ClientPermsContext.Provider value={{ perms, userRole, accounts, instance }}>
            <div className="client-management-container bg-slate-50 min-h-screen">
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/samples" element={perms.view_samples ? <SampleManagement /> : <Navigate to="/clients" />} />
                    <Route path="/settings" element={perms.manage_settings ? <Settings /> : <Navigate to="/clients" />} />
                    <Route path="/admin" element={perms.manage_permissions ? <Admin /> : <Navigate to="/clients" />} />
                    <Route path="/:id" element={<ClientDetail />} />
                </Routes>
            </div>
        </ClientPermsContext.Provider>
    );
} 