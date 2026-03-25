import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../firebase_config';
import { doc, onSnapshot } from 'firebase/firestore';

const RoleContext = createContext();

export function RoleProvider({ children }) {
  const [access, setAccess] = useState({ 
      ipad: null, hr: null, tech: false, shed: false, 
      master: false, shipment: null, production: false, qc: false,
      blending: false, reports: null, wifi: null, readOnly: false,
      deletedItems: false, client: false, warehouse: null // <-- Added warehouse
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let timeoutId;

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        if (!user.email) {
            setLoading(false);
            return;
        }

        const email = user.email.toLowerCase();

        // --- CENTRALIZED EMERGENCY BYPASS ---
        if (email === 'daniel.s@makeit.buzz') {
          setAccess({ 
              ipad: 'admin', hr: 'Admin', tech: true, shed: true, 
              master: true, shipment: 'Admin', production: true, qc: true,
              blending: true, reports: 'Both_Finance', wifi: 'Master Admin', readOnly: false,
              deletedItems: true, client: true, warehouse: 'Admin' // <-- Added warehouse
          });
          setLoading(false);
          return;
        }

        const trackers = { 
            ipad: false, hr: false, tech: false, shed: false, 
            shipment: false, prod: false, qc: false, blending: false, 
            reports: false, master: false, wifi: false, readOnly: false,
            deletedItems: false, client: false, warehouse: false // <-- Added warehouse
        };

        const markLoaded = (key) => {
            trackers[key] = true;
            if (Object.values(trackers).every(v => v === true)) {
                setLoading(false);
                if (timeoutId) clearTimeout(timeoutId);
            }
        };

        timeoutId = setTimeout(() => {
            console.warn("Permission sync timed out. Forcing app to load.");
            setLoading(false);
        }, 3000);

        // Fetch all roles simultaneously, including Warehouse
        const unsubs = [
          onSnapshot(doc(db, "users", email), (s) => { setAccess(v => ({ ...v, ipad: s.data()?.role })); markLoaded('ipad'); }, () => markLoaded('ipad')),
          onSnapshot(doc(db, "authorized_users", email), (s) => { setAccess(v => ({ ...v, hr: s.data()?.role })); markLoaded('hr'); }, () => markLoaded('hr')),
          onSnapshot(doc(db, "tech_access", email), (s) => { setAccess(v => ({ ...v, tech: s.exists() })); markLoaded('tech'); }, () => markLoaded('tech')),
          onSnapshot(doc(db, "shed_access", email), (s) => { setAccess(v => ({ ...v, shed: s.exists() })); markLoaded('shed'); }, () => markLoaded('shed')),
          onSnapshot(doc(db, "shipment_access", email), (s) => { setAccess(v => ({ ...v, shipment: s.data()?.role })); markLoaded('shipment'); }, () => markLoaded('shipment')),
          onSnapshot(doc(db, "production_access", email), (s) => { setAccess(v => ({ ...v, production: s.exists() })); markLoaded('prod'); }, () => markLoaded('prod')),
          onSnapshot(doc(db, "qc_access", email), (s) => { setAccess(v => ({ ...v, qc: s.exists() })); markLoaded('qc'); }, () => markLoaded('qc')),
          onSnapshot(doc(db, "blending_access", email), (s) => { setAccess(v => ({ ...v, blending: s.exists() })); markLoaded('blending'); }, () => markLoaded('blending')),
          onSnapshot(doc(db, "machine_access", email), (s) => { setAccess(v => ({ ...v, reports: s.data()?.role })); markLoaded('reports'); }, () => markLoaded('reports')),
          onSnapshot(doc(db, "master_admin_access", email), (s) => { setAccess(v => ({ ...v, master: s.exists() })); markLoaded('master'); }, () => markLoaded('master')),
          onSnapshot(doc(db, "wifi_access", email), (s) => { setAccess(v => ({ ...v, wifi: s.data()?.role })); markLoaded('wifi'); }, () => markLoaded('wifi')),
          onSnapshot(doc(db, "readonly_admin_access", email), (s) => { setAccess(v => ({ ...v, readOnly: s.exists() })); markLoaded('readOnly'); }, () => markLoaded('readOnly')),
          onSnapshot(doc(db, "deleted_items_access", email), (s) => { setAccess(v => ({ ...v, deletedItems: s.exists() })); markLoaded('deletedItems'); }, () => markLoaded('deletedItems')),
          onSnapshot(doc(db, "client_access", email), (s) => { setAccess(v => ({ ...v, client: s.exists() })); markLoaded('client'); }, () => markLoaded('client')),
          onSnapshot(doc(db, "warehouse_billing_access", email), (s) => { setAccess(v => ({ ...v, warehouse: s.data()?.role })); markLoaded('warehouse'); }, () => markLoaded('warehouse')) // <-- Added listener
        ];

        return () => {
            unsubs.forEach(fn => fn());
            clearTimeout(timeoutId);
        };
      } else {
        setAccess({ 
            ipad: null, hr: null, tech: false, shed: false, master: false, 
            shipment: null, production: false, qc: false, blending: false, 
            reports: null, wifi: null, readOnly: false, deletedItems: false, client: false, warehouse: null
        });
        setLoading(false);
      }
    });
    
    return () => {
        unsubscribeAuth();
        if (timeoutId) clearTimeout(timeoutId);
    }
  }, []);

  const hasAnyAccess = !!access.ipad || !!access.hr || access.tech || access.shed || access.master || !!access.shipment || access.production || access.qc || access.blending || !!access.reports || !!access.wifi || access.readOnly || access.deletedItems || access.client || !!access.warehouse; // <-- Added to hasAnyAccess

  const checkAccess = (system, feature, action = 'view') => {
    if (access.master) return true;

    if (access.readOnly) {
        if (action === 'view') return true; 
        if (action === 'edit') return false; 
    }

    switch (system) {
      case 'admin': 
          if (feature === 'deleted_items') return access.deletedItems;
          return access.master;
      case 'hr': return !!access.hr;
      case 'techs': return access.tech;
      case 'ipad': return !!access.ipad;
      case 'production': 
         if (feature === 'shed') return access.shed;
         return access.production;
      case 'shipment': return !!access.shipment;
      case 'qc': return access.qc;
      case 'blending': return access.blending;
      case 'reports': return !!access.reports;
      case 'wifi': return !!access.wifi;
      case 'client': return access.client;
      case 'warehouse': return !!access.warehouse; // <-- Added to switch
      default: return false;
    }
  };

  return (
    <RoleContext.Provider value={{ access, roleData: access, loading, hasAnyAccess, checkAccess }}>
      {children}
    </RoleContext.Provider>
  );
}

export const useRole = () => useContext(RoleContext);