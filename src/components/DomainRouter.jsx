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
        // Get current hostname (e.g. hr.makeit.buzz)
        const currentHost = window.location.hostname.toLowerCase();
        
        // 1. Fetch all routing rules
        // (For a larger app, you might optimize this to cache or hardcode, 
        // but fetching allows dynamic updates from your new Manager)
        const routesSnapshot = await getDocs(collection(db, "config_routing"));
        
        routesSnapshot.forEach(doc => {
          const rule = doc.data();
          const sourceDomain = rule.source.toLowerCase();

          // 2. Check for Match
          if (currentHost === sourceDomain) {
            // 3. Prevent Loop: Only redirect if we aren't already at the target
            if (!location.pathname.startsWith(rule.destination)) {
              console.log(`[DomainRouter] Redirecting ${currentHost} -> ${rule.destination}`);
              navigate(rule.destination);
            }
          }
        });
      } catch (error) {
        console.error("Routing check error:", error);
      }
    };

    checkRouting();
  }, []); // Run once on mount

  return null; // Renders nothing UI-wise
};

export default DomainRouter;