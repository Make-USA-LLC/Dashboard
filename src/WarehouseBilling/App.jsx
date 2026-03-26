import React from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { useRole } from '../hooks/useRole';
import { PlusCircle, DollarSign, History, Shield, Settings } from 'lucide-react';

import Loader from '../components/Loader';
import Input from './Input';
import BillingFinance from './BillingFinance';
import PastBills from './PastBills';
import WarehouseSettings from './settings';

const WarehouseApp = () => {
  const location = useLocation();
  const { roleData, loading } = useRole(); 

  const navItemClass = (path) => {
    const isActive = location.pathname === path;
    return {
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '10px 20px', borderRadius: '8px',
      textDecoration: 'none', fontWeight: '500',
      background: isActive ? '#2563eb' : 'transparent',
      color: isActive ? 'white' : '#64748b',
      transition: 'all 0.2s'
    };
  };

  // Explicitly pull the warehouse role assigned in MasterAdmin
  const myRole = roleData?.warehouse || 'Input'; 
  const isMaster = roleData?.master === true;
  const isReadOnly = roleData?.readOnly === true;

  // STRICT ROLE DEFINITIONS
  const canEnterData = (myRole === 'Admin' || myRole === 'Input' || isMaster) && !isReadOnly;
  const canBill = (myRole === 'Admin' || myRole === 'Finance' || isMaster) && !isReadOnly;
  const canViewBilling = myRole === 'Admin' || myRole === 'Finance' || isMaster || isReadOnly;
  
  // UPDATED: Added 'Finance' to the allowed list for Settings
  const canViewSettings = (myRole === 'Admin' || myRole === 'Finance' || isMaster) && !isReadOnly;

  if (loading) return <Loader message="Loading Warehouse Billing..." />;

  return (
    <div style={{ minHeight: 'calc(100vh - 60px)', background: '#f8fafc', padding: '20px' }}>
      
      <div style={{ 
        maxWidth: '1200px', margin: '0 auto 20px', 
        background: 'white', padding: '15px', borderRadius: '12px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)' 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ background: '#eff6ff', padding: '8px', borderRadius: '8px', color: '#2563eb' }}>
            <Shield size={24} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>Warehouse Billing</h2>
            <span style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {isReadOnly ? 'Global Read-Only' : `${myRole} Access`}
            </span>
          </div>
        </div>

        <nav style={{ display: 'flex', gap: '5px' }}>
          {/* Hide Entry tab from Finance entirely */}
          {canEnterData && (
            <Link to="/warehousebilling" style={navItemClass('/warehousebilling')}>
              <PlusCircle size={18} /> Entry
            </Link>
          )}
          
          {canViewBilling && (
            <Link to="/warehousebilling/billing" style={navItemClass('/warehousebilling/billing')}>
              <DollarSign size={18} /> Billing Queue
            </Link>
          )}

          <Link to="/warehousebilling/history" style={navItemClass('/warehousebilling/history')}>
            <History size={18} /> History
          </Link>

          {canViewSettings && (
            <Link to="/warehousebilling/settings" style={navItemClass('/warehousebilling/settings')}>
              <Settings size={18} /> Settings
            </Link>
          )}
        </nav>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <Routes>
          {/* If Finance tries to hit the root route, auto-redirect them to billing */}
          <Route path="/" element={canEnterData ? <Input canEdit={canEnterData} /> : <Navigate to="/warehousebilling/billing" replace />} />
          
          <Route path="/billing" element={canViewBilling ? <BillingFinance canBill={canBill} /> : <Navigate to="/warehousebilling" replace />} />
          <Route path="/history" element={<PastBills />} />
          <Route path="/settings" element={canViewSettings ? <WarehouseSettings /> : <Navigate to="/warehousebilling" replace />} />
          <Route path="*" element={<Navigate to="/warehousebilling" replace />} />
        </Routes>
      </div>
    </div>
  );
};

export default WarehouseApp;
