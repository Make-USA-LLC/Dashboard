import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase_config';
import {
  collection, onSnapshot, doc, writeBatch,
  serverTimestamp, getDoc
} from 'firebase/firestore';
import {
  PackageOpen, Printer, Save, Plus, Trash2,
  Mail, Search, AlertTriangle, CheckCircle, X
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { allocateBins, generateId, injectPrintStyles } from './utils/inventoryUtils';

const Fulfillment = () => {
  const [items, setItems] = useState([]);
  const [clients, setClients] = useState([]);
  const [globalCc, setGlobalCc] = useState([]);

  const [clientId, setClientId] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [shipLines, setShipLines] = useState([{ skuInput: '', qty: '', allocations: [] }]);

  const [weight, setWeight] = useState('');
  const [dims, setDims] = useState('');
  const [palletBreakdown, setPalletBreakdown] = useState('');
  const [instructions, setInstructions] = useState('');
  const [footerNotes, setFooterNotes] = useState('');

  const [loading, setLoading] = useState(false);
  const [successReport, setSuccessReport] = useState(null);

  useEffect(() => {
    injectPrintStyles();

    const u1 = onSnapshot(collection(db, 'inv_items'), snap => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const u2 = onSnapshot(collection(db, 'inv_clients'), snap => setClients(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

    getDoc(doc(db, 'config', 'inv_settings')).then(snap => {
      if (snap.exists()) setGlobalCc(snap.data().alwaysCc || []);
    });

    return () => { u1(); u2(); };
  }, []);

  const addLine = () => setShipLines([...shipLines, { skuInput: '', qty: '', allocations: [] }]);
  const removeLine = (i) => setShipLines(shipLines.filter((_, idx) => idx !== i));

  const handleLineChange = (index, field, value) => {
    const newLines = [...shipLines];
    newLines[index][field] = value;
    newLines[index].allocations = allocateBins(newLines[index].skuInput, newLines[index].qty, items);
    setShipLines(newLines);
  };

  // Recalculate allocations when items load
  useEffect(() => {
    if (items.length === 0) return;
    setShipLines(prev => prev.map(line => ({
      ...line,
      allocations: allocateBins(line.skuInput, line.qty, items),
    })));
  }, [items]);

  // Validation
  const validateLines = () => {
    if (!clientId) return 'Please select a client.';
    if (!orderNumber.trim()) return 'Please enter a reference / order number.';
    for (const line of shipLines) {
      if (!line.skuInput.trim()) return 'Fill in all SKU fields.';
      if (!items.find(i => i.sku === line.skuInput)) return `SKU "${line.skuInput}" not found in item master.`;
      if (!line.qty || Number(line.qty) <= 0) return 'All quantities must be greater than 0.';
      if (line.allocations.some(a => a.error)) return `Insufficient stock for "${line.skuInput}". Adjust quantity or check stock levels.`;
    }
    return null;
  };

  const generateShipmentPDF = (plNumber, clientName, populatedLines) => {
    const pdf = new jsPDF();

    pdf.setFontSize(20);
    pdf.text('make', 14, 20);
    pdf.setFontSize(10);
    pdf.text('One Stop Operational Shop', 14, 26);
    pdf.text('Make USA LLC\n340 13th Street\nCarlstadt NJ 07072\nUS', 14, 32);

    pdf.text('BILL TO / SHIP TO', 14, 55);
    pdf.setFont(undefined, 'bold');
    pdf.text(clientName, 14, 61);
    pdf.setFont(undefined, 'normal');

    pdf.text('Packing Slip', 150, 20);
    pdf.text(`DATE: ${new Date().toLocaleDateString()}`, 150, 26);
    pdf.text(`ORDER #: ${orderNumber || plNumber}`, 150, 32);

    const tableBody = populatedLines.map(l => [l.sku, `${l.name}\nBins: ${l.binString}`, l.qty.toString()]);
    pdf.autoTable({
      startY: 70,
      head: [['Item', 'Description / Bins', 'Shipped']],
      body: tableBody,
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42] },
    });

    let finalY = pdf.lastAutoTable.finalY + 10;

    if (palletBreakdown) {
      pdf.setFont(undefined, 'bold');
      pdf.text(palletBreakdown, 14, finalY);
      finalY += 8;
      pdf.setFont(undefined, 'normal');
    }
    if (weight || dims) {
      pdf.text(`Weight: ${weight || 'N/A'}     Dimensions: ${dims || 'N/A'}`, 14, finalY);
      finalY += 10;
    }
    if (instructions) {
      const split = pdf.splitTextToSize(instructions, 180);
      pdf.text(split, 14, finalY);
      finalY += (split.length * 5) + 5;
    }
    if (footerNotes) {
      pdf.setFont(undefined, 'italic');
      const split = pdf.splitTextToSize(`*${footerNotes}*`, 180);
      pdf.text(split, 14, finalY);
    }

    return pdf.output('datauristring').split(',')[1];
  };

  const handleShip = async (e) => {
    e.preventDefault();

    const validationError = validateLines();
    if (validationError) return alert(validationError);

    const clientData = clients.find(c => c.id === clientId);

    // Always confirm before emailing on fulfillment
    const proceed = window.confirm(
      `This will deduct stock and email the packing list PDF to ${clientData.name}.\n\nProceed?`
    );
    if (!proceed) return;

    setLoading(true);
    try {
      const batch = writeBatch(db);
      const plNumber = generateId('PL');
      const populatedLines = [];

      let htmlEmailBody = `<p>Please see attached packing slip.</p>
        <p><strong>Order #:</strong> ${orderNumber}</p><br/>`;

      if (palletBreakdown) htmlEmailBody += `<p><strong>${palletBreakdown}</strong></p>`;
      if (weight || dims) htmlEmailBody += `<p>Weight: ${weight}<br/>Dimensions: ${dims}</p>`;
      if (instructions) htmlEmailBody += `<p>${instructions.replace(/\n/g, '<br/>')}</p>`;
      if (footerNotes) htmlEmailBody += `<p><em>*${footerNotes}*</em></p>`;
      htmlEmailBody += `<hr/><p>Make USA LLC Operations</p>`;

      shipLines.forEach(line => {
        const itemData = items.find(i => i.sku === line.skuInput);
        const binString = line.allocations.map(a => `${a.bin} (${a.qty})`).join(', ');

        line.allocations.forEach(alloc => {
          batch.set(doc(collection(db, 'inv_transactions')), {
            type: 'FULFILLMENT',
            plNumber,
            client: clientData.name,
            orderNumber,
            itemId: itemData.id,
            sku: itemData.sku,
            locationId: alloc.bin,
            qtyChange: -Math.abs(Number(alloc.qty)),
            user: auth.currentUser?.email || 'System',
            timestamp: serverTimestamp(),
          });
        });

        populatedLines.push({ sku: itemData.sku, name: itemData.name, qty: line.qty, binString });
      });

      const base64PDF = generateShipmentPDF(plNumber, clientData.name, populatedLines);
      batch.set(doc(collection(db, 'inv_emails')), {
        to: clientData.emails || [],
        cc: globalCc || [],
        subject: `Packing List & Shipment Details - ${clientData.name}`,
        htmlBody: htmlEmailBody,
        attachments: [{
          content: base64PDF,
          filename: `Shipment_${orderNumber || plNumber}.pdf`,
          type: 'application/pdf',
          disposition: 'attachment',
        }],
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      await batch.commit();

      setSuccessReport({ plNumber, clientName: clientData.name, orderNumber, populatedLines });

      // Reset form
      setClientId(''); setOrderNumber(''); setWeight(''); setDims('');
      setPalletBreakdown(''); setInstructions(''); setFooterNotes('');
      setShipLines([{ skuInput: '', qty: '', allocations: [] }]);
    } catch (error) {
      alert('Fulfillment failed: ' + error.message);
    }
    setLoading(false);
  };

  const hasInsufficientStock = shipLines.some(l => l.allocations.some(a => a.error));

  return (
    <div style={{ maxWidth: '1000px' }}>

      {/* ---- Success Banner ---- */}
      {successReport && (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '12px', padding: '20px 24px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: '14px' }}>
            <CheckCircle color="#ea580c" size={28} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <p style={{ margin: '0 0 4px', fontWeight: '700', color: '#9a3412', fontSize: '16px' }}>
                Shipment Processed — {successReport.plNumber}
              </p>
              <p style={{ margin: '0 0 10px', color: '#c2410c', fontSize: '14px' }}>
                {successReport.clientName} · Order {successReport.orderNumber} · PDF emailed ✓
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {successReport.populatedLines.map((l, i) => (
                  <span key={i} style={{ background: '#ffedd5', color: '#9a3412', padding: '4px 10px', borderRadius: '6px', fontSize: '13px' }}>
                    {l.sku} × {l.qty}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button onClick={() => window.print()} style={styles.btnOutline}><Printer size={16} /> Print</button>
            <button onClick={() => setSuccessReport(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}><X size={18} /></button>
          </div>
        </div>
      )}

      {/* ---- Main Form ---- */}
      <div style={styles.card} className="no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '25px', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px' }}>
          <div style={{ background: '#ea580c', padding: '8px', borderRadius: '8px', color: 'white', display: 'flex' }}>
            <PackageOpen size={22} />
          </div>
          <h2 style={{ margin: 0, color: '#0f172a', fontSize: '20px' }}>Outbound Fulfillment & Packing Lists</h2>
        </div>

        <datalist id="item-skus-ful">{items.map(i => <option key={i.id} value={i.sku}>{i.name}</option>)}</datalist>

        <form onSubmit={handleShip}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
            <div>
              <label style={styles.lbl}>Client *</label>
              <select required value={clientId} onChange={e => setClientId(e.target.value)} style={styles.inp}>
                <option value="">Select Client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={styles.lbl}>Reference / Order # *</label>
              <input required value={orderNumber} onChange={e => setOrderNumber(e.target.value)} style={styles.inp} placeholder="e.g. SO-2024-001" />
            </div>
          </div>

          {/* Line Items */}
          <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
            <h4 style={{ margin: '0 0 14px', color: '#334155', fontSize: '15px' }}>
              Items to Ship
              <span style={{ fontWeight: 'normal', color: '#94a3b8', fontSize: '13px', marginLeft: '8px' }}>Bins auto-allocated from highest stock</span>
            </h4>

            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 36px', gap: '10px', marginBottom: '8px', paddingLeft: '4px' }}>
              <span style={styles.colHdr}>SKU / Item</span>
              <span style={styles.colHdr}>Qty to Ship</span>
              <span />
            </div>

            {shipLines.map((line, index) => (
              <div key={index} style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: index < shipLines.length - 1 ? '1px dashed #e2e8f0' : 'none' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 36px', gap: '10px', marginBottom: '8px', alignItems: 'center' }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={15} color="#94a3b8" style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '10px', pointerEvents: 'none' }} />
                    <input
                      list="item-skus-ful"
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
                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    disabled={shipLines.length === 1}
                    style={{ ...styles.iconBtnRed, opacity: shipLines.length === 1 ? 0.3 : 1 }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                {/* Allocation chips */}
                {line.allocations.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', paddingLeft: '4px' }}>
                    {line.allocations.map((alloc, i) => (
                      <span
                        key={i}
                        style={{
                          fontSize: '12px', padding: '3px 9px', borderRadius: '5px',
                          background: alloc.error ? '#fee2e2' : '#e0f2fe',
                          color: alloc.error ? '#ef4444' : '#0369a1',
                          display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '500',
                        }}
                      >
                        {alloc.error && <AlertTriangle size={11} />}
                        Pull <strong style={{ marginLeft: '2px' }}>{alloc.qty}</strong>&nbsp;from&nbsp;<strong>{alloc.bin}</strong>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={addLine}
              style={{ background: 'none', border: 'none', color: '#ea580c', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '14px', marginTop: '4px' }}
            >
              <Plus size={16} /> Add Line
            </button>
          </div>

          {/* Packing Details */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <div>
              <label style={styles.lbl}>Pallet / Case Breakdown</label>
              <input placeholder="e.g. 12@204 Total 2,448 units" value={palletBreakdown} onChange={e => setPalletBreakdown(e.target.value)} style={styles.inp} />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <label style={styles.lbl}>Total Weight</label>
                <input placeholder="e.g. 395 lbs" value={weight} onChange={e => setWeight(e.target.value)} style={styles.inp} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={styles.lbl}>Dimensions</label>
                <input placeholder="e.g. 40×48×24" value={dims} onChange={e => setDims(e.target.value)} style={styles.inp} />
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={styles.lbl}>Processing Instructions <span style={{ fontWeight: 'normal', color: '#94a3b8' }}>(prints on PL & email body)</span></label>
            <textarea
              rows="5"
              placeholder="1. Remove 10ml bottle from poly bag&#10;2. Fill bottle with bulk..."
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              style={{ ...styles.inp, resize: 'vertical' }}
            />
          </div>

          <div style={{ marginBottom: '28px' }}>
            <label style={styles.lbl}>Footer Notes <span style={{ fontWeight: 'normal', color: '#94a3b8' }}>(italicized on PDF)</span></label>
            <input placeholder="e.g. 12 master cases and dunnage were used" value={footerNotes} onChange={e => setFooterNotes(e.target.value)} style={styles.inp} />
          </div>

          {/* Stock warning */}
          {hasInsufficientStock && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <AlertTriangle size={18} color="#ef4444" />
              <span style={{ color: '#b91c1c', fontSize: '14px', fontWeight: '500' }}>
                One or more lines have insufficient stock. Resolve before submitting.
              </span>
            </div>
          )}

          <button
            disabled={loading || hasInsufficientStock}
            type="submit"
            style={{
              background: hasInsufficientStock ? '#94a3b8' : '#ea580c',
              color: 'white', border: 'none', padding: '15px', width: '100%',
              borderRadius: '8px', fontSize: '15px', fontWeight: '700',
              cursor: loading || hasInsufficientStock ? 'not-allowed' : 'pointer',
              display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px',
              opacity: loading ? 0.7 : 1, transition: 'background 0.2s',
            }}
          >
            <Mail size={20} />
            {loading ? 'Processing...' : 'Deduct Stock, Generate PDF & Email Client'}
          </button>
        </form>
      </div>

      {/* Printable packing list */}
      {successReport && (
        <div className="printable-packing-list" style={{ display: 'none' }}>
          <h2>Packing List — {successReport.plNumber}</h2>
          <p>Client: {successReport.clientName} | Order: {successReport.orderNumber} | Date: {new Date().toLocaleDateString()}</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px' }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th style={{ padding: '8px', border: '1px solid #ccc', textAlign: 'left' }}>SKU</th>
                <th style={{ padding: '8px', border: '1px solid #ccc', textAlign: 'left' }}>Item</th>
                <th style={{ padding: '8px', border: '1px solid #ccc', textAlign: 'left' }}>Qty</th>
                <th style={{ padding: '8px', border: '1px solid #ccc', textAlign: 'left' }}>Bins</th>
              </tr>
            </thead>
            <tbody>
              {successReport.populatedLines.map((l, i) => (
                <tr key={i}>
                  <td style={{ padding: '8px', border: '1px solid #ccc' }}>{l.sku}</td>
                  <td style={{ padding: '8px', border: '1px solid #ccc' }}>{l.name}</td>
                  <td style={{ padding: '8px', border: '1px solid #ccc' }}>{l.qty}</td>
                  <td style={{ padding: '8px', border: '1px solid #ccc' }}>{l.binString}</td>
                </tr>
              ))}
            </tbody>
          </table>
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

export default Fulfillment;
