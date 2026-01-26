import React, { useState, useEffect } from 'react';
import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { logAudit } from '../utils/logger'; 
import { useRole } from '../hooks/useRole'; 

export default function Keys() {
  const { checkAccess } = useRole();
  const canEdit = checkAccess('assets_keys', 'edit');

  const [keys, setKeys] = useState([]);
  const [employees, setEmployees] = useState([]);
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [assignModal, setAssignModal] = useState({ isOpen: false, keyType: "", availableKeys: [] });
  
  const [manageModal, setManageModal] = useState({ isOpen: false, groupName: "", mode: "add", maxRemove: 0 });
  const [manageQty, setManageQty] = useState(1);

  const [expandedGroups, setExpandedGroups] = useState({}); 

  const [formData, setFormData] = useState({ 
    name: "", quantity: 1, keyTag: "", status: "Available" 
  });
  const [editingId, setEditingId] = useState(null);

  const STATUSES = ["Available", "Assigned", "Lost", "Broken"];

  useEffect(() => {
    const unsubKeys = onSnapshot(collection(db, "keys"), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setKeys(list);
    });

    const unsubEmps = onSnapshot(collection(db, "employees"), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.lastName || "").localeCompare(b.lastName || ""));
      setEmployees(list);
    });

    return () => { unsubKeys(); unsubEmps(); };
  }, []);

  const inventory = keys.reduce((acc, key) => {
    if (!acc[key.name]) {
        acc[key.name] = { 
            name: key.name, total: 0, available: 0, instances: [], availableInstances: [] 
        };
    }
    acc[key.name].total += 1;
    const isReady = !key.holderId && (key.status === 'Available' || !key.status);
    if (isReady) {
        acc[key.name].available += 1;
        acc[key.name].availableInstances.push(key);
    }
    acc[key.name].instances.push(key);
    return acc;
  }, {});

  const inventoryList = Object.values(inventory).sort((a,b) => a.name.localeCompare(b.name));

  const toggleGroup = (groupName) => {
      setExpandedGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }));
  };

  const batchAddKeys = async (e) => {
    e.preventDefault();
    if (!canEdit) return;
    if (!formData.name.trim()) return;
    const batch = writeBatch(db);
    for (let i = 0; i < formData.quantity; i++) {
        const newRef = doc(collection(db, "keys"));
        batch.set(newRef, { 
            name: formData.name, keyTag: "", status: "Available", holderId: null, holderName: "", createdAt: Date.now()
        });
    }
    await batch.commit();
    logAudit("Create Keys", formData.name, `Added ${formData.quantity} copies`); // LOGGED
    setIsAddModalOpen(false);
    resetForm();
  };

  const openManageModal = (group) => {
      if (!canEdit) return;
      setManageModal({ isOpen: true, groupName: group.name, mode: "add", maxRemove: group.availableInstances.length });
      setManageQty(1);
  };

  const handleManageSubmit = async (e) => {
      e.preventDefault();
      if (!canEdit) return;
      const { groupName, mode } = manageModal;
      const batch = writeBatch(db);

      if (mode === "add") {
          for (let i = 0; i < manageQty; i++) {
              const newRef = doc(collection(db, "keys"));
              batch.set(newRef, { name: groupName, keyTag: "", status: "Available", holderId: null, holderName: "", createdAt: Date.now() });
          }
          logAudit("Manage Keys", groupName, `Added ${manageQty} extra copies`); // LOGGED
      } else if (mode === "remove") {
          const availableToDelete = inventory[groupName].availableInstances.slice(0, manageQty);
          availableToDelete.forEach(key => { const ref = doc(db, "keys", key.id); batch.delete(ref); });
          logAudit("Manage Keys", groupName, `Deleted ${manageQty} copies`); // LOGGED
      }
      await batch.commit();
      setManageModal({ isOpen: false, groupName: "", mode: "add", maxRemove: 0 });
  };

  const openEdit = (key) => {
      if (!canEdit) return;
      setEditingId(key.id);
      setFormData({ name: key.name || "", quantity: 1, keyTag: key.keyTag || "", status: key.status || "Available" });
      setIsEditModalOpen(true);
  };

  const handleEditSave = async (e) => {
      e.preventDefault();
      if (!editingId || !canEdit) return;
      const updates = { name: formData.name, keyTag: formData.keyTag, status: formData.status };
      if (updates.status !== "Assigned") { updates.holderId = null; updates.holderName = ""; }
      await updateDoc(doc(db, "keys", editingId), updates);
      logAudit("Edit Key", formData.name, `Updated status to ${formData.status}, Tag: ${formData.keyTag}`); // LOGGED
      setIsEditModalOpen(false);
      resetForm();
  };

  const deleteKey = async (keyId) => {
    if (!canEdit) return;
    if(!confirm("Permanently delete this specific key copy?")) return;
    await deleteDoc(doc(db, "keys", keyId));
    logAudit("Delete Key", keyId, "Permanently deleted single key copy"); // LOGGED
  };

  const openAssignModal = (keyType, availableInstances) => {
      if (!canEdit) return;
      setAssignModal({ isOpen: true, keyType, availableKeys: availableInstances });
  };

  const performAssign = async (employeeId) => {
      if (!employeeId || !canEdit) return;
      const emp = employees.find(e => e.id === employeeId);
      const keyToAssign = assignModal.availableKeys[0]; 
      await updateDoc(doc(db, "keys", keyToAssign.id), {
          holderId: emp.id,
          holderName: emp.firstName ? `${emp.firstName} ${emp.lastName}` : emp.name,
          status: "Assigned"
      });
      logAudit("Assign Key", keyToAssign.name, `Assigned copy to ${emp.firstName} ${emp.lastName}`); // LOGGED
      setAssignModal({ isOpen: false, keyType: "", availableKeys: [] });
  };

  const returnKey = async (key) => {
      if (!canEdit) return;
      const isGood = confirm(`Return "${key.name}" from ${key.holderName}?\n\nOK = Good Condition\nCancel = Mark Lost/Broken`);
      if (isGood) {
          await updateDoc(doc(db, "keys", key.id), { holderId: null, holderName: "", status: "Available" });
          logAudit("Return Key", key.name, `Returned from ${key.holderName} (Good)`); // LOGGED
      } else {
          const isLost = confirm("Is the key LOST?\n\nOK = Yes, Lost\nCancel = No, just Broken");
          const newStatus = isLost ? "Lost" : "Broken";
          await updateDoc(doc(db, "keys", key.id), { holderId: null, holderName: "", status: newStatus });
          logAudit("Return Key (Incident)", key.name, `Returned from ${key.holderName} as ${newStatus}`); // LOGGED
      }
  };

  const resetForm = () => { setFormData({ name: "", quantity: 1, keyTag: "", status: "Available" }); setEditingId(null); };

  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <h2>Key Inventory</h2>
        {canEdit && <button className="primary" onClick={() => setIsAddModalOpen(true)}>+ Add Keys</button>}
      </div>

      <div style={{marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20, alignItems:'start'}}>
          {inventoryList.map(group => (
              <div key={group.name} className="card" style={{padding: 0, overflow:'hidden', border: '1px solid #e2e8f0'}}>
                  <div style={{padding: 20, background: '#f8fafc', borderBottom:'1px solid #e2e8f0'}}>
                      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                          <h3 style={{margin:0, fontSize:'1.1rem'}}>{group.name}</h3>
                          <div style={{display:'flex', alignItems:'center', gap: 10}}>
                              <span style={{background: group.available > 0 ? '#dcfce7' : '#fee2e2', color: group.available > 0 ? '#166534' : '#991b1b', padding: '2px 8px', borderRadius: 10, fontSize:'11px', fontWeight:'bold'}}>
                                  {group.available} / {group.total} In Stock
                              </span>
                              {canEdit && <button onClick={() => openManageModal(group)} style={{border:'none', background:'transparent', cursor:'pointer', fontSize:'14px', padding: '2px', color: '#64748b'}}>✎</button>}
                          </div>
                      </div>
                      <div style={{marginTop: 15, display:'flex', gap: 10}}>
                          {canEdit && <button className="primary" style={{flex: 1, fontSize:'13px'}} disabled={group.available === 0} onClick={() => openAssignModal(group.name, group.availableInstances)}>Assign Next</button>}
                          <button className="text-only" style={{fontSize:'13px', border:'1px solid #cbd5e1', borderRadius: 6, padding: '8px 15px'}} onClick={() => toggleGroup(group.name)}>
                              {expandedGroups[group.name] ? "Hide" : "View List"}
                          </button>
                      </div>
                  </div>
                  {expandedGroups[group.name] && (
                      <div style={{maxHeight: '300px', overflowY: 'auto', background: 'white'}}>
                          <table style={{width:'100%', fontSize:'13px', borderCollapse:'collapse'}}>
                              <tbody>
                                  {group.instances.map((k, i) => (
                                      <tr key={k.id} style={{borderBottom:'1px solid #f1f5f9'}}>
                                          <td style={{padding: '10px 15px', color: '#64748b', display:'flex', flexDirection:'column'}}>
                                              <span style={{fontWeight:'bold', color:'#334155'}}>{k.keyTag ? `Tag: ${k.keyTag}` : `Copy #${i+1}`}</span>
                                              {(k.status === 'Lost' || k.status === 'Broken') && <span style={{fontSize:'10px', color:'#ef4444', fontWeight:'bold'}}>{k.status.toUpperCase()}</span>}
                                          </td>
                                          <td style={{padding: '10px'}}>
                                              {k.holderId ? <span style={{color: '#0f172a', fontWeight:'bold', background:'#fee2e2', padding:'2px 6px', borderRadius:4, fontSize:'11px'}}>{k.holderName}</span> : (k.status === 'Available' || !k.status ? <span style={{color: '#16a34a'}}>Available</span> : <span style={{color: '#94a3b8'}}>-</span>)}
                                          </td>
                                          <td style={{textAlign:'right', padding: '10px 15px'}}>
                                              {canEdit && (
                                                  <>
                                                      {k.holderId ? <button className="text-only" onClick={() => returnKey(k)} style={{color:'#2563eb', marginRight: 8}}>Return</button> : <button className="text-only" onClick={() => openEdit(k)} style={{color:'#64748b', marginRight: 8}}>Edit</button>}
                                                      {!k.holderId && <button className="text-only" onClick={() => deleteKey(k.id)} style={{color:'#ef4444'}}>X</button>}
                                                  </>
                                              )}
                                          </td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      </div>
                  )}
              </div>
          ))}
      </div>

      {manageModal.isOpen && (
        <div className="modal-overlay" onClick={(e) => {if(e.target.className === 'modal-overlay') setManageModal({...manageModal, isOpen:false})}}>
            <div className="modal">
                <h3>Manage "{manageModal.groupName}"</h3>
                <div style={{display:'flex', gap: 10, marginBottom: 20}}>
                    <button onClick={() => setManageModal({...manageModal, mode: 'add'})} style={{flex: 1, padding: 8, borderRadius: 6, border: '1px solid #e2e8f0', cursor:'pointer', background: manageModal.mode === 'add' ? '#e0f2fe' : 'transparent', color: manageModal.mode === 'add' ? '#0284c7' : 'inherit', fontWeight: manageModal.mode === 'add' ? 'bold' : 'normal'}}>Add Copies</button>
                    <button onClick={() => setManageModal({...manageModal, mode: 'remove'})} style={{flex: 1, padding: 8, borderRadius: 6, border: '1px solid #e2e8f0', cursor:'pointer', background: manageModal.mode === 'remove' ? '#fee2e2' : 'transparent', color: manageModal.mode === 'remove' ? '#991b1b' : 'inherit', fontWeight: manageModal.mode === 'remove' ? 'bold' : 'normal'}}>Remove Copies</button>
                </div>
                <form onSubmit={handleManageSubmit}>
                    <label style={{marginTop: 10}}>Quantity</label>
                    <input type="number" min="1" max={manageModal.mode === 'remove' ? manageModal.maxRemove : 50} value={manageQty} onChange={e => setManageQty(e.target.value)} required />
                    <div style={{marginTop: 20, display:'flex', gap: 10}}>
                        <button type="button" onClick={() => setManageModal({...manageModal, isOpen:false})} style={{flex:1}}>Cancel</button>
                        <button type="submit" className="primary" style={{flex:1}}>{manageModal.mode === 'add' ? 'Create Keys' : 'Delete Keys'}</button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {(isAddModalOpen || isEditModalOpen) && (
        <div className="modal-overlay" onClick={(e) => {if(e.target.className === 'modal-overlay') { setIsAddModalOpen(false); setIsEditModalOpen(false); resetForm(); }}}>
          <div className="modal">
            <h3>{isEditModalOpen ? "Edit Key Details" : "Add New Keys"}</h3>
            <form onSubmit={isEditModalOpen ? handleEditSave : batchAddKeys}>
                <label>Key Name</label><input placeholder="e.g. Front Door" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
                {isEditModalOpen ? (
                    <div style={{display:'flex', gap: 10}}>
                        <div style={{flex:1}}><label>Key Tag</label><input placeholder="e.g. A1" value={formData.keyTag} onChange={e => setFormData({...formData, keyTag: e.target.value})} /></div>
                        <div style={{flex:1}}><label>Status</label><select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                    </div>
                ) : (
                    <><label>Quantity to Add</label><input type="number" min="1" max="50" value={formData.quantity} onChange={e => setFormData({...formData, quantity: e.target.value})} required /></>
                )}
                <div style={{marginTop: 20, display:'flex', gap: 10}}>
                    <button type="button" onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); resetForm(); }} style={{flex:1}}>Cancel</button>
                    <button type="submit" className="primary" style={{flex:1}}>{isEditModalOpen ? "Save Changes" : "Create Keys"}</button>
                </div>
            </form>
          </div>
        </div>
      )}

      {assignModal.isOpen && (
        <div className="modal-overlay" onClick={(e) => {if(e.target.className === 'modal-overlay') setAssignModal({isOpen:false, keyType:"", availableKeys:[]})}}>
          <div className="modal">
            <h3>Assign "{assignModal.keyType}"</h3>
            <p>Assigning 1 copy to:</p>
            <select onChange={(e) => performAssign(e.target.value)} defaultValue="" style={{width:'100%', marginBottom: 20}}>
                <option value="" disabled>-- Select Staff --</option>
                {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.lastName}, {emp.firstName}</option>
                ))}
            </select>
            <button onClick={() => setAssignModal({isOpen:false, keyType:"", availableKeys:[]})} style={{width:'100%'}}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}