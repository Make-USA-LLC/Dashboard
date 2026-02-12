import React from 'react';
import { Routes, Route, Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useRole, RoleProvider } from './hooks/useRole'; 

// 1. IMPORT YOUR CSS
import './HR.css'; 

// Page Imports
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import EmployeeDetail from './pages/EmployeeDetail';
import Lockers from './pages/Lockers';
import Keys from './pages/Keys';
import Assets from './pages/Assets';
import Reviews from './pages/Reviews';
import Admin from './pages/Admin';
import Logs from './pages/Logs';
import Settings from './pages/Settings'; 
import Schedule from './pages/Schedule'; 

// 2. DEFINE THE BASE PATH
const isSubdomain = window.location.hostname.toLowerCase().startsWith('hr.');
const BASE = isSubdomain ? "" : "/hr"; // If on hr.domain.com, base is root. Else /hr.

// 3. ROLE GUARD
function RoleRoute({ children, resource, action = 'view' }) {
  const { checkAccess, loading } = useRole();
  if (loading) return <div style={{padding:20}}>Verifying permissions...</div>;
  
  if (!checkAccess) return <Navigate to="/" replace />; 

  if (!checkAccess(resource, action)) return <Navigate to={`${BASE}`} replace />;
  
  return children;
}

// --- FIXED: Function name matches usages below ---
function NavBar() {
  const { checkAccess, loading } = useRole();
  const navigate = useNavigate();

  if (loading) return null; 

  const canEmployees = checkAccess('employees', 'view');
  const canSchedule  = checkAccess('schedule', 'view');
  const canReviews   = checkAccess('reviews', 'view');
  const canKeys      = checkAccess('assets_keys', 'view') || checkAccess('assets', 'view');
  const canLockers   = checkAccess('assets_lockers', 'view') || checkAccess('assets', 'view');
  const canAssets    = checkAccess('assets_hardware', 'view') || checkAccess('assets', 'view');
  const canLogs      = checkAccess('logs', 'view') || checkAccess('security', 'view');
  const canSettings  = checkAccess('settings_general', 'view') || checkAccess('settings', 'view');
  const canAdmin     = checkAccess('settings_security', 'edit') || checkAccess('security', 'edit');

  const NavLink = ({ to, children }) => (
    <Link to={`${BASE}${to}`} className="nav-link">
      {children}
    </Link>
  );

  return (
    <nav className="hr-nav">
      <div style={{display: 'flex', alignItems: 'center', gap: '30px'}}>
        <Link to={`${BASE}`} style={{textDecoration:'none', color:'black', fontSize:'20px', fontWeight:'bold'}}>HR Suite</Link>
        <div style={{display:'flex', gap:'20px', fontSize:'15px'}}>
          {canEmployees && <NavLink to="/employees">Staff</NavLink>}
          {canSchedule && <NavLink to="/schedule">Schedule</NavLink>}
          {canReviews && <NavLink to="/reviews">Reviews</NavLink>}
          {canKeys && <NavLink to="/keys">Keys</NavLink>}
          {canLockers && <NavLink to="/lockers">Lockers</NavLink>}
          {canAssets && <NavLink to="/assets">Assets</NavLink>}
          {canLogs && <NavLink to="/logs">Logs</NavLink>}
        </div>
      </div>

      <div style={{display:'flex', gap:'20px', fontSize:'15px', color:'#64748b', alignItems:'center'}}>
        {canSettings && <Link to={`${BASE}/settings`} style={{textDecoration:'none', fontSize:'18px'}}>⚙️</Link>}
        {canAdmin && <NavLink to="/admin">Admin</NavLink>}
        <div style={{width: '1px', height: '15px', background: '#cbd5e1'}}></div>
        <Link to="/" style={{textDecoration:'none', color:'#2563eb', fontWeight:'bold'}}>Exit to Hub</Link>
      </div>
    </nav>
  );
}

export default function App() {
  return (
    // --- FIXED: RoleProvider must wrap everything ---
    <RoleProvider>
      <div style={{minHeight: '100vh', background: '#f8fafc'}}>
        
        {/* Navbar Container */}
        <div style={{maxWidth: '100%', padding: '0 20px', margin: '0 auto'}}>
          <NavBar /> {/* --- FIXED: Capital 'B' to match function name --- */}
        </div>

        {/* Page Content Container */}
        <div style={{
          maxWidth: '100%', 
          margin: '0 auto', 
          padding: '20px'
        }}>
          <Routes>
            <Route path="" element={<Dashboard />} />
            
            <Route path="employees" element={<RoleRoute resource="employees"><Employees /></RoleRoute>} />
            <Route path="employee/:id" element={<RoleRoute resource="employees"><EmployeeDetail /></RoleRoute>} />
            <Route path="schedule" element={<RoleRoute resource="schedule"><Schedule /></RoleRoute>} />
            <Route path="reviews" element={<RoleRoute resource="reviews"><Reviews /></RoleRoute>} />
            <Route path="logs" element={<RoleRoute resource="logs"><Logs /></RoleRoute>} />
            
            <Route path="keys" element={<RoleRoute resource="assets_keys"><Keys /></RoleRoute>} />
            <Route path="lockers" element={<RoleRoute resource="assets_lockers"><Lockers /></RoleRoute>} />
            <Route path="assets" element={<RoleRoute resource="assets_hardware"><Assets /></RoleRoute>} />
            
            <Route path="settings" element={<RoleRoute resource="settings_general"><Settings /></RoleRoute>} />
            <Route path="admin" element={<RoleRoute resource="settings_security" action="edit"><Admin /></RoleRoute>} />
            
            <Route path="*" element={<Navigate to={`${BASE}`} />} />
          </Routes>
        </div>
      </div>
    </RoleProvider>
  );
}