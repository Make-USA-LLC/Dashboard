import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { AlertOctagon, Clock, Calendar, Play, Square, Search, Filter } from 'lucide-react';

export default function DowntimeReports() {
  const [loading, setLoading] = useState(true);
  
  // Data State
  const [reports, setReports] = useState([]);
  const [filteredReports, setFilteredReports] = useState([]);
  const [uniqueMachines, setUniqueMachines] = useState([]);

  // Filter & Display State
  const [search, setSearch] = useState('');
  const [machineFilter, setMachineFilter] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [displayLimit, setDisplayLimit] = useState(50); // Show 50 by default

  useEffect(() => {
    const fetchDowntime = async () => {
      try {
        // Fetch a larger pool of data (500) so local filtering has good history to search through
        const q = query(collection(db, "issue_reports"), orderBy("timestamp", "desc"), limit(500));
        const snap = await getDocs(q);
        
        const data = snap.docs.map(doc => {
          const d = doc.data();
          
          // --- 1. TIME PARSING ---
          const parseTime = (t) => t?.toDate ? t.toDate() : (t ? new Date(t) : null);
          const logDate = parseTime(d.timestamp || d.date) || new Date();
          const start = parseTime(d.startTime);
          const end = parseTime(d.endTime);

          // --- 2. ROBUST DURATION CALCULATION ---
          let seconds = 0;
          if (d.durationSeconds !== undefined && d.durationSeconds !== null) {
              seconds = parseFloat(d.durationSeconds);
          } else if (d.durationMinutes !== undefined && d.durationMinutes !== null) {
              seconds = parseFloat(d.durationMinutes) * 60;
          } else if (start && end) {
              const diffMs = end.getTime() - start.getTime();
              seconds = diffMs / 1000;
          }

          if (isNaN(seconds)) seconds = 0;

          return {
            id: doc.id,
            machine: d.machine || d.lineName || "Unknown",
            company: d.company || "—", // <--- Added Company
            project: d.project || "—", // <--- Added Project
            reason: d.type || d.reason || "Unspecified", 
            action: d.actionTaken || "-",
            date: logDate,
            startTime: start,
            endTime: end,
            durationSeconds: seconds,
            technician: d.leader || d.technician || "Unknown" 
          };
        });
        
        setReports(data);
        
        // Extract unique machines for the dropdown filter
        const machines = Array.from(new Set(data.map(r => r.machine))).filter(Boolean).sort();
        setUniqueMachines(machines);

      } catch (err) {
        console.error("Failed to load downtime reports:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchDowntime();
  }, []);

  // --- FILTERING LOGIC ---
  useEffect(() => {
    let temp = [...reports];

    // 1. Machine Filter
    if (machineFilter) {
        temp = temp.filter(r => r.machine === machineFilter);
    }

    // 2. Text Search (Now includes Company & Project)
    if (search) {
        const lower = search.toLowerCase();
        temp = temp.filter(r => 
            (r.machine || '').toLowerCase().includes(lower) ||
            (r.company || '').toLowerCase().includes(lower) || 
            (r.project || '').toLowerCase().includes(lower) || 
            (r.reason || '').toLowerCase().includes(lower) ||
            (r.technician || '').toLowerCase().includes(lower) ||
            (r.action || '').toLowerCase().includes(lower)
        );
    }

    // 3. Date Range Filter
    if (dateRange.start) {
        const start = new Date(dateRange.start);
        temp = temp.filter(r => r.date >= start);
    }
    if (dateRange.end) {
        const end = new Date(dateRange.end);
        end.setHours(23, 59, 59, 999); 
        temp = temp.filter(r => r.date <= end);
    }

    setFilteredReports(temp);
    setDisplayLimit(50); // Reset to 50 items whenever filters change
  }, [search, machineFilter, dateRange, reports]);

  // --- HELPER FORMATTERS ---
  const formatDuration = (totalSeconds) => {
      if (!totalSeconds) return "0s";
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = Math.floor(totalSeconds % 60);
      
      if (h > 0) return `${h}h ${m}m ${s}s`;
      if (m > 0) return `${m}m ${s}s`;
      return `${s}s`;
  };

  const formatTime = (dateObj) => {
      if (!dateObj) return "-";
      return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) return <div className="p-10 text-center text-slate-400">Loading downtime logs...</div>;

  // --- TOTALS CALCULATION (Based on FILTERED Data) ---
  const totalSeconds = filteredReports.reduce((acc, curr) => acc + (curr.durationSeconds || 0), 0);
  const totalHours = (totalSeconds / 3600).toFixed(2);

  // Get only the currently visible rows
  const visibleReports = filteredReports.slice(0, displayLimit);

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* HEADER STATS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-red-50 p-5 rounded-xl border border-red-100 flex items-center gap-4">
          <div className="p-3 bg-red-500 text-white rounded-lg shadow-sm">
            <AlertOctagon size={24} />
          </div>
          <div>
            <div className="text-red-800 text-sm font-bold uppercase tracking-wider">Filtered Events</div>
            <div className="text-2xl font-black text-slate-900">{filteredReports.length}</div>
          </div>
        </div>
        
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="p-3 bg-slate-100 text-slate-500 rounded-lg">
            <Clock size={24} />
          </div>
          <div>
            <div className="text-slate-500 text-sm font-bold uppercase tracking-wider">Filtered Downtime</div>
            <div className="text-2xl font-black text-slate-900">
              {totalHours} <span className="text-sm font-medium text-slate-400">hrs</span>
            </div>
          </div>
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex flex-wrap gap-6 items-end">
              
              {/* MACHINE FILTER */}
              <div className="flex-1 min-w-[200px]">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase mb-2">
                      <Filter size={14}/> Machine
                  </label>
                  <select 
                      value={machineFilter} 
                      onChange={e => setMachineFilter(e.target.value)}
                      className="w-full p-2.5 border rounded-lg text-sm bg-slate-50 focus:bg-white transition-colors"
                  >
                      <option value="">All Machines</option>
                      {uniqueMachines.map(m => (
                          <option key={m} value={m}>{m}</option>
                      ))}
                  </select>
              </div>

              {/* DATE RANGE FILTER */}
              <div>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase mb-2">
                      <Calendar size={14}/> Date Range
                  </label>
                  <div className="flex items-center gap-2 bg-slate-50 border p-1 rounded-lg">
                      <input type="date" value={dateRange.start} onChange={e => setDateRange({...dateRange, start:e.target.value})} className="bg-transparent text-sm p-1.5 focus:outline-none" />
                      <span className="text-slate-300">-</span>
                      <input type="date" value={dateRange.end} onChange={e => setDateRange({...dateRange, end:e.target.value})} className="bg-transparent text-sm p-1.5 focus:outline-none" />
                  </div>
              </div>

              {/* TEXT SEARCH */}
              <div className="flex-1 min-w-[200px]">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase mb-2">
                      <Search size={14}/> Search
                  </label>
                  <input 
                      placeholder="Reason, company, project..." 
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 transition-all" 
                  />
              </div>

          </div>
      </div>

      {/* DATA TABLE */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-bold text-slate-700 flex items-center gap-2">
            <Calendar size={18} className="text-slate-400"/> Downtime Log
          </h3>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Showing {visibleReports.length} of {filteredReports.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-3 font-bold">Date</th>
                <th className="px-6 py-3 font-bold">Time Range</th>
                <th className="px-6 py-3 font-bold">Machine & Issue</th>
                
                {/* NEW COLUMN HEADER */}
                <th className="px-6 py-3 font-bold">Company & Project</th>
                
                <th className="px-6 py-3 font-bold text-right">Duration</th>
                <th className="px-6 py-3 font-bold text-right">Line Leader</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleReports.map((report) => (
                <tr key={report.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-slate-600 font-bold">
                    {report.date.toLocaleDateString()}
                  </td>
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
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-900">{report.machine}</div>
                    <div className="text-xs font-bold uppercase tracking-wide text-red-600 mt-0.5">
                        {report.reason}
                    </div>
                  </td>
                  
                  {/* NEW COLUMN CELL */}
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-700">{report.company}</div>
                    <div className="text-xs text-slate-500 italic mt-0.5">
                        {report.project}
                    </div>
                  </td>

                  <td className="px-6 py-4 text-right">
                    <span className={`font-mono font-bold px-2 py-1 rounded ${report.durationSeconds > 600 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}`}>
                      {formatDuration(report.durationSeconds)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-slate-500 text-sm">
                    {report.technician}
                  </td>
                </tr>
              ))}
              
              {filteredReports.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-slate-400 italic">
                    No downtime events match your current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* LOAD MORE BUTTON */}
        {filteredReports.length > displayLimit && (
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 text-center">
                <button 
                    onClick={() => setDisplayLimit(prev => prev + 50)}
                    className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-all"
                >
                    Load More Events (+50)
                </button>
            </div>
        )}
      </div>
    </div>
  );
}