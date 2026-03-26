import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase_config';
import {
  collection, onSnapshot, doc, writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import {
  SlidersHorizontal, Plus, Trash2, Search,
  Save, AlertTriangle, CheckCircle, X, Info
} from 'lucide-react';
import { generateId } from './utils/inventoryUtils';

const REASON_CODES = [
  { value: 'CYCLE_COUNT',     label: 'Cycle Count Correction',     color: '#2563eb', bg: '#dbeafe' },
  { value: 'DAMAGED',         label: 'Damaged / Spoiled',           color: '#dc2626', bg: '#fee2e2' },
  { value: 'FOUND',           label: 'Found / Unrecorded Stock',    color: '#16a34a', bg: '#dcfce7' },
  { value: 'RETURN',          label: 'Customer Return',             color: '#d97706', bg: '#fef3c7' },
  { value: 'WRITE_OFF',       label: 'Write-Off / Expiry',          color: '#7c3aed', bg: '#ede9fe' },
  { value: 'VENDOR_SHORTAGE', label: 'Vendor Shortage / Over-ship', color: '#0891b2', bg: '#cffafe' },
  { value: 'OTHER',           label: 'Other (see notes)',           color: '#64748b', bg: '#f1f5f9' },
];

const AdjustmentLine = ({ line, index, items, locations, onChange, onRemove, isOnly }) => {
  const item = items.find(i => i.sku === line.skuInput);
  const currentBinQty = item?.locations?.[line.location] ?? null;

  const newQty = line.mode === 'SET'
    ? Number(line.value)
    : (currentBinQty ?? 0) + Number(line.value || 0);

  const delta = item && line.location && line.value !== ''
    ? newQty - (currentBinQty ?? 0)
    : null;

  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', marginBottom: '12px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 80px 1.5fr 36px', gap: '10px', alignItems: 'center', marginBottom: item && line.location ? '10px' : 0 }}>

        {/* SKU */}
        <div style={{ position: 'relative' }}>
          <Search size={14} color="#94a3b8" style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '10px', pointerEvents: 'none' }} />
          <input
            list="adj-skus"
            required
            placeholder="SKU or Name..."
            value={line.skuInput}
            onChange={e => onChange(index, 'skuInput', e.target.value)}
            style={{ ...s.inp, paddingLeft: '30px' }}
          />
        </div>

        {/* Bin */}
        <input
          list="adj-locations"
          required
          placeholder="Bin location..."
          value={line.location}
          onChange={e => onChange(index, 'location', e.target.value)}
          style={s.inp}
        />

        {/* Mode toggle */}
        <div style={{ display: 'flex', borderRadius: '7px', overflow: 'hidden', border: '1px solid #cbd5e1' }}>
          {['±', '='].map((m, i) => {
            const modeVal = i === 0 ? 'DELTA' : 'SET';
            return (
              <button
                key={m}
                type="button"
                onClick={() => onChange(index, 'mode', modeVal)}
                title={modeVal === 'DELTA' ? 'Add or subtract from current stock' : 'Set stock to exact quantity'}
                style={{
                  flex: 1, border: 'none', padding: '9px 0', cursor: 'pointer', fontSize: '15px', fontWeight: '700',
                  background: line.mode === modeVal ? '#0f172a' : 'white',
                  color: line.mode === modeVal ? 'white' : '#64748b',
                  transition: 'all 0.15s',
                }}
              >
                {m}
              </button>
            );
          })}
        </div>

        {/* Value */}
        <input
          type="number"
          required
          placeholder={line.mode === 'DELTA' ? '+10 or -5' : 'Exact qty'}
          value={line.value}
          onChange={e => onChange(index, 'value', e.target.value)}
          style={{
            ...s.inp,
            color: line.mode === 'DELTA'
              ? (Number(line.value) >= 0 ? '#16a34a' : '#dc2626')
              : '#0f172a',
            fontWeight: '600',
          }}
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

      {/* Live preview row */}
      {item && line.location && line.value !== '' && delta !== null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingTop: '10px', borderTop: '1px dashed #e2e8f0', fontSize: '13px' }}>
          <span style={{ color: '#64748b' }}>
            <strong style={{ color: '#334155' }}>{item.name}</strong> @ {line.location}
          </span>
          <span style={{ color: '#94a3b8' }}>→</span>
          <span style={{ color: '#475569' }}>
            Current: <strong>{currentBinQty ?? 0} {item.uom}</strong>
          </span>
          <span style={{ color: '#94a3b8' }}>→</span>
          <span style={{ fontWeight: '700', color: newQty < 0 ? '#dc2626' : '#0f172a' }}>
            New: {newQty} {item.uom}
          </span>
          <span style={{
            padding: '2px 8px', borderRadius: '5px', fontWeight: '700',
            background: delta > 0 ? '#dcfce7' : delta < 0 ? '#fee2e2' : '#f1f5f9',
            color: delta > 0 ? '#16a34a' : delta < 0 ? '#dc2626' : '#64748b',
          }}>
            {delta > 0 ? `+${delta}` : delta}
          </span>
          {newQty < 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#dc2626', fontWeight: '600' }}>
              <AlertTriangle size={13} /> Would go negative
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default function Adjustments() {
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [lines, setLines] = useState([{ skuInput: '', location: '', mode: 'DELTA', value: '' }]);
  const [reason, setReason] = useState('CYCLE_COUNT');
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

  const addLine = () => setLines([...lines, { skuInput: '', location: '', mode: 'DELTA', value: '' }]);
  const removeLine = (i) => setLines(lines.filter((_, idx) => idx !== i));

  const validate = () => {
    if (!reason) return 'Select a reason code.';
    for (const line of lines) {
      const item = items.find(i => i.sku === line.skuInput);
      if (!item) return `SKU "${line.skuInput}" not found.`;
      if (!line.location.trim()) return 'All lines need a bin location.';
      if (line.value === '' || line.value === null) return 'Enter a quantity for all lines.';
      const currentQty = item.locations?.[line.location] ?? 0;
      const newQty = line.mode === 'SET'
        ? Number(line.value)
        : currentQty + Number(line.value);
      if (newQty < 0) return `Adjustment would put "${line.skuInput}" @ ${line.location} below zero (${newQty}).`;
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) return alert(err);

    const reasonLabel = REASON_CODES.find(r => r.value === reason)?.label || reason;
    const proceed = window.confirm(
      `Log ${lines.length} adjustment(s) with reason: "${reasonLabel}"?\n\nThis will immediately update stock levels.`
    );
    if (!proceed) return;

    setLoading(true);
    try {
      const batch = writeBatch(db);
      const adjId = generateId('ADJ');
      const summary = [];

      lines.forEach(line => {
        const item = items.find(i => i.sku === line.skuInput);
        const currentQty = item.locations?.[line.location] ?? 0;
        const newQty = line.mode === 'SET' ? Number(line.value) : currentQty + Number(line.value);
        const delta = newQty - currentQty;

        batch.set(doc(collection(db, 'inv_transactions')), {
          type: 'ADJUSTMENT',
          adjId,
          reason,
          reasonLabel,
          notes: notes || '',
          itemId: item.id,
          sku: item.sku,
          locationId: line.location,
          qtyChange: delta,
          previousQty: currentQty,
          newQty,
          user: auth.currentUser?.email || 'System',
          timestamp: serverTimestamp(),
        });

        summary.push({ sku: item.sku, name: item.name, location: line.location, delta, newQty, uom: item.uom });
      });

      await batch.commit();
      setSuccess({ adjId, reason: reasonLabel, summary });
      setLines([{ skuInput: '', location: '', mode: 'DELTA', value: '' }]);
      setNotes('');
    } catch (err) {
      alert('Adjustment failed: ' + err.message);
    }
    setLoading(false);
  };

  const hasNegative = lines.some(line => {
    const item = items.find(i => i.sku === line.skuInput);
    if (!item || line.value === '') return false;
    const curr = item.locations?.[line.location] ?? 0;
    const nq = line.mode === 'SET' ? Number(line.value) : curr + Number(line.value);
    return nq < 0;
  });

  const selectedReason = REASON_CODES.find(r => r.value === reason);

  return (
    <div style={{ maxWidth: '1000px' }}>

      {/* Success banner */}
      {success && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '12px', padding: '20px 24px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: '14px' }}>
            <CheckCircle color="#16a34a" size={26} style={{ flexShrink: 0 }} />
            <div>
              <p style={{ margin: '0 0 4px', fontWeight: '700', color: '#166534', fontSize: '15px' }}>
                Adjustment Logged — {success.adjId}
              </p>
              <p style={{ margin: '0 0 10px', color: '#15803d', fontSize: '13px' }}>Reason: {success.reason}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {success.summary.map((l, i) => (
                  <span key={i} style={{
                    padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
                    background: l.delta > 0 ? '#dcfce7' : l.delta < 0 ? '#fee2e2' : '#f1f5f9',
                    color: l.delta > 0 ? '#166534' : l.delta < 0 ? '#991b1b' : '#475569',
                  }}>
                    {l.sku} @ {l.location}: {l.delta > 0 ? '+' : ''}{l.delta} → {l.newQty} {l.uom}
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
          <div style={{ background: '#7c3aed', padding: '8px', borderRadius: '8px', color: 'white', display: 'flex' }}>
            <SlidersHorizontal size={22} />
          </div>
          <div>
            <h2 style={{ margin: 0, color: '#0f172a', fontSize: '20px' }}>Inventory Adjustments</h2>
            <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>Cycle counts, write-offs, corrections, and found stock</p>
          </div>
        </div>

        <datalist id="adj-skus">{items.map(i => <option key={i.id} value={i.sku}>{i.name}</option>)}</datalist>
        <datalist id="adj-locations">{locations.map(l => <option key={l} value={l} />)}</datalist>

        <form onSubmit={handleSubmit}>

          {/* Reason code selector */}
          <div style={{ marginBottom: '24px' }}>
            <label style={s.lbl}>Reason Code *</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {REASON_CODES.map(rc => (
                <button
                  key={rc.value}
                  type="button"
                  onClick={() => setReason(rc.value)}
                  style={{
                    padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                    border: reason === rc.value ? `2px solid ${rc.color}` : '2px solid #e2e8f0',
                    background: reason === rc.value ? rc.bg : 'white',
                    color: reason === rc.value ? rc.color : '#64748b',
                    transition: 'all 0.15s',
                  }}
                >
                  {rc.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mode legend */}
          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', padding: '10px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <Info size={15} color="#64748b" style={{ flexShrink: 0, marginTop: '1px' }} />
            <span style={{ fontSize: '13px', color: '#475569' }}>
              <strong>± mode</strong> adds or subtracts from current stock (e.g. <code style={{ background: '#e2e8f0', padding: '1px 5px', borderRadius: '3px' }}>-3</code> removes 3, <code style={{ background: '#e2e8f0', padding: '1px 5px', borderRadius: '3px' }}>+10</code> adds 10). &nbsp;
              <strong>= mode</strong> sets stock to an exact count (for cycle counts).
            </span>
          </div>

          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 80px 1.5fr 36px', gap: '10px', marginBottom: '8px', paddingLeft: '4px' }}>
            {['SKU / Item', 'Bin Location', 'Mode', 'Qty / Value', ''].map((h, i) => (
              <span key={i} style={s.colHdr}>{h}</span>
            ))}
          </div>

          {lines.map((line, index) => (
            <AdjustmentLine
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
            style={{ background: 'none', border: 'none', color: '#7c3aed', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '14px', marginBottom: '24px' }}
          >
            <Plus size={16} /> Add Another Item
          </button>

          {/* Notes */}
          <div style={{ marginBottom: '24px' }}>
            <label style={s.lbl}>Internal Notes <span style={{ fontWeight: 'normal', color: '#94a3b8' }}>(optional — stored on audit trail)</span></label>
            <textarea
              rows="3"
              placeholder="e.g. Physical count conducted by John on 2024-01-15. Discrepancy found in bin WH1-A12."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              style={{ ...s.inp, resize: 'vertical' }}
            />
          </div>

          {hasNegative && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <AlertTriangle size={18} color="#ef4444" />
              <span style={{ color: '#b91c1c', fontSize: '14px', fontWeight: '600' }}>
                One or more adjustments would result in negative stock. Fix before submitting.
              </span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || hasNegative}
            style={{
              background: hasNegative ? '#94a3b8' : '#7c3aed',
              color: 'white', border: 'none', padding: '14px', width: '100%', borderRadius: '8px',
              fontSize: '15px', fontWeight: '700', cursor: loading || hasNegative ? 'not-allowed' : 'pointer',
              display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px',
              opacity: loading ? 0.7 : 1, transition: 'background 0.2s',
            }}
          >
            <Save size={20} />
            {loading ? 'Saving...' : `Log ${lines.length} Adjustment${lines.length > 1 ? 's' : ''} — ${selectedReason?.label}`}
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
