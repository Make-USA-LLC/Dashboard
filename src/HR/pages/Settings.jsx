import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { logAudit } from '../utils/logger';
import { useRole } from '../hooks/useRole';

const sortList = (list) => {
  if (!list) return [];
  return [...list].sort((a, b) => {
    if (a === "Other") return 1;
    if (b === "Other") return -1;
    return a.localeCompare(b);
  });
};

export default function Settings() {
  const location = useLocation();
  const { checkAccess } = useRole();

  const canViewGeneral = checkAccess('settings_general', 'view');
  const canEditGeneral = checkAccess('settings_general', 'edit');
  const canEditSchedule = checkAccess('schedule', 'edit');
  const canViewTraining = checkAccess('employees', 'view');
  const canViewChecklists = checkAccess('checklists', 'view');
  const canViewReviews = checkAccess('reviews', 'view');
  const canEditLockers = checkAccess('assets_lockers', 'edit');

  const [isMasterAdmin, setIsMasterAdmin] = useState(false);

  useEffect(() => {
    const checkMasterAdmin = async () => {
      if (auth.currentUser?.email) {
        const adminSnap = await getDoc(doc(db, "master_admin_access", auth.currentUser.email));
        if (adminSnap.exists()) setIsMasterAdmin(true);
      }
    };
    checkMasterAdmin();
  }, []);

  const [activeTab, setActiveTab] = useState("general");
  const [loading, setLoading] = useState(true);

  const [globalOptions, setGlobalOptions] = useState({
    assetCategories: [],
    assetStatuses: [],
    reviewApprovers: [],
    departments: [],
    shiftBlocks: [],
    scheduleAreas: [],
    certTypes: [],
    lunchDuration: 30,
    shiftColorRules: [],
    shiftCategories: [],
    defaultPto: 15,
    defaultSick: 5
  });

  // Color Rule State
  const [ruleForm, setRuleForm] = useState({ start: '', end: '', color: '#ffcc00', areas: [] });
  const [editingRuleIdx, setEditingRuleIdx] = useState(null);

  // Sorting Category State
  const [catForm, setCatForm] = useState({ name: '', start: '', end: '' });
  const [editingCatIdx, setEditingCatIdx] = useState(null);

  const [reviewConfig, setReviewConfig] = useState({ maxSalary: 25.00, minWage: 15.00, seniorityCap: 25, seniorityWeight: 10, categories: [] });
  const [checklistTemplates, setChecklistTemplates] = useState({ salaryOnboarding: [], salaryOffboarding: [], hourlyOnboarding: [], hourlyOffboarding: [] });
  const [lockerConfig, setLockerConfig] = useState({ walls: [{ name: "Left", banks: 12 }], sizes: [{ name: "Medium", height: 120 }] });
  const PIXELS_PER_INCH = 5;

  useEffect(() => {
    if (location.state && location.state.activeTab) setActiveTab(location.state.activeTab);

    const loadData = async () => {
      const globalSnap = await getDoc(doc(db, "settings", "global_options"));
      if (globalSnap.exists()) {
        const data = globalSnap.data();
        setGlobalOptions({
          ...data,
          departments: sortList(data.departments || []),
          assetCategories: sortList(data.assetCategories || []),
          assetStatuses: sortList(data.assetStatuses || []),
          shiftBlocks: data.shiftBlocks || [], 
          scheduleAreas: sortList(data.scheduleAreas || []),
          certTypes: sortList(data.certTypes || []),
          lunchDuration: data.lunchDuration !== undefined ? data.lunchDuration : 30,
          shiftColorRules: data.shiftColorRules || [],
          shiftCategories: data.shiftCategories || [],
          defaultPto: data.defaultPto !== undefined ? data.defaultPto : 15,
          defaultSick: data.defaultSick !== undefined ? data.defaultSick : 5
        });
      }

      if (canViewReviews || canViewChecklists) {
        const reviewSnap = await getDoc(doc(db, "settings", "reviews"));
        if (reviewSnap.exists()) setReviewConfig(prev => ({ ...prev, ...reviewSnap.data() }));
        const checkSnap = await getDoc(doc(db, "settings", "checklists"));
        if (checkSnap.exists()) setChecklistTemplates(checkSnap.data());
      }

      if (canEditLockers) {
        const lockerSnap = await getDoc(doc(db, "settings", "locker_layout"));
        if (lockerSnap.exists()) setLockerConfig(lockerSnap.data());
      }
      setLoading(false);
    };
    loadData();
  }, [location.state, canViewReviews, canViewChecklists, canEditLockers]);

  const persistGlobal = async (newData) => {
    setGlobalOptions(newData);
    await setDoc(doc(db, "settings", "global_options"), newData, { merge: true });
  };
  const persistReviews = async (newData) => {
    setReviewConfig(newData);
    await setDoc(doc(db, "settings", "reviews"), newData);
  };
  const persistChecklists = async (newData) => {
    setChecklistTemplates(newData);
    await setDoc(doc(db, "settings", "checklists"), newData);
  };
  const persistLockers = async (newData) => {
    setLockerConfig(newData);
    await setDoc(doc(db, "settings", "locker_layout"), newData);
  };

  // --- GENERAL LIST HELPERS ---
  const addOption = (key, val) => {
    if (!val) return;
    let newList = [...(globalOptions[key] || []), val];
    if (key !== 'shiftBlocks') newList = sortList(newList);
    persistGlobal({ ...globalOptions, [key]: newList });
    logAudit("Update Settings", "Global", `Added ${val} to ${key}`);
  };

  const removeOption = (key, index) => {
    const newList = [...globalOptions[key]];
    newList.splice(index, 1);
    persistGlobal({ ...globalOptions, [key]: newList });
    logAudit("Update Settings", "Global", `Removed item from ${key}`);
  };

  // --- COLOR RULES HELPERS ---
  const handleSaveRule = () => {
    const { start, end, color, areas } = ruleForm;
    if (!start || !end || !color) return alert("Fill start, end, and color.");
    const newRule = { start: parseFloat(start), end: parseFloat(end), color, areas: areas || [] };
    if (isNaN(newRule.start) || isNaN(newRule.end)) return alert("Invalid Times");

    const newRules = [...globalOptions.shiftColorRules];
    if (editingRuleIdx !== null) newRules[editingRuleIdx] = newRule;
    else newRules.push(newRule);

    persistGlobal({ ...globalOptions, shiftColorRules: newRules });
    setRuleForm({ start: '', end: '', color: '#ffcc00', areas: [] });
    setEditingRuleIdx(null);
  };

  const removeColorRule = (index) => {
    if (!confirm("Delete color rule?")) return;
    const newRules = [...globalOptions.shiftColorRules];
    newRules.splice(index, 1);
    persistGlobal({ ...globalOptions, shiftColorRules: newRules });
  };

  const toggleRuleFormArea = (area) => {
    setRuleForm(prev => {
        const currentAreas = prev.areas || [];
        if (currentAreas.includes(area)) {
            return { ...prev, areas: currentAreas.filter(a => a !== area) };
        } else {
            return { ...prev, areas: [...currentAreas, area] };
        }
    });
  };

  // --- CATEGORY SORTING HELPERS ---
  const handleSaveCat = () => {
    const { name, start, end } = catForm;
    if (!name || !start || !end) return alert("Fill out Name, Start, and End.");
    const newCat = { name, start: parseFloat(start), end: parseFloat(end) };
    if (isNaN(newCat.start) || isNaN(newCat.end)) return alert("Invalid Times");

    const newCats = [...globalOptions.shiftCategories];
    if (editingCatIdx !== null) newCats[editingCatIdx] = newCat;
    else newCats.push(newCat);

    persistGlobal({ ...globalOptions, shiftCategories: newCats });
    setCatForm({ name: '', start: '', end: '' });
    setEditingCatIdx(null);
  };

  const removeCat = (index) => {
    if (!confirm("Delete this sorting category?")) return;
    const newCats = [...globalOptions.shiftCategories];
    newCats.splice(index, 1);
    persistGlobal({ ...globalOptions, shiftCategories: newCats });
  };

  // --- OTHER HELPERS ---
  const updateWall = (idx, field, val) => { const newWalls = [...lockerConfig.walls]; newWalls[idx][field] = val; persistLockers({ ...lockerConfig, walls: newWalls }); };
  const addWall = () => persistLockers({ ...lockerConfig, walls: [...lockerConfig.walls, { name: "New Wall", banks: 12 }] });
  const removeWall = (idx) => { if (confirm("Remove?")) { const newWalls = [...lockerConfig.walls]; newWalls.splice(idx, 1); persistLockers({ ...lockerConfig, walls: newWalls }); } };
  const updateSize = (idx, field, val) => { const newSizes = [...lockerConfig.sizes]; newSizes[idx][field] = val; persistLockers({ ...lockerConfig, sizes: newSizes }); };
  const addSize = () => persistLockers({ ...lockerConfig, sizes: [...lockerConfig.sizes, { name: "New Size", height: 120 }] });
  const removeSize = (idx) => { if (confirm("Remove?")) { const newSizes = [...lockerConfig.sizes]; newSizes.splice(idx, 1); persistLockers({ ...lockerConfig, sizes: newSizes }); } };

  if (loading) return <div style={{ padding: 20 }}>Loading Settings...</div>;
  const ListEditorSafe = (props) => <ListEditor {...props} readOnly={!canEditGeneral} />;

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: 20 }}>System Configuration</h2>
      
      {/* TABS */}
      <div style={{ display: 'flex', borderBottom: '1px solid #cbd5e1', marginBottom: 20, overflowX: 'auto' }}>
        {canViewGeneral && <TabButton name="General" id="general" active={activeTab} onClick={setActiveTab} />}
        {canEditSchedule && <TabButton name="Scheduling" id="scheduling" active={activeTab} onClick={setActiveTab} />}
        {canEditLockers && <TabButton name="Locker Layout" id="lockers" active={activeTab} onClick={setActiveTab} />}
        {canViewTraining && <TabButton name="Training" id="training" active={activeTab} onClick={setActiveTab} />}
        {canViewChecklists && <TabButton name="Checklists" id="checklists" active={activeTab} onClick={setActiveTab} />}
        {canViewReviews && <TabButton name="Performance Reviews" id="reviews" active={activeTab} onClick={setActiveTab} />}
      </div>

      {/* --- SCHEDULING TAB --- */}
      {activeTab === "scheduling" && canEditSchedule && (
        <div className="animate-fade">
          <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid #f59e0b' }}>
            <h4>⏳ Time Calculations</h4>
            <div style={{display: 'flex', gap: 20, flexWrap: 'wrap'}}>
                <div>
                    <label style={lblStyle}>Standard Lunch Deduction (Mins)</label>
                    <input type="number" value={globalOptions.lunchDuration} onChange={e => persistGlobal({ ...globalOptions, lunchDuration: parseInt(e.target.value) || 0 })} style={{ ...inpStyle, width: 200, marginBottom: 15 }} />
                </div>
                <div>
                    <label style={lblStyle}>Default Annual PTO (Days)</label>
                    <input type="number" value={globalOptions.defaultPto} onChange={e => persistGlobal({ ...globalOptions, defaultPto: parseFloat(e.target.value) || 0 })} style={{ ...inpStyle, width: 200, marginBottom: 15 }} />
                </div>
                <div>
                    <label style={lblStyle}>Default Annual Sick Time (Days)</label>
                    <input type="number" value={globalOptions.defaultSick} onChange={e => persistGlobal({ ...globalOptions, defaultSick: parseFloat(e.target.value) || 0 })} style={{ ...inpStyle, width: 200 }} />
                </div>
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div className="card">
              <h4>🏭 Production Areas</h4>
              <ListEditor list={globalOptions.scheduleAreas} onAdd={v => addOption('scheduleAreas', v)} onRemove={i => removeOption('scheduleAreas', i)} />
            </div>
            
            <div className="card">
              <h4>⏰ Exact Shift Times</h4>
              <p style={{fontSize:'12px', color:'#64748b'}}>The exact strings that show in the dropdowns.</p>
              <ListEditor list={globalOptions.shiftBlocks} onAdd={v => addOption('shiftBlocks', v)} onRemove={i => removeOption('shiftBlocks', i)} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
              {/* BOX 2: SHIFT COLORS */}
              <div className="card" style={{ borderTop: '4px solid #ec4899' }}>
                 <h4>🎨 Shift Colors</h4>
                 <div style={{ marginBottom: 15, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {globalOptions.shiftColorRules.map((rule, idx) => (
                       <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f8fafc', padding: 8, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '13px' }}>
                          <div style={{ width: 16, height: 16, background: rule.color, border: '1px solid #ddd' }}></div>
                          <div style={{ flex: 1 }}>{rule.start}:00-{rule.end}:00 {rule.areas?.length > 0 ? `(${rule.areas.join(',')})` : ''}</div>
                          <button className="text-only" onClick={() => removeColorRule(idx)} style={{ color: 'red' }}>X</button>
                       </div>
                    ))}
                 </div>
                 <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end', marginBottom: 10 }}>
                    <div style={{flex: 1}}><label style={lblStyle}>Start (0-23)</label><input type="number" value={ruleForm.start} onChange={e => setRuleForm({...ruleForm, start: e.target.value})} style={inpStyle} /></div>
                    <div style={{flex: 1}}><label style={lblStyle}>End (0-24)</label><input type="number" value={ruleForm.end} onChange={e => setRuleForm({...ruleForm, end: e.target.value})} style={inpStyle} /></div>
                    <div><input type="color" value={ruleForm.color} onChange={e => setRuleForm({...ruleForm, color: e.target.value})} style={{ height: 38, width: 40 }} /></div>
                 </div>
                 
                 {/* RESTORED: LIMIT TO SPECIFIC AREAS */}
                 <div style={{ marginBottom: 15 }}>
                    <label style={{...lblStyle, fontSize:'11px'}}>Limit to Areas (Optional - Leave empty for all)</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {globalOptions.scheduleAreas?.map(area => (
                            <label key={area} style={{ fontSize: '11px', background: ruleForm.areas.includes(area) ? '#ec4899' : '#f1f5f9', color: ruleForm.areas.includes(area) ? 'white' : 'black', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', border: '1px solid #e2e8f0' }}>
                                <input type="checkbox" checked={ruleForm.areas.includes(area)} onChange={() => toggleRuleFormArea(area)} style={{ display: 'none' }} />
                                {area}
                            </label>
                        ))}
                    </div>
                 </div>

                 <button className="primary" style={{width:'100%', padding: 8}} onClick={handleSaveRule}>+ Add Color</button>
              </div>

              {/* BOX 3: SHIFT GROUPING */}
              <div className="card" style={{ borderTop: '4px solid #3b82f6' }}>
                 <h4>📁 Shift Grouping / Filtering</h4>
                 <p style={{fontSize:'12px', color:'#64748b'}}>Used exclusively for sorting and dropdown filters on the schedule page.</p>
                 <div style={{ marginBottom: 15, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {globalOptions.shiftCategories?.map((cat, idx) => (
                       <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f8fafc', padding: 8, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '13px' }}>
                          <div style={{ flex: 1, fontWeight:'bold' }}>{cat.name}</div>
                          <div style={{ flex: 1, color:'#64748b' }}>Starts: {cat.start}:00 - {cat.end}:00</div>
                          <button className="text-only" onClick={() => removeCat(idx)} style={{ color: 'red' }}>X</button>
                       </div>
                    ))}
                 </div>
                 <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end', marginBottom: 10 }}>
                    <div style={{flex: 2}}><label style={lblStyle}>Category Name</label><input type="text" placeholder="e.g. 1st Shift" value={catForm.name} onChange={e => setCatForm({...catForm, name: e.target.value})} style={inpStyle} /></div>
                    <div style={{flex: 1}}><label style={lblStyle}>Start (0-23)</label><input type="number" value={catForm.start} onChange={e => setCatForm({...catForm, start: e.target.value})} style={inpStyle} /></div>
                    <div style={{flex: 1}}><label style={lblStyle}>End (0-24)</label><input type="number" value={catForm.end} onChange={e => setCatForm({...catForm, end: e.target.value})} style={inpStyle} /></div>
                 </div>
                 <button className="primary" style={{width:'100%', padding: 8}} onClick={handleSaveCat}>+ Add Group</button>
              </div>
          </div>
        </div>
      )}

      {/* --- ALL OTHER TABS REMAIN STANDARD AND UNCHANGED --- */}
      {/* General */}
      {activeTab === "general" && canViewGeneral && (
        <div className="animate-fade" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="card"><h4>🏢 Departments</h4><ListEditorSafe list={globalOptions.departments || []} onAdd={v => addOption('departments', v)} onRemove={i => removeOption('departments', i)} /></div>
          <div className="card"><h4>💻 Asset Categories</h4><ListEditorSafe list={globalOptions.assetCategories} onAdd={v => addOption('assetCategories', v)} onRemove={i => removeOption('assetCategories', i)} /></div>
          <div className="card"><h4>📊 Asset Statuses</h4><ListEditorSafe list={globalOptions.assetStatuses} onAdd={v => addOption('assetStatuses', v)} onRemove={i => removeOption('assetStatuses', i)} /></div>
        </div>
      )}

      {/* Lockers */}
      {activeTab === "lockers" && canEditLockers && (
        <div className="animate-fade" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30 }}>
          <div className="card">
            <button className="text-only" onClick={addWall} style={{ color: '#2563eb', float:'right' }}>+ Add Wall</button><h4>🧱 Locker Walls</h4>
            {lockerConfig.walls.map((wall, i) => (<div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10 }}><input value={wall.name} onChange={e => updateWall(i, 'name', e.target.value)} /><input type="number" value={wall.banks} onChange={e => updateWall(i, 'banks', parseInt(e.target.value))} /><button onClick={() => removeWall(i)}>X</button></div>))}
          </div>
        </div>
      )}

      {/* Training */}
      {activeTab === "training" && canViewTraining && (
        <div className="animate-fade"><div className="card"><h4>📜 Certifications</h4><ListEditorSafe list={globalOptions.certTypes} onAdd={v => addOption('certTypes', v)} onRemove={i => removeOption('certTypes', i)} /></div></div>
      )}
    </div>
  );
}

const lblStyle = { display: 'block', marginBottom: 5, fontSize: '13px', color: '#64748b', fontWeight: 'bold' };
const inpStyle = { width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '13px' };

const TabButton = ({ name, id, active, onClick }) => (
  <div onClick={() => onClick(id)} style={{ padding: '10px 20px', cursor: 'pointer', fontWeight: active === id ? 'bold' : 'normal', borderBottom: active === id ? '3px solid #2563eb' : 'none', color: active === id ? '#2563eb' : '#64748b' }}>
    {name}
  </div>
);

const ListEditor = ({ list, onAdd, onRemove, readOnly = false }) => {
  const [val, setVal] = useState("");
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
        {(list || []).map((item, i) => (
          <span key={i} style={{ background: '#f1f5f9', padding: '4px 8px', borderRadius: 4, fontSize: '13px' }}>
            {item} {!readOnly && <span onClick={() => onRemove(i)} style={{ color: 'red', cursor: 'pointer', marginLeft: 4 }}>×</span>}
          </span>
        ))}
      </div>
      {!readOnly && (
        <div style={{ display: 'flex', gap: 5 }}>
          <input placeholder="Add new..." value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { onAdd(val); setVal(""); } }} />
          <button onClick={() => { onAdd(val); setVal(""); }} style={{ background: '#e2e8f0', border: 'none', borderRadius: 4 }}>+</button>
        </div>
      )}
    </div>
  );
};