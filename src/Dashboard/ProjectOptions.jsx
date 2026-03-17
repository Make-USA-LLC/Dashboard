import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './ProjectOptions.css';
import Loader from '../components/loader';
import { db } from './firebase_config.jsx';
import { doc, updateDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { useRole } from './hooks/useRole'; // <-- Imported hook

const RenderCard = ({ title, list, type, inputVal, setInput, canEdit, addItem, deleteItem }) => (
    <div className={`dm-card ${!canEdit ? 'read-only' : ''}`}>
        <h2>{title}</h2>
        <div className="dm-input-group">
            <input 
                type="text" 
                className="dm-input" 
                placeholder={`Add ${title}...`}
                value={inputVal}
                onChange={e => setInput(e.target.value)}
                disabled={!canEdit}
            />
            <button className="btn btn-green" onClick={() => addItem(type, inputVal, setInput)} disabled={!canEdit}>Add</button>
        </div>
        <ul className="dm-list">
            {list.length === 0 && <li className="dm-empty">No items defined.</li>}
            {list.map((item, i) => (
                <li key={i}>
                    <span>{item}</span>
                    {canEdit && (
                        <button className="btn-red-small" onClick={() => deleteItem(type, i)}>Delete</button>
                    )}
                </li>
            ))}
        </ul>
    </div>
);

const DropdownManager = () => {
    const navigate = useNavigate();
    
    // --- 1. USE THE HOOK ---
    const { user, hasPerm, isReadOnly, loading: roleLoading } = useRole();
    const canView = hasPerm('queue', 'view') || hasPerm('admin', 'view') || isReadOnly;
    const canEdit = (hasPerm('queue', 'edit') || hasPerm('admin', 'edit')) && !isReadOnly;

    const [pageLoading, setPageLoading] = useState(true);
    
    // Data State
    const [data, setData] = useState({
        companies: [],
        categories: [],
        sizes: []
    });

    // Inputs State
    const [newCompany, setNewCompany] = useState('');
    const [newCategory, setNewCategory] = useState('');
    const [newSize, setNewSize] = useState('');

    // --- 2. INITIALIZATION ---
    useEffect(() => {
        if (roleLoading) return;

        if (!user || !canView) {
            navigate('/dashboard');
            return;
        }

        const configRef = doc(db, "config", "project_options");
        const unsubscribe = onSnapshot(configRef, (snap) => {
            if (snap.exists()) {
                const d = snap.data();
                setData({
                    companies: d.companies || [],
                    categories: d.categories || [],
                    sizes: d.sizes || []
                });
            } else {
                if (canEdit) setDoc(configRef, { companies: [], categories: [], sizes: [] });
            }
            setPageLoading(false);
        });

        return () => unsubscribe();
    }, [user, canView, roleLoading, canEdit, navigate]);

    // --- 3. ACTIONS ---
    const addItem = async (type, val, setter) => {
        if (!canEdit) return alert("Read-Only Access");
        if (!val.trim()) return;

        const configRef = doc(db, "config", "project_options");
        const list = [...data[type]];
        
        if (!list.includes(val.trim())) {
            list.push(val.trim());
            list.sort();
            await updateDoc(configRef, { [type]: list });
            setter(''); 
        }
    };

    const deleteItem = async (type, index) => {
        if (!canEdit) return alert("Read-Only Access");
        if(!window.confirm("Delete item?")) return;

        const configRef = doc(db, "config", "project_options");
        const list = [...data[type]];
        list.splice(index, 1);
        await updateDoc(configRef, { [type]: list });
    };

    if (roleLoading || pageLoading) return <div style={{height: '100vh', display: 'flex', alignItems: 'center', background: '#f8fafc'}}><Loader message="Loading Options..." /></div>;
    if (!canView) return null;

    return (
        <div className="dm-wrapper">
            <div className="dm-top-bar">
                <button onClick={() => navigate('/dashboard')} className="btn-text">&larr; Dashboard</button>
                <div style={{fontWeight:'bold'}}>Dropdown Options Manager</div>
                <div />
            </div>

            <div className="dm-container">
                <div className="dm-split-view">
                    <RenderCard 
                        title="Companies" 
                        list={data.companies} 
                        type="companies" 
                        inputVal={newCompany} 
                        setInput={setNewCompany}
                        canEdit={canEdit}
                        addItem={addItem}
                        deleteItem={deleteItem}
                    />
                    
                    <RenderCard 
                        title="Categories" 
                        list={data.categories} 
                        type="categories" 
                        inputVal={newCategory} 
                        setInput={setNewCategory}
                        canEdit={canEdit}
                        addItem={addItem}
                        deleteItem={deleteItem}
                    />
                    
                    <RenderCard 
                        title="Sizes" 
                        list={data.sizes} 
                        type="sizes" 
                        inputVal={newSize} 
                        setInput={setNewSize}
                        canEdit={canEdit}
                        addItem={addItem}
                        deleteItem={deleteItem}
                    />
                </div>
            </div>
        </div>
    );
};

export default DropdownManager;