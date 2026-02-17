import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useRole } from '../hooks/useRole';
import { LogOut, PlusCircle, DollarSign, History, Shield } from 'lucide-react';

import ShipmentInput from './ShipmentInput';
import BillingFinance from './BillingFinance';
import PastBills from './PastBills';

const ShipmentApp = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { roleData, loading } = useRole(); // We will need to update useRole to expose roleData or similar

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

  // Permission Check Helper
  // Roles: 'Admin', 'Finance', 'Input'
  const myRole = roleData?.shipment || 'Input';
  const canBill = myRole === 'Admin' || myRole === 'Finance';

  if (loading) return <div>Loading App...</div>;

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
              {myRole} Access
            </span>
          </div>
        </div>

        <nav style={{ display: 'flex', gap: '5px' }}>
          <Link to="/shipments" style={navItemClass('/shipments')}>
            <PlusCircle size={18} /> Entry
          </Link>
          
          {canBill && (
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
          <Route path="/" element={<ShipmentInput />} />
          <Route path="/billing" element={canBill ? <BillingFinance /> : <Navigate to="/shipments" />} />
          <Route path="/history" element={<PastBills />} />
          <Route path="*" element={<Navigate to="/shipments" />} />
        </Routes>
      </div>

    </div>
  );
};

export default ShipmentApp;