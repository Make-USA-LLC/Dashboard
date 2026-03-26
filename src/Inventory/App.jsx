import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { useRole } from '../hooks/useRole';
import { db } from '../firebase_config';
import { doc, getDoc } from 'firebase/firestore';
import {
  Package, MapPin, Wrench, Boxes,
  ArrowDownToLine, PackageOpen, Users, Map,
  ShieldAlert, SlidersHorizontal, ArrowRightLeft,
  ClipboardList, BarChart3
} from 'lucide-react';
import Loader from '../components/Loader';

import ItemMaster        from './ItemMaster';
import StockLedger       from './StockLedger';
import Receiving         from './Receiving';
import Fulfillment       from './Fulfillment';
import BuildEngine       from './BuildEngine';
import Locations         from './Locations';
import Clients           from './Clients';
import Admin             from './Admin';
import Adjustments       from './Adjustments';
import StockTransfer     from './StockTransfer';
import TransactionHistory from './TransactionHistory';
import Reports           from './Reports';

const InventoryApp = () => {
  const location = useLocation();
  const { roleData, loading: roleLoading } = useRole();

  const [perms, setPerms]               = useState(null);
  const [permsLoading, setPermsLoading] = useState(true);

  const myRoleName = roleData?.inventory || 'Viewer';
  const isMaster   = roleData?.master === true;
  const isReadOnly = roleData?.readOnly === true;

  useEffect(() => {
    if (isMaster) {
      setPerms({
        items:    { view: true, edit: true },
        stock:    { view: true, edit: false },
        receive:  { view: true, edit: true },
        builds:   { view: true, edit: true },
        fulfill:  { view: true, edit: true },
        locations:{ view: true, edit: true },
        clients:  { view: true, edit: true },
        admin:    { view: true, edit: true },
        adjust:   { view: true, edit: true },
        transfer: { view: true, edit: true },
        history:  { view: true, edit: false },
        reports:  { view: true, edit: false },
      });
      setPermsLoading(false);
      return;
    }

    if (!myRoleName) { setPermsLoading(false); return; }

    getDoc(doc(db, 'inv_roles', myRoleName)).then(snap => {
      if (snap.exists()) {
        // Merge stored perms — default new modules to false if not yet set
        const stored = snap.data();
        setPerms({
          adjust:   { view: false, edit: false },
          transfer: { view: false, edit: false },
          history:  { view: false, edit: false },
          reports:  { view: false, edit: false },
          ...stored,
        });
      } else {
        const isMgr = myRoleName === 'Manager' || myRoleName === 'Admin';
        const isAdm = myRoleName === 'Admin';
        setPerms({
          items:    { view: true,  edit: isMgr },
          stock:    { view: true,  edit: false },
          receive:  { view: isMgr, edit: isMgr },
          builds:   { view: isMgr, edit: isMgr },
          fulfill:  { view: isMgr, edit: isMgr },
          locations:{ view: isAdm, edit: isAdm },
          clients:  { view: isAdm, edit: isAdm },
          admin:    { view: isAdm, edit: isAdm },
          adjust:   { view: isMgr, edit: isMgr },
          transfer: { view: isMgr, edit: isMgr },
          history:  { view: isMgr, edit: false },
          reports:  { view: isMgr, edit: false },
        });
      }
      setPermsLoading(false);
    });
  }, [myRoleName, isMaster]);

  const navItemStyle = (path) => ({
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '10px 14px', borderRadius: '8px',
    textDecoration: 'none', fontWeight: '500', fontSize: '14px',
    background: location.pathname.startsWith(path) ? '#dbeafe' : 'transparent',
    color: location.pathname.startsWith(path) ? '#2563eb' : '#475569',
    transition: 'all 0.15s', width: '100%', boxSizing: 'border-box',
  });

  if (roleLoading || permsLoading) return <Loader message="Loading ERP Permissions..." />;

  const can = (module, action) =>
    isReadOnly
      ? action === 'view' && perms?.[module]?.view
      : perms?.[module]?.[action];

  const NavSection = ({ label, children }) => (
    <>
      <p style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', margin: '18px 0 5px 10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</p>
      {children}
    </>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'row', height: 'calc(100vh - 60px)', background: '#f8fafc', overflow: 'hidden' }}>

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <div style={{ width: '240px', minWidth: '240px', height: '100%', background: 'white', borderRight: '1px solid #e2e8f0', padding: '16px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', overflowY: 'auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ background: '#2563eb', padding: '7px', borderRadius: '8px', color: 'white', display: 'flex' }}><Boxes size={22} /></div>
          <div>
            <h2 style={{ margin: 0, fontSize: '15px', color: '#0f172a', fontWeight: '700' }}>Inventory ERP</h2>
            <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.4px' }}>
              {isReadOnly ? 'Read-Only' : myRoleName}
            </span>
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>

          <NavSection label="Ledger">
            {can('stock',   'view') && <Link to="/inventory/stock"   style={navItemStyle('/inventory/stock')}><MapPin size={17} /> Global Stock</Link>}
            {can('items',   'view') && <Link to="/inventory/items"   style={navItemStyle('/inventory/items')}><Package size={17} /> Item Master</Link>}
            {can('reports', 'view') && <Link to="/inventory/reports" style={navItemStyle('/inventory/reports')}><BarChart3 size={17} /> Reports</Link>}
            {can('history', 'view') && <Link to="/inventory/history" style={navItemStyle('/inventory/history')}><ClipboardList size={17} /> Audit Trail</Link>}
          </NavSection>

          <NavSection label="Operations">
            {can('receive',  'view') && <Link to="/inventory/receive"   style={navItemStyle('/inventory/receive')}><ArrowDownToLine size={17} /> Receiving</Link>}
            {can('fulfill',  'view') && <Link to="/inventory/fulfill"   style={navItemStyle('/inventory/fulfill')}><PackageOpen size={17} /> Fulfillment</Link>}
            {can('builds',   'view') && <Link to="/inventory/builds"    style={navItemStyle('/inventory/builds')}><Wrench size={17} /> Manufacturing</Link>}
            {can('adjust',   'view') && <Link to="/inventory/adjust"    style={navItemStyle('/inventory/adjust')}><SlidersHorizontal size={17} /> Adjustments</Link>}
            {can('transfer', 'view') && <Link to="/inventory/transfer"  style={navItemStyle('/inventory/transfer')}><ArrowRightLeft size={17} /> Stock Transfer</Link>}
          </NavSection>

          <NavSection label="Setup">
            {can('locations', 'view') && <Link to="/inventory/locations" style={navItemStyle('/inventory/locations')}><Map size={17} /> Warehouses & Bins</Link>}
            {can('clients',   'view') && <Link to="/inventory/clients"   style={navItemStyle('/inventory/clients')}><Users size={17} /> Clients</Link>}
            {can('admin',     'view') && <Link to="/inventory/admin"     style={navItemStyle('/inventory/admin')}><ShieldAlert size={17} /> Admin</Link>}
          </NavSection>

        </nav>
      </div>

      {/* ── Main content ────────────────────────────────────────── */}
      <div style={{ flex: 1, height: '100%', overflowY: 'auto', padding: '30px', boxSizing: 'border-box' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <Routes>
            <Route path="/stock"     element={can('stock',    'view') ? <StockLedger />          : <Navigate to="/" />} />
            <Route path="/items"     element={can('items',    'view') ? <ItemMaster canEdit={can('items', 'edit')} /> : <Navigate to="/inventory/stock" />} />
            <Route path="/receive"   element={can('receive',  'view') ? <Receiving />             : <Navigate to="/inventory/stock" />} />
            <Route path="/builds"    element={can('builds',   'view') ? <BuildEngine />           : <Navigate to="/inventory/stock" />} />
            <Route path="/fulfill"   element={can('fulfill',  'view') ? <Fulfillment />           : <Navigate to="/inventory/stock" />} />
            <Route path="/locations" element={can('locations','view') ? <Locations />             : <Navigate to="/inventory/stock" />} />
            <Route path="/clients"   element={can('clients',  'view') ? <Clients />               : <Navigate to="/inventory/stock" />} />
            <Route path="/admin"     element={can('admin',    'view') ? <Admin />                 : <Navigate to="/inventory/stock" />} />
            <Route path="/adjust"    element={can('adjust',   'view') ? <Adjustments />           : <Navigate to="/inventory/stock" />} />
            <Route path="/transfer"  element={can('transfer', 'view') ? <StockTransfer />         : <Navigate to="/inventory/stock" />} />
            <Route path="/history"   element={can('history',  'view') ? <TransactionHistory />    : <Navigate to="/inventory/stock" />} />
            <Route path="/reports"   element={can('reports',  'view') ? <Reports />               : <Navigate to="/inventory/stock" />} />
            <Route path="*"          element={<Navigate to="/inventory/stock" replace />} />
          </Routes>
        </div>
      </div>

    </div>
  );
};

export default InventoryApp;
