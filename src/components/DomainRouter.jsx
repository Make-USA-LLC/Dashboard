import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const domainMap = {
  // Agent Portal
  "agent.makeit.buzz": "/agent-portal",
  "agent.makeusa.us": "/agent-portal",
  
  // HR
  "hr.makeit.buzz": "/hr",
  "hr.makeusa.us": "/hr",
  
  // Inventory/Shed
  "inventory.makeit.buzz": "/shed",
  "inventory.makeusa.us": "/shed",
  
  // Employee Portal
  "portal.makeit.buzz": "/dashboard/employee-portal",
  "portal.makeusa.us": "/dashboard/employee-portal",
  
  // QC
  "qc.makeit.buzz": "/qc",
  "qc.makeusa.us": "/qc",
  
  // Shipments
  "shipment.makeit.buzz": "/shipments",
  "shipment.makeusa.us": "/shipments",
  "shipments.makeit.buzz": "/shipments",
  "shipments.makeusa.us": "/shipments",
  
  // Techs
  "tech.makeit.buzz": "/techs",
  "tech.makeusa.us": "/techs",
  
  // Guest WiFi
  "wifi.makeit.buzz": "/guest-wifi",
  "wifi.makeusa.us": "/guest-wifi",

  // Specific Path Overrides
  "makeusa.us/kiosk": "/dashboard/kiosk",
  "makeusa.us/kiosk.html": "/dashboard/kiosk"
};

const DomainRouter = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const currentHost = window.location.hostname.toLowerCase();
    const currentPath = window.location.pathname.toLowerCase();
    
    // Clean up trailing slashes for safer matching
    const cleanPath = currentPath.endsWith('/') && currentPath.length > 1 ? currentPath.slice(0, -1) : currentPath;
    const fullSource = currentHost + cleanPath;

    // Check full path first (e.g. makeusa.us/kiosk), fallback to just domain matching
    const targetPath = domainMap[fullSource] || domainMap[currentHost];

    // Only redirect if a mapping exists AND we aren't already at the target
    if (targetPath && !location.pathname.startsWith(targetPath)) {
      console.log(`[DomainRouter] Redirecting to ${targetPath}`);
      navigate(targetPath, { replace: true });
    }
    // Empty dependency array ensures this ONLY fires on the initial site load.
  }, []); 

  return null;
};

export default DomainRouter;