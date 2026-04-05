import { useState } from "react";
import { PublicClientApplication } from "@azure/msal-browser";
import { msalConfig, graphConfig } from "../authConfig";
import ExcelJS from "exceljs";

const msalInstance = new PublicClientApplication(msalConfig);
await msalInstance.initialize();

const SITE_ID = "makeitbuzz.sharepoint.com,5f466306-673d-4008-a8cc-86bdb931024f,eb52fce7-86e8-43c9-b592-cf8da705e9ef";

export const useSharePointExcel = () => {
    const [msalLoading, setMsalLoading] = useState(false);
    const [isConnected, setIsConnected] = useState(msalInstance.getAllAccounts().length > 0);

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
            await msalInstance.loginRedirect({ scopes: graphConfig.uploadScope });
            return null; 
        }
        
        const activeAccount = accounts[0];
        try {
            const tokenResponse = await msalInstance.acquireTokenSilent({
                scopes: graphConfig.uploadScope,
                account: activeAccount
            });
            return tokenResponse.accessToken;
        } catch (error) {
            await msalInstance.acquireTokenRedirect({ scopes: graphConfig.uploadScope });
        }
    };

    const appendToExcelAndUpload = async (clientName, orderData) => {
        setMsalLoading(true);
        try {
            const token = await getAccessToken();
            if (!token) return false; 
            
            const now = new Date();
            const yearMonth = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;
            const fileName = `3PL_Billing_${yearMonth}.xlsx`;
            
            const safeCompany = String(clientName || "Unknown Client").trim().replace(/[^a-zA-Z0-9 -]/g, "");
            const path = `/Documents/Production/Files/${safeCompany}/3PL/${yearMonth}/${fileName}`;
            const encodedPath = encodeURI(path);
            const graphEndpoint = `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive/root:${encodedPath}:/content`;

            let workbook = new ExcelJS.Workbook();

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

            const weekNum = Math.ceil(now.getDate() / 7);
            const sheetName = `Week_${weekNum}`;
            
            let worksheet = workbook.getWorksheet(sheetName);
            
            if (!worksheet) {
                worksheet = workbook.addWorksheet(sheetName);
                worksheet.addRow(['DATE', 'SITE', 'ORDER #', 'QUANTITY', 'AMOUNT', 'ITEM']);
                worksheet.getRow(1).font = { bold: true };
                
                worksheet.getColumn(1).width = 12;
                worksheet.getColumn(2).width = 12;
                worksheet.getColumn(3).width = 15;
                worksheet.getColumn(4).width = 10;
                worksheet.getColumn(5).width = 12;
                worksheet.getColumn(6).width = 40;
            }

            worksheet.addRow([
                orderData.date || '',
                orderData.site || 'Shopify',
                orderData.orderNumber || '',
                orderData.totalQuantity || 0,
                orderData.totalPrice || 0,
                orderData.description || ''
            ]);

            let totalRowIndex = -1;
            worksheet.eachRow((row, rowNumber) => {
                try {
                    const valA = String(row.getCell(1).value || '').trim().toUpperCase();
                    const valB = String(row.getCell(2).value || '').trim().toUpperCase();
                    if (valA === 'TOTAL' || valB === 'TOTAL') {
                        totalRowIndex = rowNumber;
                    }
                } catch(e) {}
            });

            if (totalRowIndex > -1) {
                worksheet.spliceRows(totalRowIndex, 1);
            }

            let sumQty = 0;
            let sumAmt = 0;
            worksheet.eachRow((row, rowNumber) => {
                try {
                    if (rowNumber > 1) { 
                        sumQty += Number(row.getCell(4).value || 0); 
                        sumAmt += Number(row.getCell(5).value || 0); 
                    }
                } catch(e) {}
            });

            const totRow = worksheet.addRow(['', 'TOTAL', '', sumQty, sumAmt, '']);
            totRow.font = { bold: true };

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
                const errText = await uploadRes.text();
                throw new Error(`Graph API Upload Failed (${uploadRes.status}): ${errText}`);
            }
            return true;

        } catch (error) {
            console.error("SharePoint Upload Error:", error);
            throw error;
        } finally {
            setMsalLoading(false);
        }
    };

    const removeRowFromExcelAndUpload = async (clientName, itemData) => {
        setMsalLoading(true);
        try {
            const token = await getAccessToken();
            if (!token) return false;

            let targetYear = new Date().getFullYear();
            let targetMonth = String(new Date().getMonth() + 1).padStart(2, '0');
            let targetDay = new Date().getDate();
            
            try {
                const rawDateStr = itemData.createdAt || itemData.date;
                if (typeof rawDateStr === 'string' && rawDateStr.includes('-')) {
                    const parts = rawDateStr.split('-');
                    if(parts.length >= 3) {
                        targetYear = parts[0];
                        targetMonth = parts[1].padStart(2, '0'); 
                        targetDay = parts[2].substring(0, 2);
                    }
                } else if (itemData.createdAt && itemData.createdAt.seconds) {
                    const d = new Date(itemData.createdAt.seconds * 1000);
                    targetYear = d.getFullYear();
                    targetMonth = String(d.getMonth() + 1).padStart(2, '0');
                    targetDay = d.getDate();
                }
            } catch(dateErr) {
                console.warn("Date parsing skipped due to malformed data.");
            }

            const yearMonth = `${targetYear}_${targetMonth}`;
            const fileName = `3PL_Billing_${yearMonth}.xlsx`;

            const safeCompany = String(clientName || "Unknown").trim().replace(/[^a-zA-Z0-9 -]/g, "");
            const path = `/Documents/Production/Files/${safeCompany}/3PL/${yearMonth}/${fileName}`;
            const encodedPath = encodeURI(path);
            
            let workbook = new ExcelJS.Workbook();
            try {
                const getEndpoint = `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive/root:${encodedPath}`;
                const getRes = await fetch(getEndpoint, { headers: { 'Authorization': `Bearer ${token}` } });
                
                if (getRes.ok) {
                    const dlData = await getRes.json();
                    if(dlData['@microsoft.graph.downloadUrl']) {
                        const fileBlob = await fetch(dlData['@microsoft.graph.downloadUrl']).then(r => r.arrayBuffer());
                        await workbook.xlsx.load(fileBlob);
                    } else {
                        throw new Error("File found, but download URL was missing from Microsoft Graph.");
                    }
                } else {
                    return true; // File doesn't exist, technically successfully voided in SharePoint.
                }
            } catch(e) {
                return true; 
            }

            const safeDayNum = Number(targetDay) || 1;
            const weekNum = Math.ceil(safeDayNum / 7) || 1;
            const sheetName = `Week_${weekNum}`;
            let worksheet = workbook.getWorksheet(sheetName);

            if (!worksheet) {
                throw new Error(`The sheet tab '${sheetName}' does not exist in the Excel file.`);
            }

            let targetRowIndex = -1;
            let totalRowIndex = -1;

            // Target Values (Trimmed to prevent trailing space bugs)
            const targetOrder = String(itemData.orderNumber || '').trim();
            const targetDesc = String(itemData.description || '').trim();
            const targetAmt = Number(itemData.totalPrice || 0);

            worksheet.eachRow((row, rowNumber) => {
                try {
                    const valA = String(row.getCell(1).value || '').trim().toUpperCase();
                    const valB = String(row.getCell(2).value || '').trim().toUpperCase();
                    
                    if (valA === 'TOTAL' || valB === 'TOTAL') {
                        totalRowIndex = rowNumber;
                    } 
                    else if (rowNumber > 1) {
                        // Extract Cell Values safely
                        const rOrder = String(row.getCell(3).value || '').trim();
                        const rAmt = Number(row.getCell(5).value || 0);
                        const rDesc = String(row.getCell(6).value || '').trim();

                        // Looser matching threshold (0.05 instead of exact math)
                        if (rOrder === targetOrder && rDesc === targetDesc && Math.abs(rAmt - targetAmt) < 0.05) {
                            targetRowIndex = rowNumber;
                        }
                    }
                } catch(rowErr) { }
            });

            // If we STILL can't find it, throw an explicit error to halt the process!
            if (targetRowIndex === -1) {
                throw new Error(`Could not find a matching row in the Excel file for Order [${targetOrder}], Amount [$${targetAmt}]. It may have already been deleted manually.`);
            }

            // Execute Delete
            const rowsToDelete = [targetRowIndex];
            if (totalRowIndex > -1) rowsToDelete.push(totalRowIndex);
            
            // Delete from bottom to top to preserve indexes
            rowsToDelete.sort((a, b) => b - a).forEach(rowIndex => {
                worksheet.spliceRows(rowIndex, 1);
            });

            // Recalculate Totals
            let sumQty = 0;
            let sumAmt = 0;
            worksheet.eachRow((row, rowNumber) => {
                try {
                    if(rowNumber > 1) {
                        sumQty += Number(row.getCell(4).value || 0);
                        sumAmt += Number(row.getCell(5).value || 0);
                    }
                } catch(e) {}
            });

            const totRow = worksheet.addRow(['', 'TOTAL', '', sumQty, sumAmt, '']);
            totRow.font = { bold: true };

            const buffer = await workbook.xlsx.writeBuffer();
            const uploadEndpoint = `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive/root:${encodedPath}:/content?@microsoft.graph.conflictBehavior=replace`;

            const uploadRes = await fetch(uploadEndpoint, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                },
                body: buffer
            });

            if (!uploadRes.ok) {
                const errText = await uploadRes.text();
                throw new Error(`Graph API Void Upload Failed (${uploadRes.status}): ${errText}`);
            }

            return true;

        } catch (error) {
            console.error("SharePoint Delete Error Caught:", error);
            throw error; // This gets caught by PastBills.jsx and shown to the user
        } finally {
            setMsalLoading(false);
        }
    };

    return { appendToExcelAndUpload, removeRowFromExcelAndUpload, msalLoading, connectSharePoint, isConnected };
};