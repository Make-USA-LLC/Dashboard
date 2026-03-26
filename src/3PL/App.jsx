import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { db } from '../firebase_config';
import { doc, getDoc } from 'firebase/firestore';
import { useRole } from '../hooks/useRole';
import { PlusCircle, DollarSign, History, Shield, Settings, ShieldAlert } from 'lucide-react';

import Loader from '../components/loader';
import Input from './Input';
import BillingFinance from './BillingFinance';
import PastBills from './PastBills';
import TPLSettings from './settings';
import TPLAdmin from './Admin';

const TPLApp = () => {
  const location = useLocation();
  const { roleData, loading: roleLoading } = useRole(); 

  const [tplPerms, setTplPerms] = useState(null);
  const [permsLoading, setPermsLoading] = useState(true);

  const myRoleName = roleData?.tpl;
  const isMaster = roleData?.master === true;
  const isReadOnly = roleData?.readOnly === true;

  useEffect(() => {
      if (isMaster) {
          setTplPerms({ input_entries: true, view_history: true, edit_rates: true, manage_clients: true, manage_users: true });
          setPermsLoading(false);
          return;
      }
      if (!myRoleName) {
          setPermsLoading(false);
          return;
      }
      
      getDoc(doc(db, "tpl_roles", myRoleName)).then(snap => {
          if (snap.exists()) {
              setTplPerms(snap.data());
          } else {
              setTplPerms({
                  input_entries: myRoleName === 'Input' || myRoleName === 'Admin',
                  view_history: myRoleName === 'Finance' || myRoleName === 'Admin' || isReadOnly,
                  edit_rates: myRoleName === 'Finance' || myRoleName === 'Admin',
                  manage_clients: myRoleName === 'Finance' || myRoleName === 'Admin',
                  manage_users: myRoleName === 'Admin'
              });
          }
          setPermsLoading(false);
      });
  }, [myRoleName, isMaster, isReadOnly]);

  const navItemClass = (path) => {
    const isActive = location.pathname === path;
    return {
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '10px 20px', borderRadius: '8px',
      textDecoration: 'none', fontWeight: '500',
      background: isActive ? '#ea580c' : 'transparent',
      color: isActive ? 'white' : '#64748b',
      transition: 'all 0.2s'
    };
  };

  if (roleLoading || permsLoading) return <Loader message="Loading 3PL Billing..." />;

  const canEnterData = (tplPerms?.input_entries) && !isReadOnly;
  const canBill = (tplPerms?.view_history) && !isReadOnly;
  const canViewBilling = (tplPerms?.view_history) || isReadOnly;
  const canViewSettings = (tplPerms?.edit_rates || tplPerms?.manage_clients) && !isReadOnly;
  const canManageUsers = (tplPerms?.manage_users) && !isReadOnly;

  return (
    <div style={{ minHeight: 'calc(100vh - 60px)', background: '#f8fafc', padding: '20px' }}>
      
      <div style={{ 
        maxWidth: '1200px', margin: '0 auto 20px', 
        background: 'white', padding: '15px', borderRadius: '12px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)' 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ background: '#ffedd5', padding: '8px', borderRadius: '8px', color: '#ea580c' }}>
            <Shield size={24} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>3PL Fulfillment</h2>
            <span style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {isReadOnly ? 'Global Read-Only' : `${myRoleName} Access`}
            </span>
          </div>
        </div>

        <nav style={{ display: 'flex', gap: '5px' }}>
          {canEnterData && (
            <Link to="/3pl" style={navItemClass('/3pl')}>
              <PlusCircle size={18} /> Entry
            </Link>
          )}
          
          {canViewBilling && (
            <Link to="/3pl/billing" style={navItemClass('/3pl/billing')}>
              <DollarSign size={18} /> Monthly Billing
            </Link>
          )}

          <Link to="/3pl/history" style={navItemClass('/3pl/history')}>
            <History size={18} /> History
          </Link>

          {canViewSettings && (
            <Link to="/3pl/settings" style={navItemClass('/3pl/settings')}>
              <Settings size={18} /> Settings
            </Link>
          )}

          {canManageUsers && (
            <Link to="/3pl/admin" style={navItemClass('/3pl/admin')}>
              <ShieldAlert size={18} /> Access Roles
            </Link>
          )}
        </nav>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <Routes>
          <Route path="/" element={canEnterData ? <Input canEdit={canEnterData} /> : <Navigate to="/3pl/billing" replace />} />
          <Route path="/billing" element={canViewBilling ? <BillingFinance canBill={canBill} /> : <Navigate to="/3pl" replace />} />
          <Route path="/history" element={<PastBills />} />
          <Route path="/settings" element={canViewSettings ? <TPLSettings perms={tplPerms} /> : <Navigate to="/3pl" replace />} />
          <Route path="/admin" element={canManageUsers ? <TPLAdmin /> : <Navigate to="/3pl" replace />} />
          <Route path="*" element={<Navigate to="/3pl" replace />} />
        </Routes>
      </div>
    </div>
  );
};

export default TPLApp;