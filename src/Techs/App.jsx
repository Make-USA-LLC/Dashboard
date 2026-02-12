import React, { useState, useEffect } from "react";
import { Routes, Route, Link, Navigate } from "react-router-dom"; 
import { auth } from "../firebase_config"; // Import auth to get the user
import Dashboard from "./Dashboard";
import LineDetails from "./LineDetails";
import Inventory from "./Inventory"; 
import "./App.css";

// Define the Base Path for this module
const BASE = "/techs";

function App() {
  // Get the current user directly from Auth (handled by parent App)
  const user = auth.currentUser;
  const username = user?.displayName || user?.email || 'Technician';

  return (
    <div className="app-container">
      <header className="main-header" style={{background: '#1e293b', padding: '15px 20px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div className="logo">
          <Link to={`${BASE}`} style={{color:'white', textDecoration:'none', fontSize:'18px', fontWeight:'bold', display:'flex', alignItems:'center', gap: 10}}>
            Make USA <span className="tag" style={{background:'#16a34a', padding:'2px 8px', borderRadius:'4px', fontSize:'12px'}}>Technicians</span>
          </Link>
        </div>
        
        <div className="user-menu" style={{display:'flex', gap:'20px', alignItems: 'center'}}>
          {/* Internal Navigation */}
          <Link to={`${BASE}`} style={{color: '#cbd5e1', textDecoration:'none', fontWeight: 500}}>Lines</Link>
          <Link to={`${BASE}/inventory`} style={{color: '#cbd5e1', textDecoration:'none', fontWeight: 500}}>Inventory</Link>
          
          <span className="divider" style={{opacity:0.3, color:'white'}}>|</span>
          
          {/* User Name Display */}
          <span style={{color: '#94a3b8', fontSize: '14px', fontStyle: 'italic'}}>
            {username}
          </span>
          
          {/* Exit Button */}
          <Link to="/" style={{color: '#ef4444', textDecoration:'none', fontWeight:'bold', fontSize:'14px'}}>Exit</Link>
        </div>
      </header>

      <div className="main-content" style={{padding: '20px'}}>
        <Routes>
          <Route path="" element={<Dashboard />} />
          <Route path="line/:id" element={<LineDetails />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="*" element={<Navigate to={`${BASE}`} />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;