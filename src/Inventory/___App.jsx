import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { useRole } from '../hooks/useRole';
import { db } from '../firebase_config';
import { doc, getDoc } from 'firebase/firestore';
import { Package, MapPin, Wrench, Boxes, ArrowDownToLine, PackageOpen, Users, Map, ShieldAlert } from 'lucide-react';
import Loader from '../components/loader';

import ItemMaster from './ItemMaster';
import StockLedger from './StockLedger';
import Receiving from './Receiving';
import Fulfillment from './Fulfillment';
import BuildEngine from './BuildEngine';
import Locations from './Locations';
import Clients from './Clients';
import Admin from './Admin';

const InventoryApp = () => {
  const location = useLocation();
  const { roleData, loading: roleLoading } = useRole(); 

  const [perms, setPerms] = useState(null);
  const [permsLoading, setPermsLoading] = useState(true);

  const myRoleName = roleData?.inventory || 'Viewer';
  const isMaster = roleData?.master === true;
  const isReadOnly = roleData?.readOnly === true;

  // The Engine: Evaluates exact permissions based on Role string or Master status
  useEffect(() => {
      if (isMaster) {
          setPerms({
              items: { view: true, edit: true }, stock: { view: true, edit: false },
              receive: { view: true, edit: true }, builds: { view: true, edit: true },
              fulfill: { view: true, edit: true }, locations: { view: true, edit: true },
              clients: { view: true, edit: true }, admin: { view: true, edit: true }
          });
          setPermsLoading(false);
          return;
      }
      
      if (!myRoleName) { setPermsLoading(false); return; }

      getDoc(doc(db, "inv_roles", myRoleName)).then(snap => {
          if (snap.exists()) {
              setPerms(snap.data()); // Apply granular custom role
          } else {
              // Legacy Fallback mapping for generic roles
              const isMgr = myRoleName === 'Manager' || myRoleName === 'Admin';
              const isAdm = myRoleName === 'Admin';
              setPerms({
                  items: { view: true, edit: isMgr }, stock: { view: true, edit: false },
                  receive: { view: isMgr, edit: isMgr }, builds: { view: isMgr, edit: isMgr },
                  fulfill: { view: isMgr, edit: isMgr }, locations: { view: isAdm, edit: isAdm },
                  clients: { view: isAdm, edit: isAdm }, admin: { view: isAdm, edit: isAdm }
              });
          }
          setPermsLoading(false);
      });
  }, [myRoleName, isMaster]);

  const navItemClass = (path) => ({
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '12px 20px', borderRadius: '8px',
    textDecoration: 'none', fontWeight: '500', fontSize: '15px',
    background: location.pathname.startsWith(path) ? '#dbeafe' : 'transparent',
    color: location.pathname.startsWith(path) ? '#2563eb' : '#475569',
    transition: 'all 0.2s', width: '100%', boxSizing: 'border-box'
  });

  if (roleLoading || permsLoading) return <Loader message="Loading ERP Permissions..." />;

  // Apply Global Read-Only Override
  const can = (module, action) => isReadOnly ? (action === 'view' && perms?.[module]?.view) : perms?.[module]?.[action];

  return (
    <div style={{ display: 'flex', flexDirection: 'row', height: 'calc(100vh - 60px)', background: '#f8fafc', overflow: 'hidden' }}>
      
      {/* STRICT VERTICAL LEFT SIDEBAR */}
      <div style={{ width: '260px', minWidth: '260px', height: '100%', background: 'white', borderRight: '1px solid #e2e8f0', padding: '20px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', overflowY: 'auto' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '30px', paddingBottom: '20px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ background: '#2563eb', padding: '8px', borderRadius: '8px', color: 'white', display: 'flex' }}><Boxes size={24} /></div>
          <div>
            <h2 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>Inventory ERP</h2>
            <span style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold' }}>Role: {isReadOnly ? 'Read-Only' : myRoleName}</span>
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1 }}>
          <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#94a3b8', margin: '0 0 5px 10px', textTransform: 'uppercase' }}>Core Ledger</p>
          {can('stock', 'view') && <Link to="/inventory/stock" style={navItemClass('/inventory/stock')}><MapPin size={18} /> Global Stock</Link>}
          {can('items', 'view') && <Link to="/inventory/items" style={navItemClass('/inventory/items')}><Package size={18} /> Item Master</Link>}
          
          <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#94a3b8', margin: '20px 0 5px 10px', textTransform: 'uppercase' }}>Operations</p>
          {can('receive', 'view') && <Link to="/inventory/receive" style={navItemClass('/inventory/receive')}><ArrowDownToLine size={18} /> Receiving</Link>}
          {can('builds', 'view') && <Link to="/inventory/builds" style={navItemClass('/inventory/builds')}><Wrench size={18} /> Manufacturing</Link>}
          {can('fulfill', 'view') && <Link to="/inventory/fulfill" style={navItemClass('/inventory/fulfill')}><PackageOpen size={18} /> Fulfillment</Link>}

          <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#94a3b8', margin: '20px 0 5px 10px', textTransform: 'uppercase' }}>Ecosystem</p>
          {can('locations', 'view') && <Link to="/inventory/locations" style={navItemClass('/inventory/locations')}><Map size={18} /> Warehouses & Bins</Link>}
          {can('clients', 'view') && <Link to="/inventory/clients" style={navItemClass('/inventory/clients')}><Users size={18} /> Reporting Clients</Link>}
          {can('admin', 'view') && <Link to="/inventory/admin" style={navItemClass('/inventory/admin')}><ShieldAlert size={18} /> System Admin</Link>}
        </nav>
      </div>

      {/* MAIN CONTENT AREA */}
      <div style={{ flex: 1, height: '100%', overflowY: 'auto', padding: '30px', boxSizing: 'border-box' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <Routes>
                <Route path="/stock" element={can('stock', 'view') ? <StockLedger /> : <Navigate to="/" />} />
                <Route path="/items" element={can('items', 'view') ? <ItemMaster canEdit={can('items', 'edit')} /> : <Navigate to="/inventory/stock" />} />
                <Route path="/receive" element={can('receive', 'view') ? <Receiving /> : <Navigate to="/inventory/stock" />} />
                <Route path="/builds" element={can('builds', 'view') ? <BuildEngine /> : <Navigate to="/inventory/stock" />} />
                <Route path="/fulfill" element={can('fulfill', 'view') ? <Fulfillment /> : <Navigate to="/inventory/stock" />} />
                <Route path="/locations" element={can('locations', 'view') ? <Locations /> : <Navigate to="/inventory/stock" />} />
                <Route path="/clients" element={can('clients', 'view') ? <Clients /> : <Navigate to="/inventory/stock" />} />
                <Route path="/admin" element={can('admin', 'view') ? <Admin /> : <Navigate to="/inventory/stock" />} />
                <Route path="*" element={<Navigate to="/inventory/stock" replace />} />
            </Routes>
        </div>
      </div>
    </div>
  );
};

export default InventoryApp;