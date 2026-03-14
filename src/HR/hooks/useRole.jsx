// src/HR/hooks/useRole.jsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';

const RoleContext = createContext();

export function RoleProvider({ children }) {
  const [roleName, setRoleName] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      
      if (!currentUser) {
        setRoleName(null);
        setPermissions({});
        setLoading(false);
        return;
      }

      try {
        // --- NEW: Check for Master Admin globally first ---
        const masterRef = doc(db, 'master_admin_access', currentUser.email);
        const masterSnap = await getDoc(masterRef);
        const isMasterAdmin = masterSnap.exists();

        // Fetch Authorized User Doc
        const userRef = doc(db, 'authorized_users', currentUser.email);
        const userSnap = await getDoc(userRef);

        if (isMasterAdmin || userSnap.exists()) {
          // --- NEW: Default to 'Admin' if they possess Master access ---
          const rName = isMasterAdmin ? 'Admin' : userSnap.data().role;
          setRoleName(rName);

          // 3. Determine Permissions
          if (rName === 'Admin') {
            setPermissions({ __admin: true });
          } else {
            const roleRef = doc(db, 'roles', rName);
            const roleSnap = await getDoc(roleRef);
            
            if (roleSnap.exists()) {
              setPermissions(roleSnap.data().permissions || {});
            } else {
              console.error("Role definition not found:", rName);
              setPermissions({});
            }
          }
        } else {
          setRoleName(null);
          setPermissions({});
        }
      } catch (error) {
        console.error("Error fetching permissions:", error);
        setRoleName(null);
        setPermissions({});
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const checkAccess = (resource, action = 'view') => {
      if (loading) return false;
      if (roleName === 'Admin' || permissions.__admin) return true;

      const level = permissions[resource] || 0;
      
      if (action === 'edit' || action === 'write') return level >= 2;
      if (action === 'view' || action === 'read') return level >= 1;
      
      return false;
  };

  const isAdmin = roleName === 'Admin';
  const isHR = checkAccess('employees', 'edit'); 
  const isIT = checkAccess('assets', 'edit');
  const isFinance = checkAccess('financials', 'view');

  return (
    <RoleContext.Provider value={{ roleName, permissions, checkAccess, isAdmin, isHR, isIT, isFinance, loading }}>
      {children}
    </RoleContext.Provider>
  );
}

export const useRole = () => useContext(RoleContext);