import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { AlertOctagon, Clock, Calendar, ArrowRight } from 'lucide-react';

export default function DowntimeReports() {
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState([]);

  useEffect(() => {
    const fetchDowntime = async () => {
      try {
        // Change "downtime_reports" to "issue_reports"
	const q = query(collection(db, "issue_reports"), orderBy("date", "desc"), limit(100));
        const snap = await getDocs(q);
        
        const data = snap.docs.map(doc => {
          const d = doc.data();
          // Normalizing data structure similar to your other reports
          return {
            id: doc.id,
            machine: d.machine || d.lineName || "Unknown",
            reason: d.reason || "Unspecified",
            action: d.actionTaken || "-",
            duration: parseFloat(d.durationMinutes || 0),
            date: d.date?.toDate ? d.date.toDate() : new Date(d.date || Date.now()),
            technician: d.technician || d.user || "Unknown"
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

  if (loading) return <div className="p-10 text-center text-slate-400">Loading downtime logs...</div>;

  const totalDowntime = reports.reduce((acc, curr) => acc + curr.duration, 0);

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
              {(totalDowntime / 60).toFixed(1)} <span className="text-sm font-medium text-slate-400">hrs</span>
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
                <th className="px-6 py-3 font-bold">Machine</th>
                <th className="px-6 py-3 font-bold">Issue & Action</th>
                <th className="px-6 py-3 font-bold text-right">Duration</th>
                <th className="px-6 py-3 font-bold text-right">Tech</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reports.map((report) => (
                <tr key={report.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-slate-600">
                    <div className="font-bold">{report.date.toLocaleDateString()}</div>
                    <div className="text-xs text-slate-400">{report.date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-900">
                    {report.machine}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-start gap-2">
                      <span className="text-red-600 font-bold">{report.reason}</span>
                      {report.action !== '-' && (
                        <>
                          <ArrowRight size={14} className="mt-1 text-slate-300" />
                          <span className="text-slate-500">{report.action}</span>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="bg-slate-100 text-slate-700 font-bold px-2 py-1 rounded">
                      {report.duration} m
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-slate-500">
                    {report.technician}
                  </td>
                </tr>
              ))}
              {reports.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-400 italic">
                    No downtime events recorded.
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