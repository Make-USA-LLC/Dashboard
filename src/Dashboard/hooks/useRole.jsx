// src/Dashboard/hooks/useRole.jsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../firebase_config';

const RoleContext = createContext();

export function RoleProvider({ children }) {
  const [role, setRole] = useState(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [rolesConfig, setRolesConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      if (!currentUser) {
        setUser(null);
        setRole(null);
        setIsReadOnly(false);
        setLoading(false);
        return;
      }
      
      setUser(currentUser);

      // FIX: Safely handle iPads / Anonymous Logins that don't have an email!
      if (!currentUser.email) {
          setRole('fleet'); 
          setLoading(false);
          return;
      }

      const emailKey = currentUser.email.toLowerCase();

      try {
        const rSnap = await getDoc(doc(db, "config", "roles"));
        if (rSnap.exists()) setRolesConfig(rSnap.data());

        const masterSnap = await getDoc(doc(db, "master_admin_access", emailKey));
        if (masterSnap.exists() || emailKey === "daniel.s@makeit.buzz") {
          setRole('admin');
          setLoading(false);
          return;
        }

        const readOnlySnap = await getDoc(doc(db, "readonly_admin_access", emailKey));
        if (readOnlySnap.exists()) {
          setIsReadOnly(true);
          setRole('Global Read-Only'); 
          setLoading(false);
          return;
        }

        const uSnap = await getDoc(doc(db, "users", emailKey));
        if (uSnap.exists()) {
          setRole(uSnap.data().role);
        } else {
          setRole(null);
        }
      } catch (error) {
        console.error("Error fetching role data:", error);
        setRole(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const hasPerm = (feature, type = 'view') => {
    if (role === 'admin') return true;
    
    if (isReadOnly) {
      if (type === 'view') return true;
      if (type === 'edit') return false;
    }

    if (!role) return false;

    const cleanUserRole = role.toLowerCase().replace(/[^a-z0-9]/g, '');
    let matchedRoleKey = null;
    const configKeys = Object.keys(rolesConfig);

    if (rolesConfig[role]) matchedRoleKey = role;
    else {
      for (const key of configKeys) {
        if (key.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanUserRole) {
          matchedRoleKey = key;
          break;
        }
      }
    }

    if (!matchedRoleKey) return false;
    const roleData = rolesConfig[matchedRoleKey];
    if (!roleData) return false;

    const viewKey = feature + '_view';
    const editKey = feature + '_edit';
    const canView = roleData[viewKey] === true;
    const canEdit = roleData[editKey] === true;

    if (type === 'edit') return canEdit;
    if (type === 'view') return canView || canEdit;
    
    return false;
  };

  return (
    <RoleContext.Provider value={{ user, role, isReadOnly, rolesConfig, hasPerm, loading }}>
      {children}
    </RoleContext.Provider>
  );
}

export const useRole = () => useContext(RoleContext);