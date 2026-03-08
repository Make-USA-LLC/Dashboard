import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase_config';
import { 
  Users, Wrench, Tablet, Warehouse, ShieldAlert, LogOut,
  Activity, Package, Factory, ClipboardCheck, FlaskConical, Wifi
} from 'lucide-react'; 

import DomainRouter from './components/DomainRouter';
import LinksManager from './LinksManager';
import { RoleProvider, useRole } from './hooks/useRole.jsx';
import RoleRoute from './components/RoleRoute.jsx';

import HRApp from './HR/App'; 
import TechApp from './Techs/App'; 
import DashboardApp from './Dashboard/App';
import Kiosk from './Dashboard/Kiosk';
import EmployeePortal from './Dashboard/EmployeePortal'; 
import AgentPortal from './Dashboard/AgentPortal';
import ShedApp from './Shed/App';
import MasterAdmin from './MasterAdmin'; 
import ReportsApp from './Machines & QC Reports/App'; 
import ShipmentApp from './Shipment/App'; 
import ProductionApp from './Production/App'; 
import QCApp from './QC/App';                 
import BlendingApp from './Blending/App';

import GuestAccess from './wifi/GuestAccess';
import WifiApp from './wifi/App'; 

import Login from './Login'; 

function SelectionGrid({ user }) {
  const { checkAccess, loading } = useRole();

  if (loading) return <div style={{padding: '40px', textAlign: 'center'}}>Syncing Permissions...</div>;

  return (
    <div style={{ padding: '40px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{marginBottom: 40}}>
        <h1 style={{ color: '#0f172a', marginBottom: 5, fontSize: '28px' }}>Welcome, {user?.displayName?.split(" ")[0] || "User"}</h1>
        <p style={{ color: '#64748b' }}>Select an application to launch</p>
      </div>
       
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 25 }}>
        
        {checkAccess('hr', 'dashboard', 'view') && (
          <Link to="/hr" style={cardStyle}>
            <div style={{...iconBox, background: '#dbeafe', color: '#2563eb'}}><Users size={32} /></div>
            <div><div style={titleStyle}>HR Platform</div></div>
          </Link>
        )}
        
        {checkAccess('production', 'management', 'view') && (
          <Link to="/production" style={cardStyle}>
            <div style={{...iconBox, background: '#dcfce7', color: '#16a34a'}}><Factory size={32} /></div>
            <div><div style={titleStyle}>Production Manager</div></div>
          </Link>
        )}

        {checkAccess('blending', 'lab', 'view') && (
          <Link to="/blending" style={cardStyle}>
            <div style={{...iconBox, background: '#ede9fe', color: '#8b5cf6'}}><FlaskConical size={32} /></div>
            <div><div style={titleStyle}>Blending Lab</div></div>
          </Link>
        )}

        {checkAccess('qc', 'module', 'view') && (
          <Link to="/qc" style={cardStyle}>
            <div style={{...iconBox, background: '#fce7f3', color: '#be185d'}}><ClipboardCheck size={32} /></div>
            <div><div style={titleStyle}>QC Module</div></div>
          </Link>
        )}

        {checkAccess('ipad', 'fleet', 'view') && (
          <Link to="/dashboard" style={cardStyle}>
            <div style={{...iconBox, background: '#f3e8ff', color: '#9333ea'}}><Tablet size={32} /></div>
            <div><div style={titleStyle}>iPad Dashboard</div></div>
          </Link>
        )}

        {checkAccess('techs', 'inventory', 'view') && (
          <Link to="/techs" style={cardStyle}>
            <div style={{...iconBox, background: '#dcfce7', color: '#16a34a'}}><Wrench size={32} /></div>
            <div><div style={titleStyle}>Technicians</div></div>
          </Link>
        )}

        {checkAccess('production', 'shed', 'view') && (
          <Link to="/shed" style={cardStyle}>
            <div style={{...iconBox, background: '#ffedd5', color: '#ea580c'}}><Warehouse size={32} /></div>
            <div><div style={titleStyle}>Shed Inventory</div></div>
          </Link>
        )}

        {checkAccess('shipment', 'app', 'view') && (
          <Link to="/shipments" style={cardStyle}>
            <div style={{...iconBox, background: '#e0f2fe', color: '#0284c7'}}><Package size={32} /></div>
            <div><div style={titleStyle}>Shipment Billing</div></div>
          </Link>
        )}

        {checkAccess('reports', 'analytics', 'view') && (
          <Link to="/reports" style={cardStyle}>
            <div style={{...iconBox, background: '#fee2e2', color: '#ef4444'}}><Activity size={32} /></div>
            <div><div style={titleStyle}>Machine & QC Reports</div></div>
          </Link>
        )}

        {checkAccess('wifi', 'portal', 'view') && (
          <Link to="/wifi" style={cardStyle}>
            <div style={{...iconBox, background: '#ccfbf1', color: '#059669'}}><Wifi size={32} /></div>
            <div><div style={titleStyle}>Wi-Fi Management</div></div>
          </Link>
        )}

        {checkAccess('admin', 'panel', 'view') && (
          <Link to="/admin" style={{...cardStyle, border: '2px solid #0f172a'}}>
            <div style={{...iconBox, background: '#0f172a', color: 'white'}}><ShieldAlert size={32} /></div>
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
  const { loading: roleLoading, hasAnyAccess } = useRole();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (authLoading || (user && roleLoading)) {
    return <div style={{height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', color: '#64748b'}}>Syncing Secure Profile...</div>;
  }
  
  if (!user) return <Login />;

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
      <div style={{background:'#1e293b', padding:'15px 30px', display:'flex', justifyContent:'space-between', alignItems:'center', color: 'white'}}>
        <Link to="/" style={{textDecoration: 'none', color: 'white', fontWeight:'bold', fontSize: '18px', display:'flex', alignItems:'center', gap:'10px'}}>
          <ShieldAlert size={20} /> Make USA | Command Center
        </Link>
        <button onClick={() => signOut(auth)} style={{background:'rgba(255,255,255,0.1)', color:'white', border:'none', padding:'8px 16px', borderRadius:'6px', cursor:'pointer', display:'flex', alignItems:'center', gap:'8px'}}>
          <LogOut size={16} /> Sign Out
        </button>
      </div>

      <Routes>
        <Route path="/" element={<SelectionGrid user={user} />} />
        
        <Route path="/admin" element={<RoleRoute system="admin" feature="panel"><MasterAdmin /></RoleRoute>} />
        <Route path="/admin/links" element={<RoleRoute system="admin" feature="panel"><LinksManager /></RoleRoute>} />
        <Route path="/hr/*" element={<RoleRoute system="hr" feature="dashboard"><HRApp /></RoleRoute>} />
        <Route path="/techs/*" element={<RoleRoute system="techs" feature="inventory"><TechApp /></RoleRoute>} />
        <Route path="/dashboard/*" element={<RoleRoute system="ipad" feature="fleet"><DashboardApp /></RoleRoute>} />
        <Route path="/shed/*" element={<RoleRoute system="production" feature="shed"><ShedApp /></RoleRoute>} />
        <Route path="/shipments/*" element={<RoleRoute system="shipment" feature="app"><ShipmentApp /></RoleRoute>} />
        <Route path="/production/*" element={<RoleRoute system="production" feature="management"><ProductionApp /></RoleRoute>} />
        <Route path="/blending/*" element={<RoleRoute system="blending" feature="lab"><BlendingApp /></RoleRoute>} /> 
        <Route path="/qc/*" element={<RoleRoute system="qc" feature="module"><QCApp /></RoleRoute>} />
        <Route path="/reports/*" element={<RoleRoute system="reports" feature="analytics"><ReportsApp /></RoleRoute>} />
        
        {/* WI-FI PROPERLY SECURED WITH ROLEROUTE AGAIN */}
        <Route path="/wifi/*" element={<RoleRoute system="wifi" feature="portal"><WifiApp /></RoleRoute>} />
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

          <Route path="/guest-wifi" element={<GuestAccess />} />

          <Route path="/*" element={<ProtectedMainApp />} />
        </Routes>
      </BrowserRouter>
    </RoleProvider>
  );
}

const cardStyle = { background: 'white', padding: '25px', borderRadius: '16px', textDecoration: 'none', color: '#334155', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '20px', transition: 'transform 0.2s', cursor: 'pointer' };
const iconBox = { width: '60px', height: '60px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
const titleStyle = { fontSize: '18px', fontWeight: '700', color: '#0f172a' };