import { useState } from "react";
import { PublicClientApplication } from "@azure/msal-browser";
import { msalConfig, graphConfig } from "../authConfig";
import ExcelJS from "exceljs";

const msalInstance = new PublicClientApplication(msalConfig);
await msalInstance.initialize();

const SITE_ID = "makeitbuzz.sharepoint.com,5f466306-673d-4008-a8cc-86bdb931024f,eb52fce7-86e8-43c9-b592-cf8da705e9ef";

export const useSharePointExcel = () => {
    const [msalLoading, setMsalLoading] = useState(false);

    const getAccessToken = async () => {
        const accounts = msalInstance.getAllAccounts();
        if (accounts.length === 0) {
            await msalInstance.loginPopup({ scopes: graphConfig.uploadScope });
        }
        const activeAccount = msalInstance.getAllAccounts()[0];
        const tokenResponse = await msalInstance.acquireTokenSilent({
            scopes: graphConfig.uploadScope,
            account: activeAccount
        }).catch(async (error) => {
            return await msalInstance.acquireTokenPopup({ scopes: graphConfig.uploadScope });
        });
        return tokenResponse.accessToken;
    };

    /**
     * Appends data to a weekly tab in a specific client's monthly Excel file
     */
    const appendToExcelAndUpload = async (clientName, orderData) => {
        setMsalLoading(true);
        try {
            const token = await getAccessToken();
            
            const now = new Date();
            const yearMonth = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;
            const fileName = `3PL_Billing_${yearMonth}.xlsx`;
            
            // Path: /Documents/Make USA LLC/Production/files/@clientname/3PL/Month/3PL_Billing_2026_01.xlsx
            const path = `/Documents/Make USA LLC/Production/files/${clientName}/3PL/${yearMonth}/${fileName}`;
            const encodedPath = encodeURI(path);
            const graphEndpoint = `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive/root:${encodedPath}:/content`;

            let workbook = new ExcelJS.Workbook();
            let fileExists = false;

            // Try to download the existing file
            try {
                const getEndpoint = `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive/root:${encodedPath}`;
                const getRes = await fetch(getEndpoint, { headers: { 'Authorization': `Bearer ${token}` } });
                
                if (getRes.ok) {
                    const dlData = await getRes.json();
                    if(dlData['@microsoft.graph.downloadUrl']) {
                        const fileBlob = await fetch(dlData['@microsoft.graph.downloadUrl']).then(r => r.arrayBuffer());
                        await workbook.xlsx.load(fileBlob);
                        fileExists = true;
                    }
                }
            } catch(e) { console.log("File does not exist yet, creating new."); }

            // Determine Week Tab Name
            // Simple logic: e.g., "Week_1" (Days 1-7), "Week_2" (8-14)
            const weekNum = Math.ceil(now.getDate() / 7);
            const sheetName = `Week_${weekNum}`;
            
            let worksheet = workbook.getWorksheet(sheetName);
            
            if (!worksheet) {
                worksheet = workbook.addWorksheet(sheetName);
                // Setup Columns matching your CSV example
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
            if(lastRow.getCell('A').value === 'TOTAL') {
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

            if (!uploadRes.ok) throw new Error("Failed to upload to SharePoint");
            
            return true;

        } catch (error) {
            console.error("SharePoint Upload Error:", error);
            throw error;
        } finally {
            setMsalLoading(false);
        }
    };

    return { appendToExcelAndUpload, msalLoading };
};