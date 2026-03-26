import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import {
  collection, onSnapshot, addDoc, deleteDoc,
  doc, updateDoc, getDocs, query, where
} from 'firebase/firestore';
import { Map, Plus, Trash2, Edit2, Save, X, Search, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

export default function Locations() {
  const [locations, setLocations] = useState([]);
  const [warehouse, setWarehouse] = useState('');
  const [bin, setBin] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editWarehouse, setEditWarehouse] = useState('');
  const [editBin, setEditBin] = useState('');
  const [collapsedWarehouses, setCollapsedWarehouses] = useState({});
  const [deletingId, setDeletingId] = useState(null); // confirm state

  useEffect(() => {
    return onSnapshot(collection(db, 'inv_locations'), snap => {
      setLocations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  // --- Add ---
  const handleAdd = async (e) => {
    e.preventDefault();
    const fullName = `${warehouse.trim()} - ${bin.trim()}`;
    const duplicate = locations.find(l => l.fullName.toLowerCase() === fullName.toLowerCase());
    if (duplicate) return alert(`"${fullName}" already exists.`);
    try {
      await addDoc(collection(db, 'inv_locations'), {
        warehouse: warehouse.trim(),
        bin: bin.trim(),
        fullName,
      });
      setBin(''); // keep warehouse for quick multi-bin entry
    } catch (e) {
      alert(e.message);
    }
  };

  // --- Edit ---
  const startEdit = (loc) => {
    setEditingId(loc.id);
    setEditWarehouse(loc.warehouse || '');
    setEditBin(loc.bin || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditWarehouse('');
    setEditBin('');
  };

  const saveEdit = async (loc) => {
    const newFullName = `${editWarehouse.trim()} - ${editBin.trim()}`;
    if (!editWarehouse.trim() || !editBin.trim()) return alert('Both fields are required.');
    const duplicate = locations.find(l => l.fullName.toLowerCase() === newFullName.toLowerCase() && l.id !== loc.id);
    if (duplicate) return alert(`"${newFullName}" already exists.`);
    try {
      await updateDoc(doc(db, 'inv_locations', loc.id), {
        warehouse: editWarehouse.trim(),
        bin: editBin.trim(),
        fullName: newFullName,
      });
      cancelEdit();
    } catch (e) {
      alert(e.message);
    }
  };

  // --- Delete with safety check ---
  const handleDelete = async (loc) => {
    setDeletingId(loc.id);
    try {
      // Check if any item still has stock at this bin
      const itemsSnap = await getDocs(collection(db, 'inv_items'));
      const occupiedItems = itemsSnap.docs.filter(d => {
        const locs = d.data().locations || {};
        return locs[loc.fullName] && locs[loc.fullName] > 0;
      });

      if (occupiedItems.length > 0) {
        const names = occupiedItems.map(d => d.data().sku).join(', ');
        alert(`Cannot delete "${loc.fullName}" — it still holds stock for: ${names}.\n\nTransfer or zero out stock first.`);
        setDeletingId(null);
        return;
      }

      if (!window.confirm(`Delete "${loc.fullName}"? This cannot be undone.`)) {
        setDeletingId(null);
        return;
      }

      await deleteDoc(doc(db, 'inv_locations', loc.id));
    } catch (e) {
      alert(e.message);
    }
    setDeletingId(null);
  };

  // --- Group by warehouse ---
  const filtered = locations.filter(l =>
    l.fullName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const grouped = filtered.reduce((acc, loc) => {
    const wh = loc.warehouse || 'Unassigned';
    if (!acc[wh]) acc[wh] = [];
    acc[wh].push(loc);
    return acc;
  }, {});

  // Sort warehouses and bins within each
  const sortedWarehouses = Object.keys(grouped).sort();
  sortedWarehouses.forEach(wh => {
    grouped[wh].sort((a, b) => (a.bin || '').localeCompare(b.bin || ''));
  });

  const toggleWarehouse = (wh) => {
    setCollapsedWarehouses(prev => ({ ...prev, [wh]: !prev[wh] }));
  };

  return (
    <div style={{ maxWidth: '700px' }}>
      {/* Header */}
      <div style={styles.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
          <div style={{ background: '#2563eb', padding: '8px', borderRadius: '8px', color: 'white', display: 'flex' }}>
            <Map size={22} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>Warehouse & Bin Locations</h2>
            <span style={{ fontSize: '13px', color: '#64748b' }}>
              {locations.length} bin{locations.length !== 1 ? 's' : ''} across {Object.keys(grouped).length} warehouse{Object.keys(grouped).length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Add Form */}
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <div style={{ flex: 1 }}>
            <label style={styles.lbl}>Warehouse</label>
            <input
              required
              placeholder="e.g. WH1"
              value={warehouse}
              onChange={e => setWarehouse(e.target.value)}
              style={styles.inp}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.lbl}>Bin</label>
            <input
              required
              placeholder="e.g. A-12"
              value={bin}
              onChange={e => setBin(e.target.value)}
              style={styles.inp}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="submit" style={styles.btn}>
              <Plus size={18} /> Add Bin
            </button>
          </div>
        </form>

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', padding: '10px 14px', borderRadius: '8px', gap: '8px' }}>
          <Search size={16} color="#64748b" />
          <input
            placeholder="Search bins..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, fontSize: '14px', color: '#334155' }}
          />
          {searchTerm && (
            <X size={15} color="#94a3b8" style={{ cursor: 'pointer' }} onClick={() => setSearchTerm('')} />
          )}
        </div>
      </div>

      {/* Grouped Location List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
        {sortedWarehouses.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', background: 'white', borderRadius: '12px' }}>
            {searchTerm ? 'No bins match your search.' : 'No locations yet. Add your first bin above.'}
          </div>
        )}

        {sortedWarehouses.map(wh => {
          const isCollapsed = collapsedWarehouses[wh];
          const bins = grouped[wh];

          return (
            <div key={wh} style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
              {/* Warehouse Header */}
              <div
                onClick={() => toggleWarehouse(wh)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: '#f8fafc', cursor: 'pointer', borderBottom: isCollapsed ? 'none' : '1px solid #e2e8f0', userSelect: 'none' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {isCollapsed ? <ChevronRight size={16} color="#64748b" /> : <ChevronDown size={16} color="#64748b" />}
                  <span style={{ fontWeight: '700', color: '#0f172a', fontSize: '15px' }}>{wh}</span>
                  <span style={{ background: '#dbeafe', color: '#2563eb', fontSize: '12px', fontWeight: '600', padding: '2px 8px', borderRadius: '10px' }}>
                    {bins.length} bin{bins.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setWarehouse(wh); // pre-fill warehouse for quick add
                    document.querySelector('input[placeholder="e.g. A-12"]')?.focus();
                  }}
                  style={{ background: 'none', border: '1px solid #cbd5e1', color: '#475569', padding: '5px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                  <Plus size={13} /> Add bin here
                </button>
              </div>

              {/* Bins */}
              {!isCollapsed && (
                <div>
                  {bins.map((loc, i) => (
                    <div
                      key={loc.id}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '12px 20px',
                        borderBottom: i < bins.length - 1 ? '1px solid #f1f5f9' : 'none',
                        background: editingId === loc.id ? '#eff6ff' : 'white',
                        transition: 'background 0.15s',
                      }}
                    >
                      {editingId === loc.id ? (
                        /* Inline Edit Row */
                        <div style={{ display: 'flex', gap: '10px', flex: 1, alignItems: 'center' }}>
                          <input
                            value={editWarehouse}
                            onChange={e => setEditWarehouse(e.target.value)}
                            style={{ ...styles.inpSm, width: '130px' }}
                            placeholder="Warehouse"
                          />
                          <span style={{ color: '#94a3b8' }}>-</span>
                          <input
                            value={editBin}
                            onChange={e => setEditBin(e.target.value)}
                            style={{ ...styles.inpSm, width: '100px' }}
                            placeholder="Bin"
                            autoFocus
                          />
                          <button onClick={() => saveEdit(loc)} style={styles.btnSave}><Save size={15} /> Save</button>
                          <button onClick={cancelEdit} style={styles.btnCancel}><X size={15} /></button>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ background: '#f1f5f9', color: '#334155', padding: '4px 10px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', border: '1px solid #e2e8f0' }}>
                              {loc.bin || loc.fullName}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => startEdit(loc)}
                              style={styles.iconBtnBlue}
                              title="Edit bin"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              onClick={() => handleDelete(loc)}
                              disabled={deletingId === loc.id}
                              style={styles.iconBtnRed}
                              title="Delete bin"
                            >
                              {deletingId === loc.id
                                ? <AlertTriangle size={15} />
                                : <Trash2 size={15} />
                              }
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  card: {
    background: 'white',
    padding: '24px',
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    border: '1px solid #e2e8f0',
  },
  lbl: { display: 'block', fontSize: '12px', fontWeight: '700', color: '#64748b', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.4px' },
  inp: { padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%', boxSizing: 'border-box', fontSize: '14px', outline: 'none' },
  inpSm: { padding: '7px 10px', borderRadius: '6px', border: '1px solid #93c5fd', fontSize: '13px', outline: 'none' },
  btn: { background: '#2563eb', color: 'white', border: 'none', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600', fontSize: '14px', whiteSpace: 'nowrap' },
  btnSave: { background: '#2563eb', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', fontWeight: '600' },
  btnCancel: { background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' },
  iconBtnBlue: { background: '#eff6ff', color: '#2563eb', border: 'none', padding: '7px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' },
  iconBtnRed: { background: '#fef2f2', color: '#ef4444', border: 'none', padding: '7px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' },
};
