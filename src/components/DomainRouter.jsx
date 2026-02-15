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
        const currentHost = window.location.hostname.toLowerCase();
        const currentPath = window.location.pathname.toLowerCase();
        
        const cleanPath = currentPath.endsWith('/') && currentPath.length > 1 ? currentPath.slice(0, -1) : currentPath;
        
        // Construct "Host + Path"
        const fullSource = (currentHost + cleanPath);

        const routesSnapshot = await getDocs(collection(db, "config_routing"));
        
        routesSnapshot.forEach(doc => {
          const rule = doc.data();
          const ruleSource = rule.source.toLowerCase().replace(/\/$/, ''); 

          if (currentHost === ruleSource || fullSource === ruleSource) {
            
            // 3. Prevent Loop: Only redirect if we aren't already at the target
            // Note: Since we only run on mount now, this simply sets the "Default Entry" for the domain
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
    // CHANGED: Empty dependency array ensures this only runs on initial site load.
    // This allows the user to navigate away (e.g. to "/") without being forced back.
  }, []); 

  return null;
};

export default DomainRouter;