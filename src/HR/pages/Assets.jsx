import React, { useState, useEffect } from 'react';
import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { logAudit } from '../utils/logger'; 
import { useRole } from '../hooks/useRole'; 

export default function Assets() {
  const { checkAccess } = useRole(); 
  const canEdit = checkAccess('assets_hardware', 'edit'); 

  const [assets, setAssets] = useState([]);
  const [employees, setEmployees] = useState([]);
  
  const [categories, setCategories] = useState(["Laptop", "Phone", "Tablet", "Monitor", "Vehicle", "Padlock", "Other"]);
  const [statuses, setStatuses] = useState(["Available", "Assigned", "Damaged", "In Repair", "Lost/Stolen"]);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [assignModal, setAssignModal] = useState({ isOpen: false, asset: null });
  const [expandedCategories, setExpandedCategories] = useState({}); 

  const [formData, setFormData] = useState({ 
    name: "", category: "", serial: "", assetTag: "", notes: "", status: "Available" 
  });
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    const unsubAssets = onSnapshot(collection(db, "assets"), (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (a.name || "").localeCompare(b.name || "")); 
        setAssets(list);
    });
    
    const unsubEmps = onSnapshot(collection(db, "employees"), (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (a.lastName || "").localeCompare(b.lastName || ""));
        setEmployees(list);
    });

    const fetchSettings = async () => {
        const docSnap = await getDoc(doc(db, "settings", "global_options"));
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.assetCategories && data.assetCategories.length > 0) setCategories(data.assetCategories);
            if (data.assetStatuses && data.assetStatuses.length > 0) setStatuses(data.assetStatuses);
        }
    };
    fetchSettings();
    
    return () => { unsubAssets(); unsubEmps(); };
  }, []);

  useEffect(() => {
      if (categories.length > 0 && !formData.category) {
          setFormData(prev => ({ ...prev, category: categories[0] }));
      }
  }, [categories]);

  const groupedAssets = assets.reduce((acc, asset) => {
    const cat = asset.category || "Other";
    if (!acc[cat]) acc[cat] = { total: 0, available: 0, items: [] };
    acc[cat].items.push(asset);
    acc[cat].total++;
    if (!asset.assignedToId && asset.status === 'Available') acc[cat].available++;
    return acc;
  }, {});

  const toggleCategory = (category) => {
      setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!canEdit) return; 
    await addDoc(collection(db, "assets"), {
        ...formData, 
        category: formData.category || categories[0], 
        assignedToId: null, assignedToName: "", status: "Available", createdAt: Date.now()
    });
    logAudit("Create Asset", formData.name, `Category: ${formData.category}`);
    setIsAddModalOpen(false);
    resetForm();
  };

  const openEdit = (asset) => {
      if (!canEdit) return;
      setEditingId(asset.id);
      setFormData({
          name: asset.name || "", category: asset.category || categories[0], serial: asset.serial || "",
          assetTag: asset.assetTag || "", notes: asset.notes || "", status: asset.status || "Available"
      });
      setIsEditModalOpen(true);
  };

  const handleDuplicate = (asset) => {
      if (!canEdit) return;
      setEditingId(null); 
      setFormData({
          name: asset.name || "", 
          category: asset.category || categories[0], 
          serial: "", 
          assetTag: "", 
          notes: asset.notes || "", 
          status: "Available" 
      });
      setIsAddModalOpen(true); 
  };

  const handleEditSave = async (e) => {
      e.preventDefault();
      if (!editingId || !canEdit) return;
      const updates = { ...formData };
      if (updates.status === "Available") { updates.assignedToId = null; updates.assignedToName = ""; }
      await updateDoc(doc(db, "assets", editingId), updates);
      logAudit("Edit Asset", formData.name, `Updated status to ${formData.status}`);
      setIsEditModalOpen(false);
      resetForm();
  };

  const handleDelete = async (id) => {
      if (!canEdit) return;
      if(confirm("Permanently delete this asset?")) {
          await deleteDoc(doc(db, "assets", id));
          logAudit("Delete Asset", id, "Permanently deleted asset");
      }
  };

  const handleAssign = async (employeeId) => {
      if (!employeeId || !canEdit) return;
      const emp = employees.find(e => e.id === employeeId);
      const asset = assignModal.asset;
      await updateDoc(doc(db, "assets", asset.id), {
          assignedToId: emp.id,
          assignedToName: emp.firstName ? `${emp.firstName} ${emp.lastName}` : emp.name,
          status: "Assigned"
      });
      logAudit("Assign Asset", asset.name, `Assigned to ${emp.firstName} ${emp.lastName}`);
      setAssignModal({ isOpen: false, asset: null });
  };

  const handleReturn = async (asset) => {
      if (!canEdit) return;
      const isDamaged = confirm(`Return ${asset.name}?\n\nOK = Good Condition\nCancel = DAMAGED`);
      if (isDamaged) {
          await updateDoc(doc(db, "assets", asset.id), { assignedToId: null, assignedToName: "", status: "Available" });
          logAudit("Return Asset", asset.name, `Returned from ${asset.assignedToName}`);
      } else {
          const reason = prompt("Describe damage:");
          const newNotes = (asset.notes ? asset.notes + ". " : "") + `Returned Damaged: ${reason || "Unspecified"}`;
          await updateDoc(doc(db, "assets", asset.id), { assignedToId: null, assignedToName: "", status: "Damaged", notes: newNotes });
          logAudit("Return Asset (Damaged)", asset.name, `Returned Damaged: ${reason}`);
      }
  };

  const resetForm = () => { setFormData({ name: "", category: categories[0], serial: "", assetTag: "", notes: "", status: "Available" }); setEditingId(null); };

  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <h2>Asset Inventory</h2>
        {canEdit && (
            <button className="primary" onClick={() => setIsAddModalOpen(true)}>+ Add Asset</button>
        )}
      </div>

      <div style={{marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 20, alignItems: 'start'}}>
          {Object.entries(groupedAssets).sort(([a],[b]) => a.localeCompare(b)).map(([category, data]) => (
              <div key={category} className="card" style={{padding:0, overflow:'hidden', border:'1px solid #e2e8f0'}}>
                  <div style={{padding: 20, background: '#f8fafc', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                      <div>
                          {/* FIX: Only append 's' if word doesn't already end in 's' */}
                          <h3 style={{margin:0}}>{category.endsWith('s') ? category : category + 's'}</h3>
                          <span style={{fontSize:'12px', color:'#64748b'}}>{data.available} ready / {data.total} total</span>
                      </div>
                      <button className="text-only" style={{border:'1px solid #cbd5e1', padding:'5px 10px', borderRadius: 6, fontSize:'12px'}} onClick={() => toggleCategory(category)}>{expandedCategories[category] ? "Hide" : "View"}</button>
                  </div>
                  {expandedCategories[category] && (
                      <div style={{maxHeight: 400, overflowY:'auto', background:'white'}}>
                          {data.items.map(asset => (
                              <div key={asset.id} style={{padding: 15, borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                  <div style={{flex: 1}}>
                                      <div style={{fontWeight:'bold', color:'#334155'}}>{asset.name} {asset.assetTag && <span style={{background:'#e2e8f0', padding:'2px 6px', borderRadius:4, fontSize:'10px', marginLeft: 8, color:'#475569'}}>Tag: {asset.assetTag}</span>}</div>
                                      <div style={{fontSize:'12px', color:'#64748b', marginTop: 2}}>{asset.serial && <span>SN: {asset.serial}</span>}{asset.status !== 'Assigned' && asset.status !== 'Available' && <span style={{color:'#ef4444', fontWeight:'bold', marginLeft: 10}}> • {asset.status}</span>}</div>
                                      {asset.notes && <div style={{fontSize:'11px', color:'#94a3b8', fontStyle:'italic', marginTop: 4}}>{asset.notes}</div>}
                                  </div>
                                  
                                  <div style={{textAlign:'right', minWidth: '120px'}}>
                                      {asset.assignedToId ? (
                                          <div>
                                              <span style={{background:'#fee2e2', color:'#991b1b', fontSize:'10px', padding:'2px 6px', borderRadius:4, fontWeight:'bold'}}>{asset.assignedToName}</span>
                                              {canEdit && (
                                                  <div style={{marginTop: 5, display:'flex', gap: 10, justifyContent:'flex-end'}}>
                                                      <button className="text-only" onClick={() => handleDuplicate(asset)} style={{color:'#0ea5e9', fontSize:'11px', fontWeight:'bold'}}>❐ Copy</button>
                                                      <button className="text-only" onClick={() => handleReturn(asset)} style={{color:'#2563eb', fontSize:'11px'}}>Return</button>
                                                      <button className="text-only" onClick={() => openEdit(asset)} style={{color:'#64748b', fontSize:'11px'}}>Edit</button>
                                                  </div>
                                              )}
                                          </div>
                                      ) : (
                                          <div>
                                              <span style={{background: asset.status==='Available'?'#dcfce7':'#f3f4f6', color: asset.status==='Available'?'#166534':'#6b7280', fontSize:'10px', padding:'2px 6px', borderRadius:4, fontWeight:'bold'}}>{asset.status}</span>
                                              {canEdit && (
                                                  <div style={{marginTop: 5, display:'flex', gap: 10, justifyContent:'flex-end'}}>
                                                      <button className="text-only" onClick={() => handleDuplicate(asset)} style={{color:'#0ea5e9', fontSize:'11px', fontWeight:'bold'}}>❐ Copy</button>
                                                      <button className="text-only" onClick={() => setAssignModal({isOpen:true, asset})} style={{color:'#16a34a', fontSize:'11px'}}>Assign</button>
                                                      <button className="text-only" onClick={() => openEdit(asset)} style={{color:'#64748b', fontSize:'11px'}}>Edit</button>
                                                  </div>
                                              )}
                                          </div>
                                      )}
                                  </div>
                              </div>
                          ))}
                      </div>
                  )}
              </div>
          ))}
      </div>

      {(isAddModalOpen || isEditModalOpen) && canEdit && (
        <div className="modal-overlay" onClick={(e) => {if(e.target.className === 'modal-overlay') { setIsAddModalOpen(false); setIsEditModalOpen(false); resetForm(); }}}>
          <div className="modal">
            <h3>{isEditModalOpen ? "Edit Asset" : "Add New Asset"}</h3>
            <form onSubmit={isEditModalOpen ? handleEditSave : handleAdd}>
                <label>Item Name / Model</label><input placeholder="e.g. iPad Air 5th Gen" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
                <div style={{display:'flex', gap: 10}}>
                    <div style={{flex:1}}>
                        <label>Category</label>
                        <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div style={{flex:1}}>
                        <label>Status</label>
                        <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                </div>
                <div style={{display:'flex', gap: 10}}>
                    <div style={{flex:1}}><label>Serial Number</label><input placeholder="SN-..." value={formData.serial} onChange={e => setFormData({...formData, serial: e.target.value})} /></div>
                    <div style={{flex:1}}><label>Asset Tag ID</label><input placeholder="Tag #001" value={formData.assetTag} onChange={e => setFormData({...formData, assetTag: e.target.value})} /></div>
                </div>
                <label>Notes</label><input placeholder="Condition notes..." value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
                <div style={{marginTop: 20, display:'flex', gap: 10}}>
                    <button type="button" onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); resetForm(); }} style={{flex:1}}>Cancel</button>
                    {isEditModalOpen ? <><button type="button" onClick={() => { handleDelete(editingId); setIsEditModalOpen(false); }} style={{flex:1, background:'#fee2e2', color:'#ef4444'}}>Delete</button><button type="submit" className="primary" style={{flex:1}}>Save Changes</button></> : <button type="submit" className="primary" style={{flex:1}}>Add Asset</button>}
                </div>
            </form>
          </div>
        </div>
      )}

      {assignModal.isOpen && canEdit && (
        <div className="modal-overlay" onClick={(e) => {if(e.target.className === 'modal-overlay') setAssignModal({isOpen:false, asset:null})}}>
          <div className="modal">
            <h3>Assign {assignModal.asset.name}</h3>
            <select onChange={(e) => handleAssign(e.target.value)} defaultValue="" style={{width:'100%', marginBottom: 20}}>
                <option value="" disabled>-- Select Staff --</option>
                {employees.map(emp => (<option key={emp.id} value={emp.id}>{emp.lastName}, {emp.firstName}</option>))}
            </select>
            <button onClick={() => setAssignModal({isOpen:false, asset:null})} style={{width:'100%'}}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}