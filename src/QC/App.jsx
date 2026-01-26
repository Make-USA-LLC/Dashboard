import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { 
  CheckCircle2, XCircle, AlertOctagon, 
  FileCheck, ShieldCheck, UserCheck, UploadCloud, ArrowLeft 
} from 'lucide-react';
import { 
  collection, query, where, orderBy, onSnapshot, 
  doc, updateDoc, addDoc, deleteDoc, serverTimestamp, getDoc, setDoc 
} from 'firebase/firestore';
import { auth, db } from '../firebase_config'; 
import { useMsal } from "@azure/msal-react";

// YOUR SITE ID
const SITE_ID = "makeitbuzz.sharepoint.com,5f466306-673d-4008-a8cc-86bdb931024f,eb52fce7-86e8-43c9-b592-cf8da705e9ef";

const sanitizeForSP = (name) => {
    if (!name) return "Unknown";
    return name.replace(/[^a-zA-Z0-9 \-_]/g, "").trim();
};

export default function QCApp() {
    const [activeTab, setActiveTab] = useState('pre');
    const { instance, accounts } = useMsal();

    const handleMicrosoftLogin = async () => { 
        try { 
            await instance.loginRedirect({ 
                scopes: ["Sites.ReadWrite.All", "Files.ReadWrite.All"],
                redirectUri: window.location.origin 
            }); 
        } catch (e) { alert("Login Failed: " + e.message); } 
    };

    const getMsToken = useCallback(async () => {
        const request = { 
            scopes: ["Sites.ReadWrite.All", "Files.ReadWrite.All"], 
            account: accounts[0],
            redirectUri: window.location.origin 
        };
        try { 
            const response = await instance.acquireTokenSilent(request); 
            return response.accessToken; 
        } catch (err) { await instance.acquireTokenRedirect(request); }
    }, [accounts, instance]);

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
            <div className="bg-slate-900 border-b border-slate-800 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center gap-2 font-bold text-xl text-white">
                            <ShieldCheck className="text-orange-500" /> QC Portal
                        </div>
                        <div className="flex space-x-1 bg-slate-800 p-1 rounded-lg">
                            <button onClick={() => setActiveTab('pre')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'pre' ? 'bg-orange-500 text-white shadow' : 'text-slate-400 hover:text-white'}`}>
                                <div className="flex items-center gap-2"><FileCheck size={16}/> Pre-Run (Staging)</div>
                            </button>
                            <button onClick={() => setActiveTab('post')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'post' ? 'bg-orange-500 text-white shadow' : 'text-slate-400 hover:text-white'}`}>
                                <div className="flex items-center gap-2"><CheckCircle2 size={16}/> Post-Run (Bonus)</div>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <div className="max-w-7xl mx-auto p-4 md:p-6">
                {activeTab === 'pre' ? (
                    <PreRunQC accounts={accounts} getMsToken={getMsToken} handleLogin={handleMicrosoftLogin} />
                ) : (
                    <PostRunQC />
                )}
            </div>
        </div>
    );
}

// --- SIDE 1: STAGING -> LIVE ---
const PreRunQC = ({ accounts, getMsToken, handleLogin }) => {
    const [stagingProjects, setStagingProjects] = useState([]);
    const [selectedProject, setSelectedProject] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [approvalData, setApprovalData] = useState({ clientName: '', notes: '' });
    const [uploadedUrl, setUploadedUrl] = useState('');

    useEffect(() => {
        const q = query(collection(db, "project_staging"), orderBy("createdAt", "asc"));
        const unsubscribe = onSnapshot(q, (snap) => setStagingProjects(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        return () => unsubscribe();
    }, []);

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file || !selectedProject || accounts.length === 0) return;
        setUploading(true);
        try {
            const token = await getMsToken();
            if (!token) return; 

            const safeCompany = sanitizeForSP(selectedProject.company);
            const safeProject = sanitizeForSP(selectedProject.project);
            const filePath = `/sites/${SITE_ID}/drive/root:/Quality Control/QC Images/${safeCompany}/${safeProject}/${file.name}:/content?@microsoft.graph.conflictBehavior=rename`;
            
            const resp = await fetch(`https://graph.microsoft.com/v1.0${filePath}`, {
                method: "PUT", headers: { "Authorization": `Bearer ${token}`, "Content-Type": file.type }, body: file
            });
            if (!resp.ok) throw new Error("SharePoint Error");
            const data = await resp.json();
            setUploadedUrl(data.webUrl);
            alert("Uploaded to SharePoint!");
        } catch (err) { console.error(err); alert("Upload failed"); } 
        finally { setUploading(false); }
    };

    const approveAndMove = async () => {
        if (!selectedProject) return;
        if (!approvalData.clientName) return alert("Enter Approver Name");
        if (!confirm(`Approve "${selectedProject.project}" and send to iPads?`)) return;

        try {
            // --- FIX IS HERE: USE setDoc TO KEEP ID ---
            // 1. Create in Live Queue using the SAME ID as Staging
            await setDoc(doc(db, "project_queue", selectedProject.id), {
                ...selectedProject,
                status: 'queued',
                qcApproved: true,
                qcApprover: approvalData.clientName,
                qcNotes: approvalData.notes,
                proofUrl: uploadedUrl,
                approvedAt: serverTimestamp()
            });

            // 2. Delete from Staging
            await deleteDoc(doc(db, "project_staging", selectedProject.id));
            
            alert("Project Approved and LIVE on iPads.");
            setSelectedProject(null);
            setApprovalData({ clientName: '', notes: '' });
            setUploadedUrl('');
        } catch (e) { alert("Error moving project: " + e.message); }
    };

    return (
        <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
                <h2 className="text-lg font-bold text-white mb-4">Staging Queue (Pending Approval)</h2>
                {stagingProjects.length === 0 && <div className="text-slate-500">No projects waiting for approval.</div>}
                {stagingProjects.map(p => (
                    <div key={p.id} onClick={() => setSelectedProject(p)} className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedProject?.id === p.id ? 'bg-orange-500/10 border-orange-500' : 'bg-slate-900 border-slate-800 hover:border-slate-600'}`}>
                        <div className="font-bold text-white">{p.project}</div>
                        <div className="text-sm text-slate-400">{p.company} • {p.expectedUnits} units</div>
                    </div>
                ))}
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 h-fit">
                {!selectedProject ? (
                    <div className="text-slate-500 text-center py-12">Select a project to approve</div>
                ) : (
                    <div className="space-y-6">
                        <h3 className="text-xl font-bold text-white border-b border-slate-800 pb-2">Approve: <span className="text-orange-400">{selectedProject.project}</span></h3>
                        
                        <div>
                            <label className="block text-sm font-bold text-slate-400 mb-2">1. Upload Proof (Optional)</label>
                            {accounts.length === 0 ? <button onClick={handleLogin} className="w-full bg-[#0078d4] text-white py-2 rounded text-sm font-bold">Connect SharePoint</button> : 
                                <input type="file" onChange={handleFileUpload} disabled={uploading} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-slate-800 file:text-orange-500 hover:file:bg-slate-700"/>
                            }
                            {uploadedUrl && <a href={uploadedUrl} target="_blank" className="text-xs text-green-400 block mt-2">✓ Proof Uploaded (Click to View)</a>}
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-400 mb-2">2. Sign-Off</label>
                            <input type="text" placeholder="Client / Manager Name" value={approvalData.clientName} onChange={e => setApprovalData({...approvalData, clientName: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white mb-2" />
                            <textarea placeholder="Approval Notes" value={approvalData.notes} onChange={e => setApprovalData({...approvalData, notes: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white h-20" />
                        </div>

                        <button onClick={approveAndMove} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2"><UserCheck size={18} /> APPROVE & SEND TO IPADS</button>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- SIDE 2: POST-RUN (Unchanged) ---
const PostRunQC = () => {
    const [queue, setQueue] = useState([]);
    const [selectedRun, setSelectedRun] = useState(null);
    const [qcForm, setQcForm] = useState({ defectsFound: false, defectReason: '', bonusEligible: true, notes: '' });

    useEffect(() => {
        const q = query(collection(db, "reports"), orderBy("completedAt", "desc"));
        const unsubscribe = onSnapshot(q, (snap) => {
            const list = [];
            snap.forEach(d => {
                const data = d.data();
                if (data.completedAt && data.qcStatus !== 'completed') {
                    list.push({ id: d.id, ...data });
                }
            });
            setQueue(list);
        });
        return () => unsubscribe();
    }, []);

    const submitFinalQC = async () => {
        if (!selectedRun) return;
        if (qcForm.defectsFound && !qcForm.defectReason) return alert("Enter defect reason");
        if (!confirm("Confirm QC Results?")) return;

        await updateDoc(doc(db, "reports", selectedRun.id), {
            qcStatus: 'completed',
            qcResult: qcForm.defectsFound ? 'failed' : 'passed',
            qcBy: auth.currentUser.email,
            qcDate: serverTimestamp(),
            bonusEligible: qcForm.bonusEligible,
            defectReason: qcForm.defectReason,
            qcNotes: qcForm.notes
        });
        setSelectedRun(null);
        setQcForm({ defectsFound: false, defectReason: '', bonusEligible: true, notes: '' });
    };

    return (
        <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-4">
                <h2 className="text-white font-bold flex items-center gap-2"><AlertOctagon className="text-orange-500" /> Finished Jobs (Pending QC)</h2>
                {queue.length === 0 && <div className="text-slate-500">No jobs waiting.</div>}
                {queue.map(run => (
                    <div key={run.id} onClick={() => setSelectedRun(run)} className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedRun?.id === run.id ? 'bg-orange-500/10 border-orange-500' : 'bg-slate-900 border-slate-800'}`}>
                        <div className="font-bold text-white">{run.project}</div>
                        <div className="text-xs text-slate-400 mt-1">{run.company} • {run.leader}</div>
                    </div>
                ))}
            </div>
            <div className="lg:col-span-2">
                {selectedRun ? (
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                        <h3 className="text-xl font-bold text-white mb-6 border-b border-slate-800 pb-4">Final QC: <span className="text-orange-400">{selectedRun.project}</span></h3>
                        <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 mb-4">
                            <label className="text-sm font-bold text-slate-400 mb-4 block">Physical Inspection</label>
                            <div className="flex gap-4">
                                <button onClick={() => setQcForm(p => ({...p, defectsFound: false, bonusEligible: true}))} className={`flex-1 py-4 rounded-xl border font-bold ${!qcForm.defectsFound ? 'bg-green-500/20 border-green-500 text-green-500' : 'bg-slate-900 border-slate-700 text-slate-500'}`}>PASS</button>
                                <button onClick={() => setQcForm(p => ({...p, defectsFound: true, bonusEligible: false}))} className={`flex-1 py-4 rounded-xl border font-bold ${qcForm.defectsFound ? 'bg-red-500/20 border-red-500 text-red-500' : 'bg-slate-900 border-slate-700 text-slate-500'}`}>DEFECTS</button>
                            </div>
                        </div>
                        {qcForm.defectsFound && <textarea value={qcForm.defectReason} onChange={e => setQcForm({...qcForm, defectReason: e.target.value})} className="w-full bg-red-950/30 border border-red-900/50 rounded-lg p-3 text-red-100 h-24 mb-4" placeholder="Describe defects..." />}
                        
                        <div className={`p-4 rounded-lg border flex justify-between mb-6 ${qcForm.bonusEligible ? 'bg-green-500/5 border-green-500/30' : 'bg-red-500/5 border-red-500/30'}`}>
                            <div><div className="font-bold text-white">Bonus Eligibility</div><div className="text-xs text-slate-400">{qcForm.bonusEligible ? "Approved for Payout" : "Blocked"}</div></div>
                            <button onClick={() => setQcForm(p => ({ ...p, bonusEligible: !p.bonusEligible }))} className={`w-12 h-6 rounded-full relative transition-colors ${qcForm.bonusEligible ? 'bg-green-500' : 'bg-slate-700'}`}><div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${qcForm.bonusEligible ? 'left-7' : 'left-1'}`} /></button>
                        </div>
                        
                        <button onClick={submitFinalQC} className="w-full bg-slate-100 hover:bg-white text-slate-900 font-bold py-4 rounded-xl shadow-xl">COMPLETE QC</button>
                    </div>
                ) : <div className="text-center py-12 text-slate-500">Select a job to inspect</div>}
            </div>
        </div>
    );
};