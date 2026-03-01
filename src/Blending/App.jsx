import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { db, functions } from '../firebase_config'; 
import { collection, updateDoc, doc, onSnapshot, query, where, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useMsal } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";

// Import your split files
import { styles, getGallons } from './utils';
import SampleForm from './SampleForm';
import ProcessingModal from './ProcessingModal';
import ViewingModal from './ViewingModal';

export default function BlendingApp() {
    const { instance, accounts, inProgress } = useMsal();

    const [activeTab, setActiveTab] = useState('samples_pending'); 
    const [pendingSamples, setPendingSamples] = useState([]);
    const [fullBlends, setFullBlends] = useState([]);
    const [finishedBlends, setFinishedBlends] = useState([]);
    
    const [showSampleForm, setShowSampleForm] = useState(false);
    const [processingItem, setProcessingItem] = useState(null);
    const [viewingItem, setViewingItem] = useState(null);
    
    const [searchTerm, setSearchTerm] = useState('');
    const [sortOption, setSortOption] = useState('dateDesc'); 

    useEffect(() => {
        const qSamples = query(collection(db, "blending_samples"), where("status", "==", "pending"));
        const unsub1 = onSnapshot(qSamples, (snap) => setPendingSamples(snap.docs.map(d => ({ id: d.id, ...d.data(), type: 'sample' }))));

        const qProd = query(collection(db, "production_pipeline"), where("requiresBlending", "==", true), where("blendingStatus", "==", "pending"));
        const unsub2 = onSnapshot(qProd, (snap) => setFullBlends(snap.docs.map(d => ({ id: d.id, ...d.data(), type: 'production' }))));

        const qFinished = query(collection(db, "blending_samples"), where("status", "==", "completed"));
        const unsub3 = onSnapshot(qFinished, (snap) => {
            const s = snap.docs.map(d => ({ id: d.id, ...d.data(), type: 'sample' }));
            const qProdFin = query(collection(db, "production_pipeline"), where("requiresBlending", "==", true), where("blendingStatus", "==", "completed"));
            onSnapshot(qProdFin, (snap2) => {
                const p = snap2.docs.map(d => ({ id: d.id, ...d.data(), type: 'production' }));
                setFinishedBlends([...s, ...p]);
            });
        });

        return () => { unsub1(); unsub2(); unsub3(); };
    }, []);

    const handleLogin = async () => {
        if (inProgress !== InteractionStatus.None) return;
        try {
            await instance.loginRedirect({ scopes: ["Sites.ReadWrite.All", "Files.ReadWrite.All"], prompt: "select_account" });
        } catch (error) { console.error("Login failed:", error); }
    };

    const getMsToken = useCallback(async () => {
        if (accounts.length === 0) return null;
        const request = { scopes: ["Sites.ReadWrite.All", "Files.ReadWrite.All"], account: accounts[0] };
        try { return (await instance.acquireTokenSilent(request)).accessToken; } 
        catch (err) {
            try { await instance.acquireTokenRedirect(request); } 
            catch(e) { return null; }
        }
    }, [accounts, instance]);

    const generateAndUploadExcel = async (item) => {
        try {
            const token = await getMsToken();
            if (!token) return false; 

            const title = item.company ? `${item.company} - ${item.project || item.name}` : (item.project || item.name);
            const finishDate = new Date().toLocaleString(); 

            const worksheetData = [
                ["MakeUSA Blending Ticket"],
                [`${item.type === 'sample' ? 'Sample:' : 'Production:'} ${title}`],
                [`Total Batch Size: ${item.totalBatchGrams} g`],
                [`Finished On: ${finishDate}`],
                [], 
                ["Formula (Ingredient)", "%", "gr", "Gallons"]
            ];

            item.calculatedIngredients.forEach(ing => {
                worksheetData.push([ing.name, ing.percentage, ing.calculatedGrams, getGallons(ing.name, ing.calculatedGrams)]);
            });

            const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Blending Ticket");
            const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

            const companyName = (item.company || 'Unknown_Company').trim();
            const projectName = (item.project || item.name || 'Unknown_Project').trim();
            const fileName = `${projectName}_Blend.xlsx`;
            let storagePath = item.type === 'sample' 
                ? `/Documents/Production/Files/${companyName}/Samples/${String(new Date().getMonth() + 1).padStart(2, '0')}-${new Date().getFullYear()}/${fileName}`
                : (item.sharepointFolder ? `${item.sharepointFolder}/${fileName}` : `/Documents/Production/Files/${companyName}/${projectName}/${fileName}`);

            const SITE_ID = "makeitbuzz.sharepoint.com,5f466306-673d-4008-a8cc-86bdb931024f,eb52fce7-86e8-43c9-b592-cf8da705e9ef";
            const uploadUrl = `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive/root:${storagePath}:/content?@microsoft.graph.conflictBehavior=replace`;

            const response = await fetch(uploadUrl, {
                method: "PUT",
                headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
                body: blob
            });

            if (!response.ok) throw new Error("Upload response failed");
            const responseData = await response.json();
            console.log("SUCCESS! Saved Excel to SharePoint:", storagePath);
            return true;
        } catch (error) {
            console.error("Error saving Excel automatically:", error);
            return false;
        }
    };

    const markAsFinishedInline = async (item) => {
        if (!item.calculatedIngredients) return alert("Please add information to calculate the formula first.");
        
        if (accounts.length === 0) {
            if (!confirm("SharePoint is not connected. The Excel file will NOT be saved automatically. Do you still want to finish this blend?")) return;
        }

        try {
            const updatePayload = { completedAt: serverTimestamp() };
            if (item.type === 'sample') {
                updatePayload.status = "completed";
                await updateDoc(doc(db, "blending_samples", item.id), updatePayload);
            } else {
                updatePayload.blendingStatus = "completed";
                await updateDoc(doc(db, "production_pipeline", item.id), updatePayload);
            }

            if (accounts.length > 0) {
                const success = await generateAndUploadExcel(item);
                if (success) alert("Blend marked as finished and Excel successfully saved to SharePoint!");
                else alert("Blend finished, but there was an error saving the Excel file to SharePoint.");
            } else {
                alert("Blend marked as finished!");
            }
        } catch (error) {
            console.error("Error marking as finished:", error);
            alert("An error occurred while finishing the blend.");
        }
    };

    const handleBillItem = async (item) => {
        const invoice = prompt("Enter Invoice Number for Billing:");
        if (!invoice) return; 
        const updatePayload = { billed: true, invoiceNumber: invoice, billedAt: serverTimestamp() };
        if (item.type === 'sample') await updateDoc(doc(db, "blending_samples", item.id), updatePayload);
        else await updateDoc(doc(db, "production_pipeline", item.id), updatePayload);
    };

    const emailFinishedBlend = async (item) => {
        try {
            const sendManualEmail = httpsCallable(functions, 'sendManualEmail');
            await sendManualEmail({ id: item.id, type: item.type });
            alert("Email requested successfully! It should arrive momentarily.");
        } catch (error) {
            console.error("Error calling email function:", error);
            alert("Failed to send email. Check console for details.");
        }
    };

    const printTicket = (item) => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return alert("Please allow pop-ups for this site to print tickets.");

        const title = item.company ? `${item.company} - ${item.project || item.name}` : (item.project || item.name);
        let finishDate = item.completedAt?.seconds ? new Date(item.completedAt.seconds * 1000).toLocaleString() : new Date().toLocaleString(); 
        
        let html = `
            <html><head><title>Batch Ticket</title>
            <style>
                body { font-family: 'Calibri', 'Arial', sans-serif; padding: 20px; color: #333; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 15px; }
                th, td { border: 1px solid #d0d7e5; padding: 10px; text-align: left; }
                th { background-color: #e2efda; color: #375623; border-bottom: 2px solid #8ea9db; font-weight: bold; }
                tr:nth-child(even) { background-color: #f8f9fa; }
                h1 { border-bottom: 2px solid #4472c4; padding-bottom: 10px; color: #4472c4; font-size: 24px; margin-bottom: 10px; }
                h2 { font-size: 18px; margin-bottom: 5px; color: #2c3e50; text-transform: uppercase; }
                .meta-info { font-size: 14px; color: #555; margin-bottom: 20px; }
                .meta-info p { margin: 5px 0; }
            </style>
            </head><body>
            <h1>MakeUSA Blending Ticket</h1>
            <h2>${item.type === 'sample' ? 'Sample: ' : 'Production: '} ${title}</h2>
            <div class="meta-info">
                <p><strong>Total Batch Size:</strong> ${item.totalBatchGrams} g</p>
                <p><strong>Finished On:</strong> ${finishDate}</p>
            </div>
            <table>
                <tr><th>Formula (Ingredient)</th><th>%</th><th>gr</th><th>Gallons</th></tr>
                ${item.calculatedIngredients.map(ing => `
                    <tr>
                        <td>${ing.name}</td>
                        <td>${ing.percentage}</td>
                        <td><strong>${ing.calculatedGrams}</strong></td>
                        <td>${getGallons(ing.name, ing.calculatedGrams)}</td>
                    </tr>
                `).join('')}
            </table>
            <script>
                setTimeout(() => { window.print(); }, 250);
                window.onafterprint = () => { window.close(); };
            </script>
            </body></html>
        `;
        printWindow.document.write(html);
        printWindow.document.close();
    };

    const processedFinishedBlends = finishedBlends
        .filter(item => {
            const searchLower = searchTerm.toLowerCase();
            const itemName = (item.project || item.name || '').toLowerCase();
            const itemCompany = (item.company || '').toLowerCase();
            return itemName.includes(searchLower) || itemCompany.includes(searchLower) || item.type.includes(searchLower);
        })
        .sort((a, b) => {
            if (sortOption === 'dateDesc') return (b.completedAt?.seconds || 0) - (a.completedAt?.seconds || 0);
            if (sortOption === 'dateAsc') return (a.completedAt?.seconds || 0) - (b.completedAt?.seconds || 0);
            if (sortOption === 'nameAsc') return (a.project || a.name || '').toLowerCase().localeCompare((b.project || b.name || '').toLowerCase());
            if (sortOption === 'nameDesc') return (b.project || b.name || '').toLowerCase().localeCompare((a.project || a.name || '').toLowerCase());
            if (sortOption === 'sizeDesc') return Number(b.totalBatchGrams || 0) - Number(a.totalBatchGrams || 0);
            if (sortOption === 'sizeAsc') return Number(a.totalBatchGrams || 0) - Number(b.totalBatchGrams || 0);
            return 0;
        });

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h1 style={{color: '#2c3e50', margin: 0}}>⚗️ Blending Lab</h1>
                <div>
                    {accounts.length === 0 ? (
                        <button onClick={handleLogin} style={{...styles.btn, background:'#0078d4', color:'white', fontSize:'13px'}}>Connect SharePoint</button>
                    ) : (
                        <span style={{color: '#10b981', fontWeight:'bold', fontSize:'13px'}}>✓ SharePoint Connected</span>
                    )}
                </div>
            </div>
            
            <div style={styles.tabs}>
                <button style={styles.tab(activeTab === 'samples_pending')} onClick={() => setActiveTab('samples_pending')}>Samples Queue ({pendingSamples.length})</button>
                <button style={styles.tab(activeTab === 'full_blends')} onClick={() => setActiveTab('full_blends')}>Production Queue ({fullBlends.length})</button>
                <button style={styles.tab(activeTab === 'finished')} onClick={() => setActiveTab('finished')}>Finished Blends ({finishedBlends.length})</button>
            </div>

            {/* SAMPLES QUEUE */}
            {activeTab === 'samples_pending' && (
                <div>
                    <button onClick={() => setShowSampleForm(!showSampleForm)} style={{...styles.btn, marginBottom: '20px'}}>+ Create New Sample</button>
                    
                    {showSampleForm && <SampleForm setShowSampleForm={setShowSampleForm} styles={styles} />}

                    {pendingSamples.map(sample => (
                        <div key={sample.id} style={styles.card}>
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px'}}>
                                <div>
                                    <h3 style={{margin: '0 0 5px 0'}}>
                                        {sample.project || sample.name} 
                                        {sample.calculatedIngredients && <span style={{fontSize: '12px', color: '#047857', background: '#d1fae5', padding: '3px 8px', borderRadius: '10px', marginLeft: '10px'}}>Ready to Finish</span>}
                                    </h3>
                                    <p style={{margin: 0, color:'#666'}}>{sample.company}</p>
                                </div>
                            </div>
                            
                            <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
                                {!sample.calculatedIngredients ? (
                                    <button onClick={() => setProcessingItem(sample)} style={{...styles.btn, background: '#3b82f6'}}>➕ Add Information</button>
                                ) : (
                                    <>
                                        <button onClick={() => setProcessingItem(sample)} style={{...styles.btn, background: '#f59e0b', padding: '8px 12px'}}>✏️ Edit Info</button>
                                        <button onClick={() => setViewingItem(sample)} style={{...styles.btn, background: '#3b82f6', padding: '8px 12px'}}>👀 View Excel</button>
                                        <button onClick={() => printTicket(sample)} style={{...styles.btn, background: '#475569', padding: '8px 12px'}}>🖨️ Print</button>
                                        <button onClick={() => markAsFinishedInline(sample)} style={{...styles.btn, background: '#10b981', padding: '8px 12px'}}>✅ Finish</button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* PRODUCTION QUEUE */}
            {activeTab === 'full_blends' && (
                <div>
                    {fullBlends.length === 0 ? <p>No production jobs require blending right now.</p> : null}
                    {fullBlends.map(job => (
                        <div key={job.id} style={styles.card}>
                            <div style={{marginBottom: '15px'}}>
                                <h3 style={{margin:'0 0 5px 0'}}>
                                    {job.project}
                                    {job.calculatedIngredients && <span style={{fontSize: '12px', color: '#047857', background: '#d1fae5', padding: '3px 8px', borderRadius: '10px', marginLeft: '10px'}}>Ready to Finish</span>}
                                </h3>
                                <p style={{margin: 0, color:'#666'}}>{job.company} • {job.quantity} units</p>
                            </div>
                            
                            <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
                                {!job.calculatedIngredients ? (
                                    <button onClick={() => setProcessingItem(job)} style={{...styles.btn, background: '#3b82f6'}}>➕ Add Information</button>
                                ) : (
                                    <>
                                        <button onClick={() => setProcessingItem(job)} style={{...styles.btn, background: '#f59e0b', padding: '8px 12px'}}>✏️ Edit Info</button>
                                        <button onClick={() => setViewingItem(job)} style={{...styles.btn, background: '#3b82f6', padding: '8px 12px'}}>👀 View Excel</button>
                                        <button onClick={() => printTicket(job)} style={{...styles.btn, background: '#475569', padding: '8px 12px'}}>🖨️ Print</button>
                                        <button onClick={() => markAsFinishedInline(job)} style={{...styles.btn, background: '#10b981', padding: '8px 12px'}}>✅ Finish</button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* FINISHED BLENDS */}
            {activeTab === 'finished' && (
                <div>
                    <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
                        <input type="text" placeholder="Search by name, project, or company..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ ...styles.input, flex: 1 }} />
                        <select value={sortOption} onChange={(e) => setSortOption(e.target.value)} style={{ ...styles.input, width: '200px' }}>
                            <option value="dateDesc">Newest First</option>
                            <option value="dateAsc">Oldest First</option>
                            <option value="nameAsc">Name (A-Z)</option>
                            <option value="nameDesc">Name (Z-A)</option>
                            <option value="sizeDesc">Largest Batch First</option>
                            <option value="sizeAsc">Smallest Batch First</option>
                        </select>
                    </div>

                    {processedFinishedBlends.length === 0 && <p style={{ color: '#666', fontStyle: 'italic' }}>No finished blends match your criteria.</p>}

                    {processedFinishedBlends.map(item => {
                        const isBilled = item.billed;
                        return (
                            <div key={item.id} style={{...styles.card, borderLeft: `5px solid ${isBilled ? '#10b981' : '#f59e0b'}`, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                <div>
                                    <h3 style={{margin:'0 0 5px 0'}}>
                                        {item.project || item.name} 
                                        <span style={{fontSize:'12px', background:'#eee', padding:'3px 8px', borderRadius:'10px', marginLeft: '10px'}}>{item.type}</span>
                                    </h3>
                                    <p style={{margin:0, color:'#666'}}>{item.company} • Batch: {item.totalBatchGrams}g</p>
                                    {isBilled && <p style={{margin: '5px 0 0 0', color: '#10b981', fontSize: '13px', fontWeight: 'bold'}}>✓ Billed (Inv: {item.invoiceNumber})</p>}
                                </div>
                                <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
                                    <button onClick={() => setViewingItem(item)} style={{...styles.btn, background: '#3b82f6', padding: '8px 12px'}}>👀 View Excel</button>
                                    <button onClick={() => printTicket(item)} style={{...styles.btn, background: '#475569', padding: '8px 12px'}}>🖨️ Print</button>
                                    <button onClick={() => emailFinishedBlend(item)} style={{...styles.btn, background: '#8b5cf6', padding: '8px 12px'}}>✉️ Email</button>
                                    {!isBilled && <button onClick={() => handleBillItem(item)} style={{...styles.btn, background: '#f59e0b', padding: '8px 12px'}}>💰 Bill</button>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* MODALS */}
            {processingItem && <ProcessingModal processingItem={processingItem} setProcessingItem={setProcessingItem} styles={styles} />}
            {viewingItem && <ViewingModal viewingItem={viewingItem} setViewingItem={setViewingItem} emailFinishedBlend={emailFinishedBlend} printTicket={printTicket} styles={styles} />}
        </div>
    );
}