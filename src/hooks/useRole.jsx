// src/hooks/useRole.jsx
import { useState, useEffect, createContext, useContext } from 'react';
import { db, auth } from '../firebase_config';
import { doc, onSnapshot } from 'firebase/firestore';

const RoleContext = createContext();

export function RoleProvider({ children }) {
  const [access, setAccess] = useState({ 
      ipad: null, hr: null, tech: false, shed: false, 
      master: false, shipment: null, production: false, qc: false,
      blending: false, reports: null, wifi: null
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        const email = user.email.toLowerCase();
        
        // --- EMERGENCY BYPASS ---
        if (email === 'daniel.s@makeit.buzz') {
          setAccess({ 
              ipad: 'admin', hr: 'Admin', tech: true, shed: true, 
              master: true, shipment: 'Admin', production: true, qc: true,
              blending: true, reports: 'Both_Finance', wifi: 'Master Admin'
          });
          setLoading(false);
          return;
        }

        // --- ROBUST LOADING TRACKER ---
        const loadedTracker = { 
            ipad: false, hr: false, tech: false, shed: false, 
            shipment: false, prod: false, qc: false, 
            blending: false, reports: false, master: false, wifi: false
        };

        const markLoaded = (key) => {
            loadedTracker[key] = true;
            if (Object.values(loadedTracker).every(status => status === true)) {
                setLoading(false);
            }
        };

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
          onSnapshot(doc(db, "wifi_access", email), (s) => { setAccess(v => ({ ...v, wifi: s.data()?.role })); markLoaded('wifi'); }, () => markLoaded('wifi'))
        ];
        return () => unsubs.forEach(un => un());
      } else {
        setAccess({ ipad: null, hr: null, tech: false, shed: false, master: false, shipment: null, production: false, qc: false, blending: false, reports: null, wifi: null });
        setLoading(false);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  const hasAnyAccess = !!access.ipad || !!access.hr || access.tech || access.shed || access.master || !!access.shipment || access.production || access.qc || access.blending || !!access.reports || !!access.wifi;

  const checkAccess = (system, feature) => {
    if (access.master) return true;
    
    if (system === 'reports') {
        if (!access.reports) return false;
        const r = access.reports.toLowerCase();
        
        if (feature === 'qc') return r.includes('qc') || r.includes('both');
        if (feature === 'tech') return r.includes('tech') || r.includes('both');
        if (feature === 'finance') return r.includes('finance');
        return true; 
    }

    if (system === 'techs') return access.tech;
    if (system === 'production' && feature === 'shed') return access.shed;
    if (system === 'production' && feature === 'management') return access.production;
    if (system === 'qc' && feature === 'module') return access.qc;
    if (system === 'blending') return access.blending;
    if (system === 'ipad') return !!access.ipad;
    if (system === 'hr') return !!access.hr;
    if (system === 'shipment') return !!access.shipment;
    if (system === 'wifi') return !!access.wifi;
    if (system === 'admin') return access.master;
    
    return false;
  };

  // --- NEW: Map master access to explicit strings for legacy systems ---
  const derivedAccess = {
    ...access,
    ipad: access.master ? 'admin' : access.ipad,
    hr: access.master ? 'Admin' : access.hr,
shipment: access.master ? 'Admin' : access.shipment,
  };

  return (
    <RoleContext.Provider value={{ checkAccess, loading, roleData: derivedAccess, hasAnyAccess }}>
      {children}
    </RoleContext.Provider>
  );
}

export const useRole = () => useContext(RoleContext);