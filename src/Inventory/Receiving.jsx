import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from '../firebase_config';
import {
  collection, onSnapshot, doc, writeBatch,
  serverTimestamp, getDoc
} from 'firebase/firestore';
import { ArrowDownToLine, Save, Plus, Trash2, Search, Mail, X, Printer, CheckCircle } from 'lucide-react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { generateId, injectPrintStyles } from './utils/inventoryUtils';

const Receiving = () => {
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [clients, setClients] = useState([]);
  const [globalCc, setGlobalCc] = useState([]);

  const [selectedClientId, setSelectedClientId] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [emailClient, setEmailClient] = useState(false);
  const [receivingNotes, setReceivingNotes] = useState('');
  const [receivedLines, setReceivedLines] = useState([{ skuInput: '', qty: '', location: '' }]);
  const [loading, setLoading] = useState(false);
  const [successReport, setSuccessReport] = useState(null); // for post-submit receipt preview

  const printRef = useRef(null);

  useEffect(() => {
    injectPrintStyles(); // Safely inject print CSS once

    const u1 = onSnapshot(collection(db, 'inv_items'), snap => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const u2 = onSnapshot(collection(db, 'inv_locations'), snap => setLocations(snap.docs.map(d => d.data().fullName)));
    const u3 = onSnapshot(collection(db, 'inv_clients'), snap => setClients(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

    getDoc(doc(db, 'config', 'inv_settings')).then(snap => {
      if (snap.exists()) setGlobalCc(snap.data().alwaysCc || []);
    });

    return () => { u1(); u2(); u3(); };
  }, []);

  const addLine = () => setReceivedLines([...receivedLines, { skuInput: '', qty: '', location: '' }]);
  const removeLine = (i) => setReceivedLines(receivedLines.filter((_, idx) => idx !== i));

  const handleLineChange = (index, field, value) => {
    const newLines = [...receivedLines];
    newLines[index][field] = value;
    setReceivedLines(newLines);
  };

  // Validate all lines before submitting
  const validateLines = () => {
    if (!selectedClientId) return 'Please select a client.';
    if (!poNumber.trim()) return 'Please enter a PO number.';
    for (const line of receivedLines) {
      if (!line.skuInput.trim()) return 'Fill in all SKU fields.';
      if (!items.find(i => i.sku === line.skuInput)) return `SKU "${line.skuInput}" not found in item master.`;
      if (!line.qty || Number(line.qty) <= 0) return 'All quantities must be greater than 0.';
      if (!line.location.trim()) return 'All lines need a destination bin.';
    }
    return null;
  };

  const generateReceiptPDF = (reportId, populatedLines, clientName) => {
    const pdf = new jsPDF();
    pdf.setFontSize(20);
    pdf.text('make', 14, 20);
    pdf.setFontSize(10);
    pdf.text('One Stop Operational Shop', 14, 26);
    pdf.text('Make USA LLC\n340 13th Street\nCarlstadt NJ 07072\nUS', 14, 32);

    pdf.text('Item Receipt', 150, 20);
    pdf.text(`DATE: ${new Date().toLocaleDateString()}`, 150, 26);
    pdf.text(`PO #: ${poNumber || reportId}`, 150, 32);
    pdf.text(`CLIENT: ${clientName}`, 150, 38);

    const tableBody = populatedLines.map(l => [l.sku, `${l.name}\nBin: ${l.location}`, l.qty.toString()]);
    pdf.autoTable({
      startY: 58,
      head: [['Item', 'Description / Bin', 'Qty Received']],
      body: tableBody,
      theme: 'striped',
      headStyles: { fillColor: [22, 163, 74] },
    });

    let finalY = pdf.lastAutoTable.finalY + 10;
    if (receivingNotes) {
      pdf.setFont(undefined, 'normal');
      const split = pdf.splitTextToSize(receivingNotes, 180);
      pdf.text(split, 14, finalY);
    }

    return pdf.output('datauristring').split(',')[1];
  };

  const handleReceive = async (e) => {
    e.preventDefault();

    const validationError = validateLines();
    if (validationError) return alert(validationError);

    const clientData = clients.find(c => c.id === selectedClientId);

    // Email confirmation prompt
    if (emailClient) {
      const proceed = window.confirm(
        `This will instantly email the Receiving Report PDF to ${clientData.name} and all internal CC recipients.\n\nProceed?`
      );
      if (!proceed) return;
    }

    setLoading(true);
    try {
      const batch = writeBatch(db);
      const reportId = generateId('REC');
      const populatedLines = [];

      let htmlEmailBody = `<p><strong>Receiving Report: ${reportId}</strong></p>
        <p><strong>Client:</strong> ${clientData.name}<br/><strong>PO:</strong> ${poNumber}</p>`;
      if (receivingNotes) htmlEmailBody += `<p>${receivingNotes.replace(/\n/g, '<br/>')}</p>`;
      htmlEmailBody += `<hr/><p>Make USA LLC Operations</p>`;

      receivedLines.forEach(line => {
        const itemData = items.find(i => i.sku === line.skuInput);
        batch.set(doc(collection(db, 'inv_transactions')), {
          type: 'RECEIVING',
          reportId,
          vendor: clientData.name, // Maintained field for backwards compatibility in ledger
          client: clientData.name,
          clientId: clientData.id,
          poNumber,
          itemId: itemData.id,
          sku: itemData.sku,
          locationId: line.location,
          qtyChange: Number(line.qty),
          user: auth.currentUser?.email || 'System',
          timestamp: serverTimestamp(),
        });
        populatedLines.push({ sku: itemData.sku, name: itemData.name, qty: line.qty, location: line.location });
      });

      if (emailClient) {
        const base64PDF = generateReceiptPDF(reportId, populatedLines, clientData.name);
        batch.set(doc(collection(db, 'inv_emails')), {
          to: clientData.emails || [],
          cc: globalCc || [],
          subject: `Inventory Received for ${clientData.name} - ${poNumber}`,
          htmlBody: htmlEmailBody,
          attachments: [{
            content: base64PDF,
            filename: `ItemReceipt_${poNumber || reportId}.pdf`,
            type: 'application/pdf',
            disposition: 'attachment',
          }],
          status: 'pending',
          createdAt: serverTimestamp(),
        });
      }

      await batch.commit();

      // Show success summary instead of alert
      setSuccessReport({ reportId, populatedLines, clientName: clientData.name, poNumber, notifiedClient: emailClient ? clientData.name : null });

      // Reset form
      setSelectedClientId(''); setPoNumber(''); setEmailClient(false); setReceivingNotes('');
      setReceivedLines([{ skuInput: '', qty: '', location: '' }]);
    } catch (error) {
      alert('Receiving failed: ' + error.message);
    }
    setLoading(false);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{ maxWidth: '1000px' }}>

      {/* ---- Success Banner ---- */}
      {successReport && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '12px', padding: '20px 24px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: '14px' }}>
            <CheckCircle color="#16a34a" size={28} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <p style={{ margin: '0 0 4px', fontWeight: '700', color: '#166534', fontSize: '16px' }}>
                Receipt Logged — {successReport.reportId}
              </p>
              <p style={{ margin: '0 0 10px', color: '#15803d', fontSize: '14px' }}>
                {successReport.clientName} · PO {successReport.poNumber}
                {successReport.notifiedClient && ` · Email sent to ${successReport.notifiedClient}`}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {successReport.populatedLines.map((l, i) => (
                  <span key={i} style={{ background: '#dcfce7', color: '#166534', padding: '4px 10px', borderRadius: '6px', fontSize: '13px' }}>
                    {l.sku} × {l.qty} → {l.location}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button onClick={handlePrint} style={styles.btnOutline}><Printer size={16} /> Print</button>
            <button onClick={() => setSuccessReport(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}><X size={18} /></button>
          </div>
        </div>
      )}

      {/* ---- Main Form ---- */}
      <div style={styles.card} className="no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '25px', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px' }}>
          <div style={{ background: '#16a34a', padding: '8px', borderRadius: '8px', color: 'white', display: 'flex' }}>
            <ArrowDownToLine size={22} />
          </div>
          <h2 style={{ margin: 0, color: '#0f172a', fontSize: '20px' }}>Receive Inventory</h2>
        </div>

        <datalist id="item-skus-rec">{items.map(i => <option key={i.id} value={i.sku}>{i.name}</option>)}</datalist>

        <form onSubmit={handleReceive}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>

            {/* Client */}
            <div>
              <label style={styles.lbl}>Client *</label>
              <select required value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)} style={styles.inp}>
                <option value="">Select Client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* PO Number */}
            <div>
              <label style={styles.lbl}>PO Number *</label>
              <input required value={poNumber} onChange={e => setPoNumber(e.target.value)} style={styles.inp} placeholder="e.g. PO-2024-001" />
            </div>

          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={styles.lbl}>Receiving Notes & Breakdown</label>
            <textarea
              rows="3"
              placeholder="e.g. 5 pallets @ 160kg each, total 800kg. 1 damaged box noted."
              value={receivingNotes}
              onChange={e => setReceivingNotes(e.target.value)}
              style={{ ...styles.inp, resize: 'vertical' }}
            />
          </div>

          {/* Line Items */}
          <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
            <h4 style={{ margin: '0 0 16px', color: '#334155', fontSize: '15px' }}>Items Received</h4>

            {/* Column Headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 40px', gap: '10px', marginBottom: '8px', paddingLeft: '4px' }}>
              <span style={styles.colHdr}>SKU / Item</span>
              <span style={styles.colHdr}>Qty Received</span>
              <span style={styles.colHdr}>Destination Bin</span>
              <span />
            </div>

            {receivedLines.map((line, index) => (
              <div key={index} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 40px', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={15} color="#94a3b8" style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '10px', pointerEvents: 'none' }} />
                  <input
                    list="item-skus-rec"
                    required
                    placeholder="Type SKU or Name..."
                    value={line.skuInput}
                    onChange={e => handleLineChange(index, 'skuInput', e.target.value)}
                    style={{ ...styles.inp, paddingLeft: '32px' }}
                  />
                </div>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="0"
                  value={line.qty}
                  onChange={e => handleLineChange(index, 'qty', e.target.value)}
                  style={styles.inp}
                />
                
                {/* Changed from text input with datalist to a true select dropdown */}
                <select
                  required
                  value={line.location}
                  onChange={e => handleLineChange(index, 'location', e.target.value)}
                  style={styles.inp}
                >
                  <option value="">Select bin...</option>
                  {locations.map(loc => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => removeLine(index)}
                  disabled={receivedLines.length === 1}
                  style={{ ...styles.iconBtnRed, opacity: receivedLines.length === 1 ? 0.3 : 1 }}
                  title="Remove line"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={addLine}
              style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '6px', fontSize: '14px' }}
            >
              <Plus size={16} /> Add Line
            </button>
          </div>

          {/* Email Checkbox */}
          <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              id="emailClient"
              checked={emailClient}
              onChange={e => setEmailClient(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <label htmlFor="emailClient" style={{ fontSize: '15px', color: '#334155', cursor: 'pointer', fontWeight: '500' }}>
              Email receipt to client upon save
            </label>
          </div>

          {/* Submit */}
          <button
            disabled={loading}
            type="submit"
            style={{
              background: emailClient ? '#ea580c' : '#16a34a',
              color: 'white', border: 'none', padding: '14px', width: '100%',
              borderRadius: '8px', fontSize: '15px', fontWeight: '700', cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px',
              opacity: loading ? 0.7 : 1, transition: 'background 0.2s',
            }}
          >
            {emailClient ? <Mail size={20} /> : <Save size={20} />}
            {loading
              ? 'Processing...'
              : emailClient
                ? `Log Ledger & Email ${clients.find(c => c.id === selectedClientId)?.name || 'Client'}`
                : 'Log to Ledger Only'
            }
          </button>
        </form>
      </div>

      {/* ---- Printable Receipt (hidden until print) ---- */}
      {successReport && (
        <div className="printable-packing-list" ref={printRef} style={{ display: 'none' }}>
          <h2>Item Receipt — {successReport.reportId}</h2>
          <p>Client: {successReport.clientName} | PO: {successReport.poNumber} | Date: {new Date().toLocaleDateString()}</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px' }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th style={{ padding: '8px', border: '1px solid #ccc', textAlign: 'left' }}>SKU</th>
                <th style={{ padding: '8px', border: '1px solid #ccc', textAlign: 'left' }}>Item</th>
                <th style={{ padding: '8px', border: '1px solid #ccc', textAlign: 'left' }}>Qty</th>
                <th style={{ padding: '8px', border: '1px solid #ccc', textAlign: 'left' }}>Bin</th>
              </tr>
            </thead>
            <tbody>
              {successReport.populatedLines.map((l, i) => (
                <tr key={i}>
                  <td style={{ padding: '8px', border: '1px solid #ccc' }}>{l.sku}</td>
                  <td style={{ padding: '8px', border: '1px solid #ccc' }}>{l.name}</td>
                  <td style={{ padding: '8px', border: '1px solid #ccc' }}>{l.qty}</td>
                  <td style={{ padding: '8px', border: '1px solid #ccc' }}>{l.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {receivingNotes && <p style={{ marginTop: '20px' }}>{receivingNotes}</p>}
        </div>
      )}
    </div>
  );
};

const styles = {
  card: { background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', padding: '30px' },
  lbl: { display: 'block', fontSize: '12px', fontWeight: '700', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' },
  inp: { padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%', boxSizing: 'border-box', fontSize: '14px', outline: 'none' },
  colHdr: { fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' },
  iconBtnRed: { background: '#fef2f2', color: '#ef4444', border: 'none', padding: '9px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' },
  btnOutline: { background: 'white', color: '#334155', border: '1px solid #cbd5e1', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '600' },
};

export default Receiving;