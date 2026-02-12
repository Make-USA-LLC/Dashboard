// src/components/RoleRoute.jsx
import React from 'react';
import { useRole } from '../hooks/useRole';
import AccessDenied from './AccessDenied';

const RoleRoute = ({ children, system, feature, action = 'view' }) => {
  const { checkAccess, loading } = useRole();

  if (loading) {
    return (
      <div style={{height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        Validating Permissions...
      </div>
    );
  }

  // Use the system name for the error page title (e.g., "Technicians", "Shed")
  const systemLabels = {
    hr: "HR Platform",
    techs: "Technicians App",
    ipad: "iPad Dashboard",
    production: "Shed Inventory",
    admin: "Master Admin"
  };

  if (!checkAccess(system, feature, action)) {
    return <AccessDenied systemName={systemLabels[system] || "System"} />;
  }

  return children;
};

export default RoleRoute;