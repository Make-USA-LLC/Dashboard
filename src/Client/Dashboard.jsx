import React, { useState, useEffect, useContext } from 'react';
import { collection, getDocs, doc, addDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase_config';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { ClientPermsContext } from './App'; 
import { uploadToSharePoint } from './sharepointUtils';
import { 
  Search, Building2, Phone, Mail, UploadCloud, Settings, 
  Globe, ArrowRight, UserPlus, X, ArrowDownAZ, ChevronDown, 
  ShieldCheck, AlertCircle
} from 'lucide-react';

export default function Dashboard() {
  const { perms, userRole, accounts, instance } = useContext(ClientPermsContext);

  const [clients, setClients] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('nameAsc'); 
  const [filterView, setFilterView] = useState('active'); // active, inactive, missing_w9, missing_legal
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', emails: '', phones: '', billAddress: '', shipAddress: '' });

  useEffect(() => { fetchClients(); }, []);

  const fetchClients = async () => {
    const querySnapshot = await getDocs(collection(db, "clients"));
    setClients(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  };

  const getMsToken = async () => {
      const request = { scopes: ["Sites.ReadWrite.All", "Files.ReadWrite.All"], account: accounts[0] };
      try { return (await instance.acquireTokenSilent(request)).accessToken; } 
      catch (err) { await instance.acquireTokenRedirect(request); return null; }
  };

  const handleManualAdd = async (e) => {
    e.preventDefault();
    const normalizedName = newClient.name.trim().toLowerCase();
    if (clients.some(c => c.name.toLowerCase() === normalizedName)) return alert("A client with this name already exists.");

    const clientData = {
        name: newClient.name.trim(), phones: newClient.phones, emails: newClient.emails, fullName: '', 
        billAddress: newClient.billAddress, shipAddress: newClient.shipAddress, upsAccount: '', fedexAccount: '', 
        files: { w9: '', legalTerms: '' }, isActive: true
    };
    await addDoc(collection(db, "clients"), clientData);
    setIsAddModalOpen(false);
    setNewClient({ name: '', emails: '', phones: '', billAddress: '', shipAddress: '' });
    fetchClients();
  };

  const handleQuickUpload = async (e, type, client) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const token = await getMsToken();
    if (!token) return;

    const folder = type === 'w9' ? 'W9s' : 'Legal Terms';
    try {
        const url = await uploadToSharePoint(client.name, folder, file, token);
        if(url) {
            await updateDoc(doc(db, "clients", client.id), { [`files.${type}`]: url });
            setClients(prev => prev.map(c => c.id === client.id ? { ...c, files: { ...c.files, [type]: url } } : c));
        }
    } catch(err) {
        alert("Upload Failed: " + err.message);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      const existingNames = new Set(clients.map(c => c.name.toLowerCase()));
      
      for (let i = 4; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0 || !row[0]) continue; 
        const name = String(row[0]).trim();
        if (!name || existingNames.has(name.toLowerCase())) continue; 
        
        await addDoc(collection(db, "clients"), {
          name: name, phones: row[1] ? String(row[1]) : '', emails: row[2] ? String(row[2]) : '', fullName: row[3] ? String(row[3]) : '',
          billAddress: row[4] ? String(row[4]) : '', shipAddress: row[5] ? String(row[5]) : '', upsAccount: '', fedexAccount: '', files: { w9: '', legalTerms: '' }, isActive: true
        });
        existingNames.add(name.toLowerCase()); 
      }
      fetchClients();
    };
    reader.readAsArrayBuffer(file);
    e.target.value = null; 
  };

  let processedClients = clients.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || (c.emails && c.emails.toLowerCase().includes(searchTerm.toLowerCase()));
      if (!matchesSearch) return false;

      if (filterView === 'active') return c.isActive !== false;
      if (filterView === 'inactive') return c.isActive === false;
      if (filterView === 'missing_w9') return !c.files?.w9 && c.isActive !== false;
      if (filterView === 'missing_legal') return !c.files?.legalTerms && c.isActive !== false;
      return true;
  });

  processedClients.sort((a, b) => {
      if (sortBy === 'nameAsc') return a.name.localeCompare(b.name);
      if (sortBy === 'nameDesc') return b.name.localeCompare(a.name);
      return 0;
  });

  return (
    <div className="p-8 max-w-7xl mx-auto text-slate-800">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Client Hub</h1>
          <p className="text-slate-500 mt-1 font-medium">Role: <span className="text-blue-600 uppercase text-xs font-black">{userRole}</span></p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          {perms?.view_samples && <Link to="/clients/samples" className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 shadow-sm transition-all font-bold text-sm" style={{textDecoration:'none'}}><Globe size={18} /> Global Samples</Link>}
          {perms?.manage_settings && <Link to="/clients/settings" className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 shadow-sm transition-all font-bold text-sm" style={{textDecoration:'none'}}><Settings size={18} /> Settings</Link>}
          {perms?.manage_permissions && <Link to="/clients/admin" className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 shadow-sm transition-all font-bold text-sm" style={{textDecoration:'none'}}><ShieldCheck size={18} /> Permissions</Link>}
          {perms?.edit_client_details && (
              <>
                <label className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 shadow-sm transition-all cursor-pointer font-bold text-sm">
                    <UploadCloud size={18} /> Import XLSX
                    <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} />
                </label>
                <button onClick={() => setIsAddModalOpen(true)} className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2 rounded-lg hover:bg-black shadow-sm transition-all font-bold text-sm"><UserPlus size={18} /> Add Client</button>
              </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 mb-8">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 flex items-center gap-4">
                <Search className="text-slate-400 shrink-0" size={28} />
                <input type="text" placeholder="Search clients..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full px-5 py-3.5 rounded-xl border border-slate-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium" />
            </div>
            <div className="w-full sm:w-72 shrink-0 relative">
                <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="w-full pl-5 pr-12 py-3.5 rounded-xl border border-slate-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer text-slate-700 font-bold">
                    <option value="nameAsc">Sort A-Z</option>
                    <option value="nameDesc">Sort Z-A</option>
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={20} />
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2">
              <button onClick={() => setFilterView('active')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${filterView === 'active' ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Active Clients</button>
              <button onClick={() => setFilterView('inactive')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${filterView === 'inactive' ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Inactive</button>
              <button onClick={() => setFilterView('missing_w9')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${filterView === 'missing_w9' ? 'bg-red-600 text-white' : 'bg-red-50 border border-red-200 text-red-600 hover:bg-red-100'}`}><AlertCircle size={16}/> Missing W9</button>
              <button onClick={() => setFilterView('missing_legal')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${filterView === 'missing_legal' ? 'bg-amber-500 text-white' : 'bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100'}`}><AlertCircle size={16}/> Missing Terms</button>
          </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {processedClients.map(client => (
          <div key={client.id} className={`bg-white rounded-3xl p-6 border shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between group ${client.isActive === false ? 'border-slate-200 opacity-60' : 'border-slate-200'}`}>
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${client.isActive === false ? 'bg-slate-200 text-slate-500' : 'bg-blue-100 text-blue-600'}`}><Building2 size={24} /></div>
                <div className="min-w-0">
                    <h3 className="font-bold text-lg leading-tight truncate">{client.name}</h3>
                    {client.isActive === false && <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Inactive</span>}
                </div>
              </div>
              <div className="space-y-2 text-slate-600 text-sm font-medium mb-4">
                <div className="flex items-center gap-3"><Mail size={14} className="text-slate-400"/><span className="truncate">{client.emails || 'No Email'}</span></div>
                <div className="flex items-center gap-3"><Phone size={14} className="text-slate-400"/><span>{client.phones || 'No Phone'}</span></div>
              </div>
            </div>
            
            <div className="mt-2 space-y-3">
                {filterView === 'missing_w9' && perms?.upload_w9 && (
                    <label className="w-full flex items-center justify-center gap-2 bg-red-50 text-red-600 border border-red-200 border-dashed rounded-xl py-2 cursor-pointer hover:bg-red-100 transition-colors font-bold text-sm">
                        <UploadCloud size={16}/> Upload W9
                        <input type="file" className="hidden" onChange={(e) => handleQuickUpload(e, 'w9', client)} />
                    </label>
                )}
                {filterView === 'missing_legal' && perms?.upload_legal && (
                    <label className="w-full flex items-center justify-center gap-2 bg-amber-50 text-amber-700 border border-amber-200 border-dashed rounded-xl py-2 cursor-pointer hover:bg-amber-100 transition-colors font-bold text-sm">
                        <UploadCloud size={16}/> Upload Terms
                        <input type="file" className="hidden" onChange={(e) => handleQuickUpload(e, 'legalTerms', client)} />
                    </label>
                )}
                <Link to={`/clients/${client.id}`} className="flex items-center justify-center gap-2 w-full bg-slate-50 text-blue-600 font-bold py-3 rounded-xl group-hover:bg-blue-50 group-hover:shadow-inner transition-all border border-slate-100" style={{textDecoration:'none'}}>View Profile <ArrowRight size={18} /></Link>
            </div>
          </div>
        ))}
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h2 className="text-xl font-black text-slate-900 flex items-center gap-2"><Building2 size={20} className="text-blue-600"/> Add New Client</h2>
                    <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-red-500 bg-white p-1 rounded-lg border border-slate-200 transition-colors"><X size={20}/></button>
                </div>
                <form onSubmit={handleManualAdd} className="p-6 space-y-4 text-left">
                    <div><label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Company Name *</label><input required value={newClient.name} onChange={e => setNewClient({...newClient, name: e.target.value})} className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium" placeholder="Make USA LLC" /></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Email</label><input value={newClient.emails} onChange={e => setNewClient({...newClient, emails: e.target.value})} className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium" placeholder="contact@company.com" /></div>
                        <div><label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Phone</label><input value={newClient.phones} onChange={e => setNewClient({...newClient, phones: e.target.value})} className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium" placeholder="(555) 123-4567" /></div>
                    </div>
                    <div><label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Billing Address</label><input value={newClient.billAddress} onChange={e => setNewClient({...newClient, billAddress: e.target.value})} className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium" placeholder="123 Main St, NY..." /></div>
                    <div><label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Shipping Address</label><input value={newClient.shipAddress} onChange={e => setNewClient({...newClient, shipAddress: e.target.value})} className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium" placeholder="Same as billing..." /></div>
                    <div className="mt-8 flex justify-end gap-3 pt-4">
                        <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-6 py-3 rounded-xl text-slate-600 font-bold hover:bg-slate-100 transition-colors">Cancel</button>
                        <button type="submit" className="px-8 py-3 rounded-xl bg-blue-600 text-white font-black hover:bg-blue-700 transition-all shadow-md shadow-blue-200">Save Client</button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
}