import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom'; 
import { collection, doc, updateDoc, deleteDoc, onSnapshot, getDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { logAudit } from '../utils/logger'; // <--- IMPORT
import { useRole } from '../hooks/useRole'; 

export default function Lockers() {
  const { checkAccess } = useRole();
  const canEdit = checkAccess('assets_lockers', 'edit'); 

  const [lockers, setLockers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [config, setConfig] = useState({
      walls: [{ name: "Left", banks: 12 }, { name: "Right", banks: 12 }],
      sizes: [{ name: "Small", height: 80 }, { name: "Medium", height: 120 }, { name: "Large", height: 200 }]
  });

  const [activeTab, setActiveTab] = useState(""); 
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [assignModal, setAssignModal] = useState({ isOpen: false, lockerId: null });
  const [formData, setFormData] = useState({ startId: "", quantity: 1, side: "", size: "Medium", column: 0 });

  useEffect(() => {
    const loadConfig = async () => {
        const docSnap = await getDoc(doc(db, "settings", "locker_layout"));
        if (docSnap.exists()) {
            const data = docSnap.data();
            if(data.walls && data.walls.length > 0) {
                setConfig(data);
                setActiveTab(data.walls[0].name);
            }
        } else {
            setActiveTab("Left"); 
        }
    };
    loadConfig();

    const unsubLockers = onSnapshot(collection(db, "lockers"), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      list.sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
      setLockers(list);
    });
    const unsubEmployees = onSnapshot(collection(db, "employees"), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      list.sort((a, b) => (a.lastName || "").localeCompare(b.lastName || ""));
      setEmployees(list);
    });
    return () => { unsubLockers(); unsubEmployees(); };
  }, []);

  const employeesNeedingLocker = employees.filter(e => !e.assignedLockerId);
  const activeWall = config.walls.find(w => w.name === activeTab) || { banks: 12 };

  // --- DRAG HANDLERS ---
  const handleLockerDragStart = (e, lockerId) => { 
      if (!canEdit) return; 
      e.dataTransfer.setData("type", "LOCKER");
      e.dataTransfer.setData("lockerId", lockerId); 
      e.dataTransfer.effectAllowed = "move"; 
  };

  const handleBankDragStart = (e, colIndex) => {
      if (!canEdit) return;
      e.dataTransfer.setData("type", "BANK");
      e.dataTransfer.setData("colIndex", colIndex);
      e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  
  const handleDropOnColumn = async (e, targetColumnIndex) => {
    e.preventDefault();
    if (!canEdit) return;

    const type = e.dataTransfer.getData("type");

    if (type === "BANK") {
        const sourceCol = parseInt(e.dataTransfer.getData("colIndex"));
        if (sourceCol === targetColumnIndex) return;

        if(!confirm(`Move Bank ${sourceCol + 1} to position ${targetColumnIndex + 1}?`)) return;

        const batch = writeBatch(db);
        const wallLockers = lockers.filter(l => l.side === activeTab);

        wallLockers.forEach(l => {
            let newCol = l.column;
            if (sourceCol < targetColumnIndex) {
                if (l.column === sourceCol) newCol = targetColumnIndex; 
                else if (l.column > sourceCol && l.column <= targetColumnIndex) newCol = l.column - 1; 
            } else {
                if (l.column === sourceCol) newCol = targetColumnIndex; 
                else if (l.column >= targetColumnIndex && l.column < sourceCol) newCol = l.column + 1; 
            }

            if (newCol !== l.column) {
                batch.update(doc(db, "lockers", l.id), { column: newCol });
            }
        });
        await batch.commit();
        logAudit("Locker Layout", "Move Bank", `Moved Bank ${sourceCol+1} to ${targetColumnIndex+1}`); // LOGGED
        return;
    }

    if (type === "LOCKER") {
        const draggedLockerId = e.dataTransfer.getData("lockerId");
        const draggedLocker = lockers.find(l => l.id === draggedLockerId);
        if (!draggedLocker) return;
        if (draggedLocker.column === targetColumnIndex && draggedLocker.side === activeTab) return;
        
        const targetColumnLockers = lockers.filter(l => l.side === activeTab && l.column === targetColumnIndex);
        const newOrderList = [...targetColumnLockers, draggedLocker];
        await saveBatchOrder(newOrderList, targetColumnIndex);
        logAudit("Locker Layout", "Move Locker", `Moved Locker #${draggedLocker.id} to Bank ${targetColumnIndex+1}`); // LOGGED
    }
  };

  const handleDropOnLocker = async (e, targetLocker) => {
    e.stopPropagation(); e.preventDefault();
    if (!canEdit) return;
    if (e.dataTransfer.getData("type") !== "LOCKER") return; 

    const draggedLockerId = e.dataTransfer.getData("lockerId");
    if (draggedLockerId === targetLocker.id) return;
    
    const draggedLocker = lockers.find(l => l.id === draggedLockerId);
    const columnLockers = lockers.filter(l => l.side === activeTab && l.column === targetLocker.column);
    const filteredColumn = columnLockers.filter(l => l.id !== draggedLockerId);
    const targetIndex = filteredColumn.findIndex(l => l.id === targetLocker.id);
    filteredColumn.splice(targetIndex, 0, draggedLocker);
    
    await saveBatchOrder(filteredColumn, targetLocker.column);
    logAudit("Locker Layout", "Reorder Locker", `Reordered Locker #${draggedLocker.id} in Bank ${targetLocker.column+1}`); // LOGGED
  };

  const saveBatchOrder = async (lockerList, columnIndex) => {
    const batch = writeBatch(db);
    lockerList.forEach((locker, index) => {
        const ref = doc(db, "lockers", locker.id);
        batch.update(ref, { column: columnIndex, order: index, side: activeTab });
    });
    await batch.commit();
  };

  const openAddModal = (preselectBankIndex = 0) => {
    if (!canEdit) return;
    const maxId = lockers.reduce((max, l) => Math.max(max, parseInt(l.id) || 0), 100);
    const nextId = maxId + 1;
    const defaultSize = config.sizes && config.sizes.length > 0 ? config.sizes[0].name : "Medium";
    setFormData({ startId: nextId.toString(), quantity: 1, side: activeTab, size: defaultSize, column: preselectBankIndex });
    setIsAddModalOpen(true);
  };

  const batchAddLockers = async (e) => {
    e.preventDefault();
    if (!canEdit) return;
    const targetColumn = parseInt(formData.column);
    const startNum = parseInt(formData.startId);
    const qty = parseInt(formData.quantity);
    const colLockers = lockers.filter(l => l.side === formData.side && l.column === targetColumn);
    let currentOrder = colLockers.length;
    const batch = writeBatch(db);
    for (let i = 0; i < qty; i++) {
        const newId = (startNum + i).toString();
        const ref = doc(db, "lockers", newId);
        batch.set(ref, { side: formData.side, size: formData.size, column: targetColumn, order: currentOrder + i, isOccupied: false, isOutOfOrder: false, assignedToName: "", assignedToId: null, });
    }
    await batch.commit();
    logAudit("Locker Layout", "Add Lockers", `Added ${qty} lockers to Bank ${targetColumn+1}`); // LOGGED
    setIsAddModalOpen(false);
  };

  const handleLockerClick = (locker) => {
    if (!canEdit) return; 
    if (locker.isOutOfOrder) {
        if(confirm(`Locker #${locker.id} is marked broken. Mark as Fixed?`)) {
            updateDoc(doc(db, "lockers", locker.id), { isOutOfOrder: false });
            logAudit("Locker Repair", locker.id, "Marked Fixed"); // LOGGED
        }
    } else if (locker.isOccupied) {
      if(confirm(`Unassign Locker #${locker.id} from ${locker.assignedToName}?`)) performUnassign(locker);
    } else {
      setAssignModal({ isOpen: true, lockerId: locker.id });
    }
  };

  const markBroken = async () => {
    if (!canEdit) return;
    const lockerId = assignModal.lockerId;
    if(confirm(`Mark Locker #${lockerId} as Out Of Order?`)) {
        await updateDoc(doc(db, "lockers", lockerId), { isOutOfOrder: true, isOccupied: false, assignedToName: "", assignedToId: null });
        logAudit("Locker Broken", lockerId, "Marked Out of Order"); // LOGGED
        setAssignModal({ isOpen: false, lockerId: null });
    }
  };

  const performAssign = async (employeeId) => {
    if (!employeeId || !canEdit) return;
    const emp = employees.find(e => e.id === employeeId);
    const lockerId = assignModal.lockerId;
    const empName = emp.firstName ? `${emp.firstName} ${emp.lastName}` : emp.name;
    await updateDoc(doc(db, "lockers", lockerId), { isOccupied: true, assignedToName: empName, assignedToId: emp.id });
    await updateDoc(doc(db, "employees", emp.id), { assignedLockerId: lockerId });
    logAudit("Assign Locker", lockerId, `Assigned to ${empName}`); // LOGGED
    setAssignModal({ isOpen: false, lockerId: null });
  };

  const performUnassign = async (locker) => {
    if (!canEdit) return;
    await updateDoc(doc(db, "lockers", locker.id), { isOccupied: false, assignedToName: "", assignedToId: null });
    if (locker.assignedToId) { await updateDoc(doc(db, "employees", locker.assignedToId), { assignedLockerId: null }); }
    logAudit("Unassign Locker", locker.id, `Removed ${locker.assignedToName}`); // LOGGED
  };

  const deleteLocker = async (e, id) => {
    e.stopPropagation();
    if (!canEdit) return;
    if(confirm("Delete this locker permanently?")) {
        await deleteDoc(doc(db, "lockers", id));
        logAudit("Delete Locker", id, "Permanently deleted"); // LOGGED
    }
  };

  const LockerBox = ({ locker }) => {
      const sizeDef = config.sizes.find(s => s.name === locker.size);
      const heightVal = sizeDef ? sizeDef.height + 'px' : '120px';
      let bg = '#86efac'; if (locker.isOccupied) bg = '#fca5a5'; if (locker.isOutOfOrder) bg = '#94a3b8'; 
      return (
        <div draggable={canEdit} onDragStart={(e) => handleLockerDragStart(e, locker.id)} onDrop={(e) => handleDropOnLocker(e, locker)} onDragOver={handleDragOver} onClick={() => handleLockerClick(locker)}
          style={{ height: heightVal, backgroundColor: bg, border: '2px solid #334155', borderRadius: '4px', marginBottom: '4px', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: canEdit ? 'grab' : 'default', boxShadow: '0 2px 4px rgba(0,0,0,0.2)', userSelect: 'none', opacity: locker.isOutOfOrder ? 0.8 : 1 }}
        >
          <strong>{locker.id}</strong>{locker.isOutOfOrder ? <span style={{fontSize:'20px'}}>⚠️</span> : <small style={{fontSize:'10px', textAlign:'center', lineHeight:'1.1', maxWidth:'90%', overflow:'hidden'}}>{locker.assignedToName || "Open"}</small>}
          {canEdit && <div onClick={(e) => deleteLocker(e, locker.id)} style={{position:'absolute', top:2, right:4, fontSize:'10px', fontWeight:'bold', cursor:'pointer'}}>x</div>}
        </div>
      );
  };

  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 20}}>
        <h2>Locker Layout</h2>
        {canEdit && (
            <div style={{display:'flex', gap: 10}}>
                <Link to="/settings" state={{ activeTab: 'lockers' }}>
                    <button style={{padding:'10px', background:'white', border:'1px solid #cbd5e1', borderRadius: 4, cursor:'pointer', color: '#334155'}}>⚙️ Configure Layout</button>
                </Link>
                <button className="primary" onClick={() => openAddModal(0)}>+ Add Lockers</button>
            </div>
        )}
      </div>
      
      <div style={{display: 'flex', borderBottom: '2px solid #e2e8f0', marginBottom: 20}}>
        {config.walls.map(w => (
            <div key={w.name} onClick={() => setActiveTab(w.name)} style={{padding: '10px 30px', cursor: 'pointer', fontWeight: 'bold', borderBottom: activeTab === w.name ? '3px solid #2563eb' : 'none', color: activeTab === w.name ? '#2563eb' : '#64748b'}}>{w.name} Wall</div>
        ))}
      </div>

      <div style={{display: 'grid', gridTemplateColumns: `repeat(${activeWall.banks || 12}, 1fr)`, gap: '0px', border: '1px solid #e2e8f0', padding: '20px', borderRadius: '12px', background: '#f8fafc', minHeight: '600px', width: '100%', boxSizing: 'border-box'}}>
        {Array.from({ length: activeWall.banks || 12 }, (_, i) => i).map(colIndex => {
             const colLockers = lockers.filter(l => l.side === activeTab && (l.column === colIndex || (!l.column && l.column !== 0 && colIndex === 0)));
             return (
                <div key={colIndex} onDragOver={handleDragOver} onDrop={(e) => handleDropOnColumn(e, colIndex)} style={{background: 'transparent', borderRight: '1px solid #e2e8f0', padding: '5px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', position: 'relative'}}>
                    {canEdit && <div onClick={() => openAddModal(colIndex)} style={{textAlign:'center', color:'#cbd5e1', fontSize:'24px', fontWeight:'bold', cursor:'pointer', marginBottom: 'auto', width: '100%', padding: '10px 0', borderRadius: 4}}>+</div>}
                    {colLockers.map(l => <LockerBox key={l.id} locker={l} />)}
                    
                    {/* --- DRAGGABLE BANK FOOTER --- */}
                    <div 
                        draggable={canEdit} 
                        onDragStart={(e) => handleBankDragStart(e, colIndex)}
                        style={{textAlign:'center', color:'#cbd5e1', fontSize:'14px', marginTop: 10, fontWeight:'bold', cursor: canEdit ? 'grab' : 'default', padding: '5px', border: canEdit ? '1px dashed #e2e8f0' : 'none', borderRadius: 4}}
                        title={canEdit ? "Drag to move entire bank" : ""}
                    >
                        {colIndex + 1}
                    </div>
                </div>
             )
        })}
      </div>

      {/* --- ADD MODAL --- */}
      {isAddModalOpen && (
        <div className="modal-overlay" onClick={(e) => {if(e.target.className === 'modal-overlay') setIsAddModalOpen(false)}}>
          <div className="modal">
            <h3>Add Lockers</h3>
            <form onSubmit={batchAddLockers}>
              <div style={{display:'flex', gap: 10}}>
                  <div style={{flex: 1}}><label>Starting Number</label><input type="number" value={formData.startId} onChange={e => setFormData({...formData, startId: e.target.value})} required /></div>
                  <div style={{flex: 1}}><label>Quantity</label><input type="number" min="1" max="10" value={formData.quantity} onChange={e => setFormData({...formData, quantity: e.target.value})} required /></div>
              </div>
              <label>Size</label><select value={formData.size} onChange={e => setFormData({...formData, size: e.target.value})}>{config.sizes.map(s => <option key={s.name} value={s.name}>{s.name} ({s.height}px)</option>)}</select>
              <label>Wall / Side</label><select value={formData.side} onChange={e => setFormData({...formData, side: e.target.value})}>{config.walls.map(w => <option key={w.name} value={w.name}>{w.name}</option>)}</select>
              <label>Location (Bank)</label><select value={formData.column} onChange={e => setFormData({...formData, column: e.target.value})}>{Array.from({ length: (config.walls.find(w => w.name === formData.side)?.banks || 12) }, (_, i) => i).map(num => (<option key={num} value={num}>Bank {num + 1}</option>))}</select>
              <div style={{marginTop: 20, display:'flex', gap: 10}}><button type="button" onClick={() => setIsAddModalOpen(false)} style={{flex:1}}>Cancel</button><button type="submit" className="primary" style={{flex:1}}>Create {formData.quantity}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* --- ASSIGN MODAL --- */}
      {assignModal.isOpen && (
        <div className="modal-overlay" onClick={(e) => {if(e.target.className === 'modal-overlay') setAssignModal({isOpen:false, lockerId:null})}}>
          <div className="modal">
            <h3>Locker #{assignModal.lockerId}</h3>
            <p style={{fontSize:'14px', fontWeight:'bold', marginTop:20}}>Assign to Staff:</p>
            {employeesNeedingLocker.length === 0 ? <p style={{color: '#94a3b8', fontSize: '13px'}}>All staff currently have lockers.</p> : (
                <select onChange={(e) => performAssign(e.target.value)} defaultValue="" style={{marginBottom: 10}}>
                    <option value="" disabled>-- Select Staff --</option>
                    {employeesNeedingLocker.map(emp => (<option key={emp.id} value={emp.id}>{emp.lastName}, {emp.firstName}</option>))}
                </select>
            )}
            <div style={{borderTop: '1px solid #eee', marginTop: 20, paddingTop: 20}}>
                <button onClick={markBroken} style={{background: '#f1f5f9', color: '#64748b', width: '100%', border: '1px dashed #cbd5e1'}}>⚠️ Mark Out of Order</button>
            </div>
            <button onClick={() => setAssignModal({isOpen:false, lockerId:null})} style={{marginTop: 10, width: '100%'}}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}