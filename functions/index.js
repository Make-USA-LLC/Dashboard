const { onDocumentUpdated, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const ExcelJS = require("exceljs");

admin.initializeApp();

// Helper to calculate gallons
const getGallons = (name, grams) => {
    const g = parseFloat(grams);
    if (isNaN(g)) return '-';
    const lowerName = name.toLowerCase();
    
    if (lowerName.includes('water')) {
        return (g / 3785.41).toFixed(4);
    } 
    // 1 gram of B40 alcohol ≈ 0.000335 gallons
    else if (lowerName.includes('b40') || lowerName.includes('alcohol')) {
        return (g * 0.000335).toFixed(4);
    }
    
    return '-';
};

const transporter = nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    requireTLS: true,
    auth: {
        user: process.env.SMTP_EMAIL, 
        pass: process.env.SMTP_PASSWORD 
    }
});

// Manual trigger from the Blending Dashboard
exports.sendManualEmail = onCall({ cors: true }, async (request) => {
    const { id, type } = request.data;
    console.log(`Manual email requested for ${type} ID: ${id}`);

    if (!id || !type) {
        throw new HttpsError('invalid-argument', 'Missing document ID or type.');
    }

    try {
        const collectionName = type === 'sample' ? 'blending_samples' : 'production_pipeline';
        const docRef = admin.firestore().collection(collectionName).doc(id);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            console.error(`Document ${id} not found in ${collectionName}`);
            throw new HttpsError('not-found', 'Document not found.');
        }

        const data = docSnap.data();
        console.log(`Found document: ${data.name || data.project}. Generating Excel...`);

        await sendEmail(data, type === 'sample' ? 'Sample' : 'Production');

        return { success: true, message: 'Email sent successfully.' };
    } catch (error) {
        console.error("DETAILED ERROR IN MANUAL EMAIL:", error);
        throw new HttpsError('internal', error.message || 'Error sending email.');
    }
});

// Automated triggers
exports.onSampleCompleted = onDocumentUpdated("blending_samples/{sampleId}", async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (before.status !== 'completed' && after.status === 'completed') {
        return sendEmail(after, 'Sample');
    }
});

exports.onProductionBlendCompleted = onDocumentUpdated("production_pipeline/{jobId}", async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (before.blendingStatus !== 'completed' && after.blendingStatus === 'completed') {
        return sendEmail(after, 'Production');
    }
});

async function sendEmail(data, type) {
    const companyName = String(data.company || ''); 
    const projectName = String(data.project || data.name || 'Unknown Project');
    const totalGrams = data.totalBatchGrams || 0;
    const ingredients = data.calculatedIngredients || [];
    
    // --- 1. BUILD EXCEL FILE ---
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Formula");

    sheet.columns = [
        { key: 'formula', width: 35 },
        { key: 'percent', width: 12 },
        { key: 'grams', width: 12 },
        { key: 'gallons', width: 12 }
    ];

    const row1 = sheet.addRow([companyName.toUpperCase()]);
    row1.font = { bold: true, size: 12, name: 'Arial' };
    
    const row2 = sheet.addRow([projectName.toUpperCase()]);
    row2.font = { bold: true, size: 12, name: 'Arial' };
    
    sheet.addRow([]); 

    sheet.mergeCells('A4:D4');
    const mainHeader = sheet.getCell('A4');
    mainHeader.value = 'Formula';
    mainHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }; 
    mainHeader.font = { bold: true };
    mainHeader.alignment = { horizontal: 'center' };
    mainHeader.border = { top: { style: 'thick' }, left: { style: 'thick' }, right: { style: 'thick' } };

    const subHeaderRow = sheet.addRow(['', '%', 'gr', 'Gallons']);
    [2, 3, 4].forEach(col => {
        subHeaderRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
    });
    subHeaderRow.font = { bold: true };
    subHeaderRow.getCell(1).border = { left: { style: 'thick' }, bottom: { style: 'thin' } };
    subHeaderRow.getCell(4).border = { right: { style: 'thick' }, bottom: { style: 'thin' } };

    // --- 2. BUILD HTML TABLE ---
    let htmlTableRows = '';

    ingredients.forEach((ing) => {
        const galValue = getGallons(ing.name, ing.calculatedGrams);
        const percentRaw = ing.percentage ? Number(ing.percentage) : 0;
        const gramsRaw = Number(ing.calculatedGrams) || 0;
        
        const row = sheet.addRow([
            ing.name,
            percentRaw / 100,
            gramsRaw,
            galValue === '-' ? '-' : Number(galValue)
        ]);
        
        const isFragrance = ing.name.toLowerCase().includes('fragrance');

        row.eachCell((cell, colNumber) => {
            cell.border = {
                left: colNumber === 1 ? { style: 'thick' } : { style: 'thin' },
                right: colNumber === 4 ? { style: 'thick' } : { style: 'thin' },
                bottom: { style: 'thin' },
                top: { style: 'thin' }
            };
            if (isFragrance && colNumber === 3) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA9D08E' } };
            }
        });

        row.getCell(2).numFmt = '0.00%';
        row.getCell(3).numFmt = '0.00';
        if (galValue !== '-') row.getCell(4).numFmt = '0.0000';

        const highlightStyle = isFragrance ? 'background-color: #a9d08e; font-weight: bold;' : '';
        htmlTableRows += `
            <tr>
                <td style="border: 1px solid #d0d7e5; padding: 8px;">${ing.name}</td>
                <td style="border: 1px solid #d0d7e5; padding: 8px; text-align: right;">${percentRaw.toFixed(2)}%</td>
                <td style="border: 1px solid #d0d7e5; padding: 8px; text-align: right; ${highlightStyle}">${gramsRaw.toFixed(2)}</td>
                <td style="border: 1px solid #d0d7e5; padding: 8px; text-align: right;">${galValue === '-' ? '-' : Number(galValue).toFixed(4)}</td>
            </tr>
        `;
    });

    const totalRow = sheet.addRow(['Total', 1, Number(totalGrams), '']);
    totalRow.font = { bold: true };
    totalRow.eachCell((cell, colNumber) => {
        cell.border = {
            left: colNumber === 1 ? { style: 'thick' } : { style: 'thin' },
            right: colNumber === 4 ? { style: 'thick' } : { style: 'thin' },
            bottom: { style: 'thick' }
        };
    });
    totalRow.getCell(2).numFmt = '0.00%';

    htmlTableRows += `
        <tr style="font-weight: bold; background-color: #f8f9fa;">
            <td style="border: 1px solid #d0d7e5; padding: 8px;">Total</td>
            <td style="border: 1px solid #d0d7e5; padding: 8px; text-align: right;">100.00%</td>
            <td style="border: 1px solid #d0d7e5; padding: 8px; text-align: right;">${Number(totalGrams).toFixed(2)}</td>
            <td style="border: 1px solid #d0d7e5; padding: 8px;"></td>
        </tr>
    `;

    const htmlBody = `
        <div style="font-family: Arial, sans-serif; color: #333;">
            <h2 style="color: #2c3e50; margin-bottom: 5px;">MakeUSA Blending Report</h2>
            <p style="margin-top: 0; color: #666;">
                <strong>Company:</strong> ${companyName}<br>
                <strong>Project:</strong> ${projectName}<br>
                <strong>Type:</strong> ${type}
            </p>

            <table style="border-collapse: collapse; width: 100%; max-width: 600px; margin-top: 20px; font-size: 14px;">
                <thead>
                    <tr>
                        <th colspan="4" style="background-color: #fff2cc; border: 2px solid #333; padding: 10px; text-align: center; font-size: 16px;">Formula</th>
                    </tr>
                    <tr style="background-color: #fff2cc; border-bottom: 1px solid #333;">
                        <th style="border: 1px solid #d0d7e5; border-left: 2px solid #333; padding: 8px; text-align: left;">Ingredient</th>
                        <th style="border: 1px solid #d0d7e5; padding: 8px; text-align: right;">%</th>
                        <th style="border: 1px solid #d0d7e5; padding: 8px; text-align: right;">gr</th>
                        <th style="border: 1px solid #d0d7e5; border-right: 2px solid #333; padding: 8px; text-align: right;">Gallons</th>
                    </tr>
                </thead>
                <tbody style="border-left: 2px solid #333; border-right: 2px solid #333;">
                    ${htmlTableRows}
                </tbody>
                <tfoot style="border-bottom: 2px solid #333; border-left: 2px solid #333; border-right: 2px solid #333;">
                </tfoot>
            </table>

            <p style="margin-top: 20px;">
                <em>A fully formatted Excel version of this report is attached.</em>
            </p>
        </div>
    `;

    const excelBuffer = await workbook.xlsx.writeBuffer();
    const cleanFileName = projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'blend';
    
    const mailOptions = {
        from: `"MakeUSA Blending Lab" <${process.env.SMTP_EMAIL}>`,
        to: 'blendingreports@makeit.buzz',
        subject: `Blending Complete - ${type}: ${companyName} ${projectName}`,
        text: `Formula report for ${projectName} attached.`, 
        html: htmlBody, 
        attachments: [{ filename: `${cleanFileName}_formula.xlsx`, content: excelBuffer }]
    };

    console.log(`Sending email to ${mailOptions.to}...`);
    await transporter.sendMail(mailOptions);
    console.log("Email sent successfully.");
}

// 5S Audit Alert Trigger
exports.sendAuditAlerts = onDocumentCreated('five_s_audits/{auditId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data();
    const results = data.results || {};
    
    let threshold = 3; 
    try {
        const configDoc = await admin.firestore().collection('qc_settings').doc('five_s_config').get();
        if (configDoc.exists && configDoc.data().alertThreshold !== undefined) {
            threshold = configDoc.data().alertThreshold;
        }
    } catch (err) {
        console.error("Failed to fetch threshold, using default.", err);
    }

    const actionsByOwner = {};

    for (const [key, details] of Object.entries(results)) {
        if (details.owner && details.points !== undefined && details.points !== "") {
            const scoreGiven = parseInt(details.points);
            
            if (scoreGiven < threshold) {
                if (!actionsByOwner[details.owner]) {
                    actionsByOwner[details.owner] = [];
                }
                actionsByOwner[details.owner].push({
                    ...details,
                    questionId: key
                });
            }
        }
    }

    const emailPromises = Object.keys(actionsByOwner).map(async (email) => {
        const tasks = actionsByOwner[email];
        if (tasks.length === 0) return null; 
        
        let htmlContent = `<h3>Action Required: 5S Audit Items</h3>
        <p>You have been assigned action items from a recent 5S Audit because they scored below a ${threshold}.</p>
        <ul>`;
        
        tasks.forEach(task => {
            htmlContent += `<li>
                <strong>Question:</strong> ${task.question || `Task ID ${task.questionId}`}<br/>
                <strong>Action:</strong> ${task.action || 'No action specified'} <br/>
                <strong>Due Date:</strong> ${task.dueDate || 'N/A'} <br/>
                <strong>Score Given:</strong> <span style="color: red; font-weight: bold;">${task.points}</span>
            </li><br/>`;
        });
        htmlContent += `</ul>`;

        const mailOptions = {
            from: `"Make USA QC" <${process.env.SMTP_EMAIL}>`,
            to: email,
            subject: 'Action Required: 5S Audit Tasks Assigned',
            html: htmlContent
        };

        return transporter.sendMail(mailOptions);
    });

    return Promise.all(emailPromises)
        .then(() => console.log('Audit alerts evaluated successfully.'))
        .catch((error) => console.error('Error sending audit emails:', error));
});

// --- QC Ready Notification Trigger ---
exports.notifyQCReady = onCall({ cors: true }, async (request) => {
    const { projectName, companyName } = request.data;
    console.log(`QC Ready email requested for Project: ${projectName}`);

    if (!projectName || !companyName) {
        throw new HttpsError('invalid-argument', 'Project name and company name are required.');
    }

    const mailOptions = {
        from: `"MakeUSA Production" <${process.env.SMTP_EMAIL}>`,
        to: 'QCReady@makeit.buzz',
        subject: `Action Required: QC Ready for ${projectName}`,
        text: `Project Name: ${projectName}\nCompany: ${companyName}\n\nThis project has passed Production Management and requires a Quality Standard to be built and pictures uploaded.`,
        html: `
            <div style="font-family: Arial, sans-serif; color: #333;">
                <h2 style="color: #2c3e50; border-bottom: 2px solid #2c3e50; padding-bottom: 5px;">QC Action Required</h2>
                <p style="font-size: 16px;">
                    <strong>Company:</strong> ${companyName}<br>
                    <strong>Project Name:</strong> ${projectName}
                </p>
                <div style="background-color: #fff2cc; border-left: 4px solid #ffc107; padding: 15px; margin-top: 20px;">
                    <p style="margin: 0; font-size: 16px;">
                        This project has passed Production Management and requires a <strong>Quality Standard to be built</strong> and <strong>pictures uploaded</strong>.
                    </p>
                </div>
            </div>
        `,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Successfully sent QC Ready email for ${projectName}.`);
        return { success: true, message: 'Email sent to QC successfully.' };
    } catch (error) {
        console.error("Error sending QC Ready email:", error);
        throw new HttpsError('internal', error.message || 'Error sending email to QC.');
    }
});