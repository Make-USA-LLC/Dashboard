import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase_config';
import {
  collection, onSnapshot, doc, writeBatch, serverTimestamp
} from 'firebase/firestore';
import {
  ArrowRightLeft, Plus, Trash2, Search,
  Save, AlertTriangle, CheckCircle, X, MoveRight
} from 'lucide-react';
import { generateId } from './utils/inventoryUtils';

const TransferLine = ({ line, index, items, locations, onChange, onRemove, isOnly }) => {
  const item = items.find(i => i.sku === line.skuInput);
  const fromQty = item?.locations?.[line.from] ?? null;
  const toQty   = item?.locations?.[line.to]   ?? null;
  const qty     = Number(line.qty) || 0;

  const insufficient = fromQty !== null && qty > fromQty;
  const sameLocation = line.from && line.to && line.from === line.to;

  return (
    <div style={{ background: 'white', border: `1px solid ${insufficient || sameLocation ? '#fca5a5' : '#e2e8f0'}`, borderRadius: '10px', padding: '16px', marginBottom: '12px', transition: 'border-color 0.2s' }}>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 40px 1.5fr 1fr 36px', gap: '10px', alignItems: 'center' }}>

        {/* SKU */}
        <div style={{ position: 'relative' }}>
          <Search size={14} color="#94a3b8" style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '10px', pointerEvents: 'none' }} />
          <input
            list="xfr-skus"
            required
            placeholder="SKU or Name..."
            value={line.skuInput}
            onChange={e => onChange(index, 'skuInput', e.target.value)}
            style={{ ...s.inp, paddingLeft: '30px' }}
          />
        </div>

        {/* From bin */}
        <input
          list="xfr-locations"
          required
          placeholder="From bin..."
          value={line.from}
          onChange={e => onChange(index, 'from', e.target.value)}
          style={{ ...s.inp, borderColor: sameLocation ? '#fca5a5' : '#cbd5e1' }}
        />

        {/* Arrow */}
        <div style={{ display: 'flex', justifyContent: 'center', color: '#94a3b8' }}>
          <MoveRight size={18} />
        </div>

        {/* To bin */}
        <input
          list="xfr-locations"
          required
          placeholder="To bin..."
          value={line.to}
          onChange={e => onChange(index, 'to', e.target.value)}
          style={{ ...s.inp, borderColor: sameLocation ? '#fca5a5' : '#cbd5e1' }}
        />

        {/* Qty */}
        <input
          type="number"
          required
          min="1"
          placeholder="Qty"
          value={line.qty}
          onChange={e => onChange(index, 'qty', e.target.value)}
          style={{ ...s.inp, borderColor: insufficient ? '#fca5a5' : '#cbd5e1', fontWeight: '600' }}
        />

        {/* Remove */}
        <button
          type="button"
          onClick={() => onRemove(index)}
          disabled={isOnly}
          style={{ ...s.iconBtnRed, opacity: isOnly ? 0.25 : 1 }}
        >
          <Trash2 size={15} />
        </button>
      </div>

      {/* Live preview */}
      {item && line.from && line.to && qty > 0 && (
        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', fontSize: '13px' }}>
          <span style={{ fontWeight: '600', color: '#334155' }}>{item.name}</span>

          {/* FROM preview */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ background: '#f1f5f9', padding: '3px 8px', borderRadius: '5px', color: '#475569' }}>{line.from}</span>
            <span style={{ color: '#94a3b8', fontSize: '12px' }}>
              {fromQty ?? '?'} → <strong style={{ color: insufficient ? '#dc2626' : '#0f172a' }}>{fromQty !== null ? fromQty - qty : '?'}</strong>
            </span>
          </div>

          <MoveRight size={14} color="#94a3b8" />

          {/* TO preview */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ background: '#f1f5f9', padding: '3px 8px', borderRadius: '5px', color: '#475569' }}>{line.to}</span>
            <span style={{ color: '#94a3b8', fontSize: '12px' }}>
              {toQty ?? 0} → <strong style={{ color: '#16a34a' }}>{(toQty ?? 0) + qty}</strong>
            </span>
          </div>

          {insufficient && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#dc2626', fontWeight: '600', fontSize: '12px' }}>
              <AlertTriangle size={13} /> Only {fromQty} available
            </span>
          )}
          {sameLocation && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#dc2626', fontWeight: '600', fontSize: '12px' }}>
              <AlertTriangle size={13} /> From and To cannot be the same bin
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default function StockTransfer() {
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [lines, setLines] = useState([{ skuInput: '', from: '', to: '', qty: '' }]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'inv_items'), snap => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const u2 = onSnapshot(collection(db, 'inv_locations'), snap => setLocations(snap.docs.map(d => d.data().fullName)));
    return () => { u1(); u2(); };
  }, []);

  const handleChange = (index, field, value) => {
    const next = [...lines];
    next[index] = { ...next[index], [field]: value };
    setLines(next);
  };

  const addLine = () => setLines([...lines, { skuInput: '', from: '', to: '', qty: '' }]);
  const removeLine = (i) => setLines(lines.filter((_, idx) => idx !== i));

  const validate = () => {
    for (const line of lines) {
      const item = items.find(i => i.sku === line.skuInput);
      if (!item) return `SKU "${line.skuInput}" not found.`;
      if (!line.from.trim()) return 'Fill in all "From" locations.';
      if (!line.to.trim()) return 'Fill in all "To" locations.';
      if (line.from === line.to) return `From and To cannot be the same bin for "${line.skuInput}".`;
      const qty = Number(line.qty);
      if (!qty || qty <= 0) return 'All quantities must be greater than 0.';
      const fromQty = item.locations?.[line.from] ?? 0;
      if (qty > fromQty) return `Insufficient stock for "${line.skuInput}" in ${line.from} (have ${fromQty}, need ${qty}).`;
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) return alert(err);

    const proceed = window.confirm(
      `Transfer ${lines.length} line(s) of stock?\n\nThis will immediately update bin quantities.`
    );
    if (!proceed) return;

    setLoading(true);
    try {
      const batch = writeBatch(db);
      const xfrId = generateId('XFR');
      const summary = [];

      lines.forEach(line => {
        const item = items.find(i => i.sku === line.skuInput);
        const qty = Number(line.qty);
        const fromQty = item.locations?.[line.from] ?? 0;
        const toQty   = item.locations?.[line.to]   ?? 0;

        // Deduct from source
        batch.set(doc(collection(db, 'inv_transactions')), {
          type: 'TRANSFER_OUT',
          xfrId,
          notes: notes || '',
          itemId: item.id,
          sku: item.sku,
          locationId: line.from,
          destinationId: line.to,
          qtyChange: -qty,
          previousQty: fromQty,
          newQty: fromQty - qty,
          user: auth.currentUser?.email || 'System',
          timestamp: serverTimestamp(),
        });

        // Add to destination
        batch.set(doc(collection(db, 'inv_transactions')), {
          type: 'TRANSFER_IN',
          xfrId,
          notes: notes || '',
          itemId: item.id,
          sku: item.sku,
          locationId: line.to,
          sourceId: line.from,
          qtyChange: qty,
          previousQty: toQty,
          newQty: toQty + qty,
          user: auth.currentUser?.email || 'System',
          timestamp: serverTimestamp(),
        });

        summary.push({ sku: item.sku, name: item.name, qty, from: line.from, to: line.to, uom: item.uom });
      });

      await batch.commit();
      setSuccess({ xfrId, summary });
      setLines([{ skuInput: '', from: '', to: '', qty: '' }]);
      setNotes('');
    } catch (err) {
      alert('Transfer failed: ' + err.message);
    }
    setLoading(false);
  };

  const hasErrors = lines.some(line => {
    const item = items.find(i => i.sku === line.skuInput);
    if (!item || !line.qty) return false;
    const fromQty = item.locations?.[line.from] ?? 0;
    return Number(line.qty) > fromQty || line.from === line.to;
  });

  return (
    <div style={{ maxWidth: '1000px' }}>

      {/* Success banner */}
      {success && (
        <div style={{ background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: '12px', padding: '20px 24px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: '14px' }}>
            <CheckCircle color="#2563eb" size={26} style={{ flexShrink: 0 }} />
            <div>
              <p style={{ margin: '0 0 4px', fontWeight: '700', color: '#1e40af', fontSize: '15px' }}>
                Transfer Complete — {success.xfrId}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                {success.summary.map((l, i) => (
                  <span key={i} style={{ background: '#dbeafe', color: '#1e40af', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {l.sku} × {l.qty} {l.uom}:&nbsp;<em>{l.from}</em>&nbsp;<MoveRight size={11} />&nbsp;<em>{l.to}</em>
                  </span>
                ))}
              </div>
            </div>
          </div>
          <button onClick={() => setSuccess(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}><X size={18} /></button>
        </div>
      )}

      <div style={s.card}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px' }}>
          <div style={{ background: '#0891b2', padding: '8px', borderRadius: '8px', color: 'white', display: 'flex' }}>
            <ArrowRightLeft size={22} />
          </div>
          <div>
            <h2 style={{ margin: 0, color: '#0f172a', fontSize: '20px' }}>Stock Transfer</h2>
            <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>Move inventory between bins or warehouses</p>
          </div>
        </div>

        <datalist id="xfr-skus">{items.map(i => <option key={i.id} value={i.sku}>{i.name}</option>)}</datalist>
        <datalist id="xfr-locations">{locations.map(l => <option key={l} value={l} />)}</datalist>

        <form onSubmit={handleSubmit}>

          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 40px 1.5fr 1fr 36px', gap: '10px', marginBottom: '8px', paddingLeft: '4px' }}>
            {['SKU / Item', 'From Bin', '', 'To Bin', 'Qty', ''].map((h, i) => (
              <span key={i} style={s.colHdr}>{h}</span>
            ))}
          </div>

          {lines.map((line, index) => (
            <TransferLine
              key={index}
              line={line}
              index={index}
              items={items}
              locations={locations}
              onChange={handleChange}
              onRemove={removeLine}
              isOnly={lines.length === 1}
            />
          ))}

          <button
            type="button"
            onClick={addLine}
            style={{ background: 'none', border: 'none', color: '#0891b2', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '14px', marginBottom: '24px' }}
          >
            <Plus size={16} /> Add Another Item
          </button>

          {/* Notes */}
          <div style={{ marginBottom: '24px' }}>
            <label style={s.lbl}>Transfer Notes <span style={{ fontWeight: 'normal', color: '#94a3b8' }}>(optional)</span></label>
            <input
              placeholder="e.g. Moving bulk to forward pick face for next shipment"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              style={s.inp}
            />
          </div>

          {hasErrors && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <AlertTriangle size={18} color="#ef4444" />
              <span style={{ color: '#b91c1c', fontSize: '14px', fontWeight: '600' }}>
                One or more lines have errors. Check stock levels and bin selections.
              </span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || hasErrors}
            style={{
              background: hasErrors ? '#94a3b8' : '#0891b2',
              color: 'white', border: 'none', padding: '14px', width: '100%', borderRadius: '8px',
              fontSize: '15px', fontWeight: '700', cursor: loading || hasErrors ? 'not-allowed' : 'pointer',
              display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px',
              opacity: loading ? 0.7 : 1, transition: 'background 0.2s',
            }}
          >
            <ArrowRightLeft size={20} />
            {loading ? 'Processing...' : `Execute ${lines.length} Transfer${lines.length > 1 ? 's' : ''}`}
          </button>
        </form>
      </div>
    </div>
  );
}

const s = {
  card: { background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', padding: '30px' },
  lbl: { display: 'block', fontSize: '12px', fontWeight: '700', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.4px' },
  inp: { padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%', boxSizing: 'border-box', fontSize: '14px', outline: 'none' },
  colHdr: { fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' },
  iconBtnRed: { background: '#fef2f2', color: '#ef4444', border: 'none', padding: '9px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' },
};
