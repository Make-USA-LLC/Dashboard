import React, { useState, useEffect, useCallback } from 'react';
import { db, auth } from '../firebase_config'; 
import { collection, addDoc, updateDoc, doc, onSnapshot, query, where, deleteDoc, serverTimestamp, getDoc, arrayUnion } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useMsal } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { styles } from './styles';

const ProductionQueue = () => {
    const { instance, accounts, inProgress } = useMsal();
    const isDemo = import.meta.env.VITE_IS_DEMO === 'true';
    const [user, setUser] = useState(null);
    const [jobs, setJobs] = useState([]);
    const [options, setOptions] = useState({ companies: [], categories: [], sizes: [] });
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [uploadingId, setUploadingId] = useState(null);

    const [editingId, setEditingId] = useState(null);

    const [form, setForm] = useState({ 
        company: '', project: '', category: '', size: '', 
        quantity: '', price: '', notes: '', startDate: '', workerCount: ''
    });
    
    // Components State
    const [components, setComponents] = useState([]);

    const [requiresBlending, setRequiresBlending] = useState(false);
    const [ingredients, setIngredients] = useState([
        { name: 'B40 190 Proof', percentage: '' },
        { name: 'DI Water', percentage: '' },
        { name: 'Fragrance Oil', percentage: '', isOil: true }
    ]);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                const docSnap = await getDoc(doc(db, "config", "project_options"));
                if (docSnap.exists()) setOptions(docSnap.data());
            }
        });

        const q = query(collection(db, "production_pipeline"), where("status", "==", "production"));
        const unsubQueue = onSnapshot(q, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            list.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setJobs(list);
        });

        return () => { unsubscribe(); unsubQueue(); };
    }, []);

    const handleLogin = async () => {
        if (isDemo) {
            alert("🔒 SharePoint connections are disabled in the interactive demo.");
            return;
        }
        if (inProgress !== InteractionStatus.None) return;
        try { await instance.loginRedirect({ scopes: ["Sites.ReadWrite.All", "Files.ReadWrite.All"], prompt: "select_account" }); } 
        catch (error) { console.error("Login failed:", error); }
    };

    const getMsToken = useCallback(async () => {
        const request = { scopes: ["Sites.ReadWrite.All", "Files.ReadWrite.All"], account: accounts[0] };
        try { return (await instance.acquireTokenSilent(request)).accessToken; } 
        catch (err) {
            try { await instance.acquireTokenRedirect(request); } catch (e) { return null; }
        }
    }, [accounts, instance]);

    const handleSharePointUpload = async (e, job) => {
        if (isDemo) {
            alert("🔒 File uploads to SharePoint are disabled in the interactive demo.");
            e.target.value = null;
            return;
        }

        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        let folderPath = job.sharepointFolder;
        if (!folderPath) {
            const date = new Date();
            const monthYear = `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getFullYear()}`;
            const safeCompany = job.company.trim().replace(/[^a-zA-Z0-9 -]/g, "");
            const safeProject = job.project.trim().replace(/[^a-zA-Z0-9 -]/g, "");
            folderPath = `/Documents/Production/Files/${safeCompany}/${monthYear}/${safeProject}`;
        }

        if (!confirm(`Upload ${files.length} file(s) to ${folderPath}?`)) return;
        setUploadingId(job.id);
        
        try {
            const token = await getMsToken();
            if (!token) return; 

            const SITE_ID = "makeitbuzz.sharepoint.com,5f466306-673d-4008-a8cc-86bdb931024f,eb52fce7-86e8-43c9-b592-cf8da705e9ef";
            const uploadPromises = files.map(async (file) => {
                const safeFileName = file.name.replace(/[#%&{}\\<>*?/$!'":@+`|=]/g, "_");
                const filePath = `/sites/${SITE_ID}/drive/root:${folderPath}/TechSheet_${encodeURIComponent(safeFileName)}:/content?@microsoft.graph.conflictBehavior=rename`;
                
                const response = await fetch(`https://graph.microsoft.com/v1.0${filePath}`, {
                    method: "PUT", headers: { "Authorization": `Bearer ${token}`, "Content-Type": file.type }, body: file
                });
                if (!response.ok) throw new Error(`Failed to upload ${file.name}`);
                const data = await response.json();
                
                return { name: safeFileName, url: data.webUrl };
            });

            const uploadedDocs = await Promise.all(uploadPromises);
            await updateDoc(doc(db, "production_pipeline", job.id), {
                techSheetUploaded: true, sharepointFolder: folderPath, techSheets: arrayUnion(...uploadedDocs)
            });
            alert("Upload Success!");
        } catch (err) { alert("Error: " + err.message); } 
        finally { setUploadingId(null); e.target.value = null; }
    };

    const handleCreate = async () => {
        if (!form.company || !form.project) return alert("Company and Project Name are required.");
        
        const finalPayload = { 
            ...form,
            workerCount: form.workerCount ? parseInt(form.workerCount, 10) : 0
        };
        
        let finalIngredients = [];
        if (requiresBlending) {
            finalIngredients = ingredients.filter(ing => ing.percentage !== '');
            const totalRaw = finalIngredients.reduce((sum, ing) => sum + Number(ing.percentage || 0), 0);
            const roundedTotal = Math.round(totalRaw * 10000) / 10000; 
            if (finalIngredients.length > 0 && roundedTotal !== 100 && roundedTotal !== 0) {
                 if(!confirm(`Warning: Percentages total ${roundedTotal}%. Ensure the Blending Lab completes the formula. Proceed?`)) return;
            }
        }

        const finalComponents = components.filter(c => c.name.trim() !== '');

        try {
            if (editingId) {
                await updateDoc(doc(db, "production_pipeline", editingId), {
                    ...finalPayload,
                    requiresBlending,
                    ingredients: requiresBlending ? finalIngredients : [],
                    requiredComponents: finalComponents
                });
                alert("Job updated!");
            } else {
                const baseJob = {
                    ...finalPayload,
                    status: "production",
                    techSheetUploaded: false,
                    techSheets: [],
                    componentsArrived: false,
                    requiredComponents: finalComponents,
                    createdAt: serverTimestamp()
                };

                if (requiresBlending) {
                    const prodRef = await addDoc(collection(db, "production_pipeline"), {
                        ...baseJob,
                        requiresBlending: true,
                        blendingStatus: "pending",
                    });

                    await addDoc(collection(db, "blending_queue"), {
                        ...finalPayload,
                        productionJobId: prodRef.id,
                        ingredients: finalIngredients,
                        blendingStatus: "pending",
                        createdAt: serverTimestamp(),
                        type: 'production'
                    });
                } else {
                    await addDoc(collection(db, "production_pipeline"), {
                        ...baseJob,
                        requiresBlending: false,
                        blendingStatus: "not_required",
                        ingredients: [],
                    });
                }
            }
        } catch (error) {
            alert("Error saving job: " + error.message);
        }
        
        handleCancel();
    };

    const handleEdit = (job) => {
        setEditingId(job.id);
        setForm({
            company: job.company || '',
            project: job.project || '',
            category: job.category || '',
            size: job.size || '',
            quantity: job.quantity || '',
            price: job.price || '',
            notes: job.notes || '',
            startDate: job.startDate || '',
            workerCount: job.workerCount || ''
        });
        setComponents(job.requiredComponents || []);
        setRequiresBlending(job.requiresBlending || false);
        setIngredients(job.ingredients?.length > 0 ? job.ingredients : [
            { name: 'B40 190 Proof', percentage: '' },
            { name: 'DI Water', percentage: '' },
            { name: 'Fragrance Oil', percentage: '', isOil: true }
        ]);
        setIsFormOpen(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancel = () => {
        setEditingId(null);
        setForm({ company: '', project: '', category: '', size: '', quantity: '', price: '', notes: '', startDate: '', workerCount: '' });
        setRequiresBlending(false);
        setComponents([]);
        setIngredients([{ name: 'B40 190 Proof', percentage: '' }, { name: 'DI Water', percentage: '' }, { name: 'Fragrance Oil', percentage: '', isOil: true }]);
        setIsFormOpen(false);
    };

    const handleDelete = async (job) => {
        if (confirm("Move job to Deleted Items?")) {
            if (editingId === job.id) handleCancel();
            try {
                await addDoc(collection(db, "trash_bin"), {
                    originalSystem: "production",
                    originalFeature: "management",
                    type: "document",
                    collection: "production_pipeline",
                    originalId: job.id,
                    displayName: `Production Job: ${job.project} (${job.company})`,
                    data: job,
                    deletedAt: new Date().toISOString(),
                    deletedBy: user ? user.email : "Unknown"
                });
                await deleteDoc(doc(db, "production_pipeline", job.id));
            } catch (err) {
                alert("Error deleting job: " + err.message);
            }
        }
    };

    // Helper function to check if a job has all required fields for the iPad/QC
    const getMissingFields = (job) => {
        const missing = [];
        if (!job.category) missing.push("Category");
        if (!job.size) missing.push("Size");
        if (!job.quantity || job.quantity <= 0) missing.push("Quantity");
        if (!job.price || job.price <= 0) missing.push("Price");
        // Removed validation for workerCount here
        return missing;
    };

    const sendToQC = async (job) => {
        const missing = getMissingFields(job);
        if (missing.length > 0 || !job.techSheetUploaded || !job.componentsArrived) {
            return alert("Cannot send to QC. Please fill out all missing fields first.");
        }

        if (confirm(`Send "${job.project}" to QC Module?`)) {
            try {
                await updateDoc(doc(db, "production_pipeline", job.id), { status: "qc_pending", sentToQcAt: serverTimestamp() });
                alert("Passed to QC successfully!");
            } catch (error) { alert("Failed to pass job to QC."); }
        }
    };

    if (!user) return <div style={{padding:50, textAlign:'center'}}>Please log in to Firebase first.</div>;

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px', gap: '10px' }}>
                {accounts.length === 0 ? ( <button onClick={handleLogin} style={{...styles.btn, background: isDemo ? '#9ca3af' : '#0078d4', color:'white', cursor: isDemo ? 'not-allowed' : 'pointer'}}>Connect SharePoint</button> ) : ( <span style={{color: 'green', fontWeight:'bold', marginRight: '10px', fontSize: '12px', display: 'flex', alignItems: 'center'}}>✓ SharePoint Connected</span> )}
                <button onClick={() => { handleCancel(); setIsFormOpen(true); }} style={{...styles.btn, background: '#27ae60', color: 'white'}}>+ New Job</button>
            </div>

            {isFormOpen && (
                <div style={{...styles.card, background:'#f9f9f9', borderLeft: editingId ? '5px solid #f39c12' : 'none'}}>
                    <h3 style={{marginTop:0, color: editingId ? '#d35400' : '#333'}}>
                        {editingId ? "Edit Production Job" : "New Production Job"}
                    </h3>
                    <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:'15px', marginBottom: '15px'}}>
                        <div><label style={styles.label}>Company *</label>
                            <select style={styles.input} value={form.company} onChange={e=>setForm({...form, company:e.target.value})}><option value="">Select...</option>{options.companies?.map(c=><option key={c} value={c}>{c}</option>)}</select>
                        </div>
                        <div><label style={styles.label}>Project Name *</label><input style={styles.input} value={form.project} onChange={e=>setForm({...form, project:e.target.value})} /></div>
                        <div><label style={styles.label}>Category *</label>
                            <select style={styles.input} value={form.category} onChange={e=>setForm({...form, category:e.target.value})}><option value="">Select...</option>{options.categories?.map(c=><option key={c} value={c}>{c}</option>)}</select>
                        </div>
                        <div><label style={styles.label}>Size *</label>
                            <select style={styles.input} value={form.size} onChange={e=>setForm({...form, size:e.target.value})}><option value="">Select...</option>{options.sizes?.map(c=><option key={c} value={c}>{c}</option>)}</select>
                        </div>
                        <div><label style={styles.label}>Quantity *</label><input type="number" style={styles.input} value={form.quantity} onChange={e=>setForm({...form, quantity:e.target.value})} /></div>
                        <div><label style={styles.label}>Price per Unit *</label><input type="number" step="0.01" style={styles.input} value={form.price} onChange={e=>setForm({...form, price:e.target.value})} /></div>
                        <div><label style={styles.label}>Employees Required</label><input type="number" style={styles.input} value={form.workerCount} onChange={e=>setForm({...form, workerCount:e.target.value})} /></div>
                        <div><label style={styles.label}>Start Date</label><input type="date" style={styles.input} value={form.startDate} onChange={e=>setForm({...form, startDate:e.target.value})} /></div>
                        
                        {/* Components Array List */}
                        <div style={{gridColumn: '1 / -1', background: '#fff', padding: '15px', borderRadius: '5px', border: '1px solid #cbd5e1', marginTop: '10px'}}>
                            <h4 style={{margin: '0 0 10px 0', color: '#333'}}>📦 Required Components List</h4>
                            {components.map((comp, idx) => (
                                <div key={idx} style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
                                    <input style={styles.input} placeholder="e.g. 2oz Amber Glass Bottle" value={comp.name} onChange={(e) => { const newC = [...components]; newC[idx].name = e.target.value; setComponents(newC); }} />
                                    <button onClick={() => setComponents(components.filter((_, i) => i !== idx))} style={{ background: 'none', border: 'none', color: 'red', cursor: 'pointer', fontSize: '16px' }}>✖</button>
                                </div>
                            ))}
                            <button onClick={() => setComponents([...components, { name: '', arrived: false }])} style={{ ...styles.btn, background: '#e2e8f0', color: '#333', fontSize: '12px', padding: '6px 12px' }}>+ Add Required Component</button>
                        </div>
                    </div>

                    <div style={{ borderTop: '1px solid #ccc', paddingTop: '15px', marginTop: '15px' }}>
                        <h4 style={{margin: '0 0 10px 0', color: '#333'}}>Blending Lab Routing</h4>
                        <label style={{ cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', color: '#047857' }}>
                            <input type="checkbox" checked={requiresBlending} onChange={(e) => setRequiresBlending(e.target.checked)} style={{width: '18px', height: '18px'}} />
                            Send to Blending Lab for Formulation & Mixing
                        </label>

                        {requiresBlending && (
                            <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '5px', border: '1px solid #cbd5e1', marginTop: '15px' }}>
                                <div style={{ marginBottom: '15px' }}>
                                    <label style={{...styles.label, color: '#333'}}>Notes for Blending Lab (Optional)</label>
                                    <textarea style={{...styles.input, height: '60px', resize: 'vertical'}} placeholder="e.g., Use alternate fragrance, priority rush..." value={form.notes} onChange={e=>setForm({...form, notes: e.target.value})} />
                                </div>
                                <h4 style={{marginTop: '0'}}>Optional: Pre-fill Formulation Percentages (%)</h4>
                                <p style={{fontSize: '12px', color: '#666', marginTop: 0}}>If you leave this blank, the Blending Lab must fill it in.</p>
                                {ingredients.map((ing, idx) => (
                                    <div key={idx} style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
                                        {idx === 0 ? (
                                            <select style={styles.input} value={ing.name} onChange={(e) => { const newIng = [...ingredients]; newIng[idx].name = e.target.value; setIngredients(newIng); }}>
                                                <option value="B40 190 Proof">B40 190 Proof</option><option value="B40 200 Proof">B40 200 Proof</option>
                                            </select>
                                        ) : (
                                            <input style={styles.input} placeholder="Ingredient Name" value={ing.name} readOnly={idx < 3} onChange={(e) => { const newIng = [...ingredients]; newIng[idx].name = e.target.value; setIngredients(newIng); }} />
                                        )}
                                        <input type="number" step="0.0001" style={styles.input} placeholder="%" value={ing.percentage} onChange={(e) => { const newIng = [...ingredients]; newIng[idx].percentage = e.target.value; setIngredients(newIng); }} />
                                        {idx >= 3 && ( <button onClick={() => setIngredients(ingredients.filter((_, i) => i !== idx))} style={{ background: 'none', border: 'none', color: 'red', cursor: 'pointer' }}>✖</button> )}
                                    </div>
                                ))}
                                <button onClick={() => setIngredients([...ingredients, { name: '', percentage: '' }])} style={{ ...styles.btn, background: '#eee', color: '#333', fontSize: '12px' }}>+ Add Custom Ingredient</button>
                            </div>
                        )}
                    </div>

                    <div style={{marginTop:'20px', textAlign:'right', display: 'flex', gap: '10px', justifyContent: 'flex-end'}}>
                        {editingId && (
                            <button onClick={handleCancel} style={{...styles.btn, background: '#7f8c8d', color: 'white'}}>Cancel</button>
                        )}
                        <button onClick={handleCreate} style={{...styles.btn, background: editingId ? '#e67e22' : '#2980b9', color:'white'}}>
                            {editingId ? "Update Job" : "Save to Pipeline"}
                        </button>
                    </div>
                </div>
            )}

            {jobs.map(job => {
                // Determine if this job is fully ready for QC/iPad
                const missingFields = getMissingFields(job);
                const isFullyReady = job.techSheetUploaded && job.componentsArrived && missingFields.length === 0;

                return (
                <div key={job.id} style={{...styles.card, borderLeft: editingId === job.id ? '5px solid #f39c12' : 'none'}}>
                    <div style={{display:'flex', justifyContent:'space-between'}}>
                        <div style={{maxWidth: '50%'}}>
                            <h3 style={{margin:'0 0 5px 0'}}>{job.project}</h3>
                            <div style={{color:'#666'}}>
                                {job.company} • {job.quantity || 'N/A'} units • Starts: {job.startDate || 'TBD'} • Workers: {job.workerCount || 0}
                            </div>
                            
                            {job.notes && (
                                <div style={{marginTop: '8px', padding: '6px 10px', background: '#fef3c7', borderLeft: '3px solid #f59e0b', borderRadius: '4px', fontSize: '12px', color: '#92400e'}}>
                                    <strong>📝 Note:</strong> {job.notes}
                                </div>
                            )}
                            
                            {job.techSheets && job.techSheets.length > 0 && (
                                <ul style={styles.linkList}>
                                    {job.techSheets.map((file, idx) => (<li key={idx}><a href={file.url} target="_blank" rel="noreferrer" style={styles.linkItem}>📄 {file.name}</a></li>))}
                                </ul>
                            )}

                            <div style={{marginTop:'10px'}}>
                                <span style={{...styles.badge, background: job.techSheetUploaded ? '#dcfce7' : '#fee2e2', color: job.techSheetUploaded ? '#166534' : '#991b1b'}}>{job.techSheetUploaded ? "✓ Tech Sheet" : "✗ No Sheet"}</span>
                                <span style={{...styles.badge, marginLeft:'10px', background: job.componentsArrived ? '#dcfce7' : '#fef3c7', color: job.componentsArrived ? '#166534' : '#92400e'}}>{job.componentsArrived ? "✓ All Components Arrived" : "Waiting for Components"}</span>
                                
                                {/* Interactive Components Checklist */}
                                {job.requiredComponents && job.requiredComponents.length > 0 && (
                                    <div style={{ marginTop: '12px', background: '#f8fafc', padding: '10px 15px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                        <strong style={{ fontSize: '13px', display: 'block', marginBottom: '8px', color: '#334155' }}>📦 Component Checklist:</strong>
                                        {job.requiredComponents.map((comp, idx) => (
                                            <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', marginBottom: '6px', cursor: 'pointer' }}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={comp.arrived} 
                                                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                                    onChange={(e) => {
                                                        const updatedList = [...job.requiredComponents];
                                                        updatedList[idx].arrived = e.target.checked;
                                                        
                                                        // Automatically mark main status 'arrived' if all boxes get checked
                                                        const allArrived = updatedList.every(c => c.arrived);
                                                        
                                                        updateDoc(doc(db, "production_pipeline", job.id), { 
                                                            requiredComponents: updatedList,
                                                            componentsArrived: allArrived
                                                        });
                                                    }}
                                                />
                                                <span style={{ 
                                                    textDecoration: comp.arrived ? 'line-through' : 'none', 
                                                    color: comp.arrived ? '#94a3b8' : '#0f172a',
                                                    fontWeight: comp.arrived ? 'normal' : '500'
                                                }}>
                                                    {comp.name}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
                            <div style={{textAlign:'center'}}>
                                <input type="file" multiple id={`file-${job.id}`} style={{display:'none'}} onChange={(e) => handleSharePointUpload(e, job)} disabled={uploadingId === job.id || isDemo} />
                                <label htmlFor={`file-${job.id}`} style={{fontSize:'12px', color: isDemo ? '#9ca3af' : '#2563eb', cursor: isDemo ? 'not-allowed' : 'pointer', textDecoration: isDemo ? 'none' : 'underline', display: 'block', marginBottom: '5px'}}>{uploadingId === job.id ? "Uploading..." : (isDemo ? "Uploads Disabled (Demo)" : "+ Add Tech Sheet(s)")}</label>
                            </div>

                            <button onClick={() => {
                                // Smart toggle: checks/unchecks all sub-components automatically
                                const isNowArrived = !job.componentsArrived;
                                const updatedList = (job.requiredComponents || []).map(c => ({...c, arrived: isNowArrived}));
                                updateDoc(doc(db, "production_pipeline", job.id), { 
                                    componentsArrived: isNowArrived,
                                    requiredComponents: updatedList
                                });
                            }} style={{...styles.btn, background: job.componentsArrived ? '#dcfce7' : '#fff', border: '1px solid #ccc', color: '#333'}}>
                                {job.componentsArrived ? "Mark Pending" : "Mark All Arrived"}
                            </button>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                <button 
                                    onClick={() => sendToQC(job)} 
                                    disabled={!isFullyReady} 
                                    style={{
                                        ...styles.btn, 
                                        background: !isFullyReady ? '#e2e8f0' : '#8e44ad', 
                                        color: !isFullyReady ? '#94a3b8' : 'white',
                                        cursor: !isFullyReady ? 'not-allowed' : 'pointer',
                                        opacity: !isFullyReady ? 0.7 : 1
                                    }}>
                                    Send to QC &rarr;
                                </button>
                                
                                {/* Show exactly what they need to fix to send to QC */}
                                {!isFullyReady && (
                                    <div style={{ fontSize: '10px', color: '#ef4444', textAlign: 'center', maxWidth: '120px', lineHeight: '1.2' }}>
                                        {!job.techSheetUploaded && <div>Missing: Tech Sheet</div>}
                                        {!job.componentsArrived && <div>Missing: Components</div>}
                                        {missingFields.length > 0 && <div>Missing: {missingFields.join(', ')}</div>}
                                    </div>
                                )}
                            </div>

                            <button onClick={() => handleEdit(job)} style={{...styles.btn, background: '#f39c12', color: 'white'}}>Edit</button>
                            <button onClick={() => handleDelete(job)} style={{background:'none', border:'none', color:'#ef4444', cursor:'pointer'}}>🗑️</button>
                        </div>
                    </div>
                </div>
            )})}
        </div>
    );
};

export default ProductionQueue;