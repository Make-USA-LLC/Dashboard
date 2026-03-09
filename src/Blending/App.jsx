import React, { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { db, functions } from '../firebase_config'; 
import { updateDoc, doc, serverTimestamp } from 'firebase/firestore';
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
    
    // Shared Modal States
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

            const title = item.company && item.company !== 'TBD' ? `${item.company} - ${item.project || item.name}` : (item.project || item.name);
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

            const companyName = (item.company && item.company !== 'TBD' ? item.company : 'Unknown_Company').trim();
            const projectName = (item.project || item.name || 'Unknown_Project').trim();
            const fileName = `${projectName}_Blend.xlsx`;
            
            let storagePath = item.type === 'sample' 
                ? `/Documents/Production/Files/${companyName}/Samples/${String(new Date().getMonth() + 1).padStart(2, '0')}-${new Date().getFullYear()}/${fileName}`
                : (item.sharepointFolder ? `${item.sharepointFolder}/${fileName}` : `/Documents/Production/Files/${companyName.replace(/[^a-zA-Z0-9 -]/g, "")}/${(new Date().getMonth() + 1).toString().padStart(2, '0')}-${new Date().getFullYear()}/${projectName.replace(/[^a-zA-Z0-9 -]/g, "")}/${fileName}`);

            const SITE_ID = "makeitbuzz.sharepoint.com,5f466306-673d-4008-a8cc-86bdb931024f,eb52fce7-86e8-43c9-b592-cf8da705e9ef";
            const uploadUrl = `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive/root:${storagePath}:/content?@microsoft.graph.conflictBehavior=replace`;

            const response = await fetch(uploadUrl, {
                method: "PUT",
                headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
                body: blob
            });

            if (!response.ok) throw new Error("Upload response failed");
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
        await updateDoc(doc(db, "production_pipeline", item.id), { billed: true, invoiceNumber: invoice, billedAt: serverTimestamp() });
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

            {activeTab === 'samples_pending' && <SampleQueue setProcessingItem={setProcessingItem} setViewingItem={setViewingItem} printTicket={printTicket} markAsFinishedInline={markAsFinishedInline} />}
            {activeTab === 'full_blends' && <ProductionQueue setProcessingItem={setProcessingItem} setViewingItem={setViewingItem} printTicket={printTicket} markAsFinishedInline={markAsFinishedInline} />}
            {activeTab === 'finished_samples' && <FinishedSamples setViewingItem={setViewingItem} printTicket={printTicket} />}
            {activeTab === 'finished_production' && <FinishedProduction setViewingItem={setViewingItem} printTicket={printTicket} emailFinishedBlend={emailFinishedBlend} handleBillItem={handleBillItem} />}

            {processingItem && <ProcessingModal processingItem={processingItem} setProcessingItem={setProcessingItem} styles={styles} />}
            {viewingItem && <ViewingModal viewingItem={viewingItem} setViewingItem={setViewingItem} emailFinishedBlend={emailFinishedBlend} printTicket={printTicket} styles={styles} />}
        </div>
    );
}