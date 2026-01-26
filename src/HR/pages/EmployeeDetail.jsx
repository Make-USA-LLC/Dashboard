import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { 
  doc, getDoc, updateDoc, collection, getDocs, onSnapshot, query, where
} from 'firebase/firestore'; 
import { db } from '../../firebase_config';
import { logAudit } from '../utils/logger'; 
import { useMsal } from "@azure/msal-react"; 
import { useRole } from '../hooks/useRole';

// ... (Keep your helper functions safeFormatDate, getYearlyAllowance unchanged) ...
// (I will omit them here for brevity, but keep them in your file)
const safeFormatDate = (dateVal) => {
    if (!dateVal) return null;
    try {
        if (dateVal.seconds) return new Date(dateVal.seconds * 1000).toLocaleDateString();
        return new Date(dateVal).toLocaleDateString();
    } catch (e) { return "Invalid Date"; }
};

const getYearlyAllowance = (viewYear, hireTimestamp, salaryStartTimestamp) => {
    const effectiveTimestamp = salaryStartTimestamp || hireTimestamp;
    if (!effectiveTimestamp) return { pto: 0, sick: 0, status: "Unknown" };
    const startDate = new Date(effectiveTimestamp * 1000);
    const startYear = startDate.getFullYear();
    const currentYear = new Date().getFullYear();
    const now = new Date();

    if (viewYear < startYear) return { pto: 0, sick: 0, status: "Not Eligible" };
    if (viewYear > currentYear) return { pto: 0, sick: 0, status: "Future Year" };

    if (viewYear < currentYear) {
        if (viewYear === startYear) {
            const endOfYear = new Date(viewYear, 11, 31);
            const daysInYear = 365;
            const msPerDay = 1000 * 60 * 60 * 24;
            const daysActive = Math.ceil((endOfYear - startDate) / msPerDay);
            return {
                pto: parseFloat(((daysActive / daysInYear) * 15).toFixed(2)),
                sick: parseFloat(((daysActive / daysInYear) * 5).toFixed(2)),
                status: "Prorated (Start Year)"
            };
        }
        return { pto: 15.00, sick: 5.00, status: "Full Year" };
    }

    if (viewYear === currentYear) {
        const startOfYear = new Date(currentYear, 0, 1);
        const startOfAccrual = startDate > startOfYear ? startDate : startOfYear;
        const msPerDay = 1000 * 60 * 60 * 24;
        const daysPassed = Math.ceil((now - startOfAccrual) / msPerDay);
        let accruedPto = daysPassed > 0 ? (daysPassed / 365) * 15 : 0;
        let sickAllowance = startDate > startOfYear 
            ? ((Math.ceil((new Date(currentYear, 11, 31) - startDate) / msPerDay)) / 365) * 5 
            : 5.00;
        return { 
            pto: parseFloat(accruedPto.toFixed(2)), 
            sick: parseFloat(sickAllowance.toFixed(2)),
            status: "Accruing / Front-Loaded"
        };
    }
    return { pto: 0, sick: 0, status: "Error" };
};

export default function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate(); 
  const location = useLocation(); // Used to get current path
  const { instance, accounts, inProgress } = useMsal();
  
  // --- STATE ---
  const [activeTab, setActiveTab] = useState("timeoff"); 
  
  // --- 1. RESTORE STATE AFTER REDIRECT ---
  // If we just came back from Microsoft, check if we need to open 'documents'
  useEffect(() => {
      const returnTab = sessionStorage.getItem('msal_return_tab');
      if (returnTab === 'documents' && accounts.length > 0) {
          console.log("Restoring Documents Tab...");
          setActiveTab('documents');
          sessionStorage.removeItem('msal_return_tab');
      }
  }, [accounts]);

  // --- 2. THE REDIRECT LOGIN FUNCTION ---
  const handleMicrosoftLogin = async () => { 
      try { 
          // A. Save our place ("Breadcrumb")
          // We save the Tab preference so we know to open it on return
          sessionStorage.setItem('msal_return_tab', 'documents');
          
          // B. Note: If your App.jsx redirects to Root on reload, 
          // you might need logic there to read 'window.location.pathname' 
          // but usually React Router preserves location if not forced otherwise.
          // If you get kicked to Dashboard, let me know, and we'll add a 'msal_return_path' check.

          // C. Redirect
          await instance.loginRedirect({ 
              scopes: ["Sites.ReadWrite.All", "Files.ReadWrite.All"],
              prompt: "select_account"
          }); 
      } catch (e) { 
          console.error(e);
          alert("Login Failed: " + e.message); 
      } 
  };

  // --- HELPER: Get Token (Robust) ---
  const getMsToken = useCallback(async () => {
      const request = { 
          scopes: ["Sites.ReadWrite.All", "Files.ReadWrite.All"], 
          account: accounts[0] 
      };
      try { 
          const response = await instance.acquireTokenSilent(request); 
          return response.accessToken; 
      } catch (err) { 
          // If silent fails, redirect (don't popup)
          await instance.acquireTokenRedirect(request);
      }
  }, [accounts, instance]);

  // ... (REST OF YOUR COMPONENT LOGIC REMAINS UNCHANGED BELOW) ...
  // Paste the rest of your component here (fetchSharePointFiles, useEffects, RBAC, etc.)
  // I will provide the FULL file below to be safe.
  
  const { checkAccess } = useRole(); 

  const canViewMoney = checkAccess('financials', 'view');
  const canEditMoney = checkAccess('financials', 'edit'); 
  const canEditProfile = checkAccess('employees', 'edit'); 
  const canEditGeneralInfo = checkAccess('employees', 'edit'); 
  const canEditType = checkAccess('financials', 'edit'); 
  const canStartReview = checkAccess('reviews', 'edit');
  const canEditLogs = checkAccess('pto', 'edit');
  
  const showTimeOff = checkAccess('pto', 'view'); 
  const showAssets  = checkAccess('assets_hardware', 'view') || checkAccess('assets_keys', 'view') || checkAccess('assets_lockers', 'view'); 
  
  const showChecklists = checkAccess('checklists', 'view');
  const showPerformance = checkAccess('reviews', 'view');
  const showTraining = checkAccess('training', 'view');
  const showDocuments = checkAccess('documents', 'view');
  
  const canEditHardware = checkAccess('assets_hardware', 'edit'); 
  const canEditKeysLockers = checkAccess('assets_keys', 'edit') || checkAccess('assets_lockers', 'edit'); 
  const showKeysLockers = checkAccess('assets_keys', 'view') || checkAccess('assets_lockers', 'view');    

  const [employee, setEmployee] = useState(null); 
  const [pastReviews, setPastReviews] = useState([]); 
  const [departmentOptions, setDepartmentOptions] = useState([]); 
  
  const [heldKeys, setHeldKeys] = useState([]);
  const [heldAssets, setHeldAssets] = useState([]);
  const [availableLockers, setAvailableLockers] = useState([]);
  
  const [availableAssets, setAvailableAssets] = useState([]);
  const [assignAssetModal, setAssignAssetModal] = useState(false);
  const [availableKeyTypes, setAvailableKeyTypes] = useState([]);
  const [assignKeyModal, setAssignKeyModal] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({});
  const [isCompModalOpen, setIsCompModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState(0);
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustTarget, setAdjustTarget] = useState("PTO");
  const [isLogEditModalOpen, setIsLogEditModalOpen] = useState(false);
  const [editingLogIndex, setEditingLogIndex] = useState(null);
  const [editingLogData, setEditingLogData] = useState({ date: "", type: "PTO", amount: 0, note: "" });

  const [isTerminateModalOpen, setIsTerminateModalOpen] = useState(false);
  const [terminationDateInput, setTerminationDateInput] = useState(new Date().toISOString().split('T')[0]);
  const [terminationReason, setTerminationReason] = useState("");

  const [certOptions, setCertOptions] = useState([]);
  const [isCertModalOpen, setIsCertModalOpen] = useState(false);
  const [certData, setCertData] = useState({ name: "", issueDate: "", expireDate: "", notes: "" });

  const [viewYear, setViewYear] = useState(new Date().getFullYear()); 
  const [manualInputMode, setManualInputMode] = useState(null); 
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [logReason, setLogReason] = useState("");
  const [logPaidInitial, setLogPaidInitial] = useState(false);
  const [ptoDate, setPtoDate] = useState(new Date().toISOString().split('T')[0]);
  const [ptoType, setPtoType] = useState("PTO"); 
  const [ptoAmount, setPtoAmount] = useState(1); 
  const [ptoNote, setPtoNote] = useState("");
  const [compDate, setCompDate] = useState(new Date().toISOString().split('T')[0]);
  const [compAmount, setCompAmount] = useState(1);
  const [compReason, setCompReason] = useState("");
  const [sickCarryover, setSickCarryover] = useState(0);

  const [isUploading, setIsUploading] = useState(false);
  const [spFiles, setSpFiles] = useState([]); 
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  useEffect(() => {
    const initData = async () => {
      const docSnap = await getDoc(doc(db, "employees", id));
      if (!docSnap.exists()) return;
      let empData = docSnap.data();
      if (!empData.assignedLockerIds) empData.assignedLockerIds = empData.assignedLockerId ? [empData.assignedLockerId] : [];
      if (!empData.certifications) empData.certifications = [];

      if (checkAccess('checklists', 'view')) {
          const settingsSnap = await getDoc(doc(db, "settings", "checklists"));
          const templates = settingsSnap.exists() ? settingsSnap.data() : {};
          const masterOnboard = empData.type === "Salary" ? (templates.salaryOnboarding || []) : (templates.hourlyOnboarding || []);
          const masterOffboard = empData.type === "Salary" ? (templates.salaryOffboarding || []) : (templates.hourlyOffboarding || []);
          let needsUpdate = false;
          const currentOnboard = empData.onboarding || {};
          const currentOffboard = empData.offboarding || {};
          masterOnboard.forEach(item => { if (currentOnboard[item] === undefined) { currentOnboard[item] = false; needsUpdate = true; } });
          masterOffboard.forEach(item => { if (currentOffboard[item] === undefined) { currentOffboard[item] = false; needsUpdate = true; } });
          if (needsUpdate) {
              await updateDoc(doc(db, "employees", id), { onboarding: currentOnboard, offboarding: currentOffboard });
              empData.onboarding = currentOnboard;
              empData.offboarding = currentOffboard;
          }
      }
      setEmployee(empData);
      setSickCarryover(empData.sickCarryover || 0);

      if (checkAccess('reviews', 'view')) {
          const qReviews = query(collection(db, "reviews"), where("employeeId", "==", id));
          const reviewSnap = await getDocs(qReviews);
          const revList = reviewSnap.docs.map(d => ({id: d.id, ...d.data()}));
          revList.sort((a,b) => (b.date || "").localeCompare(a.date || ""));
          setPastReviews(revList);
      }

      const globalSnap = await getDoc(doc(db, "settings", "global_options"));
      if(globalSnap.exists()) {
          if (globalSnap.data().departments) setDepartmentOptions(globalSnap.data().departments);
          if (globalSnap.data().certTypes) setCertOptions(globalSnap.data().certTypes);
      }
    };
    initData();
  }, [id, checkAccess]);

  useEffect(() => {
    if (!showAssets) return;
    const fetchResources = async () => {
        const qAssets = query(collection(db, "assets"), where("assignedToId", "==", id));
        const unsubAssets = onSnapshot(qAssets, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
            setHeldAssets(list);
        }, (e) => console.log("Asset fetch restricted"));

        let unsubKeys = () => {};
        if (showKeysLockers) {
            const fetchLockers = async () => {
                try {
                    const snap = await getDocs(collection(db, "lockers"));
                    const list = snap.docs.map(d => ({id: d.id, ...d.data()}));
                    const filtered = list.filter(l => (!l.isOccupied || l.assignedToId === id) && !l.isOutOfOrder);
                    filtered.sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
                    setAvailableLockers(filtered);
                } catch(e) { console.log("Locker fetch restricted"); }
            };
            fetchLockers();
            const qKeys = query(collection(db, "keys"), where("holderId", "==", id));
            unsubKeys = onSnapshot(qKeys, (snap) => setHeldKeys(snap.docs.map(d => ({ id: d.id, ...d.data() }))), (e) => console.log("Key fetch restricted"));
        }
        return () => { unsubAssets(); unsubKeys(); };
    };
    fetchResources();
  }, [id, showAssets, showKeysLockers]);

  const fetchSharePointFiles = useCallback(async () => {
      if (!employee || accounts.length === 0 || !showDocuments) return;
      setIsLoadingFiles(true);
      try {
          const token = await getMsToken();
          if(!token) return; // If token fails, user is redirecting
          const SITE_ID = "makeitbuzz.sharepoint.com,5f466306-673d-4008-a8cc-86bdb931024f,eb52fce7-86e8-43c9-b592-cf8da705e9ef";
          const safeName = `${employee.lastName}_${employee.firstName}`.replace(/[^a-zA-Z0-9_-]/g, "");
          const folderPath = `/sites/${SITE_ID}/drive/root:/Documents/HR/Personnel Folders/${safeName}:/children`;
          const response = await fetch(`https://graph.microsoft.com/v1.0${folderPath}`, { headers: { "Authorization": `Bearer ${token}` } });
          if (response.ok) { const data = await response.json(); setSpFiles(data.value || []); } else { if(response.status === 404) setSpFiles([]); }
      } catch (e) { console.error(e); } finally { setIsLoadingFiles(false); }
  }, [employee, accounts, getMsToken, showDocuments]);

  useEffect(() => { if (activeTab === 'documents') fetchSharePointFiles(); }, [activeTab, fetchSharePointFiles]);

  const handleSharePointUpload = async (e) => {
      const file = e.target.files[0]; if (!file) return; if (!confirm(`Upload "${file.name}" to SharePoint?`)) return; setIsUploading(true);
      try {
          const token = await getMsToken();
          if(!token) return;
          const SITE_ID = "makeitbuzz.sharepoint.com,5f466306-673d-4008-a8cc-86bdb931024f,eb52fce7-86e8-43c9-b592-cf8da705e9ef";
          const safeName = `${employee.lastName}_${employee.firstName}`.replace(/[^a-zA-Z0-9_-]/g, "");
          const fileName = file.name;
          const filePath = `/sites/${SITE_ID}/drive/root:/Documents/HR/Personnel Folders/${safeName}/${fileName}:/content?@microsoft.graph.conflictBehavior=rename`;
          const uploadResponse = await fetch(`https://graph.microsoft.com/v1.0${filePath}`, { method: "PUT", headers: { "Authorization": `Bearer ${token}`, "Content-Type": file.type }, body: file });
          if (!uploadResponse.ok) throw new Error("SharePoint Error: " + uploadResponse.statusText);
          logAudit("Document Upload", employee.name, `Uploaded ${file.name}`);
          alert("File uploaded successfully!"); fetchSharePointFiles(); 
      } catch (error) { console.error(error); alert("Upload failed: " + error.message); } finally { setIsUploading(false); e.target.value = null; }
  };

  const handleStartReview = () => { navigate('/hr/reviews', { state: { startReviewForId: id } }); };
  const fetchAvailableKeys = async () => { const snap = await getDocs(collection(db, "keys")); const allKeys = snap.docs.map(d => ({ id: d.id, ...d.data() })); const available = allKeys.filter(k => !k.holderId); const types = {}; available.forEach(k => { if (!types[k.name]) types[k.name] = []; types[k.name].push(k); }); setAvailableKeyTypes(types); setAssignKeyModal(true); };
  const fetchAvailableAssets = async () => { const q = query(collection(db, "assets"), where("status", "==", "Available")); const snap = await getDocs(q); const list = snap.docs.map(d => ({ id: d.id, ...d.data() })); list.sort((a, b) => (a.name || "").localeCompare(b.name || "")); setAvailableAssets(list); setAssignAssetModal(true); };
  
  const assignAssetToEmployee = async (assetId) => { 
      const asset = availableAssets.find(a => a.id === assetId); 
      const empName = employee.firstName ? `${employee.firstName} ${employee.lastName}` : employee.name; 
      await updateDoc(doc(db, "assets", assetId), { assignedToId: id, assignedToName: empName, status: "Assigned" }); 
      logAudit("Assign Asset", asset.name, `Assigned to ${empName} (via Profile)`); 
      setAssignAssetModal(false); 
  };
  
  const returnAsset = async (asset) => { 
      if(!confirm(`Return ${asset.name}?`)) return; 
      await updateDoc(doc(db, "assets", asset.id), { assignedToId: null, assignedToName: "", status: "Available" }); 
      logAudit("Return Asset", asset.name, `Returned from ${employee.name} (via Profile)`); 
  };
  
  const assignKeyToEmployee = async (keyName) => { 
      const keyToAssign = availableKeyTypes[keyName][0]; 
      if (!keyToAssign) return; 
      const empName = employee.firstName ? `${employee.firstName} ${employee.lastName}` : employee.name; 
      await updateDoc(doc(db, "keys", keyToAssign.id), { holderId: id, holderName: empName }); 
      logAudit("Assign Key", keyName, `Assigned to ${empName} (via Profile)`); 
      setAssignKeyModal(false); 
  };
  
  const returnKey = async (key) => { 
      if(!confirm(`Return key "${key.name}"?`)) return; 
      await updateDoc(doc(db, "keys", key.id), { holderId: null, holderName: "" }); 
      logAudit("Return Key", key.name, `Returned from ${employee.name} (via Profile)`); 
  };
  
  const addLocker = async (newLockerId) => { 
      if(!newLockerId) return; 
      const empName = employee.firstName ? `${employee.firstName} ${employee.lastName}` : employee.name; 
      await updateDoc(doc(db, "lockers", newLockerId), { isOccupied: true, assignedToName: empName, assignedToId: id }); 
      const currentLockers = employee.assignedLockerIds || []; 
      if (!currentLockers.includes(newLockerId)) { 
          const updatedLockers = [...currentLockers, newLockerId]; 
          await updateDoc(doc(db, "employees", id), { assignedLockerIds: updatedLockers }); 
          setEmployee({ ...employee, assignedLockerIds: updatedLockers }); 
          logAudit("Assign Locker", newLockerId, `Assigned to ${empName} (via Profile)`); 
      } 
  };
  
  const removeLocker = async (lockerId) => { 
      if(!confirm(`Unassign locker ${lockerId}?`)) return; 
      await updateDoc(doc(db, "lockers", lockerId), { isOccupied: false, assignedToName: "", assignedToId: null }); 
      const currentLockers = employee.assignedLockerIds || []; 
      const updatedLockers = currentLockers.filter(l => l !== lockerId); 
      await updateDoc(doc(db, "employees", id), { assignedLockerIds: updatedLockers }); 
      setEmployee({ ...employee, assignedLockerIds: updatedLockers }); 
      logAudit("Unassign Locker", lockerId, `Removed from ${employee.name} (via Profile)`); 
  };
  
  const openEditModal = () => {
      const formatDate = (ts) => { if (!ts) return ""; try { const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts); return !isNaN(d) ? d.toISOString().split('T')[0] : ""; } catch (e) { return ""; } };
      setEditFormData({
          firstName: employee.firstName || "", lastName: employee.lastName || "", email: employee.email || "", phone: employee.phone || "",
          addressStreet: employee.addressStreet || "", addressCity: employee.addressCity || "", addressState: employee.addressState || "", addressZip: employee.addressZip || "",
          compensation: employee.compensation || "", type: employee.type || "Salary",
          department: employee.department || "", 
          hireDate: formatDate(employee.hireDate), salaryStartDate: formatDate(employee.salaryStartDate), 
          birthday: formatDate(employee.birthday), lastReviewDate: formatDate(employee.lastReviewDate),
          terminationDate: formatDate(employee.terminationDate) 
      });
      setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e) => {
      e.preventDefault();
      const updates = { 
          firstName: editFormData.firstName, lastName: editFormData.lastName, name: `${editFormData.firstName} ${editFormData.lastName}`, email: editFormData.email, phone: editFormData.phone, addressStreet: editFormData.addressStreet, addressCity: editFormData.addressCity, addressState: editFormData.addressState, addressZip: editFormData.addressZip, type: editFormData.type, department: editFormData.department 
      };
      
      if (canEditMoney) { updates.compensation = editFormData.compensation; }

      if (editFormData.hireDate) updates.hireDate = new Date(editFormData.hireDate + 'T12:00:00');
      if (editFormData.salaryStartDate) updates.salaryStartDate = new Date(editFormData.salaryStartDate + 'T12:00:00');
      if (editFormData.birthday) updates.birthday = new Date(editFormData.birthday + 'T12:00:00');
      if (editFormData.lastReviewDate) updates.lastReviewDate = new Date(editFormData.lastReviewDate + 'T12:00:00');
      if (editFormData.terminationDate) { updates.terminationDate = new Date(editFormData.terminationDate + 'T12:00:00'); } else { updates.terminationDate = null; }

      try {
          await updateDoc(doc(db, "employees", id), updates);
          logAudit("Profile Edit", employee.name, "Updated profile details.");
          const newLocal = { ...employee, ...updates };
          if(updates.hireDate) newLocal.hireDate = { seconds: updates.hireDate.getTime()/1000 };
          if(updates.salaryStartDate) newLocal.salaryStartDate = { seconds: updates.salaryStartDate.getTime()/1000 };
          if(updates.birthday) newLocal.birthday = { seconds: updates.birthday.getTime()/1000 };
          if(updates.lastReviewDate) newLocal.lastReviewDate = { seconds: updates.lastReviewDate.getTime()/1000 };
          if(updates.terminationDate) newLocal.terminationDate = { seconds: updates.terminationDate.getTime()/1000 };
          else newLocal.terminationDate = null;
          setEmployee(newLocal);
          setIsEditModalOpen(false);
      } catch (err) { console.error(err); alert("Error saving: Permission denied."); }
  };

  const handleTerminateClick = () => { setTerminationDateInput(new Date().toISOString().split('T')[0]); setIsTerminateModalOpen(true); };
  const confirmTermination = async (e) => {
      e.preventDefault(); if(!confirm("Are you sure?")) return;
      const updates = { 
          status: "Inactive", 
          terminationDate: new Date(terminationDateInput + 'T12:00:00'),
          terminationReason: terminationReason 
      };
      await updateDoc(doc(db, "employees", id), updates);
      logAudit("Employee Terminated", employee.name, `Terminated. Reason: ${terminationReason}`);
      const newLocal = {...employee, ...updates}; newLocal.terminationDate = { seconds: updates.terminationDate.getTime()/1000 }; setEmployee(newLocal); setIsTerminateModalOpen(false);
  };

  const handleRehire = async () => {
      if(!confirm("Rehire this employee? Resetting logs.")) return;
      const settingsSnap = await getDoc(doc(db, "settings", "checklists"));
      const templates = settingsSnap.exists() ? settingsSnap.data() : {};
      const masterOnboard = employee.type === "Salary" ? (templates.salaryOnboarding || []) : (templates.hourlyOnboarding || []);
      const masterOffboard = employee.type === "Salary" ? (templates.salaryOffboarding || []) : (templates.hourlyOffboarding || []);
      const newOnboard = {}; const newOffboard = {};
      masterOnboard.forEach(item => newOnboard[item] = false); masterOffboard.forEach(item => newOffboard[item] = false);
      const updates = { status: "Active", terminationDate: null, ptoLog: [], hourlyLog: [], sickCarryover: 0, onboarding: newOnboard, offboarding: newOffboard };
      await updateDoc(doc(db, "employees", id), updates);
      logAudit("Employee Rehired", employee.name, "Reactivated and reset logs.");
      const newLocal = {...employee, ...updates}; setEmployee(newLocal);
  };

  const saveSickCarryover = async (val) => { let num = parseFloat(val); if(isNaN(num)) num=0; if(num>5) num=5; if(num<0) num=0; setSickCarryover(num); await updateDoc(doc(db, "employees", id), { sickCarryover: num }); setEmployee({ ...employee, sickCarryover: num }); };
  
  const toggleChecklist = async (type, item) => { 
      const currentList = employee[type] || {}; 
      const newVal = !currentList[item];
      const updatedList = { ...currentList, [item]: newVal }; 
      await updateDoc(doc(db, "employees", id), { [type]: updatedList }); 
      setEmployee({ ...employee, [type]: updatedList }); 
      logAudit("Checklist Update", employee.name, `${newVal ? 'Checked' : 'Unchecked'} ${item} in ${type}`); 
  };
  
  const addHourlyLog = async (e) => { e.preventDefault(); if(!logReason) return; const newEntry = { date: logDate, reason: logReason, paid: logPaidInitial, isDeleted: false, timestamp: Date.now() }; const updatedLog = [newEntry, ...(employee.hourlyLog || [])]; await updateDoc(doc(db, "employees", id), { hourlyLog: updatedLog }); setEmployee({ ...employee, hourlyLog: updatedLog }); logAudit("Attendance Log", employee.name, `Added Call-In: ${logReason}`); setLogReason(""); }; 
  const addPtoLog = async (e) => { e.preventDefault(); const newEntry = { date: ptoDate, type: ptoType, amount: parseFloat(ptoAmount), note: ptoNote, timestamp: Date.now() }; const updatedLog = [newEntry, ...(employee.ptoLog || [])]; await updateDoc(doc(db, "employees", id), { ptoLog: updatedLog }); setEmployee({ ...employee, ptoLog: updatedLog }); logAudit("PTO Log", employee.name, `Added ${ptoAmount} days ${ptoType}`); setPtoNote(""); }; 
  const togglePaidStatus = async (index) => { const updatedLog = [...employee.hourlyLog]; updatedLog[index].paid = !updatedLog[index].paid; await updateDoc(doc(db, "employees", id), { hourlyLog: updatedLog }); setEmployee({ ...employee, hourlyLog: updatedLog }); };
  const toggleSoftDelete = async (index) => { const updatedLog = [...employee.hourlyLog]; updatedLog[index].isDeleted = !updatedLog[index].isDeleted; await updateDoc(doc(db, "employees", id), { hourlyLog: updatedLog }); setEmployee({ ...employee, hourlyLog: updatedLog }); };
  const deletePtoLog = async (index) => { if(!confirm("Remove entry?")) return; const updatedLog = [...employee.ptoLog]; updatedLog.splice(index, 1); await updateDoc(doc(db, "employees", id), { ptoLog: updatedLog }); setEmployee({ ...employee, ptoLog: updatedLog }); logAudit("PTO Log", employee.name, "Deleted time off entry"); }; 
  const openCompModal = () => { setCompDate(new Date().toISOString().split('T')[0]); setCompReason(""); setCompAmount(1); setIsCompModalOpen(true); };
  const handleCompSubmit = async (e) => { e.preventDefault(); const newEntry = { date: compDate, type: "Comp", amount: parseFloat(compAmount), note: "Comp: "+compReason, timestamp: Date.now() }; const updatedLog = [newEntry, ...(employee.ptoLog || [])]; await updateDoc(doc(db, "employees", id), { ptoLog: updatedLog }); setEmployee({ ...employee, ptoLog: updatedLog }); logAudit("Comp Time", employee.name, `Added ${compAmount} days comp time`); setIsCompModalOpen(false); }; 
  const openAdjustModal = (target) => { setAdjustTarget(target); setAdjustAmount(0); setAdjustNote(""); setIsAdjustModalOpen(true); };
  const handleAdjustSubmit = async (e) => { e.preventDefault(); let entryDate = new Date().toISOString().split('T')[0]; const currentYearStr = new Date().getFullYear().toString(); if (String(viewYear) !== currentYearStr) entryDate = `${viewYear}-01-01`; const typeStr = adjustTarget === "Sick" ? "Sick Adjustment" : "PTO Adjustment"; const newEntry = { date: entryDate, type: typeStr, amount: parseFloat(adjustAmount), note: `Manual ${adjustTarget} Adjustment: ` + adjustNote, timestamp: Date.now() }; const updatedLog = [newEntry, ...(employee.ptoLog || [])]; await updateDoc(doc(db, "employees", id), { ptoLog: updatedLog }); setEmployee({ ...employee, ptoLog: updatedLog }); logAudit("PTO Adjustment", employee.name, `Adjusted ${adjustTarget} by ${adjustAmount}`); setIsAdjustModalOpen(false); }; 
  const openLogEdit = (index, log) => { const realIndex = employee.ptoLog.findIndex(l => l.timestamp === log.timestamp && l.note === log.note); if(realIndex === -1) return; setEditingLogIndex(realIndex); setEditingLogData({ date: log.date, type: log.type, amount: log.amount, note: log.note || "" }); setIsLogEditModalOpen(true); };
  const saveLogEdit = async (e) => { e.preventDefault(); if (editingLogIndex === null) return; const updatedLog = [...employee.ptoLog]; updatedLog[editingLogIndex] = { ...updatedLog[editingLogIndex], date: editingLogData.date, type: editingLogData.type, amount: parseFloat(editingLogData.amount), note: editingLogData.note }; await updateDoc(doc(db, "employees", id), { ptoLog: updatedLog }); setEmployee({ ...employee, ptoLog: updatedLog }); logAudit("PTO Log", employee.name, "Edited existing time off entry"); setIsLogEditModalOpen(false); setEditingLogIndex(null); }; 

  const handleAddCert = async (e) => {
      e.preventDefault();
      const newCert = { ...certData, id: Date.now() };
      const updatedCerts = [...(employee.certifications || []), newCert];
      await updateDoc(doc(db, "employees", id), { certifications: updatedCerts });
      setEmployee({ ...employee, certifications: updatedCerts });
      logAudit("Add Cert", employee.name, `Added ${certData.name}`);
      setIsCertModalOpen(false);
      setCertData({ name: "", issueDate: "", expireDate: "", notes: "" });
  };
  const deleteCert = async (certId) => {
      if(!confirm("Remove this certification?")) return;
      const updatedCerts = (employee.certifications || []).filter(c => c.id !== certId);
      await updateDoc(doc(db, "employees", id), { certifications: updatedCerts });
      setEmployee({ ...employee, certifications: updatedCerts });
      logAudit("Remove Cert", employee.name, "Removed certification");
  };

  if (!employee) return <div style={{padding: 20, fontWeight:'bold', color:'#64748b'}}>Loading Employee Profile...</div>;

  const isLocked = employee.status === "Inactive"; 
  const hireDateDisplay = employee.hireDate ? new Date(employee.hireDate.seconds * 1000).toLocaleDateString() : "Unknown";
  let salaryStartDisplay = null; if (employee.salaryStartDate) { salaryStartDisplay = new Date(employee.salaryStartDate.seconds * 1000).toLocaleDateString(); }
  let reviewDisplay = "No Review Yet";
  if (employee.lastReviewDate) { const rd = employee.lastReviewDate.seconds ? new Date(employee.lastReviewDate.seconds * 1000) : new Date(employee.lastReviewDate); if (!isNaN(rd)) reviewDisplay = rd.toLocaleDateString(); }
  
  const currentYear = new Date().getFullYear();
  let startYear = currentYear;
  if (employee.hireDate) startYear = new Date(employee.hireDate.seconds * 1000).getFullYear();
  if (startYear > currentYear) startYear = currentYear;
  const yearList = []; for (let y = currentYear; y >= startYear; y--) { yearList.push(y); }

  let isSalaryInViewYear = false;
  let isTransitionYear = false;
  if (employee.type === "Salary") {
      if (employee.salaryStartDate) {
          const salStartYear = new Date(employee.salaryStartDate.seconds * 1000).getFullYear();
          if (viewYear > salStartYear) isSalaryInViewYear = true; 
          if (viewYear === salStartYear) { isSalaryInViewYear = true; isTransitionYear = true; }
      } else { isSalaryInViewYear = true; }
  } else { isSalaryInViewYear = false; }
  const inputModeSalary = manualInputMode ? (manualInputMode === 'Salary') : isSalaryInViewYear;

  const filteredPtoLogs = (employee.ptoLog || []).filter(log => log.date.startsWith(String(viewYear)));
  const filteredHourlyLogs = (employee.hourlyLog || []).filter(log => log.date.startsWith(String(viewYear)));

  const yearlyAllowance = getYearlyAllowance(viewYear, employee.hireDate?.seconds, employee.salaryStartDate?.seconds);
  let usedPTO = 0, usedSick = 0, addedComp = 0, ptoAdjustments = 0, sickAdjustments = 0;
  filteredPtoLogs.forEach(log => { if (log.type === "PTO") usedPTO += log.amount; if (log.type === "Sick") usedSick += log.amount; if (log.type === "Comp") addedComp += log.amount; if (log.type === "PTO Adjustment") ptoAdjustments += log.amount; if (log.type === "Sick Adjustment") sickAdjustments += log.amount; if (log.type === "Adjustment") ptoAdjustments += log.amount; });
  let autoCarryover = 0;
  if (viewYear > startYear && viewYear >= 2026) { const prevYear = viewYear - 1; const prevLogs = (employee.ptoLog || []).filter(log => log.date.startsWith(String(prevYear))); let sickUsedPrev = 0; prevLogs.forEach(log => { if(log.type === "Sick") sickUsedPrev += log.amount; }); const allowance = 5; const remainder = Math.max(0, allowance - sickUsedPrev); autoCarryover = Math.min(remainder, 5); }
  const ptoBalance = (yearlyAllowance.pto + addedComp + ptoAdjustments - usedPTO).toFixed(2);
  const isPtoNegative = parseFloat(ptoBalance) < 0;
  const sickBalance = ((yearlyAllowance.sick + autoCarryover + sickAdjustments) - usedSick).toFixed(2);
  const applyAutoCarryover = () => { if(confirm(`Apply calculated carryover of ${autoCarryover} days?`)) { saveSickCarryover(autoCarryover); } };

  const TabButton = ({ name, label, icon }) => (
      <div 
        onClick={() => setActiveTab(name)} 
        style={{
            padding: '12px 20px', cursor: 'pointer', fontWeight: activeTab === name ? 'bold' : '500', 
            color: activeTab === name ? '#2563eb' : '#64748b', borderBottom: activeTab === name ? '3px solid #2563eb' : '3px solid transparent',
            display: 'flex', alignItems: 'center', gap: 8
        }}
      >
          <span>{icon}</span> {label}
      </div>
  );

  return (
    <div>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom: '20px', background: 'white', padding: 20, borderRadius: 12, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'}}>
            <div>
                <div style={{display:'flex', alignItems:'center', gap: 10}}>
                    <h1 style={{margin:0, textDecoration: employee.status === "Inactive" ? 'line-through' : 'none'}}>{employee.firstName ? `${employee.firstName} ${employee.lastName}` : employee.name}</h1>
                    {employee.status === "Inactive" && <span style={{background:'#94a3b8', color:'white', padding:'4px 10px', borderRadius:20, fontSize:'12px', fontWeight:'bold'}}>INACTIVE</span>}
                    {canEditProfile && !isLocked && <button onClick={openEditModal} className="text-only" style={{fontSize:'12px', color:'#2563eb', border:'1px solid #2563eb', padding:'2px 8px', borderRadius: 4}}>✎ Edit Profile</button>}
                    {canStartReview && !isLocked && <button onClick={handleStartReview} style={{fontSize:'12px', color:'#ca8a04', border:'1px solid #ca8a04', padding:'2px 8px', borderRadius: 4, cursor:'pointer'}}>⭐ Start Review</button>}
                </div>
                {employee.department && <div style={{fontSize:'12px', color:'#334155', fontWeight:'bold', background:'#f1f5f9', display:'inline-block', padding:'2px 6px', borderRadius:4, marginTop: 5, marginBottom: 5}}>🏢 {employee.department}</div>}
                {employee.terminationDate && (<div style={{fontSize:'12px', color:'#ef4444', fontWeight:'bold', marginTop: 5}}>🚫 Terminated: {safeFormatDate(employee.terminationDate)}</div>)}
                <p style={{color:'#64748b', margin:0}}>{employee.email || "No Email"} • {employee.phone || "No Phone"}</p>
                <div style={{marginTop: 10, display:'flex', gap: 10, alignItems:'center'}}>
                    <span style={{background: employee.type === 'Salary' ? '#e0f2fe' : '#f0fdf4', color: employee.type === 'Salary' ? '#0284c7' : '#16a34a', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold'}}>{employee.type}</span>
                    <span style={{color: '#94a3b8', fontSize: '12px'}}>Started: {hireDateDisplay}</span>
                    {canViewMoney && employee.compensation && <span style={{color: '#334155', fontWeight:'bold', fontSize: '13px', marginLeft: 10}}>{employee.type === "Salary" ? `$${employee.compensation}/yr` : `$${employee.compensation}/hr`}</span>}
                </div>
            </div>
            <div style={{textAlign:'right'}}>
               <div style={{marginTop: 20}}>
                   {employee.status === "Inactive" ? (
                       canEditGeneralInfo && <button onClick={handleRehire} style={{background:'#22c55e', color:'white', border:'none', padding:'8px 15px', borderRadius: 6, fontWeight:'bold', cursor:'pointer'}}>⟳ Rehire & Reset</button>
                   ) : (
                       canEditGeneralInfo && <button onClick={handleTerminateClick} style={{background:'#f1f5f9', color:'#ef4444', border:'none', padding:'8px 15px', borderRadius: 6, fontWeight:'bold', cursor:'pointer'}}>Archive / Terminate</button>
                   )}
               </div>
            </div>
        </div>

        <div style={{display:'flex', gap: 10, marginBottom: 20, borderBottom:'1px solid #e2e8f0', overflowX:'auto'}}>
            {showTimeOff && <TabButton name="timeoff" label="Time Off" icon="📅" />}
            {showAssets  && <TabButton name="assets" label="Assets" icon="🔑" />}
            {showChecklists  && <TabButton name="checklists" label="Checklists" icon="✅" />}
            {showPerformance  && <TabButton name="performance" label="Performance" icon="📈" />}
            {showTraining  && <TabButton name="training" label="Training" icon="🎓" />}
            {showDocuments  && <TabButton name="documents" label="Documents" icon="📁" />}
        </div>

        {/* ... (TABS CONTENT) ... */}
        {activeTab === 'timeoff' && showTimeOff && (
            <div className="card" style={{marginBottom: '24px', opacity: isLocked ? 0.6 : 1}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 20}}>
                  <div style={{display:'flex', alignItems:'center', gap: 15}}>
                      <h3>Time Off Management</h3>
                      <select value={viewYear} onChange={e => { setViewYear(parseInt(e.target.value)); setManualInputMode(null); }} style={{fontSize:'16px', padding:'5px', borderRadius: 6, fontWeight:'bold', color:'#334155', border:'1px solid #cbd5e1'}}>{yearList.map(y => <option key={y} value={y}>{y}</option>)}</select>
                      {isTransitionYear && (<div style={{display:'flex', gap: 0, border:'1px solid #cbd5e1', borderRadius: 6, overflow:'hidden'}}><button onClick={() => setManualInputMode('Hourly')} style={{background: !inputModeSalary ? '#e2e8f0' : 'white', border:'none', padding:'5px 10px', fontSize:'12px', cursor:'pointer', fontWeight: !inputModeSalary ? 'bold' : 'normal'}}>Hourly Entry</button><button onClick={() => setManualInputMode('Salary')} style={{background: inputModeSalary ? '#e2e8f0' : 'white', border:'none', padding:'5px 10px', fontSize:'12px', cursor:'pointer', fontWeight: inputModeSalary ? 'bold' : 'normal'}}>Salary Entry</button></div>)}
                  </div>
                  {isSalaryInViewYear && !isLocked && canEditLogs && (<button onClick={openCompModal} style={{background:'#dbeafe', color:'#1e40af', fontSize:'12px', border:'1px dashed #1e40af'}}>+ Add Comp Day (Earned)</button>)}
              </div>

              {isSalaryInViewYear && (
                  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20}}>
                      <div style={{background: '#f0f9ff', padding: 15, borderRadius: 8}}>
                          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                              <div style={{display:'flex', alignItems:'center', gap: 5}}><span style={{color: '#0369a1', fontWeight: 'bold'}}>PTO Balance ({viewYear})</span>{canEditLogs && !isLocked && <button onClick={() => openAdjustModal("PTO")} title="Manually Adjust Balance" style={{background:'transparent', border:'none', cursor:'pointer', fontSize:'16px', color:'#0369a1'}}>✎</button>}</div>
                              <div style={{fontSize:'11px', color:'#64748b'}}>Allowance: <strong>{yearlyAllowance.pto}d</strong></div>
                          </div>
                          <div style={{display:'flex', alignItems:'baseline', gap: 10}}><div style={{fontSize: '28px', fontWeight: 'bold', color: isPtoNegative ? '#dc2626' : '#0c4a6e'}}>{ptoBalance}</div><small style={{color:'#64748b'}}>days remaining</small></div>
                      </div>
                      <div style={{background: '#f0fdf4', padding: 15, borderRadius: 8}}>
                          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                              <div style={{display:'flex', alignItems:'center', gap: 5}}><span style={{color: '#15803d', fontWeight: 'bold'}}>Sick Balance ({viewYear})</span>{canEditLogs && !isLocked && <button onClick={() => openAdjustModal("Sick")} title="Manually Adjust Balance" style={{background:'transparent', border:'none', cursor:'pointer', fontSize:'16px', color:'#15803d'}}>✎</button>}</div>
                              <div style={{fontSize:'11px', color:'#64748b', background:'white', padding:'2px 6px', borderRadius:4, border:'1px solid #e2e8f0'}}>Auto-Carryover: <strong>{autoCarryover}</strong>{canEditLogs && !isLocked && sickCarryover !== autoCarryover && (<button onClick={applyAutoCarryover} style={{marginLeft: 5, border:'none', background:'transparent', color:'blue', cursor:'pointer', textDecoration:'underline'}}>Apply</button>)}</div>
                          </div>
                          <div style={{display:'flex', alignItems:'baseline', gap: 10}}><div style={{fontSize: '28px', fontWeight: 'bold', color: '#14532d'}}>{sickBalance}</div><small style={{color:'#64748b'}}>days remaining</small></div>
                      </div>
                  </div>
              )}

              {canEditLogs && !isLocked && (
                  <div style={{marginBottom: 20}}>
                      {inputModeSalary ? (
                           <form onSubmit={addPtoLog} style={{background:'#f8fafc', padding:15, borderRadius:8, display:'flex', gap: 10, alignItems:'flex-end'}}>
                              <div style={{flex: 1}}><label style={{fontSize: 12}}>Date</label><input type="date" value={ptoDate} onChange={e => setPtoDate(e.target.value)} required style={{width:'100%'}}/></div>
                              <div style={{flex: 1}}><label style={{fontSize: 12}}>Type</label><select value={ptoType} onChange={e => setPtoType(e.target.value)} style={{width:'100%'}}><option value="PTO">PTO</option><option value="Sick">Sick</option></select></div>
                              <div style={{flex: 1}}><label style={{fontSize: 12}}>Amount</label><select value={ptoAmount} onChange={e => setPtoAmount(e.target.value)} style={{width:'100%'}}><option value="1">1 Day</option><option value="0.5">0.5 Day</option></select></div>
                              <div style={{flex: 2}}><label style={{fontSize: 12}}>Note</label><input type="text" value={ptoNote} onChange={e => setPtoNote(e.target.value)} style={{width:'100%'}} /></div>
                              <button type="submit" className="primary" style={{marginBottom: 2}}>Record PTO</button>
                          </form>
                      ) : (
                          <form onSubmit={addHourlyLog} style={{background:'#f8fafc', padding:15, borderRadius:8, display:'flex', gap: 10, alignItems:'flex-end'}}>
                              <div style={{flex: 1}}><label style={{fontSize: 12}}>Date</label><input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} required style={{width:'100%'}}/></div>
                              <div style={{flex: 3}}><label style={{fontSize: 12}}>Reason</label><input type="text" value={logReason} onChange={e => setLogReason(e.target.value)} required style={{width:'100%'}}/></div>
                              <div style={{display:'flex', alignItems:'center', paddingBottom: 10}}><label style={{fontSize: 14}}><input type="checkbox" checked={logPaidInitial} onChange={e => setLogPaidInitial(e.target.checked)} /> Paid?</label></div>
                              <button type="submit" className="primary" style={{marginBottom: 2}}>Add Log</button>
                          </form>
                      )}
                  </div>
              )}

              {(filteredPtoLogs.length > 0 || isSalaryInViewYear || isTransitionYear) && (
                  <div style={{marginBottom: 30}}>
                      <h4 style={{margin: '0 0 10px 0', color: '#64748b', fontSize: '13px', textTransform:'uppercase'}}>Salary Time Off Log ({viewYear})</h4>
                      {filteredPtoLogs.length === 0 ? (<p style={{fontStyle:'italic', color:'#94a3b8', fontSize:'14px'}}>No time off recorded this year.</p>) : (
                          <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '14px'}}>
                              <thead><tr style={{borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b'}}><th style={{padding: 8}}>Date</th><th style={{padding: 8}}>Type</th><th style={{padding: 8}}>Amount</th><th style={{padding: 8}}>Note</th><th style={{padding: 8}}></th></tr></thead>
                              <tbody>{filteredPtoLogs.map((log, index) => (<tr key={index} style={{borderBottom: '1px solid #f1f5f9'}}><td style={{padding: 8}}>{log.date}</td><td style={{padding: 8}}><span style={{background: log.type === 'PTO' ? '#e0f2fe' : (log.type === 'Comp' ? '#dbeafe' : (log.type.includes('Adjustment') ? '#f3f4f6' : '#f0fdf4')), color: log.type === 'PTO' ? '#0369a1' : (log.type === 'Comp' ? '#1e40af' : (log.type.includes('Adjustment') ? '#4b5563' : '#15803d')), padding: '2px 8px', borderRadius: 4, fontSize: '11px', fontWeight:'bold'}}>{log.type}</span></td><td style={{padding: 8}}>{log.amount}</td><td style={{padding: 8, color:'#64748b'}}>{log.note}</td><td style={{padding: 8, textAlign:'right'}}>{!isLocked && canEditLogs && <div style={{display:'flex', justifyContent:'flex-end', gap: 5}}><button className="text-only" onClick={() => openLogEdit(index, log)} style={{color:'#64748b'}}>Edit</button><button className="text-only" onClick={() => deletePtoLog(index)} style={{color:'#ef4444'}}>Delete</button></div>}</td></tr>))}</tbody>
                          </table>
                      )}
                  </div>
              )}

              {(filteredHourlyLogs.length > 0 || !isSalaryInViewYear || isTransitionYear) && (
                  <div>
                      <h4 style={{margin: '0 0 10px 0', color: '#64748b', fontSize: '13px', textTransform:'uppercase'}}>Hourly Call-In Log ({viewYear})</h4>
                      {filteredHourlyLogs.length === 0 ? (<p style={{fontStyle:'italic', color:'#94a3b8', fontSize:'14px'}}>No call-ins recorded this year.</p>) : (
                          <table style={{width: '100%', borderCollapse: 'collapse'}}>
                              <thead><tr style={{borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b'}}><th style={{padding: 10}}>Date</th><th style={{padding: 10}}>Reason</th><th style={{padding: 10}}>Paid?</th><th style={{padding: 10}}>Action</th></tr></thead>
                              <tbody>{filteredHourlyLogs.map((log, index) => (<tr key={index} style={{borderBottom: '1px solid #f1f5f9', opacity: log.isDeleted ? 0.5 : 1, textDecoration: log.isDeleted ? 'line-through' : 'none', background: log.isDeleted ? '#f9fafb' : 'transparent'}}><td style={{padding: 10}}>{log.date}</td><td style={{padding: 10}}>{log.reason}</td><td style={{padding: 10}}><input type="checkbox" checked={log.paid} onChange={() => togglePaidStatus(index)} disabled={isLocked || log.isDeleted} /></td><td style={{padding: 10}}>{!isLocked && canEditLogs && <button className="text-only" onClick={() => toggleSoftDelete(index)}>{log.isDeleted ? "RESTORE" : "CROSS OUT"}</button>}</td></tr>))}</tbody>
                          </table>
                      )}
                  </div>
              )}
            </div>
        )}

        {/* ... (Other Tabs and Modals) ... */}
        {activeTab === 'assets' && showAssets && (
            <div className="card" style={{opacity: isLocked ? 0.7 : 1}}>
                <h3>Assets & Resources</h3>
                <div style={{display: 'flex', flexDirection: 'column', gap: 20}}>
                    <div style={{border:'1px solid #e2e8f0', padding: 15, borderRadius: 8}}>
                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                            <h4 style={{margin:0}}>Hardware ({heldAssets.length})</h4>
                            {canEditHardware && !isLocked && <button className="text-only" onClick={fetchAvailableAssets} style={{color:'#2563eb', fontWeight:'bold'}}>+ Issue Hardware</button>}
                        </div>
                        <div style={{marginTop: 10}}>
                            {heldAssets.length === 0 && <p style={{color:'#94a3b8', fontSize:'13px'}}>No hardware assigned.</p>}
                            {heldAssets.map(a => (
                                <div key={a.id} style={{padding: 8, borderBottom: '1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                    <div><span style={{fontWeight:'bold', color: '#334155'}}>{a.name}</span> <span style={{fontSize:'12px', color:'#64748b'}}>({a.category})</span></div>
                                    {canEditHardware && <button className="text-only" onClick={() => returnAsset(a)} style={{color:'#ef4444', fontSize:'12px'}}>Return</button>}
                                </div>
                            ))}
                        </div>
                    </div>
                    {showKeysLockers && (
                        <>
                        <div style={{border:'1px solid #e2e8f0', padding: 15, borderRadius: 8}}>
                            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                <h4 style={{margin:0}}>Keys ({heldKeys.length})</h4>
                                {!isLocked && <button className="text-only" onClick={fetchAvailableKeys} style={{color:'#2563eb', fontWeight:'bold'}}>+ Issue Key</button>}
                            </div>
                            <div style={{marginTop: 10}}>
                                {heldKeys.length === 0 && <p style={{color:'#94a3b8', fontSize:'13px'}}>No keys assigned.</p>}
                                {heldKeys.map(k => (
                                    <div key={k.id} style={{padding: 8, borderBottom: '1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                            <span style={{fontWeight:'bold', color: '#334155'}}>{k.name}</span>
                                            <button className="text-only" onClick={() => returnKey(k)} style={{color:'#ef4444', fontSize:'12px'}}>Return</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div style={{border:'1px solid #e2e8f0', padding: 15, borderRadius: 8}}>
                            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                <h4 style={{margin:0}}>Lockers ({employee.assignedLockerIds?.length || 0})</h4>
                                {!isLocked && <select onChange={(e) => { addLocker(e.target.value); e.target.value = ""; }} style={{padding: '3px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: '12px', maxWidth: '120px'}}><option value="">+ Add Locker</option>{availableLockers.filter(l => !l.isOccupied).map(l => (<option key={l.id} value={l.id}>#{l.id} ({l.side})</option>))}</select>}
                            </div>
                            <div style={{marginTop: 10}}>
                                {(employee.assignedLockerIds || []).length === 0 && <p style={{color:'#94a3b8', fontSize:'13px'}}>No lockers assigned.</p>}
                                {(employee.assignedLockerIds || []).map(lid => (
                                    <div key={lid} style={{padding: 8, borderBottom: '1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                            <span style={{fontWeight:'bold', color: '#334155'}}>Locker #{lid}</span>
                                            <button className="text-only" onClick={() => removeLocker(lid)} style={{color:'#ef4444', fontSize:'12px'}}>Unassign</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                        </>
                    )}
                </div>
            </div>
        )}

        {/* TRAINING TAB */}
        {activeTab === 'training' && showTraining && (
            <div className="card">
                <div style={{display:'flex', justifyContent:'space-between', marginBottom: 20}}>
                    <h3>Training & Certifications</h3>
                    {!isLocked && <button className="primary" onClick={() => setIsCertModalOpen(true)}>+ Add Certification</button>}
                </div>
                {(employee.certifications || []).length === 0 ? <p style={{fontStyle:'italic', color:'#94a3b8'}}>No certifications on file.</p> : (
                    <table style={{width:'100%', borderCollapse:'collapse'}}>
                        <thead><tr style={{textAlign:'left', borderBottom:'2px solid #e2e8f0', color:'#64748b'}}><th style={{padding:10}}>Type</th><th style={{padding:10}}>Issued</th><th style={{padding:10}}>Expires</th><th style={{padding:10}}>Notes</th><th style={{padding:10}}>Action</th></tr></thead>
                        <tbody>
                            {(employee.certifications || []).map((c) => (
                                <tr key={c.id} style={{borderBottom:'1px solid #f1f5f9'}}>
                                    <td style={{padding:10, fontWeight:'bold'}}>{c.name}</td>
                                    <td style={{padding:10}}>{c.issueDate}</td>
                                    <td style={{padding:10, color: new Date(c.expireDate) < new Date() ? '#ef4444' : '#16a34a', fontWeight:'bold'}}>{c.expireDate}</td>
                                    <td style={{padding:10, color:'#64748b'}}>{c.notes}</td>
                                    <td style={{padding:10}}><button className="text-only" onClick={() => deleteCert(c.id)} style={{color:'#ef4444'}}>Remove</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        )}

        {activeTab === 'checklists' && showChecklists && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', opacity: isLocked ? 0.5 : 1 }}>
              <div className="card"><h3 style={{borderBottom: '1px solid #eee', paddingBottom: '10px'}}>Onboarding</h3>{Object.entries(employee.onboarding || {}).map(([task, isDone]) => (<div key={task} className="checklist-item" style={{display:'flex', alignItems:'center', gap:'10px', padding:'10px 0'}}><input type="checkbox" style={{width:'20px', height:'20px', margin:0}} checked={isDone} onChange={() => !isLocked && toggleChecklist('onboarding', task)} disabled={isLocked} /><span style={{textDecoration: isDone ? 'line-through' : 'none', color: isDone ? '#cbd5e1' : 'inherit'}}>{task}</span></div>))}</div>
              <div className="card"><h3 style={{borderBottom: '1px solid #eee', paddingBottom: '10px', color: '#ef4444'}}>Offboarding</h3>{Object.entries(employee.offboarding || {}).map(([task, isDone]) => { if (task === 'returnKeys') return null; return (<div key={task} className="checklist-item" style={{padding:'10px 0'}}><label style={{display:'flex', alignItems:'center', gap: 10}}><input type="checkbox" style={{width:20, height:20}} checked={isDone} onChange={() => !isLocked && toggleChecklist('offboarding', task)} disabled={isLocked} /> <span style={{textDecoration: isDone ? 'line-through' : 'none', color: isDone ? '#cbd5e1' : 'inherit'}}>{task}</span></label></div>); })}</div>
            </div>
        )}

        {activeTab === 'performance' && showPerformance && (
            <div className="card">
                <h3 style={{borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: 15, color:'#334155'}}>Performance History</h3>
                {pastReviews.length === 0 ? (
                    <p style={{color:'#94a3b8', fontStyle:'italic'}}>No reviews found for this employee.</p>
                ) : (
                    <table style={{width:'100%', borderCollapse:'collapse', fontSize:'14px'}}>
                        <thead>
                            <tr style={{textAlign:'left', borderBottom:'2px solid #e2e8f0', color:'#64748b'}}>
                                <th style={{padding: 8}}>Date</th><th style={{padding: 8}}>Score</th><th style={{padding: 8}}>Status</th><th style={{padding: 8}}>Approved Salary</th><th style={{padding: 8}}>Approved By</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pastReviews.map(r => (
                                <tr 
                                    key={r.id} 
                                    style={{borderBottom:'1px solid #f1f5f9', cursor:'pointer', background: 'white', transition:'background 0.2s'}}
                                    onClick={() => navigate('/hr/reviews', { state: { viewReviewId: r.id } })}
                                    onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'}
                                    onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                                >
                                    <td style={{padding: 8}}>{new Date(r.date).toLocaleDateString()}</td>
                                    <td style={{padding: 8}}><span style={{fontWeight:'bold', color: r.results.totalScore > 80 ? '#16a34a' : (r.results.totalScore > 50 ? '#ca8a04' : '#dc2626')}}>{r.results.totalScore.toFixed(1)}</span></td>
                                    <td style={{padding: 8}}><span style={{background: r.status === 'Approved' ? '#dcfce7' : '#f3f4f6', color: r.status === 'Approved' ? '#166534' : '#4b5563', padding: '2px 8px', borderRadius: 10, fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase'}}>{r.status}</span></td>
                                    <td style={{padding: 8}}>{r.approvedSalary ? `$${r.approvedSalary.toFixed(2)}` : <span style={{color:'#94a3b8'}}>-</span>}</td>
                                    <td style={{padding: 8, color:'#64748b', fontSize:'12px'}}>{r.approvedBy || "-"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        )}

        {/* DOCUMENTS TAB - THIS IS WHERE THE MAGIC HAPPENS */}
        {activeTab === 'documents' && showDocuments && (
            <div className="card">
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 20}}>
                    <h3>Employee Documents (SharePoint)</h3>
                    <div>
                        {accounts.length > 0 ? (
                            <>
                                <input type="file" id="sp-upload" style={{display:'none'}} onChange={handleSharePointUpload} disabled={isUploading} />
                                <label htmlFor="sp-upload" style={{background: isUploading ? '#cbd5e1' : '#0f172a', color:'white', padding:'10px 20px', borderRadius:6, cursor: isUploading ? 'not-allowed' : 'pointer', fontWeight: 'bold', display: 'inline-block'}}>{isUploading ? "Uploading..." : "📤 Upload to SharePoint"}</label>
                            </>
                        ) : (
                            <button onClick={handleMicrosoftLogin} style={{background: '#0078d4', color:'white', padding:'10px 20px', borderRadius:6, cursor:'pointer', fontWeight: 'bold', border: 'none', display: 'flex', alignItems: 'center', gap: 10}}>Connect to SharePoint</button>
                        )}
                    </div>
                </div>
                {(spFiles && spFiles.length > 0) ? (
                    <div style={{display:'grid', gap: 10}}>
                        {spFiles.map((file, idx) => (
                            <div key={idx} style={{padding: 15, border:'1px solid #e2e8f0', borderRadius: 8, display:'flex', justifyContent:'space-between', alignItems:'center', background: '#f8fafc'}}>
                                <div style={{display:'flex', gap: 15, alignItems:'center'}}>
                                    <span style={{fontSize:'24px'}}>📄</span>
                                    <div><a href={file.webUrl} target="_blank" rel="noreferrer" style={{fontWeight:'bold', color:'#2563eb', textDecoration:'none', fontSize:'16px'}}>{file.name}</a><div style={{fontSize:'12px', color:'#64748b', marginTop: 4}}>Size: {(file.size / 1024).toFixed(1)} KB • Modified: {new Date(file.lastModifiedDateTime).toLocaleDateString()}</div></div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{padding: 40, textAlign:'center', color:'#94a3b8', border:'2px dashed #e2e8f0', borderRadius: 8}}>{isLoadingFiles ? <p>Loading files from SharePoint...</p> : <p>No documents found.</p>}</div>
                )}
            </div>
        )}

      {/* --- MODALS (Edit, Terminate, Comp, Adjust, Assign Assets, Keys) --- */}
      {/* (MODALS CODE IS SAME AS BEFORE) */}
      
      {assignKeyModal && (
        <div className="modal-overlay" onClick={(e) => {if(e.target.className === 'modal-overlay') setAssignKeyModal(false)}}>
          <div className="modal">
            <h3>Issue Key</h3>
            {Object.keys(availableKeyTypes).length === 0 ? <p style={{color:'red'}}>No keys available.</p> : (
                <div style={{display:'flex', flexDirection:'column', gap:10}}>
                    {Object.keys(availableKeyTypes).map(type => (
                        <button key={type} onClick={() => assignKeyToEmployee(type)} style={{textAlign:'left', padding:10, border:'1px solid #e2e8f0', background:'white', cursor:'pointer', borderRadius:6}}>
                            <strong>{type}</strong><br/><span style={{fontSize:'12px', color:'#64748b'}}>({availableKeyTypes[type].length})</span>
                        </button>
                    ))}
                </div>
            )}
            <button onClick={() => setAssignKeyModal(false)} style={{marginTop:20, width:'100%'}}>Cancel</button>
          </div>
        </div>
      )}

      {assignAssetModal && (
        <div className="modal-overlay" onClick={(e) => {if(e.target.className === 'modal-overlay') setAssignAssetModal(false)}}>
          <div className="modal">
            <h3>Issue Equipment</h3>
            {availableAssets.length === 0 ? <p style={{color:'red'}}>No assets available.</p> : (
                <div style={{maxHeight:'300px', overflowY:'auto'}}>
                    {availableAssets.map(a => (
                        <button key={a.id} onClick={() => assignAssetToEmployee(a.id)} style={{textAlign:'left', display:'block', width:'100%', padding:10, marginBottom:5, border:'1px solid #e2e8f0', background:'white', cursor:'pointer', borderRadius:6}}>
                            <strong>{a.name}</strong><br/><span style={{fontSize:'12px', color:'#64748b'}}>{a.category} • {a.serial}</span>
                        </button>
                    ))}
                </div>
            )}
            <button onClick={() => setAssignAssetModal(false)} style={{marginTop:20, width:'100%'}}>Cancel</button>
          </div>
        </div>
      )}
      
      {isEditModalOpen && (
        <div className="modal-overlay" onClick={(e) => {if(e.target.className === 'modal-overlay') setIsEditModalOpen(false)}}>
          <div className="modal" style={{maxHeight: '90vh', overflowY: 'auto', maxWidth: '95%'}}>
            <h3>Edit Profile</h3>
            <form onSubmit={handleEditSubmit}>
                <div style={{display:'flex', gap: 10}}>
                    <div style={{flex:1}}><label>First Name</label><input value={editFormData.firstName} onChange={e => setEditFormData({...editFormData, firstName: e.target.value})} required disabled={!canEditGeneralInfo} style={{background: !canEditGeneralInfo ? '#f1f5f9' : 'white'}}/></div>
                    <div style={{flex:1}}><label>Last Name</label><input value={editFormData.lastName} onChange={e => setEditFormData({...editFormData, lastName: e.target.value})} required disabled={!canEditGeneralInfo} style={{background: !canEditGeneralInfo ? '#f1f5f9' : 'white'}}/></div>
                </div>
                <div style={{display:'flex', gap: 10}}>
                    <div style={{flex:1}}><label>Start Date</label><input type="date" value={editFormData.hireDate} onChange={e => setEditFormData({...editFormData, hireDate: e.target.value})} required disabled={!canEditGeneralInfo} /></div>
                    <div style={{flex:1}}><label>Salary Start Date</label><input type="date" value={editFormData.salaryStartDate} onChange={e => setEditFormData({...editFormData, salaryStartDate: e.target.value})} disabled={!canEditGeneralInfo} /></div>
                </div>
                <div style={{display:'flex', gap: 10, marginTop: 10}}>
                    <div style={{flex:1}}>
                        <label>Employee Type</label>
                        <select value={editFormData.type} onChange={e => setEditFormData({...editFormData, type: e.target.value})} disabled={!canEditType}>
                            <option value="Salary">Salary</option>
                            <option value="Hourly">Hourly</option>
                        </select>
                    </div>
                    {canViewMoney && (<div style={{flex:1}}><label>Compensation</label><input type="number" value={editFormData.compensation} onChange={e => setEditFormData({...editFormData, compensation: e.target.value})} style={{border: '2px solid #22c55e'}} disabled={!canEditMoney} /></div>)}
                </div>
                <label style={{marginTop: 10, display: 'block', fontWeight: 'bold'}}>Department</label>
                <select value={editFormData.department} onChange={e => setEditFormData({...editFormData, department: e.target.value})} style={{width: '100%', marginBottom: 10}} disabled={!canEditGeneralInfo}><option value="">-- None --</option>{departmentOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}</select>
                <div style={{marginTop: 15, padding: 10, background: '#fee2e2', borderRadius: 6}}>
                    <label style={{fontWeight: 'bold', color: '#b91c1c'}}>Termination Date (Optional)</label>
                    <input type="date" value={editFormData.terminationDate} onChange={e => setEditFormData({...editFormData, terminationDate: e.target.value})} style={{border: '1px solid #f87171'}} disabled={!canEditGeneralInfo}/>
                </div>
                <label style={{marginTop:10, display:'block'}}>Email</label><input value={editFormData.email} onChange={e => setEditFormData({...editFormData, email: e.target.value})} disabled={!canEditGeneralInfo} />
                <label>Phone</label><input value={editFormData.phone} onChange={e => setEditFormData({...editFormData, phone: e.target.value})} disabled={!canEditGeneralInfo} />
                <label style={{marginTop:10, fontWeight:'bold', display:'block'}}>Mailing Address</label><input placeholder="Street" value={editFormData.addressStreet} onChange={e => setEditFormData({...editFormData, addressStreet: e.target.value})} disabled={!canEditGeneralInfo} /><div style={{display:'flex', gap: 10}}><input placeholder="City" value={editFormData.addressCity} onChange={e => setEditFormData({...editFormData, addressCity: e.target.value})} style={{flex:2}} disabled={!canEditGeneralInfo}/><input placeholder="State" value={editFormData.addressState} onChange={e => setEditFormData({...editFormData, addressState: e.target.value})} style={{flex:1}} disabled={!canEditGeneralInfo}/><input placeholder="Zip" value={editFormData.addressZip} onChange={e => setEditFormData({...editFormData, addressZip: e.target.value})} style={{flex:1}} disabled={!canEditGeneralInfo}/></div>
                <div style={{marginTop: 20, display:'flex', gap: 10}}><button type="button" onClick={() => setIsEditModalOpen(false)} style={{flex:1}}>Cancel</button><button type="submit" className="primary" style={{flex:1}}>Save Changes</button></div>
            </form>
          </div>
        </div>
      )}

      {isCompModalOpen && (
        <div className="modal-overlay" onClick={(e) => {if(e.target.className === 'modal-overlay') setIsCompModalOpen(false)}}>
          <div className="modal" style={{maxHeight: '90vh', overflowY: 'auto', maxWidth: '95%'}}>
            <h3>Add Earned Comp Time</h3>
            <p style={{fontSize:'12px', color:'#64748b'}}>Log work performed on a non-work day.</p>
            <form onSubmit={handleCompSubmit}>
                <label>Date Worked</label><input type="date" value={compDate} onChange={e => setCompDate(e.target.value)} required />
                <label>Amount (Days Earned)</label><select value={compAmount} onChange={e => setCompAmount(e.target.value)}><option value="1">1 Day</option><option value="0.5">0.5 Day</option></select>
                <label>Reason / Note</label><input placeholder="e.g. Worked Saturday Shift" value={compReason} onChange={e => setCompReason(e.target.value)} required />
                <div style={{marginTop: 20, display:'flex', gap: 10}}><button type="button" onClick={() => setIsCompModalOpen(false)} style={{flex:1}}>Cancel</button><button type="submit" className="primary" style={{flex:1}}>Add Comp Day</button></div>
            </form>
          </div>
        </div>
      )}

      {isAdjustModalOpen && (
        <div className="modal-overlay" onClick={(e) => {if(e.target.className === 'modal-overlay') setIsAdjustModalOpen(false)}}>
          <div className="modal" style={{maxHeight: '90vh', overflowY: 'auto', maxWidth: '95%'}}>
            <h3>Adjust {adjustTarget} Balance</h3>
            <p style={{fontSize:'12px', color:'#64748b'}}>Manually add or remove days. (Use negative numbers to remove)</p>
            <form onSubmit={handleAdjustSubmit}>
                <label>Adjustment Amount (Days)</label>
                <input type="number" step="0.5" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} required style={{fontWeight:'bold', fontSize:'18px', color:'#2563eb'}} />
                <label>Reason for Correction</label>
                <input placeholder="e.g. Starting balance migration" value={adjustNote} onChange={e => setAdjustNote(e.target.value)} required />
                <div style={{marginTop: 20, display:'flex', gap: 10}}><button type="button" onClick={() => setIsAdjustModalOpen(false)} style={{flex:1}}>Cancel</button><button type="submit" className="primary" style={{flex:1}}>Save Adjustment</button></div>
            </form>
          </div>
        </div>
      )}

      {isLogEditModalOpen && (
        <div className="modal-overlay" onClick={(e) => {if(e.target.className === 'modal-overlay') setIsLogEditModalOpen(false)}}>
          <div className="modal" style={{maxHeight: '90vh', overflowY: 'auto', maxWidth: '95%'}}>
            <h3>Edit History Entry</h3>
            <form onSubmit={saveLogEdit}>
                <label>Date</label><input type="date" value={editingLogData.date} onChange={e => setEditingLogData({...editingLogData, date: e.target.value})} required />
                <label>Type</label><select value={editingLogData.type} onChange={e => setEditingLogData({...editingLogData, type: e.target.value})}><option value="PTO">PTO</option><option value="Sick">Sick</option><option value="Comp">Comp</option><option value="Adjustment">Adjustment</option></select>
                <label>Amount</label><input type="number" step="0.25" value={editingLogData.amount} onChange={e => setEditingLogData({...editingLogData, amount: e.target.value})} />
                <label>Note</label><input value={editingLogData.note} onChange={e => setEditingLogData({...editingLogData, note: e.target.value})} />
                <div style={{marginTop: 20, display:'flex', gap: 10}}><button type="button" onClick={() => setIsLogEditModalOpen(false)} style={{flex:1}}>Cancel</button><button type="submit" className="primary" style={{flex:1}}>Save Changes</button></div>
            </form>
          </div>
        </div>
      )}

      {isTerminateModalOpen && (
        <div className="modal-overlay" onClick={(e) => {if(e.target.className === 'modal-overlay') setIsTerminateModalOpen(false)}}>
          <div className="modal" style={{maxHeight: '90vh', overflowY: 'auto', maxWidth: '95%'}}>
            <h3>Terminate Employee</h3>
            <p style={{fontSize:'12px', color:'#ef4444'}}>This will mark the employee as Inactive. They will not be able to edit logs or checklists.</p>
            <form onSubmit={confirmTermination}>
                <label>Termination Date</label>
                <input type="date" value={terminationDateInput} onChange={e => setTerminationDateInput(e.target.value)} required />
                <label style={{marginTop: 10, display:'block'}}>Reason for Termination</label>
                <select value={terminationReason} onChange={e => setTerminationReason(e.target.value)} required style={{width:'100%', marginBottom: 20}}>
                    <option value="">-- Select Reason --</option>
                    <option value="Voluntary Resignation">Voluntary Resignation</option>
                    <option value="Involuntary - Performance">Involuntary - Performance</option>
                    <option value="Involuntary - Attendance">Involuntary - Attendance</option>
                    <option value="Layoff / RIF">Layoff / RIF</option>
                    <option value="Other">Other</option>
                </select>
                <div style={{marginTop: 20, display:'flex', gap: 10}}>
                    <button type="button" onClick={() => setIsTerminateModalOpen(false)} style={{flex:1}}>Cancel</button>
                    <button type="submit" style={{flex:1, background:'#ef4444', color:'white', fontWeight:'bold', border:'none'}}>Terminate</button>
                </div>
            </form>
          </div>
        </div>
      )}

      {/* NEW CERTIFICATION MODAL */}
      {isCertModalOpen && (
        <div className="modal-overlay" onClick={(e) => {if(e.target.className === 'modal-overlay') setIsCertModalOpen(false)}}>
          <div className="modal">
            <h3>Add Certification</h3>
            <form onSubmit={handleAddCert}>
                <label>Certification Type</label>
                <select value={certData.name} onChange={e => setCertData({...certData, name: e.target.value})} required>
                    <option value="">-- Select Type --</option>
                    {certOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
                <div style={{display:'flex', gap: 10, marginTop: 10}}>
                    <div style={{flex:1}}>
                        <label>Issued Date</label>
                        <input type="date" value={certData.issueDate} onChange={e => setCertData({...certData, issueDate: e.target.value})} required />
                    </div>
                    <div style={{flex:1}}>
                        <label>Expiration Date</label>
                        <input type="date" value={certData.expireDate} onChange={e => setCertData({...certData, expireDate: e.target.value})} required />
                    </div>
                </div>
                <label style={{marginTop: 10, display:'block'}}>Notes (Optional)</label>
                <input value={certData.notes} onChange={e => setCertData({...certData, notes: e.target.value})} placeholder="e.g. License #12345" style={{width:'100%'}} />
                <div style={{marginTop: 20, display:'flex', gap: 10}}>
                    <button type="button" onClick={() => setIsCertModalOpen(false)} style={{flex:1}}>Cancel</button>
                    <button type="submit" className="primary" style={{flex:1}}>Save Cert</button>
                </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}