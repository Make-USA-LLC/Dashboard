import React, { useState, useEffect, useContext } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc, updateDoc, collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase_config';
import { uploadToSharePoint } from './sharepointUtils';
import { ClientPermsContext } from './App'; 
import { ChevronLeft, Package, MapPin, Truck, FileText, UploadCloud, Users, User, Mail, Phone, Trash2, Building2 } from 'lucide-react';

export default function ClientDetail() {
  const { id } = useParams();
  const { perms, accounts, instance } = useContext(ClientPermsContext); 

  const [client, setClient] = useState(null);
  const [samples, setSamples] = useState([]);
  const [statuses, setStatuses] = useState([]);
  
  const [newSample, setNewSample] = useState({ name: '', dateSent: '', tracking: '', cost: '', status: '' });
  const [sampleImage, setSampleImage] = useState(null);
  const [newContact, setNewContact] = useState({ name: '', role: '', email: '', phone: '' });

  useEffect(() => { fetchData(); }, [id]);

  const fetchData = async () => {
    const docSnap = await getDoc(doc(db, "clients", id));
    if (docSnap.exists()) setClient({ id: docSnap.id, ...docSnap.data() });

    const q = query(collection(db, "client_samples"), where("clientId", "==", id));
    const sampleSnap = await getDocs(q);
    setSamples(sampleSnap.docs.map(d => ({ id: d.id, ...d.data() })));

    const statusSnap = await getDoc(doc(db, 'client_settings', 'statuses'));
    if (statusSnap.exists()) setStatuses(statusSnap.data().list || []);
  };

  const getMsToken = async () => {
      const request = { scopes: ["Sites.ReadWrite.All", "Files.ReadWrite.All"], account: accounts[0] };
      try { return (await instance.acquireTokenSilent(request)).accessToken; } 
      catch (err) { await instance.acquireTokenRedirect(request); return null; }
  };

  const handleUpdateField = async (field, value) => {
    if (field === 'isActive' && !perms?.manage_client_status) return;
    if (field !== 'isActive' && !perms?.edit_client_details) return; 

    await updateDoc(doc(db, "clients", id), { [field]: value });
    setClient(prev => ({ ...prev, [field]: value }));
  };

  const handleDocumentUpload = async (e, type) => {
    const canUpload = type === 'w9' ? perms?.upload_w9 : perms?.upload_legal;
    if (!canUpload) return alert("You do not have permission to upload documents.");

    const file = e.target.files[0];
    if (!file || !client) return;
    const token = await getMsToken();
    if (!token) return;

    const folder = type === 'w9' ? 'W9s' : 'Legal Terms';
    try {
        const url = await uploadToSharePoint(client.name, folder, file, token);
        if(url) {
            await updateDoc(doc(db, "clients", id), { [`files.${type}`]: url });
            setClient(prev => ({ ...prev, files: { ...prev.files, [type]: url } }));
        }
    } catch(err) {
        alert("Upload Failed: " + err.message);
    }
  };

  const handleAddContact = async (e) => {
    e.preventDefault();
    if (!perms?.edit_client_details) return alert("Unauthorized.");
    if (!newContact.name) return;
    const contact = { ...newContact, id: Date.now().toString() };
    const updatedContacts = [...(client.contacts || []), contact];
    await updateDoc(doc(db, "clients", id), { contacts: updatedContacts });
    setClient(prev => ({ ...prev, contacts: updatedContacts }));
    setNewContact({ name: '', role: '', email: '', phone: '' });
  };

  const handleRemoveContact = async (contactId) => {
    if (!perms?.edit_client_details) return alert("Unauthorized.");
    if (!window.confirm("Remove this contact?")) return;
    const updatedContacts = (client.contacts || []).filter(c => c.id !== contactId);
    await updateDoc(doc(db, "clients", id), { contacts: updatedContacts });
    setClient(prev => ({ ...prev, contacts: updatedContacts }));
  };

  const handleAddSample = async (e) => {
    e.preventDefault();
    if (!perms?.manage_samples) return alert("Unauthorized.");
    
    let imageUrl = '';
    if (sampleImage) {
      const token = await getMsToken();
      if (!token) return;
      try { imageUrl = await uploadToSharePoint(client.name, 'Samples', sampleImage, token, newSample.name); } 
      catch (err) { return alert("Photo Upload Failed: " + err.message); }
    }
    
    const sampleData = { clientId: id, clientName: client.name, ...newSample, imageUrl };
    const docRef = await addDoc(collection(db, "client_samples"), sampleData);
    setSamples([...samples, { id: docRef.id, ...sampleData }]);
    setNewSample({ name: '', dateSent: '', tracking: '', cost: '', status: '' });
    setSampleImage(null);
  };

  const handleSampleFieldChange = (sampleId, field, value) => {
    setSamples(prev => prev.map(s => s.id === sampleId ? { ...s, [field]: value } : s));
  };

  const handleSampleFieldBlur = async (sampleId, field, value) => {
    if (!perms?.manage_samples) return;
    await updateDoc(doc(db, "client_samples", sampleId), { [field]: value });
  };

  const handleStatusChange = async (sampleId, newStatus) => {
    if (!perms?.manage_samples) return;
    handleSampleFieldChange(sampleId, 'status', newStatus);
    await updateDoc(doc(db, "client_samples", sampleId), { status: newStatus });
  };

  const getStatusColor = (statusLabel) => {
    const statusObj = statuses.find(s => s.label === statusLabel);
    return statusObj ? statusObj.color : '#e2e8f0';
  };

  if (!client) return <div className="p-16 text-center text-slate-500 font-bold animate-pulse">Loading Profile...</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto text-slate-800">
      <Link to="/clients" className="inline-flex items-center gap-2 text-blue-600 font-bold mb-6 hover:underline" style={{textDecoration:'none'}}>
          <ChevronLeft size={20} /> Back to Hub
      </Link>

      <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm mb-8">
        
        {/* NEW: INACTIVE TOGGLE BLOCK */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <h2 className="text-3xl font-bold text-slate-900 flex items-center">
                {client.name} 
                {client.isActive === false && <span className="text-sm bg-slate-100 text-slate-500 px-3 py-1 rounded-lg ml-3 align-middle font-black tracking-widest uppercase border border-slate-200 shadow-inner">INACTIVE</span>}
            </h2>
            
            {perms?.manage_client_status && (
                <button 
                    onClick={() => handleUpdateField('isActive', client.isActive === false ? true : false)}
                    className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm ${client.isActive === false ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'}`}
                >
                    {client.isActive === false ? 'Reactivate Client' : 'Mark as Inactive'}
                </button>
            )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-slate-700 border-b border-slate-100 pb-2"><MapPin size={20} className="inline mr-2 text-slate-400"/> Addresses</h3>
            <div className="grid grid-cols-1 gap-4">
              <div><label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Billing</label><input readOnly={!perms?.edit_client_details} value={client.billAddress || ''} onChange={(e) => setClient({...client, billAddress: e.target.value})} onBlur={(e) => handleUpdateField('billAddress', e.target.value)} className={`w-full border p-2.5 rounded-lg outline-none font-medium transition-all ${!perms?.edit_client_details ? 'bg-slate-50 border-transparent text-slate-500 cursor-not-allowed' : 'bg-white focus:ring-2 focus:ring-blue-500 border-slate-200'}`} /></div>
              <div><label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Shipping</label><input readOnly={!perms?.edit_client_details} value={client.shipAddress || ''} onChange={(e) => setClient({...client, shipAddress: e.target.value})} onBlur={(e) => handleUpdateField('shipAddress', e.target.value)} className={`w-full border p-2.5 rounded-lg outline-none font-medium transition-all ${!perms?.edit_client_details ? 'bg-slate-50 border-transparent text-slate-500 cursor-not-allowed' : 'bg-white focus:ring-2 focus:ring-blue-500 border-slate-200'}`} /></div>
            </div>
          </div>
          <div className="space-y-6">
            <div>
                <h3 className="text-lg font-bold text-slate-700 border-b border-slate-100 pb-2 mb-4"><Truck size={20} className="inline mr-2 text-slate-400"/> Carriers</h3>
                <div className="flex gap-4">
                    <div className="w-full"><label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">UPS</label><input readOnly={!perms?.edit_client_details} value={client.upsAccount || ''} onChange={(e) => setClient({...client, upsAccount: e.target.value})} onBlur={(e) => handleUpdateField('upsAccount', e.target.value)} className={`w-full border p-2.5 rounded-lg outline-none font-medium transition-all ${!perms?.edit_client_details ? 'bg-slate-50 border-transparent text-slate-500 cursor-not-allowed' : 'bg-white focus:ring-2 focus:ring-blue-500 border-slate-200'}`} /></div>
                    <div className="w-full"><label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">FedEx</label><input readOnly={!perms?.edit_client_details} value={client.fedexAccount || ''} onChange={(e) => setClient({...client, fedexAccount: e.target.value})} onBlur={(e) => handleUpdateField('fedexAccount', e.target.value)} className={`w-full border p-2.5 rounded-lg outline-none font-medium transition-all ${!perms?.edit_client_details ? 'bg-slate-50 border-transparent text-slate-500 cursor-not-allowed' : 'bg-white focus:ring-2 focus:ring-blue-500 border-slate-200'}`} /></div>
                </div>
            </div>
            <div>
                <h3 className="text-lg font-bold text-slate-700 border-b border-slate-100 pb-2 mb-4"><FileText size={20} className="inline mr-2 text-slate-400"/> SharePoint Vault</h3>
                <div className="flex gap-4">
                    <div className="flex flex-col gap-2 w-full">
                        {perms?.upload_w9 ? (
                            <label className="w-full flex items-center justify-center gap-2 bg-white border border-dashed border-slate-300 rounded-xl p-3 text-slate-600 font-bold hover:border-blue-500 hover:text-blue-600 cursor-pointer transition-all"><UploadCloud size={18}/> W9 <input type="file" className="hidden" onChange={(e) => handleDocumentUpload(e, 'w9')} /></label>
                        ) : (
                            <div className="p-3 text-center text-xs font-black text-slate-400 bg-slate-50 border border-slate-100 rounded-xl uppercase tracking-widest">W9 Upload Restricted</div>
                        )}
                        {perms?.view_w9 && client.files?.w9 && <a href={client.files.w9} target="_blank" rel="noreferrer" className="text-xs text-center text-blue-600 font-black uppercase tracking-wider hover:underline">Open Active W9</a>}
                    </div>
                    <div className="flex flex-col gap-2 w-full">
                        {perms?.upload_legal ? (
                            <label className="w-full flex items-center justify-center gap-2 bg-white border border-dashed border-slate-300 rounded-xl p-3 text-slate-600 font-bold hover:border-blue-500 hover:text-blue-600 cursor-pointer transition-all"><UploadCloud size={18}/> Terms <input type="file" className="hidden" onChange={(e) => handleDocumentUpload(e, 'legalTerms')} /></label>
                        ) : (
                            <div className="p-3 text-center text-xs font-black text-slate-400 bg-slate-50 border border-slate-100 rounded-xl uppercase tracking-widest">Terms Restricted</div>
                        )}
                        {perms?.view_legal && client.files?.legalTerms && <a href={client.files.legalTerms} target="_blank" rel="noreferrer" className="text-xs text-center text-blue-600 font-black uppercase tracking-wider hover:underline">Open Terms</a>}
                    </div>
                </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-10">
        <h3 className="text-2xl font-black text-slate-900 flex items-center gap-2 mb-4"><Users size={24} className="text-blue-600"/> Key Contacts</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-4">
            <div className="bg-blue-50 border border-blue-200 p-5 rounded-2xl relative shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-blue-200 flex items-center justify-center text-blue-700 shrink-0"><Building2 size={20}/></div>
                    <div className="w-full">
                        <input readOnly={!perms?.edit_client_details} value={client.fullName || ''} onChange={e => setClient({...client, fullName: e.target.value})} onBlur={e => handleUpdateField('fullName', e.target.value)} className={`font-bold text-slate-900 bg-transparent border-none outline-none w-full truncate ${perms?.edit_client_details ? 'hover:bg-white/50 focus:bg-white focus:ring-2 focus:ring-blue-300 rounded px-1 -ml-1' : ''}`} placeholder="Primary Contact Name" />
                        <div className="text-[10px] text-blue-600 font-black uppercase tracking-tighter ml-1">Primary Account</div>
                    </div>
                </div>
                <div className="space-y-3 mt-4 text-sm text-slate-700">
                    <input readOnly={!perms?.edit_client_details} value={client.emails || ''} onChange={e => setClient({...client, emails: e.target.value})} onBlur={e => handleUpdateField('emails', e.target.value)} className={`w-full bg-white border border-blue-100 rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-400 outline-none ${!perms?.edit_client_details && 'bg-transparent border-transparent px-0'}`} placeholder="Primary Email" />
                    <input readOnly={!perms?.edit_client_details} value={client.phones || ''} onChange={e => setClient({...client, phones: e.target.value})} onBlur={e => handleUpdateField('phones', e.target.value)} className={`w-full bg-white border border-blue-100 rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-400 outline-none ${!perms?.edit_client_details && 'bg-transparent border-transparent px-0'}`} placeholder="Primary Phone" />
                </div>
            </div>

            {client.contacts && client.contacts.map(contact => (
                <div key={contact.id} className="bg-white border border-slate-200 p-5 rounded-2xl relative shadow-sm group">
                    {perms?.edit_client_details && <button onClick={() => handleRemoveContact(contact.id)} className="absolute top-4 right-4 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all bg-white rounded-full"><Trash2 size={16}/></button>}
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0"><User size={20}/></div>
                        <div><div className="font-bold text-slate-800 leading-tight">{contact.name}</div><div className="text-[10px] text-slate-400 font-black uppercase">{contact.role || 'Contact'}</div></div>
                    </div>
                    <div className="space-y-1.5 mt-4 text-xs font-bold text-slate-500 truncate">
                        {contact.email && <div className="flex items-center gap-2"><Mail size={12}/> {contact.email}</div>}
                        {contact.phone && <div className="flex items-center gap-2"><Phone size={12}/> {contact.phone}</div>}
                    </div>
                </div>
            ))}
        </div>

        {perms?.edit_client_details && (
            <form onSubmit={handleAddContact} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-wrap lg:flex-nowrap gap-3 items-center">
                <input required placeholder="Full Name" value={newContact.name} onChange={e => setNewContact({...newContact, name: e.target.value})} className="flex-1 border border-slate-200 bg-white p-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium" />
                <input placeholder="Title / Role" value={newContact.role} onChange={e => setNewContact({...newContact, role: e.target.value})} className="flex-1 border border-slate-200 bg-white p-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium" />
                <button type="submit" className="bg-slate-900 text-white font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-black transition-all shadow-md">Add Contact</button>
            </form>
        )}
      </div>

      <div className="mb-6 border-t border-slate-200 pt-10">
        <h3 className="text-2xl font-black text-slate-900 flex items-center gap-2 mb-6"><Package size={24} className="text-blue-600"/> Product Samples</h3>
        
        {!perms?.view_samples ? (
            <div className="p-10 bg-slate-50 border border-dashed border-slate-200 rounded-3xl text-center text-slate-400 font-bold uppercase tracking-widest text-xs">Samples Dashboard Restricted by Administrator</div>
        ) : (
            <>
                {perms?.manage_samples && (
                  <form onSubmit={handleAddSample} className="bg-white border border-slate-200 rounded-3xl p-6 mb-8 shadow-sm grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4 items-center">
                    <input required placeholder="Sample Name" value={newSample.name} onChange={e => setNewSample({...newSample, name: e.target.value})} className="col-span-2 border border-slate-200 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 font-medium" />
                    <input type="date" required value={newSample.dateSent} onChange={e => setNewSample({...newSample, dateSent: e.target.value})} className="border border-slate-200 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 text-slate-600 font-medium" />
                    <input placeholder="Tracking #" value={newSample.tracking} onChange={e => setNewSample({...newSample, tracking: e.target.value})} className="border border-slate-200 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 font-medium" />
                    <input type="number" step="0.01" placeholder="Cost ($)" value={newSample.cost} onChange={e => setNewSample({...newSample, cost: e.target.value})} className="border border-slate-200 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 font-medium" />
                    <select required value={newSample.status} onChange={e => setNewSample({...newSample, status: e.target.value})} className="border border-slate-200 p-3 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500 font-medium cursor-pointer">
                      <option value="" disabled>Status...</option>
                      {statuses.map(s => <option key={s.label} value={s.label}>{s.label}</option>)}
                    </select>
                    <label className={`flex items-center justify-center gap-2 bg-slate-50 border border-dashed border-slate-300 rounded-xl cursor-pointer text-xs font-bold text-slate-500 p-3 transition-colors ${sampleImage ? 'border-green-400 text-green-600 bg-green-50' : 'hover:border-blue-500 hover:text-blue-600'}`}>
                        <UploadCloud size={16}/> {sampleImage ? "Ready" : "Photo"}
                        <input type="file" className="hidden" onChange={e => setSampleImage(e.target.files[0])} />
                    </label>
                    <button type="submit" className="col-span-2 md:col-span-4 xl:col-span-7 bg-blue-600 text-white font-black rounded-xl py-3 hover:bg-blue-700 transition-all shadow-md">Log Sample</button>
                  </form>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                    {samples.map(sample => (
                        <div key={sample.id} className="bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-sm flex flex-col">
                            {sample.imageUrl ? <img src={sample.imageUrl} alt={sample.name} className="h-48 w-full object-cover border-b border-slate-100" /> : <div className="h-48 bg-slate-50 flex items-center justify-center border-b border-slate-100 text-slate-300"><Package size={48} /></div>}
                            <div className="p-5 flex-1 flex flex-col justify-between">
                                <div>
                                    <div className="flex justify-between items-start mb-4">
                                        <h4 className="font-bold text-lg text-slate-800 leading-tight pr-2 truncate">{sample.name}</h4>
                                        {perms?.manage_samples ? (
                                            <select value={sample.status} onChange={(e) => handleStatusChange(sample.id, e.target.value)} className="text-[10px] px-2 py-1 rounded-full font-black shadow-sm shrink-0 border-none outline-none cursor-pointer text-slate-900" style={{ backgroundColor: getStatusColor(sample.status) }}>
                                                {statuses.map(s => <option key={s.label} value={s.label}>{s.label}</option>)}
                                            </select>
                                        ) : (
                                            <span className="text-[10px] px-2.5 py-1 rounded-full font-black shadow-sm shrink-0" style={{ backgroundColor: getStatusColor(sample.status) }}>{sample.status}</span>
                                        )}
                                    </div>
                                    
                                    <div className="space-y-2 mt-2">
                                        <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-widest">
                                            <span>Sent:</span>
                                            <input type="date" value={sample.dateSent || ''} readOnly={!perms?.manage_samples} onChange={(e) => handleSampleFieldChange(sample.id, 'dateSent', e.target.value)} onBlur={(e) => handleSampleFieldBlur(sample.id, 'dateSent', e.target.value)} className={`bg-transparent text-right outline-none w-[110px] font-mono border-b border-transparent ${perms?.manage_samples ? 'focus:border-slate-300 hover:border-slate-200' : ''}`} />
                                        </div>
                                        <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-widest">
                                            <span>Track:</span>
                                            <input placeholder="N/A" value={sample.tracking || ''} readOnly={!perms?.manage_samples} onChange={(e) => handleSampleFieldChange(sample.id, 'tracking', e.target.value)} onBlur={(e) => handleSampleFieldBlur(sample.id, 'tracking', e.target.value)} className={`bg-transparent text-right outline-none w-32 border-b border-transparent truncate ${perms?.manage_samples ? 'focus:border-slate-300 hover:border-slate-200' : ''}`} />
                                        </div>
                                        <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-widest">
                                            <span>Cost ($):</span>
                                            <input type="number" step="0.01" placeholder="0.00" value={sample.cost || ''} readOnly={!perms?.manage_samples} onChange={(e) => handleSampleFieldChange(sample.id, 'cost', e.target.value)} onBlur={(e) => handleSampleFieldBlur(sample.id, 'cost', e.target.value)} className={`bg-transparent text-right outline-none w-20 border-b border-transparent ${perms?.manage_samples ? 'focus:border-slate-300 hover:border-slate-200' : ''}`} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                    {samples.length === 0 && <div className="col-span-full py-10 text-center text-slate-400 font-medium">No samples logged for this client yet.</div>}
                </div>
            </>
        )}
      </div>
    </div>
  );
}