import React from "react";
import { Routes, Route, Link, Navigate } from "react-router-dom"; 
// Note: We use relative links now, no duplicate BrowserRouter or Auth needed!

import Dashboard from "./Dashboard";
import LineDetails from "./LineDetails";
import Inventory from "./Inventory"; 
import "./App.css";

// Define the Base Path for this module
const BASE = "/techs";

function App() {
  return (
    <div className="app-container">
      <header className="main-header" style={{background: '#1e293b', padding: '15px 20px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div className="logo">
          <Link to={`${BASE}`} style={{color:'white', textDecoration:'none', fontSize:'18px', fontWeight:'bold', display:'flex', alignItems:'center', gap: 10}}>
            Make USA <span className="tag" style={{background:'#2563eb', padding:'2px 8px', borderRadius:'4px', fontSize:'12px'}}>Technicians</span>
          </Link>
        </div>
        
        <div className="user-menu" style={{display:'flex', gap:'20px'}}>
          {/* NAV LINKS - Notice we don't need 'to="/techs/..."', relative works too if set up right, 
              but using BASE is safer for sub-apps */}
          <Link to={`${BASE}`} style={{color: '#cbd5e1', textDecoration:'none', fontWeight: 500}}>Lines</Link>
          <Link to={`${BASE}/inventory`} style={{color: '#cbd5e1', textDecoration:'none', fontWeight: 500}}>Inventory</Link>
          
          <span className="divider" style={{opacity:0.3, color:'white'}}>|</span>
          
          {/* We rely on the Main App for actual logout, but you can link back to Home */}
          <Link to="/" style={{color: '#ef4444', textDecoration:'none', fontWeight:'bold'}}>Exit</Link>
        </div>
      </header>

      <div className="main-content" style={{padding: '20px'}}>
        <Routes>
          {/* Note: Paths are relative to /techs */}
          <Route path="" element={<Dashboard />} />
          <Route path="line/:id" element={<LineDetails />} />
          <Route path="inventory" element={<Inventory />} />
          
          {/* Fallback */}
          <Route path="*" element={<Navigate to={`${BASE}`} />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;