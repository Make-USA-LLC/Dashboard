import React, { useState, useEffect, useCallback } from 'react';
import { db, auth } from '../firebase_config'; 
import { collection, addDoc, updateDoc, doc, onSnapshot, query, where, deleteDoc, serverTimestamp, getDoc, arrayUnion } from 'firebase/firestore';
import { useMsal } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";

const styles = {
    container: { padding: '20px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'Segoe UI, sans-serif' },
    header: { marginBottom: '20px', borderBottom: '2px solid #8e44ad', paddingBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    card: { background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', marginBottom: '15px', borderLeft: '5px solid #8e44ad' },
    btn: { padding: '10px 20px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontWeight: 'bold' },
    linkList: { listStyleType: 'none', padding: 0, margin: '5px 0 0 0', fontSize: '12px' },
    linkItem: { color: '#2563eb', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }
};

const QCApp = () => {
    const { instance, accounts, inProgress } = useMsal();
    const [jobs, setJobs] = useState([]);
    const [uploadingId, setUploadingId] = useState(null);
    const [financeConfig, setFinanceConfig] = useState({ costPerHour: 60 });

    useEffect(() => {
        const q = query(collection(db, "production_pipeline"), where("status", "==", "qc_pending"));
        const unsub = onSnapshot(q, (snap) => {
            setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        getDoc(doc(db, "config", "finance")).then(snap => {
            if(snap.exists()) setFinanceConfig(snap.data());
        });

        return () => unsub();
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
            } catch(e) { 
                console.error(e); 
                return null; 
            }
        }
    }, [accounts, instance]);

    const handlePhotoUpload = async (e, job) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        // Ensure we upload to the exact folder created during Production
        const folderPath = job.sharepointFolder;
        if (!folderPath) return alert("Error: No SharePoint folder path found from Production step.");

        setUploadingId(job.id);

        try {
            const token = await getMsToken();
            if (!token) return;

            const SITE_ID = "makeitbuzz.sharepoint.com,5f466306-673d-4008-a8cc-86bdb931024f,eb52fce7-86e8-43c9-b592-cf8da705e9ef";
            
            const uploadPromises = files.map(async (file) => {
                const filePath = `/sites/${SITE_ID}/drive/root:${folderPath}/QC_${file.name}:/content?@microsoft.graph.conflictBehavior=rename`;
                const response = await fetch(`https://graph.microsoft.com/v1.0${filePath}`, {
                    method: "PUT", headers: { "Authorization": `Bearer ${token}`, "Content-Type": file.type }, body: file
                });

                if (!response.ok) throw new Error(`Upload Failed for ${file.name}`);
                const data = await response.json();
                return { name: file.name, url: data.webUrl };
            });

            const uploadedDocs = await Promise.all(uploadPromises);

            await updateDoc(doc(db, "production_pipeline", job.id), { 
                qcPhotosUploaded: true,
                qcPhotos: arrayUnion(...uploadedDocs)
            });
            alert("Photos Uploaded!");
        } catch (e) {
            alert(e.message);
        } finally {
            setUploadingId(null);
            e.target.value = null;
        }
    };

    const approveAndDeploy = async (job) => {
        if (!job.qcPhotosUploaded) return alert("Upload QC approval photos first.");
        if (!confirm(`Approve ${job.project} and add to iPad Queue?`)) return;

        try {
            const costPerHour = parseFloat(financeConfig.costPerHour) || 60;
            const revenue = (parseFloat(job.quantity) || 0) * (parseFloat(job.price) || 0);
            const hours = revenue / costPerHour;
            const totalSeconds = Math.floor(hours * 3600);

            await addDoc(collection(db, "project_queue"), {
                company: job.company,
                project: job.project,
                category: job.category,
                size: job.size,
                expectedUnits: job.quantity,
                pricePerUnit: job.price,
                seconds: totalSeconds > 0 ? totalSeconds : 3600, 
                createdAt: serverTimestamp(),
                sharepointFolder: job.sharepointFolder // Carry over reference
            });

            await deleteDoc(doc(db, "production_pipeline", job.id));
            alert("Success! Project is now in the Queue.");
        } catch (e) {
            alert("Error: " + e.message);
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div>
                    <h2 style={{color: '#8e44ad', margin:0}}>🔍 QC Module</h2>
                    <p style={{color: '#777', margin:0}}>Pending approval for iPad deployment.</p>
                </div>
                <div>
                    {accounts.length === 0 ? (
                        <button onClick={handleLogin} style={{...styles.btn, background:'#0078d4', color:'white', fontSize:'13px'}}>Connect SharePoint</button>
                    ) : (
                        <span style={{color: 'green', fontWeight:'bold', fontSize:'13px'}}>✓ SharePoint Connected</span>
                    )}
                </div>
            </div>

            {jobs.length === 0 && <div style={{textAlign:'center', color:'#999', padding:30}}>No projects pending QC.</div>}

            {jobs.map(job => (
                <div key={job.id} style={styles.card}>
                    <div style={{display:'flex', justifyContent:'space-between'}}>
                        <div style={{maxWidth: '60%'}}>
                            <h3 style={{margin:'0 0 5px 0'}}>{job.project}</h3>
                            <div style={{color:'#666', marginBottom: '10px'}}>{job.company} • {job.size}</div>
                            
                            {/* RENDER TECH SHEETS */}
                            {job.techSheets && job.techSheets.length > 0 && (
                                <div style={{marginBottom: '10px', background: '#f8fafc', padding: '10px', borderRadius: '4px'}}>
                                    <div style={{fontSize: '11px', fontWeight: 'bold', color: '#64748b', marginBottom: '5px'}}>PRODUCTION FILES</div>
                                    <ul style={styles.linkList}>
                                        {job.techSheets.map((file, idx) => (
                                            <li key={idx}>
                                                <a href={file.url} target="_blank" rel="noreferrer" style={styles.linkItem}>📄 {file.name}</a>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* RENDER QC PHOTOS */}
                            {job.qcPhotos && job.qcPhotos.length > 0 && (
                                <div style={{marginBottom: '10px', background: '#fdf4ff', padding: '10px', borderRadius: '4px'}}>
                                    <div style={{fontSize: '11px', fontWeight: 'bold', color: '#86198f', marginBottom: '5px'}}>QC PROOF FILES</div>
                                    <ul style={styles.linkList}>
                                        {job.qcPhotos.map((file, idx) => (
                                            <li key={idx}>
                                                <a href={file.url} target="_blank" rel="noreferrer" style={{...styles.linkItem, color: '#86198f'}}>📷 {file.name}</a>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>

                        <div style={{display:'flex', alignItems:'center', gap:'20px'}}>
                            <div style={{textAlign:'center'}}>
                                <input type="file" multiple id={`qc-${job.id}`} style={{display:'none'}} onChange={(e) => handlePhotoUpload(e, job)} disabled={uploadingId === job.id} />
                                <label htmlFor={`qc-${job.id}`} style={{...styles.btn, background: job.qcPhotosUploaded ? '#dcfce7' : '#fff', border:'1px solid #ccc', color: job.qcPhotosUploaded ? '#166534' : '#333', display: 'block', marginBottom: '5px'}}>
                                    {uploadingId === job.id ? "Uploading..." : "+ Add QC Photo(s)"}
                                </label>
                            </div>

                            <button 
                                onClick={() => approveAndDeploy(job)}
                                disabled={!job.qcPhotosUploaded}
                                style={{...styles.btn, background: job.qcPhotosUploaded ? '#8e44ad' : '#ccc', color: 'white'}}
                            >
                                APPROVE & DEPLOY
                            </button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default QCApp;