const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const ExcelJS = require("exceljs");

admin.initializeApp();

// Helper function to calculate gallons (kept from your original script)
const getGallons = (name, grams) => {
    const g = parseFloat(grams);
    if (isNaN(g)) return '-';
    const lowerName = name.toLowerCase();
    
    if (lowerName.includes('water')) {
        return (g / 3785.41).toFixed(4);
    } else if (lowerName.includes('b40') || lowerName.includes('alcohol')) {
        return (g * 0.00028).toFixed(4);
    }
    return '-';
};

// Configure your email transporter
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

// 1. Listen for finished Samples
exports.onSampleCompleted = onDocumentUpdated("blending_samples/{sampleId}", async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();

    if (before.status !== 'completed' && after.status === 'completed') {
        return sendEmail(after, 'Sample');
    }
    return null;
});

// 2. Listen for finished Production Blends
exports.onProductionBlendCompleted = onDocumentUpdated("production_pipeline/{jobId}", async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();

    if (before.blendingStatus !== 'completed' && after.blendingStatus === 'completed') {
        return sendEmail(after, 'Production');
    }
    return null;
});

// Helper function to build the Styled Excel file and send the email
async function sendEmail(data, type) {
    const companyName = data.company || 'ST. JAMES OF LONDON';
    const projectName = type === 'Sample' ? data.name : data.project;
    const totalGrams = data.totalBatchGrams || 0;
    
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Formula");

    // Set Column Widths
    sheet.columns = [
        { key: 'formula', width: 35 },
        { key: 'percent', width: 15 },
        { key: 'grams', width: 15 }
    ];

    // --- HEADER SECTION ---
    const row1 = sheet.addRow([companyName.toUpperCase()]);
    row1.font = { bold: true, size: 12, name: 'Arial' };
    
    const row2 = sheet.addRow([projectName.toUpperCase()]);
    row2.font = { bold: true, size: 12, name: 'Arial' };
    
    sheet.addRow([]); // Blank Spacer Row

    // --- FORMULA TABLE HEADER ---
    sheet.mergeCells('A4:C4');
    const mainHeader = sheet.getCell('A4');
    mainHeader.value = 'Formula';
    mainHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }; // Yellow
    mainHeader.font = { bold: true, size: 11 };
    mainHeader.alignment = { horizontal: 'center' };
    mainHeader.border = {
        top: { style: 'thick' },
        left: { style: 'thick' },
        right: { style: 'thick' },
        bottom: { style: 'thin' }
    };

    // Sub-Headers (%, gr)
    const subHeaderRow = sheet.addRow(['', '%', 'gr']);
    subHeaderRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
    subHeaderRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
    subHeaderRow.font = { bold: true };
    
    // Sub-Header Borders
    subHeaderRow.getCell(1).border = { left: { style: 'thick' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    subHeaderRow.getCell(2).border = { bottom: { style: 'thin' }, right: { style: 'thin' }, left: { style: 'thin' } };
    subHeaderRow.getCell(3).border = { right: { style: 'thick' }, bottom: { style: 'thin' }, left: { style: 'thin' } };

    // --- INGREDIENT ROWS ---
    const ingredients = data.calculatedIngredients || [];
    ingredients.forEach((ing) => {
        const row = sheet.addRow([
            ing.name,
            ing.percentage ? Number(ing.percentage) / 100 : 0,
            Number(ing.calculatedGrams) || 0
        ]);
        
        row.eachCell((cell, colNumber) => {
            cell.border = {
                left: colNumber === 1 ? { style: 'thick' } : { style: 'thin' },
                right: colNumber === 3 ? { style: 'thick' } : { style: 'thin' },
                bottom: { style: 'thin' },
                top: { style: 'thin' }
            };

            // Fragrance Oil Highlighting (Green cell)
            if (ing.name.toLowerCase().includes('fragrance') && colNumber === 3) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA9D08E' } };
            }
        });

        row.getCell(2).numFmt = '0.00%';
        row.getCell(3).numFmt = '0.00';
    });

    // --- TOTAL ROW ---
    const totalRow = sheet.addRow(['Total', 1, Number(totalGrams)]);
    totalRow.font = { bold: true };
    totalRow.eachCell((cell, colNumber) => {
        cell.border = {
            left: colNumber === 1 ? { style: 'thick' } : { style: 'thin' },
            right: colNumber === 3 ? { style: 'thick' } : { style: 'thin' },
            bottom: { style: 'thick' },
            top: { style: 'thin' }
        };
    });
    totalRow.getCell(2).numFmt = '0.00%';

    // --- GENERATE & SEND ---
    const excelBuffer = await workbook.xlsx.writeBuffer();
    const cleanFileName = projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    
    const mailOptions = {
        from: `"MakeUSA Blending Lab" <${process.env.SMTP_EMAIL}>`,
        to: 'blendingreports@makeit.buzz',
        subject: `Blending Complete - ${type}: ${companyName} ${projectName}`,
        text: `Formula report for ${projectName} attached.`,
        attachments: [{
            filename: `${cleanFileName}_formula.xlsx`,
            content: excelBuffer
        }]
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Email sent successfully for ${projectName}`);
    } catch (error) {
        console.error('Error sending email:', error);
    }
}