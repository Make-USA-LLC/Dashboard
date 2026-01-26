import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth } from './firebase_config'; 

// --- IMPORT SUB-APPS ---
import HRApp from './hr/App'; 
import TechApp from './Techs/App'; 
import DashboardApp from './dashboard/App';
import ShedApp from './shed/App';
import QCApp from './qc/App';

// --- GLOBAL LOGIN SCREEN ---
function GlobalLogin() {
  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  return (
    <div style={{height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f8fafc', fontFamily: 'Segoe UI, sans-serif'}}>
      <div style={{background: 'white', padding: '40px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', textAlign: 'center', maxWidth: '400px'}}>
        <h1 style={{marginBottom: '10px', color: '#1e293b'}}>Make USA Master System</h1>
        <p style={{color: '#64748b', marginBottom: '30px'}}>Please sign in to access the portal.</p>
        <button onClick={handleLogin} style={{padding: '12px 24px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer'}}>
          Sign in with Google
        </button>
      </div>
    </div>
  );
}

// --- SECURITY WRAPPER ---
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

  if (loading) return <div style={{height:'100vh', display:'flex', alignItems:'center', justifyContent:'center'}}>Loading System...</div>;
  if (!user) return <GlobalLogin />;
  return children;
}

// --- MAIN ROUTER ---
export default function App() {
  const [user, setUser] = useState(null);
  useEffect(() => onAuthStateChanged(auth, setUser), []);

  return (
    <BrowserRouter>
      <RequireAuth>
        <div style={{ fontFamily: 'Segoe UI, sans-serif', minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
          
{/* Top Bar */}
          <div style={{background:'#1e293b', padding:'15px 30px', display:'flex', justifyContent:'space-between', alignItems:'center', color: 'white'}}>
            
            {/* LINK BACK TO HOME */}
            <Link to="/" style={{textDecoration: 'none', color: 'white', fontWeight:'bold', fontSize: '18px', display:'flex', alignItems:'center', gap: '10px', cursor: 'pointer'}}>
              <span>Make USA</span> <span style={{opacity: 0.5}}>|</span> <span>Command Center</span>
            </Link>

            <div style={{display:'flex', alignItems:'center', gap:'20px', fontSize:'14px'}}>
              <span style={{opacity: 0.8}}>{user?.email}</span>
              <button onClick={() => signOut(auth)} style={{background:'rgba(255,255,255,0.1)', color:'white', border:'none', padding:'8px 16px', borderRadius:'6px', cursor:'pointer', fontWeight:'bold'}}>Sign Out</button>
            </div>
          </div>

          <Routes>
            {/* --- LANDING HUB (THE MAIN ADMIN CENTER) --- */}
            <Route path="/" element={
              <div style={{ padding: '40px', maxWidth: 1200, margin: '0 auto' }}>
                <div style={{marginBottom: 40}}>
                  <h1 style={{ color: '#0f172a', marginBottom: 5, fontSize: '28px' }}>Welcome, {user?.displayName?.split(" ")[0]}</h1>
                  <p style={{ color: '#64748b', fontSize: '16px' }}>Select a module to manage operations.</p>
                </div>
                
                {/* GRID LAYOUT */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 25 }}>
                  
                  {/* 1. HR Platform */}
                  <Link to="/hr" style={cardStyle}>
                    <div style={{...iconBox, background: '#dbeafe', color: '#2563eb'}}>👥</div>
                    <div>
                      <div style={titleStyle}>HR Platform</div>
                      <div style={descStyle}>Staff, Payroll, Reviews, & Access</div>
                    </div>
                  </Link>
                  
                  {/* 2. Technicians */}
                  <Link to="/techs" style={cardStyle}>
                    <div style={{...iconBox, background: '#dcfce7', color: '#16a34a'}}>🔧</div>
                    <div>
                      <div style={titleStyle}>Technicians</div>
                      <div style={descStyle}>Line Maintenance & Repairs</div>
                    </div>
                  </Link>

                  {/* 3. iPad Dashboard */}
                  <Link to="/dashboard" style={cardStyle}>
                    <div style={{...iconBox, background: '#f3e8ff', color: '#9333ea'}}>📱</div>
                    <div>
                      <div style={titleStyle}>iPad Dashboard</div>
                      <div style={descStyle}>Production Floor Interface</div>
                    </div>
                  </Link>

                  {/* 4. QC System (NEW) */}
                  <Link to="/qc" style={cardStyle}>
                    <div style={{...iconBox, background: '#fee2e2', color: '#dc2626'}}>🛡️</div>
                    <div>
                      <div style={titleStyle}>Quality Control</div>
                      <div style={descStyle}>Inspections & Defect Tracking</div>
                    </div>
                  </Link>

                  {/* 5. Shed Inventory (NEW) */}
                  <Link to="/shed" style={cardStyle}>
                    <div style={{...iconBox, background: '#ffedd5', color: '#ea580c'}}>🏚️</div>
                    <div>
                      <div style={titleStyle}>Shed Inventory</div>
                      <div style={descStyle}>Consumable Storage & Stock</div>
                    </div>
                  </Link>

                </div>
              </div>
            } />

            {/* --- SUB-APP ROUTES --- */}
            <Route path="/hr/*" element={<HRApp />} />
            <Route path="/techs/*" element={<TechApp />} />
            <Route path="/dashboard/*" element={<DashboardApp />} />
            
            {/* PLACEHOLDERS FOR NEW APPS (So they don't crash) */}
<Route path="/qc/*" element={<QCApp />} />              
<Route path="/shed/*" element={<ShedApp />} />
          </Routes>
        </div>
      </RequireAuth>
    </BrowserRouter>
  );
}

// --- STYLES ---
const cardStyle = {
  background: 'white', 
  padding: '25px', 
  borderRadius: '16px',
  textDecoration: 'none', 
  color: '#334155',
  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
  border: '1px solid #e2e8f0',
  transition: 'transform 0.2s, box-shadow 0.2s', 
  display: 'flex',
  alignItems: 'center',
  gap: '20px',
  cursor: 'pointer'
};

const iconBox = {
  width: '60px',
  height: '60px',
  borderRadius: '12px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '30px',
  fontWeight: 'bold',
  flexShrink: 0
};

const titleStyle = {
  fontSize: '18px',
  fontWeight: '700',
  color: '#0f172a',
  marginBottom: '5px'
};

const descStyle = {
  fontSize: '14px',
  color: '#64748b'
};