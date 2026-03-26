import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useRole } from '../hooks/useRole';
import { LogOut, PlusCircle, DollarSign, History, Shield } from 'lucide-react';

import Loader from '../components/Loader';
import ShipmentInput from './ShipmentInput';
import BillingFinance from './BillingFinance';
import PastBills from './PastBills';

const ShipmentApp = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Destructure roleData from your root useRole hook
  const { roleData, loading } = useRole(); 

  // Helper to determine active tab style
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

  // --- PERMISSION LOGIC ---
  const isReadOnly = roleData?.readOnly === true;
  const isMaster = roleData?.master === true;
  const myRole = roleData?.shipment || 'Input';

  // They can VIEW billing if they are Admin, Finance, Master, OR Global Read-Only
  const canViewBilling = myRole === 'Admin' || myRole === 'Finance' || isMaster || isReadOnly;
  
  // They can EDIT only if they have the rights AND are NOT read-only
  const canEdit = (myRole === 'Admin' || myRole === 'Finance' || myRole === 'Input' || isMaster) && !isReadOnly;

  if (loading) return <Loader message="Loading Shipment App..." />;

  return (
    <div style={{ minHeight: 'calc(100vh - 60px)', background: '#f8fafc', padding: '20px' }}>
      
      {/* Local Header / Nav */}
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
            <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>Shipment & Duties</h2>
            <span style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {isReadOnly ? 'Global Read-Only' : `${myRole} Access`}
            </span>
          </div>
        </div>

        <nav style={{ display: 'flex', gap: '5px' }}>
          <Link to="/shipments" style={navItemClass('/shipments')}>
            <PlusCircle size={18} /> Entry
          </Link>
          
          {canViewBilling && (
            <Link to="/shipments/billing" style={navItemClass('/shipments/billing')}>
              <DollarSign size={18} /> Finance Billing
            </Link>
          )}

          <Link to="/shipments/history" style={navItemClass('/shipments/history')}>
            <History size={18} /> History
          </Link>
        </nav>
      </div>

      {/* Main Content Area */}
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <Routes>
          {/* We pass canEdit down as a prop so the pages know to lock the inputs! */}
          <Route path="/" element={<ShipmentInput canEdit={canEdit} />} />
          <Route path="/billing" element={canViewBilling ? <BillingFinance canEdit={canEdit} /> : <Navigate to="/shipments" />} />
          <Route path="/history" element={<PastBills canEdit={canEdit} />} />
          <Route path="*" element={<Navigate to="/shipments" />} />
        </Routes>
      </div>

    </div>
  );
};

export default ShipmentApp;
