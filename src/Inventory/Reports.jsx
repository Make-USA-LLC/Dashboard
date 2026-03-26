import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase_config';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import {
  BarChart3, TrendingDown, TrendingUp, PackageSearch,
  Download, RefreshCw, AlertTriangle, ArrowDownToLine,
  PackageOpen, Wrench, SlidersHorizontal, ArrowRightLeft
} from 'lucide-react';

/* ── tiny bar component (no recharts dependency) ─────────────────── */
const MiniBar = ({ value, max, color }) => (
  <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden', flex: 1 }}>
    <div style={{ height: '100%', width: `${max ? Math.min(100, (value / max) * 100) : 0}%`, background: color, borderRadius: '4px', transition: 'width 0.4s ease' }} />
  </div>
);

const StatCard = ({ icon: Icon, label, value, sub, color, bg }) => (
  <div style={{ background: 'white', borderRadius: '12px', padding: '20px 24px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
    <div style={{ background: bg, padding: '10px', borderRadius: '10px', flexShrink: 0 }}>
      <Icon size={22} color={color} />
    </div>
    <div>
      <p style={{ margin: 0, fontSize: '13px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</p>
      <p style={{ margin: '4px 0 2px', fontSize: '26px', fontWeight: '800', color: '#0f172a', lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>{sub}</p>}
    </div>
  </div>
);

const SectionHeader = ({ title, sub }) => (
  <div style={{ marginBottom: '16px' }}>
    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>{title}</h3>
    {sub && <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#64748b' }}>{sub}</p>}
  </div>
);

const formatDate = (ts) => {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const toCSV = (headers, rows) => {
  return [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
};

const downloadCSV = (filename, csv) => {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

export default function Reports() {
  const [items, setItems] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [lastRefresh, setLastRefresh] = useState(new Date());

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'inv_items'), snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const q = query(collection(db, 'inv_transactions'), orderBy('timestamp', 'desc'));
    const u2 = onSnapshot(q, snap => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
      setLastRefresh(new Date());
    });
    return () => { u1(); u2(); };
  }, []);

  /* ── Derived metrics ─────────────────────────── */
  const lowStockItems = useMemo(() =>
    items
      .filter(i => (i.totalQuantity || 0) <= (i.reorderPoint || 0))
      .sort((a, b) => (a.totalQuantity || 0) - (b.totalQuantity || 0)),
    [items]
  );

  const totalItems = items.length;
  const totalUnits = useMemo(() => items.reduce((sum, i) => sum + (i.totalQuantity || 0), 0), [items]);

  // Top movers: most units fulfilled in last 30 days
  const thirtyDaysAgo = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; }, []);

  const topMovers = useMemo(() => {
    const counts = {};
    transactions
      .filter(t => {
        const ts = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp || 0);
        return t.type === 'FULFILLMENT' && ts >= thirtyDaysAgo;
      })
      .forEach(t => {
        counts[t.sku] = (counts[t.sku] || 0) + Math.abs(t.qtyChange);
      });
    return Object.entries(counts)
      .map(([sku, qty]) => ({ sku, qty, name: items.find(i => i.sku === sku)?.name || sku }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);
  }, [transactions, items, thirtyDaysAgo]);

  const maxMover = topMovers[0]?.qty || 1;

  // Receiving summary: last 30 days
  const recentReceiving = useMemo(() => {
    const map = {};
    transactions
      .filter(t => {
        const ts = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp || 0);
        return t.type === 'RECEIVING' && ts >= thirtyDaysAgo;
      })
      .forEach(t => {
        const key = t.vendor || 'Unknown';
        map[key] = (map[key] || 0) + (t.qtyChange || 0);
      });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [transactions, thirtyDaysAgo]);

  // Fulfillment by client: last 30 days
  const fulfillmentByClient = useMemo(() => {
    const map = {};
    transactions
      .filter(t => {
        const ts = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp || 0);
        return t.type === 'FULFILLMENT' && ts >= thirtyDaysAgo;
      })
      .forEach(t => {
        const key = t.client || 'Unknown';
        map[key] = (map[key] || 0) + Math.abs(t.qtyChange || 0);
      });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [transactions, thirtyDaysAgo]);

  // Adjustment summary
  const adjustmentSummary = useMemo(() => {
    const byReason = {};
    transactions.filter(t => t.type === 'ADJUSTMENT').forEach(t => {
      const r = t.reasonLabel || t.reason || 'Other';
      if (!byReason[r]) byReason[r] = { count: 0, netDelta: 0 };
      byReason[r].count++;
      byReason[r].netDelta += (t.qtyChange || 0);
    });
    return Object.entries(byReason).sort((a, b) => b[1].count - a[1].count);
  }, [transactions]);

  // Activity last 30 days by type
  const activityCounts = useMemo(() => {
    const counts = { RECEIVING: 0, FULFILLMENT: 0, ADJUSTMENT: 0, TRANSFER_OUT: 0, BUILD_CONSUMPTION: 0 };
    transactions.forEach(t => {
      const ts = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp || 0);
      if (ts >= thirtyDaysAgo && counts[t.type] !== undefined) counts[t.type]++;
    });
    return counts;
  }, [transactions, thirtyDaysAgo]);

  /* ── Tab config ─────────────────────────── */
  const TABS = [
    { id: 'overview',    label: 'Overview' },
    { id: 'stock',       label: 'Stock Levels' },
    { id: 'movement',    label: 'Movement' },
    { id: 'adjustments', label: 'Adjustments' },
  ];

  /* ── Export handlers ─────────────────────── */
  const exportLowStock = () => {
    const csv = toCSV(
      ['SKU', 'Name', 'Type', 'UoM', 'Current Stock', 'Reorder Point', 'Shortfall'],
      lowStockItems.map(i => [i.sku, i.name, i.type, i.uom, i.totalQuantity || 0, i.reorderPoint || 0, Math.max(0, (i.reorderPoint || 0) - (i.totalQuantity || 0))])
    );
    downloadCSV('low_stock_report.csv', csv);
  };

  const exportStockLevels = () => {
    const csv = toCSV(
      ['SKU', 'Name', 'Type', 'UoM', 'Total Qty', 'Reorder Point', 'Status'],
      items.map(i => [i.sku, i.name, i.type, i.uom, i.totalQuantity || 0, i.reorderPoint || 0, (i.totalQuantity || 0) <= (i.reorderPoint || 0) ? 'LOW' : 'OK'])
    );
    downloadCSV('stock_levels.csv', csv);
  };

  const exportTopMovers = () => {
    const csv = toCSV(['SKU', 'Name', 'Units Fulfilled (30d)'], topMovers.map(m => [m.sku, m.name, m.qty]));
    downloadCSV('top_movers_30d.csv', csv);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px', gap: '12px', color: '#94a3b8' }}>
        <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} /> Loading reports...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: '#0f172a', padding: '8px', borderRadius: '8px', color: 'white', display: 'flex' }}>
            <BarChart3 size={22} />
          </div>
          <div>
            <h2 style={{ margin: 0, color: '#0f172a', fontSize: '20px' }}>Reports & Analytics</h2>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '12px' }}>
              Last updated {lastRefresh.toLocaleTimeString()}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '2px', background: '#f1f5f9', padding: '4px', borderRadius: '10px', marginBottom: '24px', width: 'fit-content' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 20px', borderRadius: '7px', border: 'none', cursor: 'pointer',
              fontSize: '14px', fontWeight: '600', transition: 'all 0.15s',
              background: activeTab === tab.id ? 'white' : 'transparent',
              color: activeTab === tab.id ? '#0f172a' : '#64748b',
              boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ OVERVIEW TAB ═══ */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            <StatCard icon={PackageSearch} label="Total SKUs" value={totalItems} sub="in item master" color="#2563eb" bg="#dbeafe" />
            <StatCard icon={TrendingUp} label="Total Units on Hand" value={totalUnits.toLocaleString()} sub="across all bins" color="#16a34a" bg="#dcfce7" />
            <StatCard icon={AlertTriangle} label="Low Stock SKUs" value={lowStockItems.length} sub="at or below reorder point" color="#dc2626" bg="#fee2e2" />
            <StatCard icon={BarChart3} label="Transactions (30d)" value={Object.values(activityCounts).reduce((a, b) => a + b, 0)} sub="all types" color="#7c3aed" bg="#ede9fe" />
          </div>

          {/* Activity breakdown */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e2e8f0' }}>
            <SectionHeader title="Activity Last 30 Days" sub="Transaction counts by type" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px' }}>
              {[
                { key: 'RECEIVING',        label: 'Receiving',      icon: ArrowDownToLine, color: '#16a34a', bg: '#dcfce7' },
                { key: 'FULFILLMENT',      label: 'Fulfillments',   icon: PackageOpen,     color: '#ea580c', bg: '#ffedd5' },
                { key: 'ADJUSTMENT',       label: 'Adjustments',    icon: SlidersHorizontal, color: '#7c3aed', bg: '#ede9fe' },
                { key: 'TRANSFER_OUT',     label: 'Transfers',      icon: ArrowRightLeft,  color: '#0891b2', bg: '#cffafe' },
                { key: 'BUILD_CONSUMPTION', label: 'Mfg. Runs',     icon: Wrench,          color: '#2563eb', bg: '#dbeafe' },
              ].map(({ key, label, icon: Icon, color, bg }) => (
                <div key={key} style={{ textAlign: 'center', padding: '16px', background: bg, borderRadius: '10px' }}>
                  <Icon size={20} color={color} style={{ marginBottom: '8px' }} />
                  <p style={{ margin: '0 0 4px', fontSize: '24px', fontWeight: '800', color: '#0f172a' }}>{activityCounts[key]}</p>
                  <p style={{ margin: 0, fontSize: '12px', fontWeight: '600', color }}>{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Low stock preview */}
          {lowStockItems.length > 0 && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #fca5a5' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <SectionHeader title={`⚠ ${lowStockItems.length} Items at or Below Reorder Point`} />
                <button onClick={() => setActiveTab('stock')} style={s.btnOutline}>View All</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {lowStockItems.slice(0, 8).map(i => (
                  <div key={i.id} style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '8px 14px' }}>
                    <span style={{ fontWeight: '700', color: '#991b1b', fontSize: '13px' }}>{i.sku}</span>
                    <span style={{ color: '#dc2626', fontSize: '12px', marginLeft: '8px' }}>{i.totalQuantity || 0}/{i.reorderPoint} {i.uom}</span>
                  </div>
                ))}
                {lowStockItems.length > 8 && <span style={{ color: '#94a3b8', fontSize: '13px', padding: '8px' }}>+{lowStockItems.length - 8} more</span>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ STOCK LEVELS TAB ═══ */}
      {activeTab === 'stock' && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <SectionHeader title="Current Stock Levels" sub={`All ${totalItems} SKUs`} />
            <button onClick={exportStockLevels} style={s.btnOutline}><Download size={14} /> Export CSV</button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['SKU', 'Name', 'Type', 'On Hand', 'Reorder Point', 'Status', 'Bin Breakdown'].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...items].sort((a, b) => {
                // Low stock first
                const aLow = (a.totalQuantity || 0) <= (a.reorderPoint || 0);
                const bLow = (b.totalQuantity || 0) <= (b.reorderPoint || 0);
                if (aLow && !bLow) return -1;
                if (!aLow && bLow) return 1;
                return a.sku.localeCompare(b.sku);
              }).map(item => {
                const isLow = (item.totalQuantity || 0) <= (item.reorderPoint || 0);
                const bins = Object.entries(item.locations || {}).filter(([, q]) => q > 0);
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', background: isLow ? '#fffbfb' : 'white' }}>
                    <td style={{ ...s.td, fontWeight: '700' }}>{item.sku}</td>
                    <td style={s.td}>{item.name}</td>
                    <td style={s.td}>
                      <span style={{ fontSize: '12px', padding: '2px 7px', borderRadius: '4px', background: item.type === 'Finished Good' ? '#dcfce7' : '#e0f2fe', color: item.type === 'Finished Good' ? '#166534' : '#0369a1' }}>
                        {item.type}
                      </span>
                    </td>
                    <td style={{ ...s.td, fontWeight: '700', fontSize: '16px', color: isLow ? '#dc2626' : '#16a34a' }}>
                      {item.totalQuantity || 0} <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#94a3b8' }}>{item.uom}</span>
                    </td>
                    <td style={{ ...s.td, color: '#64748b' }}>{item.reorderPoint || 0}</td>
                    <td style={s.td}>
                      {isLow ? (
                        <span style={{ background: '#fee2e2', color: '#dc2626', fontSize: '12px', fontWeight: '700', padding: '3px 8px', borderRadius: '5px', display: 'flex', alignItems: 'center', gap: '4px', width: 'fit-content' }}>
                          <AlertTriangle size={11} /> LOW
                        </span>
                      ) : (
                        <span style={{ background: '#dcfce7', color: '#16a34a', fontSize: '12px', fontWeight: '700', padding: '3px 8px', borderRadius: '5px' }}>OK</span>
                      )}
                    </td>
                    <td style={s.td}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                        {bins.map(([bin, qty]) => (
                          <span key={bin} style={{ background: '#f1f5f9', color: '#475569', fontSize: '11px', padding: '2px 7px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                            {bin}: {qty}
                          </span>
                        ))}
                        {bins.length === 0 && <span style={{ color: '#94a3b8', fontSize: '12px' }}>No stock</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ MOVEMENT TAB ═══ */}
      {activeTab === 'movement' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Top movers */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <SectionHeader title="Top 10 Outbound Movers" sub="Units fulfilled in last 30 days" />
              <button onClick={exportTopMovers} style={s.btnOutline}><Download size={14} /> Export</button>
            </div>
            {topMovers.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: '14px' }}>No fulfillment activity in the last 30 days.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {topMovers.map((m, i) => (
                  <div key={m.sku} style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <span style={{ width: '20px', textAlign: 'right', color: '#94a3b8', fontSize: '13px', fontWeight: '700' }}>{i + 1}</span>
                    <div style={{ width: '90px', flexShrink: 0 }}>
                      <span style={{ fontWeight: '700', fontSize: '13px', color: '#0f172a' }}>{m.sku}</span>
                    </div>
                    <span style={{ flex: 1, fontSize: '13px', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                    <MiniBar value={m.qty} max={maxMover} color="#ea580c" />
                    <span style={{ width: '60px', textAlign: 'right', fontWeight: '700', color: '#ea580c', fontSize: '14px', flexShrink: 0 }}>{m.qty.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Receiving by vendor */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e2e8f0' }}>
              <SectionHeader title="Inbound by Vendor" sub="Units received last 30 days" />
              {recentReceiving.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: '14px' }}>No receiving activity.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {recentReceiving.map(([vendor, qty]) => (
                    <div key={vendor} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ width: '120px', fontSize: '13px', fontWeight: '600', color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{vendor}</span>
                      <MiniBar value={qty} max={recentReceiving[0]?.[1] || 1} color="#16a34a" />
                      <span style={{ width: '50px', textAlign: 'right', fontWeight: '700', color: '#16a34a', fontSize: '13px', flexShrink: 0 }}>{qty}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Fulfillment by client */}
            <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e2e8f0' }}>
              <SectionHeader title="Outbound by Client" sub="Units shipped last 30 days" />
              {fulfillmentByClient.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: '14px' }}>No fulfillment activity.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {fulfillmentByClient.map(([client, qty]) => (
                    <div key={client} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ width: '120px', fontSize: '13px', fontWeight: '600', color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{client}</span>
                      <MiniBar value={qty} max={fulfillmentByClient[0]?.[1] || 1} color="#ea580c" />
                      <span style={{ width: '50px', textAlign: 'right', fontWeight: '700', color: '#ea580c', fontSize: '13px', flexShrink: 0 }}>{qty}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ ADJUSTMENTS TAB ═══ */}
      {activeTab === 'adjustments' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e2e8f0' }}>
            <SectionHeader title="Adjustment Summary by Reason" sub="All time" />
            {adjustmentSummary.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: '14px' }}>No adjustments recorded yet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Reason Code', 'Occurrences', 'Net Qty Change', 'Direction'].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {adjustmentSummary.map(([reason, data]) => (
                    <tr key={reason} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ ...s.td, fontWeight: '600' }}>{reason}</td>
                      <td style={s.td}>{data.count}</td>
                      <td style={{ ...s.td, fontWeight: '700', color: data.netDelta >= 0 ? '#16a34a' : '#dc2626' }}>
                        {data.netDelta > 0 ? '+' : ''}{data.netDelta}
                      </td>
                      <td style={s.td}>
                        {data.netDelta > 0
                          ? <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#16a34a', fontWeight: '600', fontSize: '13px' }}><TrendingUp size={15} /> Net positive</span>
                          : data.netDelta < 0
                          ? <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#dc2626', fontWeight: '600', fontSize: '13px' }}><TrendingDown size={15} /> Net negative</span>
                          : <span style={{ color: '#94a3b8', fontSize: '13px' }}>Neutral</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Recent adjustment transactions */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e2e8f0' }}>
            <SectionHeader title="Recent Adjustments" sub="Last 50 adjustment transactions" />
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Date', 'SKU', 'Bin', 'Δ Qty', 'Reason', 'User', 'Notes'].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions
                  .filter(t => t.type === 'ADJUSTMENT')
                  .slice(0, 50)
                  .map(t => (
                    <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ ...s.td, fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>{formatDate(t.timestamp)}</td>
                      <td style={{ ...s.td, fontWeight: '700' }}>{t.sku}</td>
                      <td style={{ ...s.td, fontSize: '12px', fontFamily: 'monospace' }}>{t.locationId}</td>
                      <td style={{ ...s.td, fontWeight: '700', color: t.qtyChange >= 0 ? '#16a34a' : '#dc2626' }}>
                        {t.qtyChange > 0 ? '+' : ''}{t.qtyChange}
                      </td>
                      <td style={{ ...s.td, fontSize: '12px' }}>{t.reasonLabel || t.reason || '—'}</td>
                      <td style={{ ...s.td, fontSize: '12px', color: '#64748b' }}>{t.user}</td>
                      <td style={{ ...s.td, fontSize: '12px', color: '#64748b', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.notes || '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}

const s = {
  th: { padding: '11px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' },
  td: { padding: '12px 16px', color: '#334155' },
  btnOutline: { background: 'white', color: '#334155', border: '1px solid #cbd5e1', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '600' },
};
