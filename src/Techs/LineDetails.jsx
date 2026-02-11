import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, collection, onSnapshot, addDoc, getDoc, deleteDoc, query, where } from "firebase/firestore";
import { db } from "../firebase_config";

export default function LineDetails() {
  const { id } = useParams();
  const [lineName, setLineName] = useState("Loading...");
  const [contacts, setContacts] = useState([]);
  const [parts, setParts] = useState([]);
  const [linkedInventory, setLinkedInventory] = useState([]); // NEW: Linked stock
  
  const [showModal, setShowModal] = useState(false);
  const [modalStep, setModalStep] = useState("selection");

  // --- FORM STATES ---
  const [cForm, setCForm] = useState({
    firstName: "", lastName: "", phone: "", email: "", 
    notes: "", messaging: [] 
  });
  
  const [msgService, setMsgService] = useState("WeChat");
  const [msgHandle, setMsgHandle] = useState("");

  const [pForm, setPForm] = useState({
    name: "", partNumber: "", supplier: "", description: "", 
    link: "", price: "", leadTime: "", criticality: "Medium"
  });

  // --- LOADING DATA ---
  useEffect(() => {
    // 1. Get Line Name
    getDoc(doc(db, "lines", id)).then(d => {
      if(d.exists()) setLineName(d.data().name);
    });

    // 2. Get Contacts (Subcollection)
    const unsubContacts = onSnapshot(collection(db, "lines", id, "contacts"), s => {
      setContacts(s.docs.map(d => ({id: d.id, ...d.data()})));
    });

    // 3. Get Parts (Reference List Subcollection)
    const unsubParts = onSnapshot(collection(db, "lines", id, "parts"), s => {
      setParts(s.docs.map(d => ({id: d.id, ...d.data()})));
    });

    // 4. NEW: Get Linked Inventory (Global Collection)
    // We query the 'inventory' collection where lineId matches this page's ID
    const qInv = query(collection(db, "inventory"), where("lineId", "==", id));
    const unsubInv = onSnapshot(qInv, (s) => {
      setLinkedInventory(s.docs.map(d => ({id: d.id, ...d.data()})));
    });

    return () => { unsubContacts(); unsubParts(); unsubInv(); };
  }, [id]);

  // --- ACTIONS ---
  const handleAddMsg = (e) => {
    e.preventDefault();
    if(!msgHandle) return;
    setCForm({ ...cForm, messaging: [...cForm.messaging, { service: msgService, handle: msgHandle }] });
    setMsgHandle("");
  };

  const removeMsg = (index) => {
    const newMsg = [...cForm.messaging];
    newMsg.splice(index, 1);
    setCForm({...cForm, messaging: newMsg});
  };

  const submitContact = async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "lines", id, "contacts"), cForm);
    closeModal();
  };

  const submitPart = async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "lines", id, "parts"), pForm);
    closeModal();
  };

  const deleteItem = async (col, itemId) => {
    if(window.confirm("Delete this item?")) {
      await deleteDoc(doc(db, "lines", id, col, itemId));
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setModalStep("selection");
    setCForm({ firstName: "", lastName: "", phone: "", email: "", notes: "", messaging: [] });
    setPForm({ name: "", partNumber: "", supplier: "", description: "", link: "", price: "", leadTime: "", criticality: "Medium" });
    setMsgService("WeChat");
    setMsgHandle("");
  };

  return (
    <div className="page">
      <Link to="/" className="back-link">← Back to Dashboard</Link>
      <div className="header-flex">
        <h1>{lineName}</h1>
      </div>

      {/* NEW: Inventory Section at the top */}
      <div className="card" style={{marginBottom: 24, borderLeft: '5px solid #2563eb'}}>
        <h3>Live Inventory / Spares</h3>
        {linkedInventory.length === 0 ? (
          <p style={{color:'#94a3b8', fontStyle:'italic'}}>No inventory assigned to this machine. Go to the <Link to="/inventory" style={{color:'#2563eb'}}>Inventory Page</Link> to assign items.</p>
        ) : (
          <div className="grid" style={{gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', marginTop: 15}}>
            {linkedInventory.map(item => (
              <div key={item.id} style={{border:'1px solid #e2e8f0', padding: 10, borderRadius: 8}}>
                <div style={{fontWeight:'bold', color:'#0f172a'}}>{item.name}</div>
                <div style={{fontSize:'0.8rem', color:'#64748b'}}>#{item.partNumber}</div>
                <div style={{marginTop: 5, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                   <span style={{fontSize:'1.2rem', fontWeight:'bold', color: item.quantity <= item.minLevel ? '#ef4444' : '#16a34a'}}>
                     {item.quantity} <span style={{fontSize:'0.8rem', fontWeight:'normal', color:'#64748b'}}>in stock</span>
                   </span>
                   <Link to="/techs/inventory" style={{fontSize:'0.8rem', color:'#2563eb'}}>Manage</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="split-view">
        {/* CONTACTS LIST */}
        <div className="section">
          <h3>Contacts</h3>
          {contacts.length === 0 && <p className="empty-state">No contacts added.</p>}
          <div className="list-container">
            {contacts.map(c => (
              <div key={c.id} className="item-card">
                <div className="item-header">
                  <strong>{c.firstName} {c.lastName}</strong>
                  <button onClick={() => deleteItem("contacts", c.id)} className="delete-x">×</button>
                </div>
                <div className="item-details">
                  {c.phone && <div>📞 {c.phone}</div>}
                  {c.email && <div>✉️ {c.email}</div>}
                  {c.messaging && c.messaging.map((m, i) => (
                    <div key={i} className="badge">{m.service}: {m.handle}</div>
                  ))}
                  {c.notes && <div className="notes">"{c.notes}"</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* REFERENCE PARTS LIST */}
        <div className="section">
          <h3>Reference Parts List</h3>
          <p style={{fontSize:'0.8rem', color:'#94a3b8', marginBottom:10}}>Use this list for parts that you need to order but don't stock.</p>
          {parts.length === 0 && <p className="empty-state">No parts listed.</p>}
          <div className="list-container">
            {parts.map(p => (
              <div key={p.id} className="item-card">
                 <div className="item-header">
                  <strong>{p.name}</strong>
                  <button onClick={() => deleteItem("parts", p.id)} className="delete-x">×</button>
                </div>
                <div className="item-sub">#{p.partNumber} • {p.supplier}</div>
                <div className="item-details">
                  <div className="desc">{p.description}</div>
                  <div className="meta-row">
                    {p.price && <span>💵 {p.price}</span>}
                    {p.leadTime && <span>⏱ {p.leadTime}</span>}
                    {p.criticality && <span className={`crit ${p.criticality.toLowerCase()}`}>{p.criticality} Priority</span>}
                  </div>
                  {p.link && <a href={p.link} target="_blank" rel="noreferrer" className="link-btn">Order Link ↗</a>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <button className="fab" onClick={() => setShowModal(true)}>+</button>

      {/* MODAL (Unchanged logic, just keeping it here for completeness) */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <button className="close-modal" onClick={closeModal}>×</button>
            
            {modalStep === "selection" && (
              <div className="selection-step">
                <h2>What would you like to add?</h2>
                <div className="selection-buttons">
                  <button onClick={() => setModalStep("contact")}>👤 Add Contact</button>
                  <button onClick={() => setModalStep("part")}>⚙️ Add Reference Part</button>
                </div>
              </div>
            )}

            {modalStep === "contact" && (
              <form onSubmit={submitContact} className="modal-form">
                <h2>New Contact</h2>
                <div className="form-row">
                  <input placeholder="First Name" value={cForm.firstName} onChange={e=>setCForm({...cForm, firstName:e.target.value})} required />
                  <input placeholder="Last Name" value={cForm.lastName} onChange={e=>setCForm({...cForm, lastName:e.target.value})} required />
                </div>
                <div className="form-row">
                  <input placeholder="Phone" value={cForm.phone} onChange={e=>setCForm({...cForm, phone:e.target.value})} />
                  <input placeholder="Email" value={cForm.email} onChange={e=>setCForm({...cForm, email:e.target.value})} />
                </div>
                
                <div className="messaging-section">
                  <label>Messaging Apps</label>
                  <div className="msg-input-row">
                    <select value={msgService} onChange={e=>setMsgService(e.target.value)}>
                      <option>WeChat</option>
                      <option>WhatsApp</option>
                      <option>Telegram</option>
                      <option>Line</option>
                      <option>Other</option>
                    </select>
                    <input placeholder="ID / Number" value={msgHandle} onChange={e=>setMsgHandle(e.target.value)} />
                    <button type="button" onClick={handleAddMsg} className="small-add">Add</button>
                  </div>
                  <div className="chips">
                    {cForm.messaging.map((m, i) => (
                      <span key={i} className="chip">{m.service}: {m.handle} <b onClick={()=>removeMsg(i)}>×</b></span>
                    ))}
                  </div>
                </div>

                <textarea placeholder="Notes / Role Description..." value={cForm.notes} onChange={e=>setCForm({...cForm, notes:e.target.value})} />
                <button type="submit" className="save-btn">Save Contact</button>
              </form>
            )}

            {modalStep === "part" && (
              <form onSubmit={submitPart} className="modal-form">
                <h2>New Reference Part</h2>
                <p style={{fontSize:'0.85rem', color:'#64748b', marginBottom:15}}>
                  Note: This adds to the reference list. To add trackable stock, use the Inventory page.
                </p>
                <div className="form-row">
                  <input placeholder="Part Name" value={pForm.name} onChange={e=>setPForm({...pForm, name:e.target.value})} required />
                  <input placeholder="Part Number / SKU" value={pForm.partNumber} onChange={e=>setPForm({...pForm, partNumber:e.target.value})} />
                </div>
                <div className="form-row">
                  <input placeholder="Supplier Name" value={pForm.supplier} onChange={e=>setPForm({...pForm, supplier:e.target.value})} />
                  <input placeholder="Price (e.g. $50)" value={pForm.price} onChange={e=>setPForm({...pForm, price:e.target.value})} />
                </div>
                <div className="form-row">
                   <select value={pForm.criticality} onChange={e=>setPForm({...pForm, criticality:e.target.value})}>
                      <option>Low</option>
                      <option>Medium</option>
                      <option>High</option>
                      <option>Critical</option>
                   </select>
                   <input placeholder="Lead Time (e.g. 3 days)" value={pForm.leadTime} onChange={e=>setPForm({...pForm, leadTime:e.target.value})} />
                </div>
                <input placeholder="Order Link (http://...)" value={pForm.link} onChange={e=>setPForm({...pForm, link:e.target.value})} />
                <textarea placeholder="Part Description..." value={pForm.description} onChange={e=>setPForm({...pForm, description:e.target.value})} />
                <button type="submit" className="save-btn">Save Part</button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}