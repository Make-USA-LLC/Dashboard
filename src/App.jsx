import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase_config';
import { 
  Users, 
  Wrench, 
  Tablet, 
  Warehouse, 
  ShieldAlert, 
  LogOut,
  Activity,
  Package,
  Factory,        
  ClipboardCheck,  
  FlaskConical    // NEW Icon for Blending
} from 'lucide-react'; 

import DomainRouter from './components/DomainRouter';
import LinksManager from './LinksManager';

import { RoleProvider, useRole } from './hooks/useRole.jsx';
import RoleRoute from './components/RoleRoute.jsx';

// App Imports
import HRApp from './HR/App'; 
import TechApp from './Techs/App'; 
import DashboardApp from './Dashboard/App';
import Kiosk from './Dashboard/Kiosk';
import EmployeePortal from './Dashboard/EmployeePortal'; 
import AgentPortal from './Dashboard/AgentPortal';
import ShedApp from './Shed/App';
import MasterAdmin from './MasterAdmin'; 
import ReportsApp from './Machines/App'; 
import ShipmentApp from './Shipment/App'; 
import ProductionApp from './Production/App'; 
import QCApp from './QC/App';                 
import BlendingApp from './Blending/App';     // NEW Import

import Login from './Login'; 

function SelectionGrid({ user }) {
  const { checkAccess, loading } = useRole();

  if (loading) return <div style={{padding: '40px', textAlign: 'center'}}>Syncing Permissions...</div>;

  return (
    <div style={{ padding: '40px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{marginBottom: 40}}>
        <h1 style={{ color: '#0f172a', marginBottom: 5, fontSize: '28px' }}>Welcome, {user?.displayName?.split(" ")[0]}</h1>
        <p style={{ color: '#64748b' }}>Select an application to launch</p>
      </div>
       
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 25 }}>
        
        {/* HR Platform */}
        {checkAccess('hr', 'dashboard', 'view') && (
          <Link to="/hr" style={cardStyle}>
            <div style={{...iconBox, background: '#dbeafe', color: '#2563eb'}}>
              <Users size={32} />
            </div>
            <div><div style={titleStyle}>HR Platform</div></div>
          </Link>
        )}
        
        {/* Production Management */}
        {checkAccess('production', 'management', 'view') && (
          <Link to="/production" style={cardStyle}>
            <div style={{...iconBox, background: '#dcfce7', color: '#16a34a'}}>
              <Factory size={32} />
            </div>
            <div><div style={titleStyle}>Production Manager</div></div>
          </Link>
        )}

        {/* Blending Lab (NEW) */}
        {checkAccess('blending', 'lab', 'view') && (
          <Link to="/blending" style={cardStyle}>
            <div style={{...iconBox, background: '#ede9fe', color: '#8b5cf6'}}>
              <FlaskConical size={32} />
            </div>
            <div><div style={titleStyle}>Blending Lab</div></div>
          </Link>
        )}

        {/* QC Module */}
        {checkAccess('qc', 'module', 'view') && (
          <Link to="/qc" style={cardStyle}>
            <div style={{...iconBox, background: '#fce7f3', color: '#be185d'}}>
              <ClipboardCheck size={32} />
            </div>
            <div><div style={titleStyle}>QC Module</div></div>
          </Link>
        )}

        {/* iPad Dashboard */}
        {checkAccess('ipad', 'fleet', 'view') && (
          <Link to="/dashboard" style={cardStyle}>
            <div style={{...iconBox, background: '#f3e8ff', color: '#9333ea'}}>
              <Tablet size={32} />
            </div>
            <div><div style={titleStyle}>iPad Dashboard</div></div>
          </Link>
        )}

        {/* Technicians */}
        {checkAccess('techs', 'inventory', 'view') && (
          <Link to="/techs" style={cardStyle}>
            <div style={{...iconBox, background: '#dcfce7', color: '#16a34a'}}>
              <Wrench size={32} />
            </div>
            <div><div style={titleStyle}>Technicians</div></div>
          </Link>
        )}

        {/* Shed Inventory */}
        {checkAccess('production', 'shed', 'view') && (
          <Link to="/shed" style={cardStyle}>
            <div style={{...iconBox, background: '#ffedd5', color: '#ea580c'}}>
              <Warehouse size={32} />
            </div>
            <div><div style={titleStyle}>Shed Inventory</div></div>
          </Link>
        )}

        {/* SHIPMENT BILLING */}
        {checkAccess('shipment', 'app', 'view') && (
          <Link to="/shipments" style={cardStyle}>
            <div style={{...iconBox, background: '#e0f2fe', color: '#0284c7'}}>
              <Package size={32} />
            </div>
            <div><div style={titleStyle}>Shipment Billing</div></div>
          </Link>
        )}

        {/* Machine Reports */}
        {checkAccess('machines', 'analytics', 'view') && (
          <Link to="/reports" style={cardStyle}>
            <div style={{...iconBox, background: '#fee2e2', color: '#ef4444'}}>
              <Activity size={32} />
            </div>
            <div><div style={titleStyle}>Machine & QC Reports</div></div>
          </Link>
        )}

        {/* MASTER ADMIN */}
        {checkAccess('admin', 'panel', 'view') && (
          <Link to="/admin" style={{...cardStyle, border: '2px solid #0f172a'}}>
            <div style={{...iconBox, background: '#0f172a', color: 'white'}}>
              <ShieldAlert size={32} />
            </div>
            <div><div style={titleStyle}>Master Admin</div></div>
          </Link>
        )}

      </div>
    </div>
  );
}

function ProtectedMainApp() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  // Pull the global access check and role loading state
  const { loading: roleLoading, hasAnyAccess } = useRole();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Wait for BOTH Firebase Auth AND Firestore Roles to load completely
  if (authLoading || (user && roleLoading)) {
    return <div style={{height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', color: '#64748b'}}>Syncing Secure Profile...</div>;
  }
  
  // If they aren't logged in at all, show the Login page
  if (!user) return <Login />;

  // BLOCK UNAUTHORIZED USERS
  if (!hasAnyAccess) {
    return (
      <div style={{height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f8fafc', fontFamily: 'Segoe UI, sans-serif'}}>
        <div style={{background:'white', padding:'40px', borderRadius:'16px', textAlign:'center', boxShadow:'0 4px 20px rgba(0,0,0,0.08)', maxWidth:'400px'}}>
          <ShieldAlert size={48} color="#ef4444" style={{marginBottom:'20px', display:'inline-block'}} />
          <h2 style={{color:'#1e293b', marginTop:0, marginBottom:'10px', fontSize: '22px'}}>Access Denied</h2>
          <p style={{color:'#64748b', marginBottom:'25px', fontSize: '15px', lineHeight: '1.5'}}>
            Your account is authenticated, but you do not have permission to access any modules. Please contact your system administrator.
          </p>
          <button 
            onClick={() => signOut(auth)} 
            style={{background:'#0f172a', color:'white', border:'none', padding:'12px 24px', borderRadius:'8px', cursor:'pointer', fontWeight:'bold', width:'100%', fontSize: '15px'}}
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'Segoe UI, sans-serif', minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
      {/* Header */}
      <div style={{background:'#1e293b', padding:'15px 30px', display:'flex', justifyContent:'space-between', alignItems:'center', color: 'white'}}>
        <Link to="/" style={{textDecoration: 'none', color: 'white', fontWeight:'bold', fontSize: '18px', display:'flex', alignItems:'center', gap:'10px'}}>
          <ShieldAlert size={20} />
          Make USA | Command Center
        </Link>
        <button 
          onClick={() => signOut(auth)} 
          style={{background:'rgba(255,255,255,0.1)', color:'white', border:'none', padding:'8px 16px', borderRadius:'6px', cursor:'pointer', display:'flex', alignItems:'center', gap:'8px'}}
        >
          <LogOut size={16} /> Sign Out
        </button>
      </div>

      <Routes>
        <Route path="/" element={<SelectionGrid user={user} />} />
        
        {/* MASTER ADMIN ROUTES */}
        <Route path="/admin" element={<RoleRoute system="admin" feature="panel"><MasterAdmin /></RoleRoute>} />
        <Route path="/admin/links" element={<RoleRoute system="admin" feature="panel"><LinksManager /></RoleRoute>} />
        
        {/* SUB-APP ROUTES */}
        <Route path="/hr/*" element={<RoleRoute system="hr" feature="dashboard"><HRApp /></RoleRoute>} />
        <Route path="/techs/*" element={<RoleRoute system="techs" feature="inventory"><TechApp /></RoleRoute>} />
        <Route path="/dashboard/*" element={<RoleRoute system="ipad" feature="fleet"><DashboardApp /></RoleRoute>} />
        <Route path="/shed/*" element={<RoleRoute system="production" feature="shed"><ShedApp /></RoleRoute>} />
        <Route path="/shipments/*" element={<RoleRoute system="shipment" feature="app"><ShipmentApp /></RoleRoute>} />
        
        {/* NEW ROUTES */}
        <Route path="/production/*" element={<RoleRoute system="production" feature="management"><ProductionApp /></RoleRoute>} />
        <Route path="/blending/*" element={<RoleRoute system="blending" feature="lab"><BlendingApp /></RoleRoute>} /> 
        <Route path="/qc/*" element={<RoleRoute system="qc" feature="module"><QCApp /></RoleRoute>} />

        {/* REPORTS */}
        <Route path="/reports/*" element={<RoleRoute system="machines" feature="analytics"><ReportsApp /></RoleRoute>} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <RoleProvider>
      <BrowserRouter>
        <DomainRouter />
        <Routes>
          <Route path="/kiosk" element={<Navigate to="/dashboard/kiosk" replace />} />
          <Route path="/dashboard/kiosk" element={<Kiosk />} />
          
          <Route path="/dashboard/employee-portal" element={<EmployeePortal />} />
          <Route path="/employee-portal" element={<EmployeePortal />} />

          <Route path="/dashboard/agent-portal" element={<AgentPortal />} />
          <Route path="/agent-portal" element={<AgentPortal />} />

          {/* Protected Area - Catches everything else */}
          <Route path="/*" element={<ProtectedMainApp />} />
        </Routes>
      </BrowserRouter>
    </RoleProvider>
  );
}

// Styles
const cardStyle = { 
  background: 'white', 
  padding: '25px', 
  borderRadius: '16px', 
  textDecoration: 'none', 
  color: '#334155', 
  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)', 
  border: '1px solid #e2e8f0', 
  display: 'flex', 
  alignItems: 'center', 
  gap: '20px', 
  transition: 'transform 0.2s', 
  cursor: 'pointer'
};

const iconBox = { 
  width: '60px', 
  height: '60px', 
  borderRadius: '12px', 
  display: 'flex', 
  alignItems: 'center', 
  justifyContent: 'center', 
  flexShrink: 0 
};

const titleStyle = { 
  fontSize: '18px', 
  fontWeight: '700', 
  color: '#0f172a' 
};