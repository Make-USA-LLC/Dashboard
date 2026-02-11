import React, { useEffect, useState } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import Dashboard from './Dashboard';
import Login from './Login';
import Admin from './Admin';
import NotFound from './NotFound';
import AgentManagement from './AgentManagement';
import Bonuses from './Bonuses';
import BonusReports from './BonusReports';
import EmployeePortal from './EmployeePortal';
import Commisions from './Commisions';
import AgentPortal from './AgentPortal';
import AgentReports from './AgentReports';
import Kiosk from './Kiosk';
import Logout from './Logout';
import ManualIngest from './manual_ingest';
import ProductionInput from './ProductionInput';
import ProjectOptions from './ProjectOptions';
import FinanceInput from './FinanceInput';
import FinanceSetup from './FinanceSetup';
import FinancialReport from './FinancialReport';
import IpadControl from './iPad';
import ProjectSearch from './ProjectSearch';
import ArchiveUpload from './ArchiveUpload';
import StaffManagement from './StaffManagement';
import ProjectSummary from './ProjectSummary';
import UpcomingProjects from './UpcomingProjects';
import Workers from './Workers';
import { auth, onAuthStateChanged, db, doc, getDoc, setDoc, signOut } from './firebase_config.jsx';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // 1. DETERMINE DOMAIN CONTEXT
  const host = window.location.hostname;
  const isEmployeeDomain = host.includes("portal.make"); 
  const isAgentDomain = host.includes("agent") || host.includes("commission");

  // 2. Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        await checkAccess(currentUser);
      } else {
        setUser(null);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const checkAccess = async (currentUser) => {
    const emailKey = currentUser.email.toLowerCase();
    
    // Admin Bypass
    if (emailKey === "daniel.s@makeit.buzz") {
      await setDoc(doc(db, "users", emailKey), { role: "admin", email: emailKey, allowPassword: true }, { merge: true });
      setUser(currentUser);
      setLoading(false);
      return;
    }

    try {
      const userDoc = await getDoc(doc(db, "users", emailKey));
      if (!userDoc.exists()) {
         setUser(null);
      } else {
        const data = userDoc.data();
        const isGoogle = currentUser.providerData.some(p => p.providerId === 'google.com');
        if (!isGoogle && data.allowPassword !== true && data.role !== 'admin') {
            await signOut(auth);
            setUser(null);
        } else {
            setUser(currentUser);
        }
      }
    } catch (err) {
      console.error("Login Check Error", err);
      setUser(null);
    }
    setLoading(false);
  };

  if (loading) return <div style={{color:'white', background:'#1e3c72', height:'100vh', display:'flex', justifyContent:'center', alignItems:'center'}}>Loading System...</div>;

  const DashboardGuard = ({ children }) => {
      if (!user) return <Login type="admin" />;
      return children;
  };

  return (
    <Routes>
      {/* --- PUBLIC / PORTAL ROUTES (Keep at Root) --- */}
      {/* These must be absolute paths because they are outside the dashboard scope */}
      <Route path="/kiosk" element={<Kiosk />} />
      <Route path="/kiosk.html" element={<Kiosk />} />
      <Route path="/logout" element={<Logout />} />
      
      {/* Portals */}
      <Route path="/employee-portal" element={<EmployeePortal />} />
      <Route path="/agent-portal" element={<AgentPortal />} />

      {/* Root Redirection for Portals */}
      <Route path="/" element={
          isEmployeeDomain ? <EmployeePortal /> :
          isAgentDomain ? <AgentPortal /> :
          <Navigate to="/dashboard" replace />
      } />

      {/* --- DASHBOARD INTERNAL ROUTES --- 
          Since this App component is mounted at "/dashboard/*" by the Root App,
          we use RELATIVE paths here. (e.g., path="admin" becomes /dashboard/admin)
      */}
      
      {/* Main Dashboard View (at /dashboard/) */}
      <Route index element={<DashboardGuard><Dashboard /></DashboardGuard>} />
      
      {/* Fix for the "dashboard/dashboard" issue - Redirect relative 'dashboard' back to index */}
      <Route path="dashboard" element={<Navigate to="/dashboard" replace />} />

      {/* Management */}
      <Route path="admin" element={<DashboardGuard><Admin /></DashboardGuard>} />
      <Route path="workers" element={<DashboardGuard><Workers /></DashboardGuard>} />
      <Route path="staff-management" element={<DashboardGuard><StaffManagement /></DashboardGuard>} />
      <Route path="agent-management" element={<DashboardGuard><AgentManagement /></DashboardGuard>} />

      {/* Finance */}
      <Route path="manual-ingest" element={<DashboardGuard><ManualIngest /></DashboardGuard>} />
      <Route path="production-input" element={<DashboardGuard><ProductionInput /></DashboardGuard>} />
      <Route path="finance-input" element={<DashboardGuard><FinanceInput /></DashboardGuard>} />
      <Route path="financial-report" element={<DashboardGuard><FinancialReport /></DashboardGuard>} />
      <Route path="finance-setup" element={<DashboardGuard><FinanceSetup /></DashboardGuard>} />
      <Route path="bonuses" element={<DashboardGuard><Bonuses /></DashboardGuard>} />
      <Route path="bonus-reports" element={<DashboardGuard><BonusReports /></DashboardGuard>} />
      <Route path="commisions" element={<DashboardGuard><Commisions /></DashboardGuard>} />
      <Route path="agent-reports" element={<DashboardGuard><AgentReports /></DashboardGuard>} />

      {/* Projects & Queue */}
      <Route path="project-search" element={<DashboardGuard><ProjectSearch /></DashboardGuard>} />
      <Route path="upload" element={<DashboardGuard><ArchiveUpload /></DashboardGuard>} />
      <Route path="upcoming-projects" element={<DashboardGuard><UpcomingProjects /></DashboardGuard>} />
      <Route path="project-summary" element={<DashboardGuard><ProjectSummary /></DashboardGuard>} />
      <Route path="project-options" element={<DashboardGuard><ProjectOptions /></DashboardGuard>} />

      {/* iPads */}
      <Route path="ipad-control/:id" element={<DashboardGuard><IpadControl /></DashboardGuard>} />

      {/* Fallback */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;