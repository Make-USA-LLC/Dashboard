import { useState } from "react";
import { PublicClientApplication } from "@azure/msal-browser";
import { msalConfig, graphConfig } from "../authConfig";
import ExcelJS from "exceljs";

const msalInstance = new PublicClientApplication(msalConfig);
await msalInstance.initialize();

const SITE_ID = "makeitbuzz.sharepoint.com,5f466306-673d-4008-a8cc-86bdb931024f,eb52fce7-86e8-43c9-b592-cf8da705e9ef";

export const useSharePointExcel = () => {
    const [msalLoading, setMsalLoading] = useState(false);
    
    // Check if user is already connected
    const [isConnected, setIsConnected] = useState(msalInstance.getAllAccounts().length > 0);

    // Manual connection trigger (Redirects in the same tab)
    const connectSharePoint = async () => {
        try {
            await msalInstance.loginRedirect({ scopes: graphConfig.uploadScope });
        } catch (error) {
            console.error("Login redirect failed:", error);
        }
    };

    const getAccessToken = async () => {
        const accounts = msalInstance.getAllAccounts();
        if (accounts.length === 0) {
            // Fallback to redirect if somehow triggered while not connected
            await msalInstance.loginRedirect({ scopes: graphConfig.uploadScope });
            return null; // Stop execution as the page will redirect
        }
        
        const activeAccount = accounts[0];
        try {
            const tokenResponse = await msalInstance.acquireTokenSilent({
                scopes: graphConfig.uploadScope,
                account: activeAccount
            });
            return tokenResponse.accessToken;
        } catch (error) {
            // If silent acquisition fails, redirect to log in again
            await msalInstance.acquireTokenRedirect({ scopes: graphConfig.uploadScope });
        }
    };

    /**
     * Appends data to a weekly tab in a specific client's monthly Excel file
     */
    const appendToExcelAndUpload = async (clientName, orderData) => {
        setMsalLoading(true);
        try {
            const token = await getAccessToken();
            if (!token) return false; // Prevent running if it started a redirect
            
            const now = new Date();
            const yearMonth = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;
            const fileName = `3PL_Billing_${yearMonth}.xlsx`;
            
            // Sanitize the client name exactly like the Production and QC modules do
            const safeCompany = clientName.trim().replace(/[^a-zA-Z0-9 -]/g, "");
            
            // Path: /Documents/Production/Files/[SafeCompany]/3PL/[YYYY_MM]/3PL_Billing_YYYY_MM.xlsx
            const path = `/Documents/Production/Files/${safeCompany}/3PL/${yearMonth}/${fileName}`;
            const encodedPath = encodeURI(path);
            const graphEndpoint = `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive/root:${encodedPath}:/content`;

            let workbook = new ExcelJS.Workbook();

            // Try to download the existing file
            try {
                const getEndpoint = `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive/root:${encodedPath}`;
                const getRes = await fetch(getEndpoint, { headers: { 'Authorization': `Bearer ${token}` } });
                
                if (getRes.ok) {
                    const dlData = await getRes.json();
                    if(dlData['@microsoft.graph.downloadUrl']) {
                        const fileBlob = await fetch(dlData['@microsoft.graph.downloadUrl']).then(r => r.arrayBuffer());
                        await workbook.xlsx.load(fileBlob);
                    }
                }
            } catch(e) { console.log("File does not exist yet, creating new."); }

            // Determine Week Tab Name (e.g., "Week_1" for Days 1-7)
            const weekNum = Math.ceil(now.getDate() / 7);
            const sheetName = `Week_${weekNum}`;
            
            let worksheet = workbook.getWorksheet(sheetName);
            
            if (!worksheet) {
                worksheet = workbook.addWorksheet(sheetName);
                // Setup Columns
                worksheet.columns = [
                    { header: 'DATE', key: 'date', width: 12 },
                    { header: 'SITE', key: 'site', width: 12 },
                    { header: 'ORDER #', key: 'orderNum', width: 15 },
                    { header: 'QUANTITY', key: 'quantity', width: 10 },
                    { header: 'AMOUNT', key: 'amount', width: 12 },
                    { header: 'ITEM', key: 'item', width: 40 }
                ];
                worksheet.getRow(1).font = { bold: true };
            }

            // Append Row
            worksheet.addRow({
                date: orderData.date,
                site: orderData.site || 'Shopify',
                orderNum: orderData.orderNumber,
                quantity: orderData.totalQuantity,
                amount: orderData.totalPrice,
                item: orderData.description
            });

            // Re-calculate Total row (if it exists, delete it and put it at the bottom)
            const lastRow = worksheet.lastRow;
            if(lastRow && lastRow.getCell('A').value === 'TOTAL') {
                 worksheet.spliceRows(lastRow.number, 1);
            }

            // Calculate new totals
            let sumQty = 0;
            let sumAmt = 0;
            worksheet.eachRow((row, rowNumber) => {
                if(rowNumber > 1) { // Skip header
                    sumQty += Number(row.getCell('D').value || 0);
                    sumAmt += Number(row.getCell('E').value || 0);
                }
            });

            // Add Total Row
            const totRow = worksheet.addRow({
                date: '', site: 'TOTAL', orderNum: '',
                quantity: sumQty, amount: sumAmt, item: ''
            });
            totRow.font = { bold: true };

            // Generate buffer and upload
            const buffer = await workbook.xlsx.writeBuffer();
            
            const uploadRes = await fetch(graphEndpoint + "?@microsoft.graph.conflictBehavior=replace", {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                },
                body: buffer
            });

            if (!uploadRes.ok) {
                // Try to extract the exact error message from Microsoft Graph
                const errorData = await uploadRes.json().catch(() => ({}));
                console.error("FULL GRAPH API ERROR:", errorData);
                
                const errorMsg = errorData?.error?.message || uploadRes.statusText;
                throw new Error(`SharePoint API Error (${uploadRes.status}): ${errorMsg}`);
            }
            
            // Optional: Print the success URL to console so you can verify exactly where it landed
            const successData = await uploadRes.json();
            console.log("FILE SAVED SUCCESSFULLY AT:", successData.webUrl);

            return true;

        } catch (error) {
            console.error("SharePoint Upload Error:", error);
            throw error;
        } finally {
            setMsalLoading(false);
        }
    };

    return { appendToExcelAndUpload, msalLoading, connectSharePoint, isConnected };
};