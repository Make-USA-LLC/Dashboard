import React from "react";
import { Routes, Route, Link, Navigate } from "react-router-dom"; 
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
          {/* Use the BASE constant to ensure absolute routing within the sub-app */}
          <Link to={`${BASE}`} style={{color: '#cbd5e1', textDecoration:'none', fontWeight: 500}}>Lines</Link>
          <Link to={`${BASE}/inventory`} style={{color: '#cbd5e1', textDecoration:'none', fontWeight: 500}}>Inventory</Link>
          
          <span className="divider" style={{opacity:0.3, color:'white'}}>|</span>
          
          {/* This link remains "/" to return to the main Command Center */}
          <Link to="/" style={{color: '#ef4444', textDecoration:'none', fontWeight:'bold'}}>Exit</Link>
        </div>
      </header>

      <div className="main-content" style={{padding: '20px'}}>
        <Routes>
          {/* These paths remain relative to the parent Route defined in the root App.jsx */}
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