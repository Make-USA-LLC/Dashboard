import React from "react";
import { Routes, Route, Link, Navigate } from "react-router-dom"; 
import { auth } from "../firebase_config"; 
import Reports from "./Reports";
import "./Reports.css"; 

// Base path for this module
const BASE = "/machines";

function App() {
  const user = auth.currentUser;
  const username = user?.displayName || user?.email || 'User';

  return (
    <div className="machines-app" style={{minHeight:'100vh', background:'#f8fafc', fontFamily: 'Segoe UI, sans-serif'}}>
      {/* Top Navigation Bar */}
      <header style={{
          background: '#0f172a', 
          padding: '15px 20px', 
          display:'flex', 
          justifyContent:'space-between', 
          alignItems:'center',
          boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
      }}>
        <div className="logo" style={{display:'flex', alignItems:'center', gap:'15px'}}>
           {/* Link back to the Main Command Center */}
           <Link to="/" style={{color:'#94a3b8', textDecoration:'none', fontSize:'14px', fontWeight:'500'}}>
             &larr; Main Menu
           </Link>
           
           <div style={{width:'1px', height:'20px', background:'#334155'}}></div>
           
           <span style={{color:'white', fontSize:'18px', fontWeight:'bold', display:'flex', alignItems:'center', gap: 10}}>
             Make USA <span style={{background:'#f59e0b', color:'black', padding:'2px 8px', borderRadius:'4px', fontSize:'11px', textTransform:'uppercase', fontWeight:'800'}}>Machine Analytics</span>
           </span>
        </div>
        
        <div style={{display:'flex', gap:'20px', alignItems: 'center'}}>
           <span style={{color: '#94a3b8', fontSize: '14px'}}>
            {username}
          </span>
        </div>
      </header>

      {/* Main Content Area */}
      <div style={{padding: '30px', maxWidth:'1400px', margin:'0 auto'}}>
        <Routes>
          <Route path="" element={<Reports />} />
          {/* Catch-all redirect to the root of this module */}
          <Route path="*" element={<Navigate to={BASE} />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;