import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase_config';

// Converts Hex input into an RGBA string with 0.5 alpha
const hexToRgba = (hex) => {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, 0.5)`;
};

export default function Settings() {
    const [statuses, setStatuses] = useState([]);
    const [newLabel, setNewLabel] = useState('');
    const [newColor, setNewColor] = useState('#000000');

    useEffect(() => {
        const fetchStatuses = async () => {
            const docRef = doc(db, 'client_settings', 'statuses');
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                setStatuses(docSnap.data().list || []);
            }
        };
        fetchStatuses();
    }, []);

    const handleAddStatus = async () => {
        if (!newLabel) return;
        const updatedStatuses = [...statuses, { label: newLabel, color: hexToRgba(newColor) }];
        
        // Save to Firestore
        await setDoc(doc(db, 'client_settings', 'statuses'), { list: updatedStatuses });
        
        setStatuses(updatedStatuses);
        setNewLabel('');
    };

    return (
        <div className="p-6">
            <h2 className="text-2xl font-bold mb-4">Sample Status Settings</h2>
            <div className="flex gap-4 mb-6">
                <input 
                    type="text" 
                    placeholder="Status Label (e.g., Shipped)" 
                    value={newLabel} 
                    onChange={e => setNewLabel(e.target.value)} 
                    className="border p-2"
                />
                <input 
                    type="color" 
                    value={newColor} 
                    onChange={e => setNewColor(e.target.value)} 
                    className="border p-1 h-10"
                />
                <button onClick={handleAddStatus} className="bg-green-600 text-white px-4 py-2">Add Status</button>
            </div>

            <ul className="w-1/2">
                {statuses.map((s, idx) => (
                    <li key={idx} className="p-3 mb-2 flex justify-between rounded" style={{ backgroundColor: s.color }}>
                        <span className="font-semibold">{s.label}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}