import React, { useState, useEffect, useCallback } from 'react';
import { db, auth, app } from '../firebase_config'; // <-- Added 'app' here
import { collection, addDoc, updateDoc, doc, onSnapshot, query, where, deleteDoc, serverTimestamp, getDoc, arrayUnion } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions'; // <-- Added functions import
import { useMsal } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";

const styles = {
  container: { padding: '20px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Segoe UI, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #eee', paddingBottom: '10px' },
  card: { background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)', marginBottom: '15px', border: '1px solid #e0e0e0' },
  btn: { padding: '10px 15px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontWeight: 'bold', marginRight: '10px' },
  input: { padding: '8px', borderRadius: '4px', border: '1px solid #ccc', width: '100%', boxSizing: 'border-box' },
  label: { display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px', color: '#555' },
  badge: { padding: '4px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' },
  linkList: { listStyleType: 'none', padding: 0, margin: '5px 0 0 0', fontSize: '12px' },
  linkItem: { color: '#2563eb', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }
};

const ProductionApp = () => {
    const { instance, accounts, inProgress } = useMsal();
    const [user, setUser] = useState(null);
    const [jobs, setJobs] = useState([]);
    const [options, setOptions] = useState({ companies: [], categories: [], sizes: [] });
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [uploadingId, setUploadingId] = useState(null);

    // Initialize Firebase Cloud Functions
    const functions = getFunctions(app);
    const notifyQCReady = httpsCallable(functions, 'notifyQCReady');

    // Job Data State
    const [form, setForm] = useState({ company: '', project: '', category: '', size: '', quantity: '', price: '' });
    
    // Blending States
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
        if (inProgress !== InteractionStatus.None) return;
        try {
            await instance.loginRedirect({
                scopes: ["Sites.ReadWrite.All", "Files.ReadWrite.All"],
                prompt: "select_account"
            });
        } catch (error) {
            console.error("Login failed:", error);
        }
    };

    const getMsToken = useCallback(async () => {
        const request = { scopes: ["Sites.ReadWrite.All", "Files.ReadWrite.All"], account: accounts[0] };
        try {
            const response = await instance.acquireTokenSilent(request);
            return response.accessToken;
        } catch (err) {
            try {
                await instance.acquireTokenRedirect(request);
            } catch (e) {
                console.error(e);
                return null;
            }
        }
    }, [accounts, instance]);

    const handleSharePointUpload = async (e, job) => {
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
                const filePath = `/sites/${SITE_ID}/drive/root:${folderPath}/TechSheet_${file.name}:/content?@microsoft.graph.conflictBehavior=rename`;
                const response = await fetch(`https://graph.microsoft.com/v1.0${filePath}`, {
                    method: "PUT",
                    headers: { "Authorization": `Bearer ${token}`, "Content-Type": file.type },
                    body: file
                });

                if (!response.ok) throw new Error(`Failed to upload ${file.name}`);
                const data = await response.json();
                return { name: file.name, url: data.webUrl };
            });

            const uploadedDocs = await Promise.all(uploadPromises);

            await updateDoc(doc(db, "production_pipeline", job.id), {
                techSheetUploaded: true,
                sharepointFolder: folderPath,
                techSheets: arrayUnion(...uploadedDocs)
            });
            
            alert("Upload Success!");
        } catch (err) {
            alert("Error: " + err.message);
        } finally {
            setUploadingId(null);
            e.target.value = null; 
        }
    };

    const handleAddIngredient = () => {
        setIngredients([...ingredients, { name: '', percentage: '' }]);
    };

    const handleIngredientChange = (index, field, value) => {
        const newIng = [...ingredients];
        newIng[index][field] = value;
        setIngredients(newIng);
    };

    const handleCreate = async () => {
        if (!form.company || !form.project) return alert("Company and Project Name are required.");
        
        if (requiresBlending) {
            // STRICT PERCENTAGE VALIDATION
            const totalRaw = ingredients.reduce((sum, ing) => sum + Number(ing.percentage || 0), 0);
            const roundedTotal = Math.round(totalRaw * 10000) / 10000; // Account for JS float math
            if (roundedTotal !== 100) {
                return alert(`Error: Formulation percentages must equal exactly 100%. Current total is ${roundedTotal}%.`);
            }
        }

        await addDoc(collection(db, "production_pipeline"), {
            ...form,
            status: "production",
            requiresBlending,
            blendingStatus: requiresBlending ? "pending" : "not_required",
            ingredients: requiresBlending ? ingredients : [],
            techSheetUploaded: false,
            techSheets: [],
            componentsArrived: false,
            createdAt: serverTimestamp()
        });
        
        setForm({ company: '', project: '', category: '', size: '', quantity: '', price: '' });
        setRequiresBlending(false);
        setIngredients([{ name: 'B40 190 Proof', percentage: '' }, { name: 'DI Water', percentage: '' }, { name: 'Fragrance Oil', percentage: '', isOil: true }]);
        setIsFormOpen(false);
    };

    // --- UPDATED SEND TO QC LOGIC ---
    const sendToQC = async (job) => {
        if (confirm(`Send "${job.project}" to QC Module?`)) {
            try {
                // 1. Update status in Firestore
                await updateDoc(doc(db, "production_pipeline", job.id), {
                    status: "qc_pending",
                    sentToQcAt: serverTimestamp()
                });

                // 2. Trigger Email Cloud Function
                try {
                    await notifyQCReady({
                        projectName: job.project,
                        companyName: job.company
                    });
                    console.log("QC Notification Email sent successfully!");
                } catch (emailError) {
                    // We catch this separately so the UI doesn't break if the email fails but the DB update succeeded.
                    console.error("Failed to send QC email:", emailError);
                    alert("Job passed to QC, but there was an issue sending the email notification.");
                }

            } catch (error) {
                console.error("Error passing to QC:", error);
                alert("Failed to pass job to QC.");
            }
        }
    };

    if (!user) return <div style={{padding:50, textAlign:'center'}}>Please log in to Firebase first.</div>;

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h2 style={{color: '#2c3e50', margin:0}}>🏭 Production Management</h2>
                <div>
                    {accounts.length === 0 ? (
                        <button onClick={handleLogin} style={{...styles.btn, background:'#0078d4', color:'white'}}>Connect SharePoint</button>
                    ) : (
                        <span style={{color: 'green', fontWeight:'bold', marginRight: '10px', fontSize: '12px'}}>✓ SharePoint Connected</span>
                    )}
                    <button onClick={() => setIsFormOpen(!isFormOpen)} style={{...styles.btn, background: '#27ae60', color: 'white'}}>+ New Job</button>
                </div>
            </div>

            {isFormOpen && (
                <div style={{...styles.card, background:'#f9f9f9'}}>
                    <h3 style={{marginTop:0}}>New Production Job</h3>
                    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'15px', marginBottom: '15px'}}>
                        <div><label style={styles.label}>Company</label>
                            <select style={styles.input} value={form.company} onChange={e=>setForm({...form, company:e.target.value})}>
                                <option value="">Select...</option>
                                {options.companies?.map(c=><option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div><label style={styles.label}>Project Name</label><input style={styles.input} value={form.project} onChange={e=>setForm({...form, project:e.target.value})} /></div>
                        <div><label style={styles.label}>Category</label>
                            <select style={styles.input} value={form.category} onChange={e=>setForm({...form, category:e.target.value})}>
                                <option value="">Select...</option>
                                {options.categories?.map(c=><option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div><label style={styles.label}>Size</label>
                            <select style={styles.input} value={form.size} onChange={e=>setForm({...form, size:e.target.value})}>
                                <option value="">Select...</option>
                                {options.sizes?.map(c=><option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div><label style={styles.label}>Quantity</label><input type="number" style={styles.input} value={form.quantity} onChange={e=>setForm({...form, quantity:e.target.value})} /></div>
                        <div><label style={styles.label}>Price per Unit</label><input type="number" style={styles.input} value={form.price} onChange={e=>setForm({...form, price:e.target.value})} /></div>
                    </div>

                    {/* BLENDING SECTION */}
                    <div style={{ borderTop: '1px solid #ccc', paddingTop: '15px', marginTop: '15px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
                            <input type="checkbox" checked={requiresBlending} onChange={(e) => setRequiresBlending(e.target.checked)} />
                            Requires Blending Phase
                        </label>

                        {requiresBlending && (
                            <div style={{ marginTop: '15px', background: 'white', padding: '15px', borderRadius: '5px', border: '1px dashed #aaa' }}>
                                <h4>Formulation Percentages (%)</h4>
                                {ingredients.map((ing, idx) => (
                                    <div key={idx} style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
                                        {idx === 0 ? (
                                            <select style={styles.input} value={ing.name} onChange={(e) => handleIngredientChange(idx, 'name', e.target.value)}>
                                                <option value="B40 190 Proof">B40 190 Proof</option>
                                                <option value="B40 200 Proof">B40 200 Proof</option>
                                            </select>
                                        ) : (
                                            <input 
                                                style={styles.input} 
                                                placeholder="Ingredient Name" 
                                                value={ing.name} 
                                                readOnly={idx < 3} // Lock base ingredients
                                                onChange={(e) => handleIngredientChange(idx, 'name', e.target.value)} 
                                            />
                                        )}
                                        <input 
                                            type="number" 
                                            step="0.0001"
                                            style={styles.input} 
                                            placeholder="%" 
                                            value={ing.percentage} 
                                            onChange={(e) => handleIngredientChange(idx, 'percentage', e.target.value)} 
                                        />
                                        {idx >= 3 && (
                                            <button onClick={() => setIngredients(ingredients.filter((_, i) => i !== idx))} style={{ background: 'none', border: 'none', color: 'red', cursor: 'pointer' }}>✖</button>
                                        )}
                                    </div>
                                ))}
                                <button onClick={handleAddIngredient} style={{ ...styles.btn, background: '#eee', color: '#333', fontSize: '12px' }}>+ Add Custom Ingredient</button>
                            </div>
                        )}
                    </div>

                    <div style={{marginTop:'20px', textAlign:'right'}}>
                        <button onClick={handleCreate} style={{...styles.btn, background:'#2980b9', color:'white'}}>Save to Pipeline</button>
                    </div>
                </div>
            )}

            {jobs.map(job => (
                <div key={job.id} style={styles.card}>
                    <div style={{display:'flex', justifyContent:'space-between'}}>
                        <div style={{maxWidth: '50%'}}>
                            <h3 style={{margin:'0 0 5px 0'}}>{job.project}</h3>
                            <div style={{color:'#666'}}>{job.company} • {job.quantity} units</div>
                            
                            {job.techSheets && job.techSheets.length > 0 && (
                                <ul style={styles.linkList}>
                                    {job.techSheets.map((file, idx) => (
                                        <li key={idx}>
                                            <a href={file.url} target="_blank" rel="noreferrer" style={styles.linkItem}>
                                                📄 {file.name}
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            <div style={{marginTop:'10px'}}>
                                <span style={{...styles.badge, background: job.techSheetUploaded ? '#dcfce7' : '#fee2e2', color: job.techSheetUploaded ? '#166534' : '#991b1b'}}>
                                    {job.techSheetUploaded ? "✓ Tech Sheet" : "✗ No Sheet"}
                                </span>
                                <span style={{...styles.badge, marginLeft:'10px', background: job.componentsArrived ? '#dcfce7' : '#f3f4f6', color: job.componentsArrived ? '#166534' : '#666'}}>
                                    {job.componentsArrived ? "✓ Arrived" : "Waiting for Components"}
                                </span>
                                {job.requiresBlending && (
                                    <span style={{...styles.badge, marginLeft:'10px', background: job.blendingStatus === 'completed' ? '#dcfce7' : '#fef08a', color: '#333'}}>
                                        {job.blendingStatus === 'completed' ? "✓ Blended" : "⚖️ Blending Pending"}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
                            <div style={{textAlign:'center'}}>
                                <input type="file" multiple id={`file-${job.id}`} style={{display:'none'}} onChange={(e) => handleSharePointUpload(e, job)} disabled={uploadingId === job.id} />
                                <label htmlFor={`file-${job.id}`} style={{fontSize:'12px', color:'#2563eb', cursor:'pointer', textDecoration:'underline', display: 'block', marginBottom: '5px'}}>
                                    {uploadingId === job.id ? "Uploading..." : "+ Add Tech Sheet(s)"}
                                </label>
                            </div>

                            <button 
                                onClick={() => updateDoc(doc(db, "production_pipeline", job.id), { componentsArrived: !job.componentsArrived })}
                                style={{...styles.btn, background: job.componentsArrived ? '#dcfce7' : '#fff', border: '1px solid #ccc', color: '#333'}}
                            >
                                {job.componentsArrived ? "Mark Pending" : "Mark Arrived"}
                            </button>

                            <button 
                                onClick={() => sendToQC(job)}
                                disabled={!job.techSheetUploaded || !job.componentsArrived || (job.requiresBlending && job.blendingStatus !== 'completed')}
                                style={{...styles.btn, background: (!job.techSheetUploaded || !job.componentsArrived || (job.requiresBlending && job.blendingStatus !== 'completed')) ? '#eee' : '#8e44ad', color: (!job.techSheetUploaded || !job.componentsArrived || (job.requiresBlending && job.blendingStatus !== 'completed')) ? '#999' : 'white'}}
                            >
                                Send to QC &rarr;
                            </button>
                            
                            <button onClick={() => deleteDoc(doc(db, "production_pipeline", job.id))} style={{background:'none', border:'none', color:'#ef4444', cursor:'pointer'}}>🗑️</button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default ProductionApp;