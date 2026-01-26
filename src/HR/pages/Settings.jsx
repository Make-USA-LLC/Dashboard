import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { logAudit } from '../utils/logger';
import { useRole } from '../hooks/useRole';
import RoleManager from '../components/RoleManager';

export default function Settings() {
  const location = useLocation();
  const { checkAccess } = useRole();

  // --- GRANULAR PERMISSIONS ---
  const canViewGeneral = checkAccess('settings_general', 'view');
  const canEditGeneral = checkAccess('settings_general', 'edit');

  const canViewSecurity = checkAccess('settings_security', 'view');
  const canEditSecurity = checkAccess('settings_security', 'edit');

  const canEditSchedule = checkAccess('schedule', 'edit');
  const canViewTraining = checkAccess('employees', 'view');
  const canViewChecklists = checkAccess('checklists', 'view');
  const canViewReviews = checkAccess('reviews', 'view');
  const canEditLockers = checkAccess('assets_lockers', 'edit');

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
    lunchDuration: 30
  });

  const [reviewConfig, setReviewConfig] = useState({
    maxSalary: 25.00,
    minWage: 15.00,
    seniorityCap: 25,
    seniorityWeight: 10,
    categories: []
  });

  const [checklistTemplates, setChecklistTemplates] = useState({
    salaryOnboarding: [],
    salaryOffboarding: [],
    hourlyOnboarding: [],
    hourlyOffboarding: []
  });

  // --- LOCKER CONFIG STATE ---
  const [lockerConfig, setLockerConfig] = useState({
    walls: [{ name: "Left", banks: 12 }, { name: "Right", banks: 12 }],
    sizes: [{ name: "Small", height: 80 }, { name: "Medium", height: 120 }, { name: "Large", height: 200 }]
  });

  // VISUAL SCALING FACTOR (5 Pixels = 1 Inch)
  const PIXELS_PER_INCH = 5;

  const sortList = (list) => {
    if (!list) return [];
    return [...list].sort((a, b) => {
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      return a.localeCompare(b);
    });
  };

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
          shiftBlocks: sortList(data.shiftBlocks || ["7:00 AM - 3:00 PM", "3:00 PM - 11:00 PM"]),
          scheduleAreas: sortList(data.scheduleAreas || ["Production", "Shipping"]),
          certTypes: sortList(data.certTypes || ["Forklift", "CPR"]),
          lunchDuration: data.lunchDuration !== undefined ? data.lunchDuration : 30
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
        if (lockerSnap.exists()) {
          setLockerConfig(lockerSnap.data());
        }
      }

      setLoading(false);
    };
    loadData();
  }, [location.state, canViewReviews, canViewChecklists, canEditLockers]);

  // --- PERSISTENCE HELPERS ---
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

  // --- LOCKER HELPERS ---
  const updateWall = (idx, field, val) => {
    const newWalls = [...lockerConfig.walls];
    newWalls[idx][field] = val;
    persistLockers({ ...lockerConfig, walls: newWalls });
  };

  const addWall = () => {
    persistLockers({ ...lockerConfig, walls: [...lockerConfig.walls, { name: "New Wall", banks: 12 }] });
  };

  const removeWall = (idx) => {
    if (!confirm("Remove wall?")) return;
    const newWalls = [...lockerConfig.walls];
    newWalls.splice(idx, 1);
    persistLockers({ ...lockerConfig, walls: newWalls });
  };

  const updateSize = (idx, field, val) => {
    const newSizes = [...lockerConfig.sizes];
    newSizes[idx][field] = val;
    persistLockers({ ...lockerConfig, sizes: newSizes });
  };

  const addSize = () => {
    persistLockers({ ...lockerConfig, sizes: [...lockerConfig.sizes, { name: "New Size", height: 120 }] });
  };

  const removeSize = (idx) => {
    if (!confirm("Remove size definition?")) return;
    const newSizes = [...lockerConfig.sizes];
    newSizes.splice(idx, 1);
    persistLockers({ ...lockerConfig, sizes: newSizes });
  };

  // --- GENERAL HELPERS ---
  const addOption = (key, val) => {
    if (!val) return;
    let newList = sortList([...(globalOptions[key] || []), val]);
    persistGlobal({ ...globalOptions, [key]: newList });
    logAudit("Update Settings", "Global", `Added ${val} to ${key}`);
  };

  const removeOption = (key, index) => {
    const newList = [...globalOptions[key]];
    newList.splice(index, 1);
    persistGlobal({ ...globalOptions, [key]: newList });
    logAudit("Update Settings", "Global", `Removed item from ${key}`);
  };

  // --- REVIEW HELPERS ---
  const handleReviewValChange = (field, val) => {
    const newData = { ...reviewConfig, [field]: parseFloat(val) };
    persistReviews(newData);
  };

  const addRevCat = () => {
    const newCats = [...(reviewConfig.categories || []), { id: `c${Date.now()}`, name: "New Category", weight: 0, points: [0, 5, 10], skills: ["New Skill"] }];
    persistReviews({ ...reviewConfig, categories: newCats });
  };

  const removeRevCat = (idx) => {
    if (!confirm("Remove category?")) return;
    const c = [...reviewConfig.categories];
    c.splice(idx, 1);
    persistReviews({ ...reviewConfig, categories: c });
  };

  const updateCatLocal = (idx, field, val) => {
    const c = [...reviewConfig.categories];
    c[idx][field] = val;
    setReviewConfig({ ...reviewConfig, categories: c });
  };

  const saveCatChange = () => {
    persistReviews(reviewConfig);
  };

  const modifyRevLevel = (catIdx, action, payload) => {
    const c = [...reviewConfig.categories];
    if (action === 'add') {
      const last = c[catIdx].points[c[catIdx].points.length - 1] || 0;
      c[catIdx].points.push(last + 5);
    } else if (action === 'remove') {
      c[catIdx].points.splice(payload, 1);
    } else if (action === 'update') {
      c[catIdx].points[payload.idx] = parseInt(payload.val) || 0;
    }
    persistReviews({ ...reviewConfig, categories: c });
  };

  const modifyRevSkill = (catIdx, action, payload) => {
    const c = [...reviewConfig.categories];
    if (action === 'add') {
      c[catIdx].skills.push("New Skill");
      persistReviews({ ...reviewConfig, categories: c });
    } else if (action === 'remove') {
      c[catIdx].skills.splice(payload, 1);
      persistReviews({ ...reviewConfig, categories: c });
    } else if (action === 'update') {
      c[catIdx].skills[payload.idx] = payload.val;
      setReviewConfig({ ...reviewConfig, categories: c });
    }
  };

  // --- CHECKLIST HELPERS ---
  const addCheckItem = async (cat, text) => {
    if (!text) return;
    const newList = [...(checklistTemplates[cat] || []), text];
    const newData = { ...checklistTemplates, [cat]: newList };
    persistChecklists(newData);
    logAudit("Update Checklist", cat, `Added: ${text}`);
  };

  const removeCheckItem = async (cat, index) => {
    const newList = checklistTemplates[cat].filter((_, i) => i !== index);
    const newData = { ...checklistTemplates, [cat]: newList };
    persistChecklists(newData);
    logAudit("Update Checklist", cat, `Removed item ${index}`);
  };

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

      {/* --- LOCKER LAYOUT EDITOR --- */}
      {activeTab === "lockers" && canEditLockers && (
        <div className="animate-fade">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30 }}>
            
            {/* WALLS */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                <h4 style={{ margin: 0 }}>🧱 Locker Walls</h4>
                <button className="text-only" onClick={addWall} style={{ color: '#2563eb' }}>+ Add Wall</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {lockerConfig.walls.map((wall, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f8fafc', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                    <div style={{ flex: 2 }}>
                      <label style={{ fontSize: '11px', color: '#64748b' }}>Wall Name</label>
                      <input value={wall.name} onChange={e => updateWall(i, 'name', e.target.value)} style={{ width: '100%', fontWeight: 'bold' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '11px', color: '#64748b' }}>Banks (Cols)</label>
                      <input type="number" value={wall.banks} onChange={e => updateWall(i, 'banks', parseInt(e.target.value))} style={{ width: '100%' }} />
                    </div>
                    <button onClick={() => removeWall(i)} style={{ border: 'none', background: 'transparent', color: 'red', fontWeight: 'bold', fontSize: '18px', cursor: 'pointer', marginTop: 15 }}>×</button>
                  </div>
                ))}
              </div>
            </div>

            {/* SIZES */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                <h4 style={{ margin: 0 }}>📏 Locker Sizes</h4>
                <button className="text-only" onClick={addSize} style={{ color: '#2563eb' }}>+ Add Size</button>
              </div>
              <p style={{ fontSize: '12px', color: '#64748b', marginTop: -10, marginBottom: 15 }}>Size inputs are in <strong>Inches</strong> (Auto-scales for display).</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {lockerConfig.sizes.map((size, i) => {
                  const inchesVal = (size.height / PIXELS_PER_INCH).toFixed(1).replace(/\.0$/, '');
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f8fafc', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                      <div style={{ flex: 2 }}>
                        <label style={{ fontSize: '11px', color: '#64748b' }}>Size Name</label>
                        <input value={size.name} onChange={e => updateSize(i, 'name', e.target.value)} style={{ width: '100%', fontWeight: 'bold' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '11px', color: '#64748b' }}>Height (In)</label>
                        <input
                          type="number"
                          step="0.5"
                          value={inchesVal}
                          onChange={e => {
                            const inVal = parseFloat(e.target.value) || 0;
                            updateSize(i, 'height', inVal * PIXELS_PER_INCH);
                          }}
                          style={{ width: '100%' }}
                        />
                      </div>
                      <button onClick={() => removeSize(i)} style={{ border: 'none', background: 'transparent', color: 'red', fontWeight: 'bold', fontSize: '18px', cursor: 'pointer', marginTop: 15 }}>×</button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- GENERAL TAB --- */}
      {activeTab === "general" && canViewGeneral && (
        <div className="animate-fade">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="card">
              <h4>🏢 Departments</h4>
              <ListEditorSafe list={globalOptions.departments || []} onAdd={v => addOption('departments', v)} onRemove={i => removeOption('departments', i)} />
            </div>
            <div className="card">
              <h4>💻 Asset Categories</h4>
              <ListEditorSafe list={globalOptions.assetCategories} onAdd={v => addOption('assetCategories', v)} onRemove={i => removeOption('assetCategories', i)} />
            </div>
            <div className="card">
              <h4>📊 Asset Statuses</h4>
              <ListEditorSafe list={globalOptions.assetStatuses} onAdd={v => addOption('assetStatuses', v)} onRemove={i => removeOption('assetStatuses', i)} />
            </div>
            <div className="card" style={{ gridColumn: '1 / -1', borderLeft: canEditSecurity ? '4px solid #16a34a' : '4px solid #cbd5e1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h4 style={{ margin: 0 }}>✅ Authorized Review Approvers</h4>
                  <p style={{ fontSize: '12px', color: '#64748b' }}>Only users with these emails can click "Approve Review".</p>
                </div>
              </div>
              <ListEditor list={globalOptions.reviewApprovers || []} onAdd={v => addOption('reviewApprovers', v)} onRemove={i => removeOption('reviewApprovers', i)} readOnly={!canEditSecurity} />
            </div>
          </div>
        </div>
      )}

      {/* --- SCHEDULING TAB --- */}
      {activeTab === "scheduling" && canEditSchedule && (
        <div className="animate-fade">
          <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid #f59e0b' }}>
            <h4>⏳ Time Calculations</h4>
            <label style={lblStyle}>Standard Lunch Deduction (Minutes)</label>
            <input type="number" value={globalOptions.lunchDuration} onChange={e => persistGlobal({ ...globalOptions, lunchDuration: parseInt(e.target.value) || 0 })} style={{ ...inpStyle, maxWidth: 150 }} />
            <p style={{ fontSize: '12px', color: '#64748b', marginTop: 5 }}>Subtracted from daily hours for shifts {'>'} 5 hours.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="card">
              <h4>🏭 Production Areas</h4>
              <ListEditor list={globalOptions.scheduleAreas} onAdd={v => addOption('scheduleAreas', v)} onRemove={i => removeOption('scheduleAreas', i)} />
            </div>
            <div className="card">
              <h4>⏰ Shift Blocks</h4>
              <ListEditor list={globalOptions.shiftBlocks} onAdd={v => addOption('shiftBlocks', v)} onRemove={i => removeOption('shiftBlocks', i)} />
            </div>
          </div>
        </div>
      )}

      {/* --- TRAINING TAB --- */}
      {activeTab === "training" && canViewTraining && (
        <div className="animate-fade">
          <div className="card">
            <h4>📜 Certification Types</h4>
            <ListEditorSafe list={globalOptions.certTypes} onAdd={v => addOption('certTypes', v)} onRemove={i => removeOption('certTypes', i)} />
          </div>
        </div>
      )}

      {/* --- CHECKLISTS TAB --- */}
      {activeTab === "checklists" && canViewChecklists && (
        <div className="animate-fade">
          <h3>Onboarding & Offboarding Templates</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <ChecklistEditor title="Salary Onboarding" category="salaryOnboarding" list={checklistTemplates.salaryOnboarding} color="#3b82f6" onAdd={addCheckItem} onRemove={removeCheckItem} />
            <ChecklistEditor title="Salary Offboarding" category="salaryOffboarding" list={checklistTemplates.salaryOffboarding} color="#ef4444" onAdd={addCheckItem} onRemove={removeCheckItem} />
            <ChecklistEditor title="Hourly Onboarding" category="hourlyOnboarding" list={checklistTemplates.hourlyOnboarding} color="#10b981" onAdd={addCheckItem} onRemove={removeCheckItem} />
            <ChecklistEditor title="Hourly Offboarding" category="hourlyOffboarding" list={checklistTemplates.hourlyOffboarding} color="#f59e0b" onAdd={addCheckItem} onRemove={removeCheckItem} />
          </div>
        </div>
      )}

      {/* --- REVIEWS TAB --- */}
      {activeTab === "reviews" && canViewReviews && (
        <div className="animate-fade">
          <div style={{ marginBottom: 15 }}><h3>Review Configuration</h3></div>
          <div className="card" style={{ marginBottom: 20 }}>
            <h4>💰 Compensation Rules</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <label style={lblStyle}>Min Wage ($)</label>
                <input type="number" value={reviewConfig.minWage} onChange={e => handleReviewValChange('minWage', e.target.value)} style={inpStyle} />
              </div>
              <div>
                <label style={lblStyle}>Max Salary ($)</label>
                <input type="number" value={reviewConfig.maxSalary} onChange={e => handleReviewValChange('maxSalary', e.target.value)} style={inpStyle} />
              </div>
              <div>
                <label style={lblStyle}>Seniority Cap (Months)</label>
                <input type="number" value={reviewConfig.seniorityCap} onChange={e => handleReviewValChange('seniorityCap', e.target.value)} style={inpStyle} />
              </div>
              <div>
                <label style={lblStyle}>Seniority Weight (%)</label>
                <input type="number" value={reviewConfig.seniorityWeight} onChange={e => handleReviewValChange('seniorityWeight', e.target.value)} style={inpStyle} />
              </div>
            </div>
          </div>
          
          {reviewConfig.categories && reviewConfig.categories.map((cat, i) => (
            <div key={i} className="card" style={{ marginBottom: 15, borderLeft: '4px solid #3b82f6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 15 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input value={cat.name} onChange={e => updateCatLocal(i, 'name', e.target.value)} onBlur={saveCatChange} style={{ fontSize: '1.1em', fontWeight: 'bold', width: 200 }} />
                  <button className="text-only" onClick={() => removeRevCat(i)} style={{ color: '#ef4444', fontSize: '12px' }}>(Remove)</button>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <label>Weight (%)</label>
                  <input type="number" style={{ width: 60, marginLeft: 10 }} value={cat.weight} onChange={e => updateCatLocal(i, 'weight', parseFloat(e.target.value))} onBlur={saveCatChange} />
                </div>
              </div>
              
              <div style={{ marginBottom: 15, background: '#f8fafc', padding: 10, borderRadius: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <strong>Points per Level:</strong>
                  <button className="text-only" onClick={() => modifyRevLevel(i, 'add')} style={{ color: '#2563eb', fontSize: '12px' }}>+ Add Level</button>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {cat.points.map((pt, ptIndex) => (
                    <div key={ptIndex} style={{ textAlign: 'center', position: 'relative' }}>
                      <small style={{ display: 'block', marginBottom: 2, color: '#64748b' }}>Lvl {ptIndex}</small>
                      <input type="number" style={{ width: 50, textAlign: 'center', padding: '5px' }} value={pt} onChange={e => modifyRevLevel(i, 'update', { idx: ptIndex, val: e.target.value })} />
                      <div onClick={() => modifyRevLevel(i, 'remove', ptIndex)} style={{ color: 'red', fontSize: '10px', cursor: 'pointer', marginTop: 2 }}>x</div>
                    </div>
                  ))}
                </div>
              </div>
              
              <label>Skills List:</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                {cat.skills.map((skill, skillIndex) => (
                  <div key={skillIndex} style={{ display: 'flex', gap: 5 }}>
                    <input value={skill} onChange={e => modifyRevSkill(i, 'update', { idx: skillIndex, val: e.target.value })} onBlur={saveCatChange} />
                    <button className="text-only" onClick={() => modifyRevSkill(i, 'remove', skillIndex)} style={{ color: 'red' }}>X</button>
                  </div>
                ))}
              </div>
              <button className="text-only" onClick={() => modifyRevSkill(i, 'add')} style={{ marginTop: 10, color: '#2563eb' }}>+ Add Skill</button>
            </div>
          ))}
          <button className="primary" onClick={addRevCat} style={{ width: '100%', padding: 15, fontSize: '16px' }}>+ Add New Category</button>
        </div>
      )}

      {/* --- SECURITY (ROLES) TAB --- */}
      {activeTab === "roles" && canViewSecurity && (
        <div className="animate-fade">
          {canEditSecurity ? <RoleManager /> : <p style={{ padding: 20 }}>Read-Only View of Roles.</p>}
        </div>
      )}
    </div>
  );
}

// --- HELPER COMPONENTS & STYLES ---

const lblStyle = { display: 'block', marginBottom: 5, fontSize: '13px', color: '#64748b', fontWeight: 'bold' };
const inpStyle = { width: '100%', padding: '10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '15px' };

const TabButton = ({ name, id, active, onClick }) => (
  <div
    onClick={() => onClick(id)}
    style={{
      padding: '10px 20px',
      cursor: 'pointer',
      fontWeight: active === id ? 'bold' : 'normal',
      borderBottom: active === id ? '3px solid #2563eb' : 'none',
      color: active === id ? '#2563eb' : '#64748b',
      whiteSpace: 'nowrap'
    }}
  >
    {name}
  </div>
);

const ListEditor = ({ list, onAdd, onRemove, readOnly = false }) => {
  const [val, setVal] = useState("");
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
        {(list || []).map((item, i) => (
          <span key={i} style={{ background: '#f1f5f9', padding: '4px 8px', borderRadius: 4, fontSize: '13px', display: 'flex', alignItems: 'center', gap: 5 }}>
            {item}
            {!readOnly && (
              <span onClick={() => onRemove(i)} style={{ color: 'red', cursor: 'pointer', fontWeight: 'bold', marginLeft: 4 }}>
                ×
              </span>
            )}
          </span>
        ))}
      </div>
      {!readOnly && (
        <div style={{ display: 'flex', gap: 5 }}>
          <input
            placeholder="Add new..."
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { onAdd(val); setVal(""); } }}
          />
          <button
            onClick={() => { onAdd(val); setVal(""); }}
            style={{ background: '#e2e8f0', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            +
          </button>
        </div>
      )}
    </div>
  );
};

const ChecklistEditor = ({ title, category, list, color, onAdd, onRemove }) => {
  const [input, setInput] = useState("");
  return (
    <div className="card" style={{ borderTop: `4px solid ${color}` }}>
      <h4>{title}</h4>
      <ul style={{ paddingLeft: 20, marginBottom: 15 }}>
        {(list || []).map((item, i) => (
          <li key={i} style={{ marginBottom: 5 }}>
            {item}
            <button className="text-only" style={{ color: 'red', marginLeft: 10 }} onClick={() => onRemove(category, i)}>
              (remove)
            </button>
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', gap: 5 }}>
        <input
          placeholder="Add task..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { onAdd(category, input); setInput(""); } }}
        />
        <button className="primary" onClick={() => { onAdd(category, input); setInput(""); }}>
          Add
        </button>
      </div>
    </div>
  );
};