import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom'; 
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useRole } from '../hooks/useRole'; 

// Import the CSS file
import '../HR.css'; 

export default function Dashboard() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate(); 
  
  // --- ROLE CHECKS ---
  const { checkAccess } = useRole();
  const canViewEmployees = checkAccess('employees', 'view');
  const canViewReviews = checkAccess('reviews', 'view');
  const canViewAssets = checkAccess('assets', 'view');
  const canViewLogs = checkAccess('security', 'view');

  useEffect(() => {
    const fetchData = async () => {
      if (!canViewEmployees) { setLoading(false); return; }
      
      try {
          const snap = await getDocs(collection(db, "employees"));
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setEmployees(list.filter(e => e.status !== 'Inactive')); 
      } catch (e) {
          console.error("Dashboard fetch error:", e);
      } finally {
          setLoading(false);
      }
    };
    fetchData();
  }, [canViewEmployees]);

  const handleStartReview = (empId) => {
      navigate('/hr/reviews', { state: { startReviewForId: empId } });
  };

  // --- LOGIC: BIRTHDAYS & REVIEWS ---
  const currentMonth = new Date().getMonth(); 
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  
  const monthlyBirthdays = employees.filter(emp => {
      if (!emp.birthday) return false;
      const d = emp.birthday.seconds ? new Date(emp.birthday.seconds * 1000) : new Date(emp.birthday);
      return d.getMonth() === currentMonth;
  }).sort((a, b) => {
      const da = a.birthday.seconds ? new Date(a.birthday.seconds * 1000) : new Date(a.birthday);
      const db = b.birthday.seconds ? new Date(b.birthday.seconds * 1000) : new Date(b.birthday);
      return da.getDate() - db.getDate();
  });

  const reviewsDue = employees.filter(emp => {
      let baseDate = null;
      if (emp.lastReviewDate) {
          baseDate = emp.lastReviewDate.seconds ? new Date(emp.lastReviewDate.seconds * 1000) : new Date(emp.lastReviewDate);
      } else if (emp.hireDate) {
          baseDate = emp.hireDate.seconds ? new Date(emp.hireDate.seconds * 1000) : new Date(emp.hireDate);
      } else { return false; }
      const nextDue = new Date(baseDate);
      nextDue.setFullYear(nextDue.getFullYear() + 1);
      const warningDate = new Date(nextDue);
      warningDate.setDate(warningDate.getDate() - 14);
      return new Date() >= warningDate;
  }).map(emp => {
      let baseDate = emp.lastReviewDate ? (emp.lastReviewDate.seconds ? new Date(emp.lastReviewDate.seconds * 1000) : new Date(emp.lastReviewDate)) : (emp.hireDate.seconds ? new Date(emp.hireDate.seconds * 1000) : new Date(emp.hireDate));
      const nextDue = new Date(baseDate);
      nextDue.setFullYear(nextDue.getFullYear() + 1);
      return { ...emp, nextDue };
  });

  if (loading) return <div style={{padding: 20}}>Loading Dashboard...</div>;

  return (
    <div style={{width: '100%', paddingBottom: '40px'}}>
      <h1 style={{marginBottom: '20px', color: '#1e293b'}}>Dashboard</h1>

      {/* --- TOP SECTION: METRICS (Forced 2 Columns) --- */}
      <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr', /* FORCE 2 EQUAL COLUMNS */
          gap: '20px',
          marginBottom: '40px'
      }}>
          
          {/* BIRTHDAY CARD */}
          <div className="card" style={{borderLeft: '5px solid #e11d48', background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'}}>
              <h3 style={{marginTop:0, color: '#be123c'}}>🎂 {monthNames[currentMonth]} Birthdays</h3>
              {monthlyBirthdays.length === 0 ? <p style={{color:'#64748b'}}>No birthdays this month.</p> : (
                  <div style={{display:'flex', flexDirection:'column', gap: 10}}>
                      {monthlyBirthdays.map(emp => {
                          const d = emp.birthday.seconds ? new Date(emp.birthday.seconds * 1000) : new Date(emp.birthday);
                          return (
                              <div key={emp.id} style={{display:'flex', justifyContent:'space-between', borderBottom:'1px solid #f1f5f9', paddingBottom:5}}>
                                  <span style={{fontWeight:'bold'}}>{emp.firstName} {emp.lastName}</span>
                                  <span style={{color:'#be123c'}}>{d.getDate()}th</span>
                              </div>
                          )
                      })}
                  </div>
              )}
          </div>

          {/* REVIEWS CARD */}
          {canViewReviews && (
              <div className="card" style={{borderLeft: '5px solid #ca8a04', background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'}}>
                  <h3 style={{marginTop:0, color: '#a16207'}}>⚠️ Reviews Due</h3>
                  <p style={{fontSize:'12px', color:'#64748b', marginTop:-10, marginBottom: 15}}>Staff needing review within 2 weeks</p>
                  
                  {reviewsDue.length === 0 ? <p style={{color:'#64748b'}}>All caught up!</p> : (
                      <div style={{display:'flex', flexDirection:'column', gap: 10}}>
                          {reviewsDue.map(emp => {
                              const isOverdue = new Date() > emp.nextDue;
                              return (
                                  <div key={emp.id} style={{display:'flex', justifyContent:'space-between', alignItems:'center', background: isOverdue ? '#fef2f2' : 'transparent', padding: 5, borderRadius: 4}}>
                                      <div>
                                          <div style={{fontWeight:'bold'}}>{emp.firstName} {emp.lastName}</div>
                                          <div style={{fontSize:'11px', color:'#64748b'}}>Due: {emp.nextDue.toLocaleDateString()}</div>
                                      </div>
                                      {checkAccess('reviews', 'edit') && (
                                          <button 
                                            onClick={() => handleStartReview(emp.id)}
                                            style={{padding:'4px 10px', fontSize:'12px', background: '#a16207', color:'white', border:'none', borderRadius: 4, cursor:'pointer'}}
                                          >
                                            Review
                                          </button>
                                      )}
                                  </div>
                              )
                          })}
                      </div>
                  )}
              </div>
          )}
      </div>

      {/* --- BOTTOM SECTION: NAVIGATION LINKS --- */}
      <div style={{
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', /* Flex to fill space */
          gap: '20px'
      }}>
        
        {canViewEmployees && (
            <Link to="/hr/employees" style={{textDecoration: 'none'}}>
              <div className="card" style={{height: '100%', borderTop: '4px solid #2563eb', background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', transition: 'transform 0.2s'}}>
                <h3 style={{marginTop: 0, color: '#1e293b'}}>👥 Staff Directory</h3>
                <p style={{color: '#64748b', fontSize: '14px'}}>Manage employees, contact info, and hiring/termination.</p>
              </div>
            </Link>
        )}

        {canViewReviews && (
            <Link to="/hr/reviews" style={{textDecoration: 'none'}}>
              <div className="card" style={{height: '100%', borderTop: '4px solid #8b5cf6', background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', transition: 'transform 0.2s'}}>
                <h3 style={{marginTop: 0, color: '#1e293b'}}>📝 Performance Reviews</h3>
                <p style={{color: '#64748b', fontSize: '14px'}}>Score employees on skills, leadership, and machines.</p>
              </div>
            </Link>
        )}

        {canViewAssets && (
            <>
                <Link to="/hr/keys" style={{textDecoration: 'none'}}>
                  <div className="card" style={{height: '100%', borderTop: '4px solid #f59e0b', background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', transition: 'transform 0.2s'}}>
                    <h3 style={{marginTop: 0, color: '#1e293b'}}>🔑 Key Inventory</h3>
                    <p style={{color: '#64748b', fontSize: '14px'}}>Track key assignments and manage spares.</p>
                  </div>
                </Link>

                <Link to="/hr/assets" style={{textDecoration: 'none'}}>
                  <div className="card" style={{height: '100%', borderTop: '4px solid #10b981', background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', transition: 'transform 0.2s'}}>
                    <h3 style={{marginTop: 0, color: '#1e293b'}}>💻 Asset Tracking</h3>
                    <p style={{color: '#64748b', fontSize: '14px'}}>Manage laptops, tablets, and company vehicles.</p>
                  </div>
                </Link>

                <Link to="/hr/lockers" style={{textDecoration: 'none'}}>
                  <div className="card" style={{height: '100%', borderTop: '4px solid #ec4899', background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', transition: 'transform 0.2s'}}>
                    <h3 style={{marginTop: 0, color: '#1e293b'}}>🔐 Lockers</h3>
                    <p style={{color: '#64748b', fontSize: '14px'}}>Assign lockers and track availability.</p>
                  </div>
                </Link>
            </>
        )}

        {canViewLogs && (
            <Link to="/hr/logs" style={{textDecoration: 'none'}}>
              <div className="card" style={{height: '100%', borderTop: '4px solid #64748b', background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', transition: 'transform 0.2s'}}>
                <h3 style={{marginTop: 0, color: '#1e293b'}}>📜 Audit Logs</h3>
                <p style={{color: '#64748b', fontSize: '14px'}}>View system history, changes, and security alerts.</p>
              </div>
            </Link>
        )}

      </div>
    </div>
  );
}