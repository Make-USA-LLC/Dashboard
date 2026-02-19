import React from "react";
import { Routes, Route, Link, Navigate, useLocation } from "react-router-dom"; 
import { auth } from "../firebase_config"; 
import { LayoutDashboard, Wrench, ClipboardCheck, AlertCircle } from "lucide-react"; // Added AlertCircle

// Sub-pages
import Dashboard from "./Dashboard";
import SetupLog from "./SetupLog";
import QCLog from "./QCLog";
import DowntimeReports from "./DowntimeReports"; // 1. IMPORT NEW COMPONENT

// UPDATE BASE PATH
const BASE = "/reports";

export default function App() {
  const user = auth.currentUser;
  const username = user?.displayName || user?.email || 'User';
  const loc = useLocation();

  // Helper for active tab styles
  const navClass = (path) => {
    const fullPath = path === '' ? BASE : `${BASE}${path}`;
    const isActive = loc.pathname === fullPath || (path === '' && loc.pathname === BASE);
    
    return `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
      isActive 
      ? "bg-blue-600 text-white shadow-md" 
      : "text-slate-500 hover:bg-white hover:text-slate-700"
    }`;
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      
      {/* 1. TOP GLOBAL HEADER */}
      <header className="bg-slate-900 px-6 py-4 flex justify-between items-center shadow-lg sticky top-0 z-50">
        <div className="flex items-center gap-4">
           {/* Main Menu Link */}
           <Link to="/" className="text-slate-400 hover:text-white text-sm font-medium no-underline transition-colors">
             &larr; Main Menu
           </Link>
           <div className="w-px h-5 bg-slate-700"></div>
           <span className="text-white text-lg font-bold flex items-center gap-2">
             Make USA <span className="bg-amber-500 text-black px-2 py-0.5 rounded text-xs uppercase font-black tracking-wide">Machine & QC Reports</span>
           </span>
        </div>
        <div className="text-slate-400 text-sm">{username}</div>
      </header>

      {/* 2. MODULE NAVIGATION */}
      <div className="max-w-7xl mx-auto px-6 mt-8 mb-6">
          <div className="flex flex-wrap gap-2 bg-slate-200/50 p-1 rounded-xl w-fit">
              <Link to={BASE} className={navClass('')}>
                  <LayoutDashboard size={18} /> Analytics Dashboard
              </Link>
              <Link to={`${BASE}/setups`} className={navClass('/setups')}>
                  <Wrench size={18} /> Machine Setups
              </Link>
              <Link to={`${BASE}/qc`} className={navClass('/qc')}>
                  <ClipboardCheck size={18} /> QC Reports
              </Link>
              {/* 2. ADD NAVIGATION LINK */}
              <Link to={`${BASE}/downtime`} className={navClass('/downtime')}>
                  <AlertCircle size={18} /> Downtime
              </Link>
          </div>
      </div>

      {/* 3. MAIN CONTENT AREA */}
      <div className="max-w-7xl mx-auto px-6 pb-20">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/setups" element={<SetupLog />} />
          <Route path="/qc" element={<QCLog />} />
          {/* 3. ADD ROUTE */}
          <Route path="/downtime" element={<DowntimeReports />} />
          <Route path="*" element={<Navigate to={BASE} />} />
        </Routes>
      </div>
    </div>
  );
}