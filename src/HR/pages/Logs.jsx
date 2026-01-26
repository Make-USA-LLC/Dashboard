import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useRole } from '../hooks/useRole'; // <--- IMPORT

export default function Logs() {
  const { checkAccess } = useRole();
  const canView = checkAccess('logs', 'view');

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [filterAction, setFilterAction] = useState("All");
  const [sortOrder, setSortOrder] = useState("desc"); 
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  const parseDate = (ts) => {
      if (!ts) return new Date();
      if (ts.seconds !== undefined) { return new Date(ts.seconds * 1000); }
      if (typeof ts.toDate === 'function') { return ts.toDate(); }
      if (typeof ts === 'string') { const clean = ts.replace(" at ", " ").replace("UTC", ""); const p = new Date(clean); if (!isNaN(p)) return p; }
      return new Date(ts);
  };

  useEffect(() => {
    if (!canView) { setLoading(false); return; }
    const fetchLogs = async () => {
      try {
        const q = query(collection(db, "audit_logs"), orderBy("timestamp", "desc"), limit(500));
        const querySnapshot = await getDocs(q);
        setLogs(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) { console.error(error); } finally { setLoading(false); }
    };
    fetchLogs();
  }, [canView]);

  if (!canView) return <div style={{padding:20}}>⛔ Access Denied.</div>;

  const getFilteredLogs = () => {
    let filtered = logs;
    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(log => (log.action && log.action.toLowerCase().includes(lowerTerm)) || (log.performedBy && log.performedBy.toLowerCase().includes(lowerTerm)) || (log.target && log.target.toLowerCase().includes(lowerTerm)) || (log.details && log.details.toLowerCase().includes(lowerTerm)));
    }
    if (filterAction !== "All") { filtered = filtered.filter(log => log.action === filterAction); }
    filtered.sort((a, b) => { const dA = parseDate(a.timestamp); const dB = parseDate(b.timestamp); return sortOrder === 'asc' ? dA - dB : dB - dA; });
    return filtered;
  };

  const filteredLogs = getFilteredLogs();
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const currentLogs = filteredLogs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const uniqueActions = ["All", ...new Set(logs.map(log => log.action).filter(Boolean))].sort();

  return (
    <div style={{maxWidth: '1200px', margin: '0 auto', paddingBottom: '50px'}}>
      <div style={{background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginBottom: '20px'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: '20px'}}><h2 style={{margin:0, color:'#1e293b'}}>Audit Logs</h2><div style={{fontSize:'13px', color:'#64748b'}}>Showing latest 500 records</div></div>
        <div style={{display: 'flex', gap: '15px', flexWrap: 'wrap'}}>
            <div style={{flex: 2, minWidth: '200px'}}><input type="text" placeholder="Search logs..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} style={{width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px'}}/></div>
            <div style={{flex: 1, minWidth: '150px'}}><select value={filterAction} onChange={(e) => { setFilterAction(e.target.value); setCurrentPage(1); }} style={{width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px'}}>{uniqueActions.map(action => (<option key={action} value={action}>{action}</option>))}</select></div>
            <button onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')} style={{padding: '10px 15px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', fontSize: '14px', color:'#334155'}}>Sort Date: {sortOrder === 'desc' ? '⬇ Newest' : '⬆ Oldest'}</button>
        </div>
      </div>

      <div className="card" style={{padding: 0, overflow: 'hidden'}}>
        {loading ? (<div style={{padding: '40px', textAlign: 'center', color: '#64748b'}}>Loading logs...</div>) : (
            <>
                <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '14px'}}>
                    <thead><tr style={{background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#475569'}}><th style={{padding: '15px'}}>Date & Time</th><th style={{padding: '15px'}}>Action</th><th style={{padding: '15px'}}>Target User</th><th style={{padding: '15px'}}>Performed By</th><th style={{padding: '15px'}}>Details</th></tr></thead>
                    <tbody>
                        {currentLogs.length === 0 ? (<tr><td colSpan="5" style={{padding: '30px', textAlign: 'center', color: '#94a3b8'}}>No logs found matching your filters.</td></tr>) : (currentLogs.map((log) => (<tr key={log.id} style={{borderBottom: '1px solid #f1f5f9'}}><td style={{padding: '15px', whiteSpace: 'nowrap', color: '#64748b'}}>{parseDate(log.timestamp).toLocaleString()}</td><td style={{padding: '15px'}}><span style={{fontWeight: 'bold', color: (log.action && log.action.includes("Delete")) ? '#ef4444' : '#2563eb', background: (log.action && log.action.includes("Delete")) ? '#fee2e2' : '#dbeafe', padding: '4px 8px', borderRadius: '4px', fontSize: '11px'}}>{log.action || "Unknown"}</span></td><td style={{padding: '15px', fontWeight: 'bold', color: '#2563eb'}}>{log.target || "-"}</td><td style={{padding: '15px', color: '#334155'}}>{log.performedBy || log.actor || "System"}</td><td style={{padding: '15px', color: '#475569'}}>{log.details}</td></tr>)))}
                    </tbody>
                </table>
                {filteredLogs.length > 0 && (
                    <div style={{padding: '15px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc'}}>
                        <span style={{fontSize: '13px', color: '#64748b'}}>Showing {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, filteredLogs.length)} of {filteredLogs.length}</span>
                        <div style={{display: 'flex', gap: '10px'}}><button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} style={{padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: '4px', background: currentPage === 1 ? '#f1f5f9' : 'white'}}>Previous</button><button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} style={{padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: '4px', background: currentPage === totalPages ? '#f1f5f9' : 'white'}}>Next</button></div>
                    </div>
                )}
            </>
        )}
      </div>
    </div>
  );
}