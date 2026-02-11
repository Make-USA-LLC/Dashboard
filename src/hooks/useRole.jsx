import { useState, useEffect, createContext, useContext } from 'react';
import { db, auth } from '../firebase_config';
import { doc, onSnapshot } from 'firebase/firestore';

const RoleContext = createContext();

export function RoleProvider({ children }) {
  const [roleData, setRoleData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        // 1. Get user's role name from /users/{email}
        const userRef = doc(db, "users", user.email.toLowerCase());
        const unsubUser = onSnapshot(userRef, (userSnap) => {
          const roleName = userSnap.data()?.role || 'guest';

          // 2. Get permissions for that role from /config/roles
          const rolesRef = doc(db, "config", "roles");
          const unsubRoles = onSnapshot(rolesRef, (rolesSnap) => {
            const allRoles = rolesSnap.data() || {};
            setRoleData({
              name: roleName,
              permissions: allRoles[roleName] || {}
            });
            setLoading(false);
          });
          return () => unsubRoles();
        });
        return () => unsubUser();
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  // The actual checker function
  const checkAccess = (system, feature, action = 'view') => {
    if (roleData?.name === 'admin') return true;
    // Checks path like: roleData.permissions.hr.employees_view
    return roleData?.permissions?.[system]?.[`${feature}_${action}`] === true;
  };

  return (
    <RoleContext.Provider value={{ checkAccess, loading, role: roleData?.name }}>
      {children}
    </RoleContext.Provider>
  );
}

export const useRole = () => useContext(RoleContext);