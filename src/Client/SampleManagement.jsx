import React, { useState, useEffect, useContext } from 'react';
import { collection, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase_config';
import { ClientPermsContext } from './App'; 
import { Link } from 'react-router-dom';
import { ChevronLeft, Search, Package, Image as ImageIcon } from 'lucide-react';

export default function SampleManagement() {
    const { perms } = useContext(ClientPermsContext);
    
    const [samples, setSamples] = useState([]);
    const [statuses, setStatuses] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        const sampleSnap = await getDocs(collection(db, "client_samples"));
        let allSamples = sampleSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        allSamples.sort((a, b) => new Date(b.dateSent || 0) - new Date(a.dateSent || 0));
        setSamples(allSamples);

        const statusSnap = await getDoc(doc(db, 'client_settings', 'statuses'));
        if (statusSnap.exists()) setStatuses(statusSnap.data().list || []);
        setLoading(false);
    };

    const handleFieldChange = (sampleId, field, value) => {
        setSamples(prev => prev.map(s => s.id === sampleId ? { ...s, [field]: value } : s));
    };

    const handleFieldBlur = async (sampleId, field, value) => {
        if (!perms?.manage_samples) return;
        await updateDoc(doc(db, "client_samples", sampleId), { [field]: value });
    };

    const handleStatusChange = async (sampleId, newStatus) => {
        if (!perms?.manage_samples) return;
        handleFieldChange(sampleId, 'status', newStatus);
        await updateDoc(doc(db, "client_samples", sampleId), { status: newStatus });
    };

    const getStatusColor = (statusLabel) => {
        const statusObj = statuses.find(s => s.label === statusLabel);
        return statusObj ? statusObj.color : '#e2e8f0';
    };

    const filteredSamples = samples.filter(s => 
        (s.name && s.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (s.clientName && s.clientName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (s.tracking && s.tracking.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    if (loading) return <div className="p-16 text-center text-slate-500 font-bold animate-pulse">Loading Global Samples...</div>;

    return (
        <div className="p-8 max-w-7xl mx-auto text-slate-800">
            <Link to="/clients" className="inline-flex items-center gap-2 text-blue-600 font-bold mb-6 hover:underline" style={{textDecoration:'none'}}>
                <ChevronLeft size={20} /> Back to Hub
            </Link>

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3"><Package size={32} className="text-blue-600"/> Global Sample Board</h1>
                    <p className="text-slate-500 mt-1 font-medium">Track and update all outbound product samples.</p>
                </div>
            </div>

            <div className="flex items-center gap-4 mb-8 bg-white p-2 rounded-2xl shadow-sm border border-slate-200">
                <Search className="text-slate-400 ml-4 shrink-0" size={24} />
                <input type="text" placeholder="Search by sample name, client, or tracking..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full p-2 outline-none font-medium bg-transparent" />
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
                <table className="w-full text-left whitespace-nowrap">
                    <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                            <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Img</th>
                            <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Sample Item</th>
                            <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Client</th>
                            <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Status</th>
                            <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Date Sent</th>
                            <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Tracking #</th>
                            <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest text-right">Cost ($)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredSamples.map(sample => (
                            <tr key={sample.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-6 py-3">
                                    {sample.imageUrl ? (
                                        <a href={sample.imageUrl} target="_blank" rel="noreferrer">
                                            <img src={sample.imageUrl} alt="sample" className="w-10 h-10 rounded-lg object-cover border border-slate-200 hover:scale-150 transition-transform cursor-pointer" />
                                        </a>
                                    ) : (
                                        <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-300"><ImageIcon size={18}/></div>
                                    )}
                                </td>
                                <td className="px-6 py-3 font-bold text-slate-800">{sample.name}</td>
                                <td className="px-6 py-3">
                                    <Link to={`/clients/${sample.clientId}`} className="font-bold text-blue-600 hover:underline">{sample.clientName}</Link>
                                </td>
                                <td className="px-6 py-3">
                                    {perms?.manage_samples ? (
                                        <select value={sample.status} onChange={(e) => handleStatusChange(sample.id, e.target.value)} className="text-[10px] px-3 py-1.5 rounded-full font-black shadow-sm border border-slate-900/10 outline-none cursor-pointer text-slate-900 uppercase tracking-widest" style={{ backgroundColor: getStatusColor(sample.status) }}>
                                            {statuses.map(s => <option key={s.label} value={s.label}>{s.label}</option>)}
                                        </select>
                                    ) : (
                                        <span className="text-[10px] px-3 py-1.5 rounded-full font-black shadow-sm uppercase tracking-widest border border-slate-900/10" style={{ backgroundColor: getStatusColor(sample.status) }}>{sample.status}</span>
                                    )}
                                </td>
                                <td className="px-6 py-3">
                                    <input type="date" value={sample.dateSent || ''} readOnly={!perms?.manage_samples} onChange={(e) => handleFieldChange(sample.id, 'dateSent', e.target.value)} onBlur={(e) => handleFieldBlur(sample.id, 'dateSent', e.target.value)} className={`bg-transparent outline-none font-mono text-sm w-32 px-2 py-1 rounded border border-transparent ${perms?.manage_samples ? 'focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100 hover:bg-slate-100 cursor-text' : 'cursor-default'}`} />
                                </td>
                                <td className="px-6 py-3">
                                    <input type="text" placeholder="No Tracking" value={sample.tracking || ''} readOnly={!perms?.manage_samples} onChange={(e) => handleFieldChange(sample.id, 'tracking', e.target.value)} onBlur={(e) => handleFieldBlur(sample.id, 'tracking', e.target.value)} className={`bg-transparent outline-none font-mono text-sm w-40 px-2 py-1 rounded border border-transparent ${perms?.manage_samples ? 'focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100 hover:bg-slate-100 cursor-text' : 'cursor-default'}`} />
                                </td>
                                <td className="px-6 py-3 text-right">
                                    <input type="number" step="0.01" placeholder="0.00" value={sample.cost || ''} readOnly={!perms?.manage_samples} onChange={(e) => handleFieldChange(sample.id, 'cost', e.target.value)} onBlur={(e) => handleFieldBlur(sample.id, 'cost', e.target.value)} className={`bg-transparent outline-none font-medium text-sm w-24 text-right px-2 py-1 rounded border border-transparent ${perms?.manage_samples ? 'focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100 hover:bg-slate-100 cursor-text' : 'cursor-default'}`} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredSamples.length === 0 && <div className="p-10 text-center font-bold text-slate-400">No samples found.</div>}
            </div>
        </div>
    );
}