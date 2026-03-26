import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase_config';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { ClipboardList, Search, Filter, Download, X, ChevronDown, ChevronUp, ArrowRightLeft, MoveRight } from 'lucide-react';

const TYPE_META = {
  RECEIVING:         { label: 'Receiving',       color: '#16a34a', bg: '#dcfce7' },
  FULFILLMENT:       { label: 'Fulfillment',      color: '#ea580c', bg: '#ffedd5' },
  ADJUSTMENT:        { label: 'Adjustment',       color: '#7c3aed', bg: '#ede9fe' },
  TRANSFER_OUT:      { label: 'Transfer Out',     color: '#0891b2', bg: '#cffafe' },
  TRANSFER_IN:       { label: 'Transfer In',      color: '#0891b2', bg: '#e0f7fa' },
  BUILD_CONSUMPTION: { label: 'Mfg. Consumed',    color: '#dc2626', bg: '#fee2e2' },
  BUILD_PRODUCTION:  { label: 'Mfg. Produced',    color: '#2563eb', bg: '#dbeafe' },
};

const TYPE_OPTIONS = ['ALL', ...Object.keys(TYPE_META)];

const formatDate = (ts) => {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

const toCSV = (rows) => {
  const headers = ['Timestamp', 'Type', 'SKU', 'Location', 'Qty Change', 'Reference', 'User', 'Notes'];
  const lines = [headers.join(',')];
  rows.forEach(r => {
    const ref = r.plNumber || r.reportId || r.adjId || r.xfrId || r.buildId || '';
    const note = r.notes || r.reasonLabel || '';
    lines.push([
      formatDate(r.timestamp),
      r.type,
      r.sku,
      r.locationId,
      r.qtyChange,
      ref,
      r.user,
      `"${note.replace(/"/g, '""')}"`,
    ].join(','));
  });
  return lines.join('\n');
};

export default function TransactionHistory() {
  const [transactions, setTransactions]   = useState([]);
  const [loadingData, setLoadingData]     = useState(true);
  const [searchTerm, setSearchTerm]       = useState('');
  const [typeFilter, setTypeFilter]       = useState('ALL');
  const [dateFrom, setDateFrom]           = useState('');
  const [dateTo, setDateTo]               = useState('');
  const [expanded, setExpanded]           = useState(null);
  const [showFilters, setShowFilters]     = useState(false);
  const [pageSize, setPageSize]           = useState(100);

  useEffect(() => {
    const q = query(collection(db, 'inv_transactions'), orderBy('timestamp', 'desc'), limit(1000));
    const unsub = onSnapshot(q, snap => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingData(false);
    });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      if (typeFilter !== 'ALL' && t.type !== typeFilter) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const ref = (t.plNumber || t.reportId || t.adjId || t.xfrId || t.buildId || '').toLowerCase();
        if (
          !t.sku?.toLowerCase().includes(term) &&
          !t.locationId?.toLowerCase().includes(term) &&
          !t.user?.toLowerCase().includes(term) &&
          !ref.includes(term) &&
          !(t.client || '').toLowerCase().includes(term) &&
          !(t.reasonLabel || '').toLowerCase().includes(term)
        ) return false;
      }
      if (dateFrom) {
        const ts = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
        if (ts < new Date(dateFrom)) return false;
      }
      if (dateTo) {
        const ts = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
        const endOfDay = new Date(dateTo);
        endOfDay.setHours(23, 59, 59);
        if (ts > endOfDay) return false;
      }
      return true;
    });
  }, [transactions, typeFilter, searchTerm, dateFrom, dateTo]);

  const displayed = filtered.slice(0, pageSize);

  const handleExport = () => {
    const csv = toCSV(filtered);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transaction_history_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setSearchTerm(''); setTypeFilter('ALL'); setDateFrom(''); setDateTo('');
  };
  const hasActiveFilters = searchTerm || typeFilter !== 'ALL' || dateFrom || dateTo;

  // Summary stats
  const stats = useMemo(() => {
    const counts = {};
    Object.keys(TYPE_META).forEach(k => counts[k] = 0);
    filtered.forEach(t => { if (counts[t.type] !== undefined) counts[t.type]++; });
    return counts;
  }, [filtered]);

  return (
    <div style={{ maxWidth: '1200px' }}>
      <div style={s.card}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: '#0f172a', padding: '8px', borderRadius: '8px', color: 'white', display: 'flex' }}>
              <ClipboardList size={22} />
            </div>
            <div>
              <h2 style={{ margin: 0, color: '#0f172a', fontSize: '20px' }}>Transaction History</h2>
              <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>
                {loadingData ? 'Loading...' : `${filtered.length.toLocaleString()} transaction${filtered.length !== 1 ? 's' : ''}${hasActiveFilters ? ' (filtered)' : ''}`}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setShowFilters(f => !f)}
              style={{ ...s.btnOutline, background: showFilters ? '#f1f5f9' : 'white' }}
            >
              <Filter size={15} /> Filters {hasActiveFilters && <span style={{ background: '#2563eb', color: 'white', borderRadius: '10px', fontSize: '11px', padding: '1px 6px' }}>{[searchTerm, typeFilter !== 'ALL', dateFrom, dateTo].filter(Boolean).length}</span>}
            </button>
            <button onClick={handleExport} style={s.btnOutline} title="Export filtered results to CSV">
              <Download size={15} /> Export CSV
            </button>
          </div>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div style={{ background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '16px 20px', marginBottom: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '14px', alignItems: 'end' }}>
              <div>
                <label style={s.lbl}>Search (SKU, bin, user, reference)</label>
                <div style={{ position: 'relative' }}>
                  <Search size={14} color="#94a3b8" style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '10px' }} />
                  <input
                    placeholder="e.g. SKU-001 or WH1-A12..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    style={{ ...s.inp, paddingLeft: '30px' }}
                  />
                </div>
              </div>
              <div>
                <label style={s.lbl}>Transaction Type</label>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={s.inp}>
                  {TYPE_OPTIONS.map(t => (
                    <option key={t} value={t}>{t === 'ALL' ? 'All Types' : TYPE_META[t]?.label || t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={s.lbl}>From Date</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={s.inp} />
              </div>
              <div>
                <label style={s.lbl}>To Date</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={s.inp} />
              </div>
            </div>
            {hasActiveFilters && (
              <button onClick={clearFilters} style={{ marginTop: '12px', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: '600', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <X size={14} /> Clear all filters
              </button>
            )}
          </div>
        )}

        {/* Type breakdown chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
          {Object.entries(stats).filter(([, count]) => count > 0).map(([type, count]) => {
            const meta = TYPE_META[type];
            return (
              <button
                key={type}
                onClick={() => setTypeFilter(typeFilter === type ? 'ALL' : type)}
                style={{
                  padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600',
                  border: `2px solid ${typeFilter === type ? meta.color : 'transparent'}`,
                  background: meta.bg, color: meta.color, cursor: 'pointer', transition: 'border 0.15s',
                }}
              >
                {meta.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Table */}
        {loadingData ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>Loading transactions...</div>
        ) : displayed.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
            {hasActiveFilters ? 'No transactions match your filters.' : 'No transactions recorded yet.'}
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Date & Time', 'Type', 'SKU', 'Location', 'Qty Change', 'Reference', 'User', ''].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(t => {
                    const meta = TYPE_META[t.type] || { label: t.type, color: '#64748b', bg: '#f1f5f9' };
                    const ref = t.plNumber || t.reportId || t.adjId || t.xfrId || t.buildId || '—';
                    const isExpanded = expanded === t.id;

                    return (
                      <React.Fragment key={t.id}>
                        <tr
                          style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: isExpanded ? '#f8fafc' : 'white' }}
                          onClick={() => setExpanded(isExpanded ? null : t.id)}
                        >
                          <td style={s.td}>{formatDate(t.timestamp)}</td>
                          <td style={s.td}>
                            <span style={{ background: meta.bg, color: meta.color, padding: '3px 9px', borderRadius: '5px', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                              {meta.label}
                            </span>
                          </td>
                          <td style={{ ...s.td, fontWeight: '700', color: '#0f172a' }}>{t.sku}</td>
                          <td style={{ ...s.td, fontFamily: 'monospace', fontSize: '13px' }}>{t.locationId}</td>
                          <td style={{ ...s.td, fontWeight: '700', color: t.qtyChange > 0 ? '#16a34a' : '#dc2626' }}>
                            {t.qtyChange > 0 ? `+${t.qtyChange}` : t.qtyChange}
                          </td>
                          <td style={{ ...s.td, fontFamily: 'monospace', fontSize: '12px', color: '#64748b' }}>{ref}</td>
                          <td style={{ ...s.td, fontSize: '13px', color: '#64748b' }}>{t.user}</td>
                          <td style={{ ...s.td, color: '#94a3b8' }}>
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </td>
                        </tr>

                        {/* Expanded detail row */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={8} style={{ background: '#f8fafc', padding: '14px 20px', borderBottom: '1px solid #e2e8f0' }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', fontSize: '13px', color: '#475569' }}>
                                {t.previousQty !== undefined && (
                                  <div><span style={s.detailLbl}>Previous Qty</span><strong>{t.previousQty}</strong></div>
                                )}
                                {t.newQty !== undefined && (
                                  <div><span style={s.detailLbl}>New Qty</span><strong>{t.newQty}</strong></div>
                                )}
                                {t.reasonLabel && (
                                  <div><span style={s.detailLbl}>Reason</span><strong>{t.reasonLabel}</strong></div>
                                )}
                                {t.client && (
                                  <div><span style={s.detailLbl}>Client</span><strong>{t.client}</strong></div>
                                )}
                                {t.vendor && (
                                  <div><span style={s.detailLbl}>Vendor</span><strong>{t.vendor}</strong></div>
                                )}
                                {t.poNumber && (
                                  <div><span style={s.detailLbl}>PO #</span><strong>{t.poNumber}</strong></div>
                                )}
                                {t.orderNumber && (
                                  <div><span style={s.detailLbl}>Order #</span><strong>{t.orderNumber}</strong></div>
                                )}
                                {(t.destinationId || t.sourceId) && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={s.detailLbl}>Transfer</span>
                                    <strong>{t.sourceId || t.locationId}</strong>
                                    <MoveRight size={13} color="#94a3b8" />
                                    <strong>{t.destinationId || t.locationId}</strong>
                                  </div>
                                )}
                                {t.notes && (
                                  <div style={{ flexBasis: '100%' }}><span style={s.detailLbl}>Notes</span>{t.notes}</div>
                                )}
                                <div><span style={s.detailLbl}>Transaction ID</span><code style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>{t.id}</code></div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Load more */}
            {filtered.length > pageSize && (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <button
                  onClick={() => setPageSize(p => p + 100)}
                  style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', padding: '10px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}
                >
                  Load more ({filtered.length - pageSize} remaining)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const s = {
  card: { background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', padding: '30px' },
  lbl: { display: 'block', fontSize: '12px', fontWeight: '700', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' },
  inp: { padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%', boxSizing: 'border-box', fontSize: '14px', outline: 'none' },
  th: { padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap', borderBottom: '2px solid #e2e8f0' },
  td: { padding: '13px 16px', color: '#334155', verticalAlign: 'middle' },
  detailLbl: { display: 'block', fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '2px' },
  btnOutline: { background: 'white', color: '#334155', border: '1px solid #cbd5e1', padding: '9px 14px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '600' },
};
