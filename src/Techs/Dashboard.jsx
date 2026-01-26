import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase_config";

export default function Dashboard() {
  const [lines, setLines] = useState([]);
  const [newLineName, setNewLineName] = useState("");

  useEffect(() => {
    // Changed orderBy from 'createdAt' to 'name'
    const q = query(collection(db, "lines"), orderBy("name"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Client-side sort to ensure case-insensitive alphabetical order (A vs a)
      list.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
      
      setLines(list);
    });
    return () => unsubscribe();
  }, []);

  const addLine = async (e) => {
    e.preventDefault();
    if (!newLineName) return;
    await addDoc(collection(db, "lines"), {
      name: newLineName,
      createdAt: serverTimestamp() // Better to use serverTimestamp than new Date()
    });
    setNewLineName("");
  };

  const handleDelete = async (e, id) => {
    e.preventDefault(); // Prevents the click from opening the line
    e.stopPropagation(); // Double check to stop bubbling
    
    if (window.confirm("Are you sure you want to delete this line? This cannot be undone.")) {
      await deleteDoc(doc(db, "lines", id));
    }
  };

  return (
    <div className="page">
      <h2>Manufacturing Lines</h2>
      
      <form onSubmit={addLine} className="add-form">
        <input 
          value={newLineName}
          onChange={(e) => setNewLineName(e.target.value)}
          placeholder="New Line Name..." 
        />
        <button type="submit">Add Line</button>
      </form>

      <div className="grid">
        {lines.map(line => (
          <Link to={`/techs/line/${line.id}`} key={line.id} className="card">
            <div className="card-header-row">
              <h3>{line.name}</h3>
              <button 
                onClick={(e) => handleDelete(e, line.id)} 
                className="delete-line-btn" 
                title="Delete Line"
              >
                ×
              </button>
            </div>
            <p>View Contacts & Parts →</p>
          </Link>
        ))}
      </div>
    </div>
  );
}