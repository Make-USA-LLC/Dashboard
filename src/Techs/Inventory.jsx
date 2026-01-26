import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, addDoc, doc, deleteDoc, updateDoc, query, orderBy } from "firebase/firestore";
import { db } from "../firebase_config";

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [lines, setLines] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);

  // Form State - Added 'reorderLink'
  const [form, setForm] = useState({
    name: "", partNumber: "", location: "", 
    quantity: 0, minLevel: 5, supplier: "", notes: "",
    lineId: "", reorderLink: "" 
  });

  // Load Inventory AND Lines
  useEffect(() => {
    // 1. Get Inventory
    const unsubInv = onSnapshot(collection(db, "inventory"), (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 2. Get Lines (Machines) for the dropdown
    const qLines = query(collection(db, "lines"), orderBy("name", "asc"));
    const unsubLines = onSnapshot(qLines, (snap) => {
      setLines(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubInv(); unsubLines(); };
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    
    // Find the name of the selected line for easier display later
    const selectedLine = lines.find(l => l.id === form.lineId);
    const lineName = selectedLine ? selectedLine.name : "General Stock";

    await addDoc(collection(db, "inventory"), {
      ...form,
      quantity: parseInt(form.quantity),
      minLevel: parseInt(form.minLevel),
      lineName: lineName
    });
    closeModal();
  };

  const handleDelete = async (id) => {
    if(window.confirm("Remove this item from inventory?")) {
      await deleteDoc(doc(db, "inventory", id));
    }
  };

  const adjustQty = async (id, currentQty, amount) => {
    const newQty = parseInt(currentQty) + amount;
    if (newQty < 0) return;
    await updateDoc(doc(db, "inventory", id), { quantity: newQty });
  };

  const closeModal = () => {
    setShowModal(false);
    // Reset Form
    setForm({ 
      name: "", partNumber: "", location: "", 
      quantity: 0, minLevel: 5, supplier: "", 
      notes: "", lineId: "", reorderLink: "" 
    });
  };

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    item.partNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="page">
      <Link to="/" className="back-link">← Back to Dashboard</Link>
      
      <div className="header-flex">
        <h1>Global Inventory</h1>
        <input 
          className="search-bar" 
          placeholder="🔍 Search by Name or SKU..." 
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="inventory-grid">
        {filteredItems.map(item => {
          const isLow = item.quantity <= item.minLevel;
          return (
            <div key={item.id} className={`inv-card ${isLow ? 'low-stock-border' : ''}`}>
              <div className="inv-header">
                <div>
                  <h3>{item.name}</h3>
                  <div className="sku">#{item.partNumber}</div>
                </div>
                <button onClick={() => handleDelete(item.id)} className="delete-x">×</button>
              </div>

              <div className="inv-body">
                <div className="inv-meta">
                  {item.lineName && item.lineName !== "General Stock" ? (
                    <span className="badge" style={{background:'#dbeafe', color:'#1e40af'}}>🔧 {item.lineName}</span>
                  ) : (
                    <span className="badge" style={{background:'#f1f5f9', color:'#64748b'}}>📦 General</span>
                  )}
                </div>
                <div className="inv-meta">
                  <span>📍 {item.location || "No Loc"}</span>
                  <span>🏭 {item.supplier || "No Supplier"}</span>
                </div>
                
                {item.notes && <div className="inv-notes">{item.notes}</div>}

                {/* Reorder Link Button */}
                {item.reorderLink && (
                  <a href={item.reorderLink} target="_blank" rel="noreferrer" className="link-btn" style={{marginTop: '10px', display:'block', textAlign:'center', background:'#f0f9ff', padding:'6px', borderRadius:'6px'}}>
                    🛒 Order from Supplier
                  </a>
                )}
              </div>

              <div className="inv-footer">
                <div className="qty-control">
                  <button onClick={() => adjustQty(item.id, item.quantity, -1)}>-</button>
                  <span className={isLow ? "qty-low" : "qty-ok"}>{item.quantity}</span>
                  <button onClick={() => adjustQty(item.id, item.quantity, 1)}>+</button>
                </div>
                {isLow && <span className="alert-badge">LOW STOCK</span>}
              </div>
            </div>
          );
        })}
      </div>

      <button className="fab" onClick={() => setShowModal(true)}>+</button>

      {/* MODAL */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <button className="close-modal" onClick={closeModal}>×</button>
            <form onSubmit={handleAdd} className="modal-form">
              <h2>Add Inventory Item</h2>
              
              <label style={{fontSize:'0.9rem', fontWeight:'bold', color:'#64748b'}}>Linked Machine</label>
              <select 
                value={form.lineId} 
                onChange={e => setForm({...form, lineId: e.target.value})} 
                style={{marginBottom: 15}}
              >
                <option value="">-- General / Shared Stock --</option>
                {lines.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>

              <div className="form-row">
                <input placeholder="Item Name" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
                <input placeholder="Part / SKU #" value={form.partNumber} onChange={e => setForm({...form, partNumber: e.target.value})} />
              </div>

              <div className="form-row">
                <input placeholder="Location" value={form.location} onChange={e => setForm({...form, location: e.target.value})} />
                <input placeholder="Supplier Name" value={form.supplier} onChange={e => setForm({...form, supplier: e.target.value})} />
              </div>

              {/* NEW REORDER LINK INPUT */}
              <input 
                placeholder="Reorder Link (https://...)" 
                value={form.reorderLink} 
                onChange={e => setForm({...form, reorderLink: e.target.value})} 
              />

              <div className="form-row">
                <div className="input-group">
                  <label>Current Qty</label>
                  <input type="number" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} />
                </div>
                <div className="input-group">
                  <label>Min Level</label>
                  <input type="number" value={form.minLevel} onChange={e => setForm({...form, minLevel: e.target.value})} />
                </div>
              </div>

              <textarea placeholder="Notes..." value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
              <button type="submit" className="save-btn">Save to Inventory</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}