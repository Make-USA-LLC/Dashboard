import { useState, useEffect, createContext, useContext } from 'react';
import { db, auth } from '../firebase_config';
import { doc, onSnapshot } from 'firebase/firestore';

const RoleContext = createContext();

export function RoleProvider({ children }) {
  // Added 'shipment' to state
  const [access, setAccess] = useState({ ipad: null, hr: null, tech: false, shed: false, master: false, shipment: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        const email = user.email.toLowerCase();
        
        // --- EMERGENCY BYPASS ---
        if (email === 'daniel.s@makeit.buzz') {
          setAccess({ ipad: 'admin', hr: 'Admin', tech: true, shed: true, master: true, shipment: 'Admin' });
          setLoading(false);
          return;
        }

        const unsubs = [
          onSnapshot(doc(db, "users", email), (s) => setAccess(v => ({ ...v, ipad: s.data()?.role })), () => {}),
          onSnapshot(doc(db, "authorized_users", email), (s) => setAccess(v => ({ ...v, hr: s.data()?.role })), () => {}),
          onSnapshot(doc(db, "tech_access", email), (s) => setAccess(v => ({ ...v, tech: s.exists() })), () => {}),
          onSnapshot(doc(db, "shed_access", email), (s) => setAccess(v => ({ ...v, shed: s.exists() })), () => {}),
          // NEW Listener for Shipment
          onSnapshot(doc(db, "shipment_access", email), (s) => setAccess(v => ({ ...v, shipment: s.data()?.role })), () => {}),
          
          onSnapshot(doc(db, "master_admin_access", email), (s) => {
             setAccess(v => ({ ...v, master: s.exists() }));
             setLoading(false); 
          }, () => setLoading(false))
        ];
        return () => unsubs.forEach(un => un());
      } else {
        setAccess({ ipad: null, hr: null, tech: false, shed: false, master: false, shipment: null });
        setLoading(false);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  const checkAccess = (system, feature) => {
    if (access.master) return true;
    if (system === 'techs') return access.tech;
    if (system === 'production' && feature === 'shed') return access.shed;
    if (system === 'ipad') return !!access.ipad;
    if (system === 'hr') return !!access.hr;
    // NEW Check for Shipment
    if (system === 'shipment') return !!access.shipment;
    
    if (system === 'admin') return access.master;
    return false;
  };

  return (
    <RoleContext.Provider value={{ checkAccess, loading, roleData: access }}>
      {children}
    </RoleContext.Provider>
  );
}

export const useRole = () => useContext(RoleContext);