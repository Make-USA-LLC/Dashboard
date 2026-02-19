import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { AlertOctagon, Clock, Calendar, ArrowRight, Play, Square } from 'lucide-react';

export default function DowntimeReports() {
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState([]);

  useEffect(() => {
    const fetchDowntime = async () => {
      try {
        // Query the 'issue_reports' collection
        const q = query(collection(db, "issue_reports"), orderBy("timestamp", "desc"), limit(100));
        const snap = await getDocs(q);
        
        const data = snap.docs.map(doc => {
          const d = doc.data();
          
          // --- 1. TIME PARSING ---
          const parseTime = (t) => t?.toDate ? t.toDate() : (t ? new Date(t) : null);
          
          // Get the main log time (when it was saved)
          const logDate = parseTime(d.timestamp || d.date) || new Date();
          
          // Get specific start/end times if available
          const start = parseTime(d.startTime);
          const end = parseTime(d.endTime);

          // --- 2. ROBUST DURATION CALCULATION ---
          let seconds = 0;

          if (d.durationSeconds !== undefined && d.durationSeconds !== null) {
              // Option A: App provides seconds
              seconds = parseFloat(d.durationSeconds);
          } else if (d.durationMinutes !== undefined && d.durationMinutes !== null) {
              // Option B: Legacy data provides minutes
              seconds = parseFloat(d.durationMinutes) * 60;
          } else if (start && end) {
              // Option C: Fallback - Calculate difference manually
              const diffMs = end.getTime() - start.getTime();
              seconds = diffMs / 1000;
          }

          // Safety check to prevent NaN (Not a Number)
          if (isNaN(seconds)) seconds = 0;

          return {
            id: doc.id,
            machine: d.machine || d.lineName || "Unknown",
            reason: d.type || d.reason || "Unspecified", 
            action: d.actionTaken || "-",
            
            // Time Data
            date: logDate,
            startTime: start,
            endTime: end,
            durationSeconds: seconds,
            
            technician: d.leader || d.technician || "Unknown" 
          };
        });
        setReports(data);
      } catch (err) {
        console.error("Failed to load downtime reports:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchDowntime();
  }, []);

  // --- HELPER: Format Duration (e.g. "1h 5m 30s") ---
  const formatDuration = (totalSeconds) => {
      if (!totalSeconds) return "0s";
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = Math.floor(totalSeconds % 60);
      
      if (h > 0) return `${h}h ${m}m ${s}s`;
      if (m > 0) return `${m}m ${s}s`;
      return `${s}s`;
  };

  // --- HELPER: Format Time (e.g. "10:30 AM") ---
  const formatTime = (dateObj) => {
      if (!dateObj) return "-";
      return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) return <div className="p-10 text-center text-slate-400">Loading downtime logs...</div>;

  // --- TOTALS CALCULATION ---
  // We use (curr.durationSeconds || 0) to ensure we never add "undefined" to the total
  const totalSeconds = reports.reduce((acc, curr) => acc + (curr.durationSeconds || 0), 0);
  const totalHours = (totalSeconds / 3600).toFixed(2);

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* HEADER STATS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-red-50 p-5 rounded-xl border border-red-100 flex items-center gap-4">
          <div className="p-3 bg-red-500 text-white rounded-lg shadow-sm">
            <AlertOctagon size={24} />
          </div>
          <div>
            <div className="text-red-800 text-sm font-bold uppercase tracking-wider">Total Events</div>
            <div className="text-2xl font-black text-slate-900">{reports.length}</div>
          </div>
        </div>
        
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="p-3 bg-slate-100 text-slate-500 rounded-lg">
            <Clock size={24} />
          </div>
          <div>
            <div className="text-slate-500 text-sm font-bold uppercase tracking-wider">Total Downtime</div>
            <div className="text-2xl font-black text-slate-900">
              {totalHours} <span className="text-sm font-medium text-slate-400">hrs</span>
            </div>
          </div>
        </div>
      </div>

      {/* DATA TABLE */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-bold text-slate-700 flex items-center gap-2">
            <Calendar size={18} className="text-slate-400"/> Downtime Log
          </h3>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Last 100 Entries</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-3 font-bold">Date</th>
                <th className="px-6 py-3 font-bold">Time Range</th>
                <th className="px-6 py-3 font-bold">Machine & Issue</th>
                <th className="px-6 py-3 font-bold text-right">Duration</th>
                <th className="px-6 py-3 font-bold text-right">Reported By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reports.map((report) => (
                <tr key={report.id} className="hover:bg-slate-50 transition-colors">
                  {/* DATE */}
                  <td className="px-6 py-4 whitespace-nowrap text-slate-600 font-bold">
                    {report.date.toLocaleDateString()}
                  </td>

                  {/* TIME RANGE (Start - End) */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    {report.startTime && report.endTime ? (
                        <div className="flex flex-col text-xs">
                            <span className="flex items-center gap-1 text-slate-500">
                                <Play size={10} className="text-green-500"/> {formatTime(report.startTime)}
                            </span>
                            <span className="flex items-center gap-1 text-slate-500 mt-1">
                                <Square size={10} className="text-red-400"/> {formatTime(report.endTime)}
                            </span>
                        </div>
                    ) : (
                        <span className="text-slate-400 text-xs italic">
                            {formatTime(report.date)}
                        </span>
                    )}
                  </td>

                  {/* MACHINE & ISSUE */}
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-900">{report.machine}</div>
                    <div className="text-xs font-bold uppercase tracking-wide text-red-600 mt-0.5">
                        {report.reason}
                    </div>
                  </td>

                  {/* DURATION */}
                  <td className="px-6 py-4 text-right">
                    <span className={`font-mono font-bold px-2 py-1 rounded ${report.durationSeconds > 600 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}`}>
                      {formatDuration(report.durationSeconds)}
                    </span>
                  </td>

                  {/* TECH */}
                  <td className="px-6 py-4 text-right text-slate-500 text-sm">
                    {report.technician}
                  </td>
                </tr>
              ))}
              
              {reports.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-400 italic">
                    No downtime events found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}