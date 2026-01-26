import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';

const RoleContext = createContext();

export function RoleProvider({ children }) {
  const [roleName, setRoleName] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true); // Start true to prevent premature redirects

  useEffect(() => {
    // We listen strictly to Auth State changes
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      // 1. If Auth State changes, we go back to loading state immediately
      setLoading(true);
      
      if (!currentUser) {
        // Case: Logged Out
        setRoleName(null);
        setPermissions({});
        setLoading(false);
        return;
      }

      try {
        // 2. Fetch Authorized User Doc
        const userRef = doc(db, 'authorized_users', currentUser.email);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const rName = userSnap.data().role;
          setRoleName(rName);

          // 3. Determine Permissions
          if (rName === 'Admin') {
            // Admin gets "Master Key" (checked in checkAccess)
            setPermissions({ __admin: true });
          } else {
            // Fetch Specific Role Permissions
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
          // User logged in via Google, but not in 'authorized_users' collection
          setRoleName(null);
          setPermissions({});
        }
      } catch (error) {
        console.error("Error fetching permissions:", error);
        setRoleName(null);
        setPermissions({});
      }

      // 4. ONLY NOW do we release the loading state
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // --- CHECK ACCESS HELPER ---
  const checkAccess = (resource, action = 'view') => {
      // If still loading, technically no access yet
      if (loading) return false;

      // Admin Bypass
      if (roleName === 'Admin' || permissions.__admin) return true;

      const level = permissions[resource] || 0;
      
      if (action === 'edit' || action === 'write') return level >= 2;
      if (action === 'view' || action === 'read') return level >= 1;
      
      return false;
  };

  // --- BACKWARDS COMPATIBILITY ---
  // (Maintained so your other components don't break)
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