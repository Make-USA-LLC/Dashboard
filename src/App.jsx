import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth } from './firebase_config'; 

// --- ROLE SYSTEM ---
import { RoleProvider, useRole } from './hooks/useRole.jsx';
import RoleRoute from './components/RoleRoute.jsx';

// --- IMPORT SUB-APPS ---
import HRApp from './hr/App'; 
import TechApp from './Techs/App'; 
import DashboardApp from './dashboard/App';
import ShedApp from './shed/App';
// QC App Removed
import MasterAdmin from './Dashboard/Admin'; // The unified admin

function GlobalLogin() {
  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try { await signInWithPopup(auth, provider); } 
    catch (error) { console.error("Login failed", error); }
  };

  return (
    <div style={{height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f8fafc', fontFamily: 'Segoe UI, sans-serif'}}>
      <div style={{background: 'white', padding: '40px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', textAlign: 'center', maxWidth: '400px'}}>
        <h1 style={{marginBottom: '10px', color: '#1e293b'}}>Make USA Master System</h1>
        <button onClick={handleLogin} style={{padding: '12px 24px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer'}}>
          Sign in with Google
        </button>
      </div>
    </div>
  );
}

function RequireAuth({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);
  if (loading) return <div style={{height:'100vh', display:'flex', alignItems:'center', justifyContent:'center'}}>Loading...</div>;
  if (!user) return <GlobalLogin />;
  return children;
}

function SelectionGrid({ user }) {
  const { checkAccess, loading } = useRole();

  if (loading) return <div style={{padding: '40px', textAlign: 'center'}}>Syncing Permissions...</div>;

  return (
    <div style={{ padding: '40px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{marginBottom: 40}}>
        <h1 style={{ color: '#0f172a', marginBottom: 5, fontSize: '28px' }}>Welcome, {user?.displayName?.split(" ")[0]}</h1>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 25 }}>
        
        {/* HR - Needs 'view' on 'dashboard' feature within 'hr' system */}
        {checkAccess('hr', 'dashboard', 'view') && (
          <Link to="/hr" style={cardStyle}>
            <div style={{...iconBox, background: '#dbeafe', color: '#2563eb'}}>👥</div>
            <div><div style={titleStyle}>HR Platform</div></div>
          </Link>
        )}
        
        {/* Techs - Needs 'view' on 'inventory' feature within 'techs' system */}
        {checkAccess('techs', 'inventory', 'view') && (
          <Link to="/techs" style={cardStyle}>
            <div style={{...iconBox, background: '#dcfce7', color: '#16a34a'}}>🔧</div>
            <div><div style={titleStyle}>Technicians</div></div>
          </Link>
        )}

        {/* Dashboard - Needs 'view' on 'fleet' feature within 'ipad' system */}
        {checkAccess('ipad', 'fleet', 'view') && (
          <Link to="/dashboard" style={cardStyle}>
            <div style={{...iconBox, background: '#f3e8ff', color: '#9333ea'}}>📱</div>
            <div><div style={titleStyle}>iPad Dashboard</div></div>
          </Link>
        )}

        {/* QC Section Removed */}

        {/* Shed - Needs 'view' on 'shed' feature within 'production' system */}
        {checkAccess('production', 'shed', 'view') && (
          <Link to="/shed" style={cardStyle}>
            <div style={{...iconBox, background: '#ffedd5', color: '#ea580c'}}>🏚️</div>
            <div><div style={titleStyle}>Shed Inventory</div></div>
          </Link>
        )}

      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  useEffect(() => onAuthStateChanged(auth, setUser), []);

  return (
    <RoleProvider>
      <BrowserRouter>
        <RequireAuth>
          <div style={{ fontFamily: 'Segoe UI, sans-serif', minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
            <div style={{background:'#1e293b', padding:'15px 30px', display:'flex', justifyContent:'space-between', alignItems:'center', color: 'white'}}>
              <Link to="/" style={{textDecoration: 'none', color: 'white', fontWeight:'bold', fontSize: '18px'}}>Make USA | Command Center</Link>
              <button onClick={() => signOut(auth)} style={{background:'rgba(255,255,255,0.1)', color:'white', border:'none', padding:'8px 16px', borderRadius:'6px', cursor:'pointer'}}>Sign Out</button>
            </div>

            <Routes>
              <Route path="/" element={<SelectionGrid user={user} />} />
              <Route path="/admin/*" element={<RoleRoute system="admin" feature="panel"><MasterAdmin /></RoleRoute>} />
              <Route path="/hr/*" element={<RoleRoute system="hr" feature="dashboard"><HRApp /></RoleRoute>} />
              <Route path="/techs/*" element={<RoleRoute system="techs" feature="inventory"><TechApp /></RoleRoute>} />
              <Route path="/dashboard/*" element={<RoleRoute system="ipad" feature="fleet"><DashboardApp /></RoleRoute>} />
              {/* QC Route Removed */}
              <Route path="/shed/*" element={<RoleRoute system="production" feature="shed"><ShedApp /></RoleRoute>} />
            </Routes>
          </div>
        </RequireAuth>
      </BrowserRouter>
    </RoleProvider>
  );
}

const cardStyle = { background: 'white', padding: '25px', borderRadius: '16px', textDecoration: 'none', color: '#334155', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '20px' };
const iconBox = { width: '60px', height: '60px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '30px', flexShrink: 0 };
const titleStyle = { fontSize: '18px', fontWeight: '700', color: '#0f172a' };