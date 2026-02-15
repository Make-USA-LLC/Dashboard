import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase_config';

const DomainRouter = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const checkRouting = async () => {
      try {
        // 1. Get current URL parts
        const currentHost = window.location.hostname.toLowerCase(); // e.g. hr.makeusa.com
        const currentPath = window.location.pathname.toLowerCase(); // e.g. /kiosk
        
        // Remove trailing slash from path for cleaner matching
        const cleanPath = currentPath.endsWith('/') && currentPath.length > 1 ? currentPath.slice(0, -1) : currentPath;
        
        // Construct "Host + Path" (e.g. makeusa.com/kiosk)
        // We strip the leading slash from pathname to join cleanly if needed, or just append.
        // Let's standard format: hostname + pathname
        const fullSource = (currentHost + cleanPath);

        const routesSnapshot = await getDocs(collection(db, "config_routing"));
        
        routesSnapshot.forEach(doc => {
          const rule = doc.data();
          const ruleSource = rule.source.toLowerCase().replace(/\/$/, ''); // Remove trailing slash from rule

          // 2. Check for Match (Either Domain Match OR Full URL Match)
          // Match 1: "hr.makeusa.com" === "hr.makeusa.com"
          // Match 2: "makeusa.com/kiosk" === "makeusa.com/kiosk"
          
          if (currentHost === ruleSource || fullSource === ruleSource) {
            
            // 3. Prevent Loop: Only redirect if we aren't already at the target
            if (!location.pathname.startsWith(rule.destination)) {
              console.log(`[DomainRouter] Redirecting ${ruleSource} -> ${rule.destination}`);
              navigate(rule.destination);
            }
          }
        });
      } catch (error) {
        console.error("Routing check error:", error);
      }
    };

    checkRouting();
  }, [location.pathname]); // Re-run if path changes (optional, but good for SPA)

  return null;
};

export default DomainRouter;