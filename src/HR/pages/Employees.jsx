import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
// Add setDoc to imports
import { collection, addDoc, onSnapshot, getDoc, doc, writeBatch, setDoc } from 'firebase/firestore';
import { db } from '../../firebase_config';
import { logAudit } from '../utils/logger'; 
import { useRole } from '../hooks/useRole'; 

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [deptFilter, setDeptFilter] = useState("All");
  const [showInactive, setShowInactive] = useState(false);
  const [departmentOptions, setDepartmentOptions] = useState([]); 
  
  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);
  
  // --- PERMISSION CHECKS ---
  const { checkAccess } = useRole();
  const canEdit = checkAccess('employees', 'edit'); 
  const canViewMoney = checkAccess('financials', 'view');
  const canViewArchived = checkAccess('employees', 'view'); 

  // ADDED: cardId to state
  const [formData, setFormData] = useState({ 
    firstName: "", lastName: "", email: "", phone: "", addressStreet: "", addressCity: "", addressState: "", addressZip: "", 
    type: "Salary", department: "", compensation: "", hireDate: new Date().toISOString().split('T')[0], birthday: "",
    cardId: "" 
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "employees"), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      list.sort((a, b) => {
          const nameA = (a.lastName + a.firstName).toLowerCase();
          const nameB = (b.lastName + b.firstName).toLowerCase();
          return nameA.localeCompare(nameB);
      });
      setEmployees(list);
      setLoading(false);
    });

    const fetchSettings = async () => {
        const docSnap = await getDoc(doc(db, "settings", "global_options"));
        if(docSnap.exists() && docSnap.data().departments) {
            setDepartmentOptions(docSnap.data().departments);
        }
    };
    fetchSettings();

    return () => unsubscribe();
  }, []);

  const getDisplayName = (emp) => (emp.firstName && emp.lastName) ? `${emp.firstName} ${emp.lastName}` : (emp.name || "Unknown");

  const visibleEmployees = employees.filter(emp => {
      if (!canViewArchived && emp.status === "Inactive") return false;
      if (!showInactive && emp.status === "Inactive") return false;
      if (showInactive && emp.status !== "Inactive") return false; 
      if (deptFilter !== "All" && emp.department !== deptFilter) return false;
      
      if (searchTerm) {
          const searchLower = searchTerm.toLowerCase();
          const fullName = getDisplayName(emp).toLowerCase();
          const email = (emp.email || "").toLowerCase();
          // Added: Search by Card ID too
          const card = (emp.cardId || "").toLowerCase();
          return fullName.includes(searchLower) || email.includes(searchLower) || card.includes(searchLower);
      }
      return true;
  });

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!canEdit) return; 
    if (!formData.firstName || !formData.lastName) { alert("First and Last Name are required."); return; }

    const settingsSnap = await getDoc(doc(db, "settings", "checklists"));
    const templates = settingsSnap.exists() ? settingsSnap.data() : {};
    const initialOnboarding = (formData.type === "Salary" ? (templates.salaryOnboarding || []) : (templates.hourlyOnboarding || [])).reduce((acc, item) => ({...acc, [item]: false}), {});
    const initialOffboarding = (formData.type === "Salary" ? (templates.salaryOffboarding || []) : (templates.hourlyOffboarding || [])).reduce((acc, item) => ({...acc, [item]: false}), {});
    
    const properHireDate = new Date(formData.hireDate + 'T12:00:00');
    let properBirthday = null; if (formData.birthday) properBirthday = new Date(formData.birthday + 'T12:00:00');
    const properReviewDate = new Date(); 

    const fullName = `${formData.firstName} ${formData.lastName}`;

    // 1. Create Employee Record
    const newEmpRef = await addDoc(collection(db, "employees"), {
      firstName: formData.firstName, lastName: formData.lastName, email: formData.email || "", phone: formData.phone || "",
      addressStreet: formData.addressStreet || "", addressCity: formData.addressCity || "", addressState: formData.addressState || "", addressZip: formData.addressZip || "",
      type: formData.type, department: formData.department || "", status: "Active", compensation: formData.compensation,
      name: fullName, hireDate: properHireDate, birthday: properBirthday, lastReviewDate: properReviewDate,
      onboarding: initialOnboarding, offboarding: initialOffboarding, assignedKeyId: null, assignedLockerId: null, ptoLog: [],
      cardId: formData.cardId || "" // Save Card ID
    });

    // 2. Sync to Workers Collection (For iPad/Portal)
    if (formData.cardId) {
        try {
            await setDoc(doc(db, "workers", formData.cardId), {
                name: fullName,
                email: formData.email || "", // This enables Portal Access
                employeeDocId: newEmpRef.id,
                syncedFromHR: true
            });
            logAudit("Sync Worker", fullName, `Linked Card ID ${formData.cardId} to HR Profile`);
        } catch (err) {
            console.error("Failed to sync worker card", err);
            alert("Employee created, but failed to sync RFID card. Please edit profile to retry.");
        }
    }

    logAudit("Create Employee", fullName, "Manual Creation via Directory");
    setIsModalOpen(false);
    setFormData({ firstName: "", lastName: "", email: "", phone: "", addressStreet: "", addressCity: "", addressState: "", addressZip: "", type: "Salary", department: "", compensation: "", hireDate: new Date().toISOString().split('T')[0], birthday: "", cardId: "" });
  };

  const handleFileUpload = async (e) => {
      // ... (Keep existing CSV import logic mostly same, unless you want to parse Card ID from CSV too)
      if (!canEdit) return;
      const file = e.target.files[0]; if (!file) return;
      setImporting(true); 
      const reader = new FileReader();
      reader.onload = async (evt) => { 
          try { await processCSV(evt.target.result); } 
          catch (err) { console.error("Critical Import Error:", err); alert("Failed to process file. See console."); } 
          finally { setImporting(false); e.target.value = null; }
      };
      reader.onerror = () => { alert("Error reading file"); setImporting(false); };
      reader.readAsText(file);
  };

  const parseCSVFull = (text) => {
    // ... (Keep existing CSV parser)
    const rows = []; let currentRow = []; let currentVal = ""; let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i]; const nextChar = text[i + 1];
        if (char === '"') { if (inQuotes && nextChar === '"') { currentVal += '"'; i++; } else { inQuotes = !inQuotes; } }
        else if (char === ',' && !inQuotes) { currentRow.push(currentVal.trim()); currentVal = ""; }
        else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (currentVal || currentRow.length > 0) { currentRow.push(currentVal.trim()); rows.push(currentRow); currentRow = []; currentVal = ""; }
            if (char === '\r' && nextChar === '\n') i++;
        } else { currentVal += char; }
    }
    if (currentVal || currentRow.length > 0) { currentRow.push(currentVal.trim()); rows.push(currentRow); }
    return rows;
  };

  const parseFlexibleDate = (dateString) => {
      // ... (Keep existing date parser)
      if (!dateString) return null;
      const cleanDate = dateString.replace(/(\r\n|\n|\r)/gm, "").trim();
      if (cleanDate.includes('/')) {
          const parts = cleanDate.split('/');
          if (parts.length === 3) {
              const month = parseInt(parts[0], 10); const day = parseInt(parts[1], 10); let year = parseInt(parts[2], 10);
              if (year < 100) year += 2000; 
              if (month >= 1 && month <= 12 && day >= 1 && day <= 31) { return new Date(year, month - 1, day); }
          }
      }
      const d = new Date(cleanDate); return isNaN(d.getTime()) ? null : d;
  };

  const processCSV = async (csvText) => {
      // ... (Keep existing CSV process logic)
      // Note: If you want CSV to import Card IDs, you'd add it to the map here.
      // For brevity, I'll leave the bulk import as-is for now.
      console.log("Starting CSV Import...");
      const rows = parseCSVFull(csvText);
      if (rows.length < 2) { alert("File empty."); return; }

      const batch = writeBatch(db);
      let newCount = 0;
      const settingsSnap = await getDoc(doc(db, "settings", "checklists"));
      const templates = settingsSnap.exists() ? settingsSnap.data() : {};
      const defOnboard = (templates.salaryOnboarding || []).reduce((acc, i) => ({...acc, [i]: false}), {});
      const defOffboard = (templates.salaryOffboarding || []).reduce((acc, i) => ({...acc, [i]: false}), {});

      let headerRowIndex = -1; let colMap = {}; 
      for(let i=0; i<Math.min(rows.length, 5); i++) {
          if (rows[i][0]?.trim() === "First Name") {
              headerRowIndex = i;
              rows[i].forEach((col, idx) => { colMap[col.trim()] = idx; });
              break;
          }
      }
      if (headerRowIndex === -1) {
          headerRowIndex = 1; 
          colMap = { "First Name": 0, "Last Name": 1, "Email": 2, "Phone": 3, "Street Address": 4, "City": 5, "State": 6, "Zip": 7, "Date of Birth": 8, "Type": 9, "Compensation": 10, "Last Review Date": 11, "Start Date": 12, "Department": 13 }; 
      }

      for (let i = headerRowIndex + 1; i < rows.length; i++) {
          const cols = rows[i];
          if (!cols[0]?.trim() && !cols[1]?.trim()) continue;
          const getVal = (key, fallbackIdx) => { const idx = colMap[key] !== undefined ? colMap[key] : fallbackIdx; return cols[idx] || ""; };

          const typeRaw = getVal("Type", 9) || "Salary";
          const compRaw = getVal("Compensation", 10);
          const reviewRaw = getVal("Last Review Date", 11);
          const hireRaw = getVal("Start Date", 12);
          const deptRaw = getVal("Department", 13);

          const compValue = compRaw.replace(/[^0-9.]/g, ''); 
          let typeValue = "Salary";
          const lowerType = typeRaw.toLowerCase();
          if (lowerType.includes("hour") || lowerType.includes("hr") || lowerType.includes("part")) { typeValue = "Hourly"; }

          const reviewDate = parseFlexibleDate(reviewRaw);
          let hireDateValue = parseFlexibleDate(hireRaw);
          if (!hireDateValue) hireDateValue = new Date(); 
          const bdayDate = parseFlexibleDate(getVal("Date of Birth", 8)); 

          const empData = {
              firstName: getVal("First Name", 0) || "Unknown", lastName: getVal("Last Name", 1) || "Unknown",
              email: getVal("Email", 2), phone: getVal("Phone", 3),
              addressStreet: getVal("Street Address", 4), addressCity: getVal("City", 5), addressState: getVal("State", 6), addressZip: getVal("Zip", 7),
              birthday: bdayDate, compensation: compValue, type: typeValue, department: deptRaw || "",
              lastReviewDate: reviewDate, hireDate: hireDateValue,
              cardId: "" // Default empty for bulk import
          };
          empData.name = `${empData.firstName} ${empData.lastName}`.trim();
          
          const newRef = doc(collection(db, "employees"));
          batch.set(newRef, { ...empData, status: "Active", onboarding: defOnboard, offboarding: defOffboard, assignedKeyId: null, assignedLockerId: null, ptoLog: [] });
          newCount++;
      }

      if (newCount > 0) {
          await batch.commit();
          logAudit("Bulk Import", "CSV Upload", `Imported ${newCount} new staff members.`);
          alert(`Success! Imported ${newCount} staff members.`);
      } else { alert("No valid employee rows found."); }
  };

  if (loading) return <div style={{padding: 20}}>Loading Staff...</div>;

  return (
    <div>
      {/* HEADER */}
      <div style={{background:'white', padding: 20, borderRadius: 12, boxShadow: '0 2px 4px rgba(0,0,0,0.05)', marginBottom: 20}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 15}}>
              <h2 style={{margin:0}}>Staff Directory</h2>
              {canEdit && (
                  <button className="primary" onClick={() => setIsModalOpen(true)} style={{fontSize:'14px'}}>
                      + New Employee
                  </button>
              )}
          </div>

          <div style={{display:'flex', gap: 10, alignItems:'center', whiteSpace:'nowrap'}}>
              <input type="text" placeholder="🔍 Search name, email, or card ID..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{padding: '10px', width: '300px', border: '1px solid #cbd5e1', borderRadius: 6}} />
              <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} style={{padding: '10px', borderRadius: 6, border: '1px solid #cbd5e1', minWidth:'180px'}}>
                  <option value="All">All Departments</option>
                  {departmentOptions.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              {canViewArchived && (
                  <div style={{display:'flex', background:'#f1f5f9', padding: 4, borderRadius: 6, marginLeft: 'auto'}}>
                      <button onClick={() => setShowInactive(false)} style={{border:'none', background: !showInactive ? 'white' : 'transparent', color: !showInactive ? '#0f172a' : '#64748b', padding:'6px 12px', borderRadius: 4, fontWeight:'bold', cursor:'pointer', boxShadow: !showInactive ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'}}>Active</button>
                      <button onClick={() => setShowInactive(true)} style={{border:'none', background: showInactive ? 'white' : 'transparent', color: showInactive ? '#ef4444' : '#64748b', padding:'6px 12px', borderRadius: 4, fontWeight:'bold', cursor:'pointer', boxShadow: showInactive ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'}}>Archived</button>
                  </div>
              )}
          </div>
      </div>

      <div className="card-grid">
        {visibleEmployees.length === 0 && <p style={{color:'#94a3b8', textAlign:'center', gridColumn:'1/-1', marginTop: 20}}>No employees found matching criteria.</p>}
        {visibleEmployees.map(emp => {
            let reviewDisplay = "No Review Yet";
            if (emp.lastReviewDate) {
                const rd = emp.lastReviewDate.seconds ? new Date(emp.lastReviewDate.seconds * 1000) : new Date(emp.lastReviewDate);
                if(!isNaN(rd)) reviewDisplay = rd.toLocaleDateString();
            }
            return (
                <div key={emp.id} className="card-hover" style={{
                    opacity: emp.status === "Inactive" ? 0.6 : 1, 
                    background: emp.status === "Inactive" ? '#f1f5f9' : 'white',
                    padding: 15, borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    transition: 'transform 0.1s ease-in-out', display:'flex', flexDirection:'column', justifyContent:'space-between'
                }}>
                    <div>
                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                            <div>
                                <h3 style={{margin:0, fontSize:'16px', textDecoration: emp.status === "Inactive" ? 'line-through' : 'none'}}>{getDisplayName(emp)}</h3>
                                <p style={{color:'#64748b', fontSize:'12px', marginTop: 4, marginBottom: 8}}>{emp.email || "No Email"}{emp.phone && <span> | {emp.phone}</span>}</p>
                            </div>
                            <span style={{background: emp.status === 'Inactive' ? '#94a3b8' : (emp.type === 'Salary' ? '#e0f2fe' : '#f0fdf4'), color: emp.status === 'Inactive' ? 'white' : (emp.type === 'Salary' ? '#0284c7' : '#16a34a'), padding: '2px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: 'bold'}}>{emp.status === 'Inactive' ? 'Inactive' : emp.type}</span>
                        </div>
                        {emp.department && <div style={{fontSize:'11px', color:'#334155', fontWeight:'bold', background:'#f8fafc', border:'1px solid #e2e8f0', display:'inline-block', padding:'2px 6px', borderRadius:4, marginBottom: 10}}>🏢 {emp.department}</div>}
                        
                        {/* Added: Card ID Display */}
                        {emp.cardId && <div style={{fontSize:'11px', color:'#64748b', marginBottom: 5}}>🆔 Card: {emp.cardId}</div>}
                        
                        <div style={{fontSize:'12px', color:'#475569', marginTop: 5, marginBottom: 10}}>Last Review: <strong>{reviewDisplay}</strong></div>
                        {canViewMoney && emp.compensation && (<div style={{fontSize: '13px', color: '#334155', fontWeight:'bold', marginBottom:'15px'}}>{emp.type === 'Salary' ? `Salary: $${emp.compensation}/yr` : `Rate: $${emp.compensation}/hr`}</div>)}
                    </div>
                    <Link to={`/hr/employee/${emp.id}`} style={{textDecoration:'none'}}>
                        <button style={{width:'100%', background:'#f1f5f9', color:'#475569', border:'1px solid #e2e8f0', cursor:'pointer', padding:'8px', borderRadius: 4}}>{emp.status === 'Inactive' ? 'View Archive' : 'View Profile'}</button>
                    </Link>
                </div>
            )
        })}
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={(e) => {if(e.target.className === 'modal-overlay') setIsModalOpen(false)}}>
          <div className="modal" style={{maxHeight: '90vh', overflowY: 'auto', maxWidth: '95%'}}>
            <h3>New Hire</h3>
            <form onSubmit={handleAdd}>
              <div style={{display:'flex', gap:'10px'}}><input placeholder="First Name *" value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} required /><input placeholder="Last Name *" value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} required /></div>
              
              {/* Added: Card ID Input */}
              <div style={{marginTop: 10, background: '#f0fdf4', padding: 10, borderRadius: 6, border: '1px solid #bbf7d0'}}>
                  <label style={{fontSize:'12px', fontWeight:'bold', display:'block', color:'#166534'}}>RFID Card Assignment</label>
                  <input placeholder="Scan Card or Enter ID..." value={formData.cardId} onChange={e => setFormData({...formData, cardId: e.target.value})} style={{width: '100%', marginTop: 5, border: '1px solid #16a34a'}} />
                  <div style={{fontSize:'10px', color:'#15803d', marginTop: 4}}>* Assigning a card here will automatically enable iPad access.</div>
              </div>

              <div style={{display:'flex', gap:'10px'}}><div style={{flex:1}}><label style={{fontSize:'12px', fontWeight:'bold', marginTop:10, display:'block'}}>Start Date</label><input type="date" value={formData.hireDate} onChange={e => setFormData({...formData, hireDate: e.target.value})} required /></div><div style={{flex:1}}><label style={{fontSize:'12px', fontWeight:'bold', marginTop:10, display:'block'}}>Date of Birth</label><input type="date" value={formData.birthday} onChange={e => setFormData({...formData, birthday: e.target.value})} /></div></div>
              <label style={{fontSize:'12px', fontWeight:'bold', marginTop:10, display:'block'}}>Compensation</label><input type="number" placeholder="0.00" value={formData.compensation} onChange={e => setFormData({...formData, compensation: e.target.value})} />
              <label style={{fontSize:'12px', fontWeight:'bold', marginTop:10, display:'block'}}>Department</label><select value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})}><option value="">-- None --</option>{departmentOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}</select>
              <label style={{fontSize:'12px', fontWeight:'bold', marginTop:10, display:'block', borderTop:'1px solid #eee', paddingTop: 10}}>Mailing Address (Optional)</label><input placeholder="Street Address" value={formData.addressStreet} onChange={e => setFormData({...formData, addressStreet: e.target.value})} /><div style={{display:'flex', gap:'10px'}}><input placeholder="City" style={{flex: 2}} value={formData.addressCity} onChange={e => setFormData({...formData, addressCity: e.target.value})} /><input placeholder="State" style={{flex: 1}} value={formData.addressState} onChange={e => setFormData({...formData, addressState: e.target.value})} /><input placeholder="Zip" style={{flex: 1}} value={formData.addressZip} onChange={e => setFormData({...formData, addressZip: e.target.value})} /></div>
              <label style={{fontSize:'12px', fontWeight:'bold', marginTop:10, display:'block'}}>Contact Info</label>
              <input type="email" placeholder="Email Address" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
              <input type="tel" placeholder="Phone Number" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
              
              <label style={{display:'block', marginBottom:'5px', fontWeight:'bold', fontSize:'12px', marginTop: 10}}>Employee Type</label><select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}><option value="Salary">Salary (Full Benefits)</option><option value="Hourly">Hourly (Time Log)</option></select>
              <div style={{marginTop:'20px', display:'flex', gap:'10px'}}><button type="button" onClick={() => setIsModalOpen(false)} style={{flex:1, background:'#f1f5f9', color:'black'}}>Cancel</button><button type="submit" className="primary" style={{flex:1}}>Add Employee</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}