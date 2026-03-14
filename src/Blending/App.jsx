import React, { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { db, functions } from '../firebase_config'; 
import { updateDoc, doc, serverTimestamp, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useMsal } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";

import { styles, getGallons } from './utils';
import ProcessingModal from './ProcessingModal';
import ViewingModal from './ViewingModal';

import SampleQueue from './SampleQueue';
import ProductionQueue from './ProductionQueue';
import FinishedSamples from './FinishedSamples';
import FinishedProduction from './FinishedProduction';

export default function BlendingApp() {
    const { instance, accounts, inProgress } = useMsal();
    const [activeTab, setActiveTab] = useState('samples_pending'); 
    
    const [processingItem, setProcessingItem] = useState(null);
    const [viewingItem, setViewingItem] = useState(null);

    const handleLogin = async () => {
        if (inProgress !== InteractionStatus.None) return;
        try { await instance.loginRedirect({ scopes: ["Sites.ReadWrite.All", "Files.ReadWrite.All"], prompt: "select_account" }); } 
        catch (error) { console.error("Login failed:", error); }
    };

    const getMsToken = useCallback(async () => {
        if (accounts.length === 0) return null;
        const request = { scopes: ["Sites.ReadWrite.All", "Files.ReadWrite.All"], account: accounts[0] };
        try { return (await instance.acquireTokenSilent(request)).accessToken; } 
        catch (err) {
            try { await instance.acquireTokenRedirect(request); } catch(e) { return null; }
        }
    }, [accounts, instance]);

    const generateAndUploadExcel = async (item) => {
        try {
            const token = await getMsToken();
            if (!token) return false; 

            // Standardize labels and casing to match the Email version
            const companyName = String(item.company || '').toUpperCase(); 
            const projectName = String(item.project || item.name || 'Unknown Project').toUpperCase();
            const finishDate = new Date().toLocaleString(); 

            const worksheetData = [
                ["MAKEUSA BLENDING TICKET"],
                [companyName],
                [projectName],
                [`TOTAL BATCH SIZE: ${item.totalBatchGrams} G`],
                [`FINISHED ON: ${finishDate}`],
                [], 
                ["FORMULA"],
                ["Ingredient", "%", "gr", "Gallons"]
            ];

            item.calculatedIngredients.forEach(ing => {
                const galValue = getGallons(ing.name, ing.calculatedGrams);
                worksheetData.push([
                    ing.name, 
                    `${Number(ing.percentage).toFixed(2)}%`, 
                    Number(ing.calculatedGrams).toFixed(2), 
                    galValue === '-' ? '-' : Number(galValue).toFixed(4)
                ]);
            });

            // Add the missing "Total" row to match Email summary
            worksheetData.push(["Total", "100.00%", Number(item.totalBatchGrams).toFixed(2), ""]);

            const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Formula");
            
            const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

            const rawCompany = (item.company && item.company !== 'TBD' ? item.company : 'Unknown_Company').trim();
            const rawProject = (item.project || item.name || 'Unknown_Project').trim();
            
            const safeCompany = rawCompany.replace(/[^a-zA-Z0-9 -_]/g, "").trim() || "Unknown_Company";
            const safeProject = rawProject.replace(/[^a-zA-Z0-9 -_]/g, "").trim() || "Unknown_Project";
            
            const fileName = `${safeProject}_Blend.xlsx`;
            
            let storagePath = '';
            
            if (item.type === 'sample') {
                storagePath = `/Documents/Production/Files/${safeCompany}/Samples/${String(new Date().getMonth() + 1).padStart(2, '0')}-${new Date().getFullYear()}/${fileName}`;
            } else {
                if (item.sharepointFolder) {
                    const cleanFolder = item.sharepointFolder.replace(/#/g, ''); 
                    storagePath = `${cleanFolder}/${fileName}`;
                } else {
                    storagePath = `/Documents/Production/Files/${safeCompany}/${(new Date().getMonth() + 1).toString().padStart(2, '0')}-${new Date().getFullYear()}/${safeProject}/${fileName}`;
                }
            }

            const encodedPath = storagePath.split('/').map(segment => encodeURIComponent(segment)).join('/');

            const SITE_ID = "makeitbuzz.sharepoint.com,5f466306-673d-4008-a8cc-86bdb931024f,eb52fce7-86e8-43c9-b592-cf8da705e9ef";
            const uploadUrl = `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive/root:${encodedPath}:/content?@microsoft.graph.conflictBehavior=replace`;

            const response = await fetch(uploadUrl, {
                method: "PUT",
                headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
                body: blob
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error("SharePoint Upload Error:", errorData);
                throw new Error("Upload response failed");
            }
            return true;
        } catch (error) {
            console.error("Error saving Excel automatically:", error);
            return false;
        }
    };

    const markAsFinishedInline = async (item) => {
        if (!item.calculatedIngredients) return alert("Please add information to calculate the formula first.");
        if (accounts.length === 0 && !confirm("SharePoint is not connected. The Excel file will NOT be saved automatically. Do you still want to finish this blend?")) return;

        try {
            const finishDate = serverTimestamp();
            
            if (item.type === 'sample') {
                await updateDoc(doc(db, "blending_samples", item.id), { status: "completed", completedAt: finishDate });
            } else {
                await setDoc(doc(db, "blending_production", item.id), {
                    ...item,
                    blendingStatus: "completed",
                    completedAt: finishDate
                });
                
                await deleteDoc(doc(db, "blending_queue", item.id));

                if (item.productionJobId) {
                    const prodRef = doc(db, "production_pipeline", item.productionJobId);
                    const prodSnap = await getDoc(prodRef);
                    if (prodSnap.exists()) {
                        await updateDoc(prodRef, { blendingStatus: "completed" });
                    }
                }
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

    const deleteBlend = async (item) => {
        if (!window.confirm(`Are you sure you want to delete ${item.project || item.name}? This action cannot be undone.`)) return;

        try {
            if (item.type === 'sample') {
                await deleteDoc(doc(db, "blending_samples", item.id));
            } else {
                // If the item has been marked completed it lives in blending_production, otherwise blending_queue
                if (item.blendingStatus === 'completed' || item.completedAt) {
                    await deleteDoc(doc(db, "blending_production", item.id));
                } else {
                    await deleteDoc(doc(db, "blending_queue", item.id));
                }
            }
            if (viewingItem?.id === item.id) setViewingItem(null);
            if (processingItem?.id === item.id) setProcessingItem(null);
            alert("Blend deleted successfully.");
        } catch (error) {
            console.error("Error deleting blend:", error);
            alert("An error occurred while trying to delete the blend.");
        }
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

        const title = item.company && item.company !== 'TBD' ? `${item.company} - ${item.project || item.name}` : (item.project || item.name);
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
                    <tr><td>${ing.name}</td><td>${ing.percentage}</td><td><strong>${ing.calculatedGrams}</strong></td><td>${getGallons(ing.name, ing.calculatedGrams)}</td></tr>
                `).join('')}
            </table>
            <script>setTimeout(() => { window.print(); }, 250); window.onafterprint = () => { window.close(); };</script>
            </body></html>
        `;
        printWindow.document.write(html);
        printWindow.document.close();
    };

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h1 style={{color: '#2c3e50', margin: 0}}>⚗️ Blending Lab</h1>
                <div>
                    {accounts.length === 0 ? (
                        <button onClick={handleLogin} style={{...styles.btn, background:'#0078d4', color:'white', fontSize:'13px'}}>Connect SharePoint</button>
                    ) : ( <span style={{color: '#10b981', fontWeight:'bold', fontSize:'13px'}}>✓ SharePoint Connected</span> )}
                </div>
            </div>
            
            <div style={styles.tabs}>
                <button style={styles.tab(activeTab === 'samples_pending')} onClick={() => setActiveTab('samples_pending')}>Samples Queue</button>
                <button style={styles.tab(activeTab === 'full_blends')} onClick={() => setActiveTab('full_blends')}>Production Queue</button>
                <button style={styles.tab(activeTab === 'finished_samples')} onClick={() => setActiveTab('finished_samples')}>Finished Samples</button>
                <button style={styles.tab(activeTab === 'finished_production')} onClick={() => setActiveTab('finished_production')}>Finished Production</button>
            </div>

            {activeTab === 'samples_pending' && <SampleQueue setProcessingItem={setProcessingItem} setViewingItem={setViewingItem} printTicket={printTicket} markAsFinishedInline={markAsFinishedInline} deleteBlend={deleteBlend} />}
            {activeTab === 'full_blends' && <ProductionQueue setProcessingItem={setProcessingItem} setViewingItem={setViewingItem} printTicket={printTicket} markAsFinishedInline={markAsFinishedInline} deleteBlend={deleteBlend} />}
            {activeTab === 'finished_samples' && <FinishedSamples setViewingItem={setViewingItem} printTicket={printTicket} deleteBlend={deleteBlend} />}
            {activeTab === 'finished_production' && <FinishedProduction setViewingItem={setViewingItem} printTicket={printTicket} emailFinishedBlend={emailFinishedBlend} deleteBlend={deleteBlend} />}

            {processingItem && <ProcessingModal processingItem={processingItem} setProcessingItem={setProcessingItem} styles={styles} />}
            {viewingItem && <ViewingModal viewingItem={viewingItem} setViewingItem={setViewingItem} emailFinishedBlend={emailFinishedBlend} printTicket={printTicket} styles={styles} />}
        </div>
    );
}