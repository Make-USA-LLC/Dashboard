import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Pages
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

// Context & Loaders
import Loader from '../components/loader';
import { RoleProvider, useRole } from './hooks/useRole';

const DashboardGuard = ({ children }) => {
    const { user, loading } = useRole();
    
    if (loading) return <div style={{height: '100vh', display: 'flex', alignItems: 'center', background: '#f8fafc'}}><Loader message="Loading Workspace..." /></div>;
    if (!user) return <Login type="admin" />;
    
    return children;
};

function App() {
  const host = window.location.hostname;
  const isEmployeeDomain = host.includes("portal.make"); 
  const isAgentDomain = host.includes("agent") || host.includes("commission");

  return (
    <RoleProvider>
        <Routes>
          {/* --- PUBLIC / PORTAL ROUTES --- */}
          <Route path="/kiosk" element={<Kiosk />} />
          <Route path="/kiosk.html" element={<Kiosk />} />
          <Route path="/logout" element={<Logout />} />
          <Route path="/employee-portal" element={<EmployeePortal />} />
          <Route path="/agent-portal" element={<AgentPortal />} />

          <Route path="/" element={
              isEmployeeDomain ? <EmployeePortal /> :
              isAgentDomain ? <AgentPortal /> :
              <Navigate to="/dashboard" replace />
          } />

          {/* --- DASHBOARD INTERNAL ROUTES --- */}
          <Route index element={<DashboardGuard><Dashboard /></DashboardGuard>} />
          <Route path="dashboard" element={<Navigate to="/" replace />} />
          
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
    </RoleProvider>
  );
}

export default App;