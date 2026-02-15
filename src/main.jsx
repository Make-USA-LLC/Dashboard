import React from 'react';
import ReactDOM from 'react-dom/client';
import HubApp from './App.jsx';
import HRApp from './HR/App.jsx'; 

import { PublicClientApplication, EventType } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import { msalConfig } from "./authConfig"; 

const msalInstance = new PublicClientApplication(msalConfig);

// Set active account on login
msalInstance.addEventCallback((event) => {
    if (event.eventType === EventType.LOGIN_SUCCESS && event.payload.account) {
        msalInstance.setActiveAccount(event.payload.account);
    }
});

// --- FIX: Define RootApp Logic Here ---
const isHRSubdomain = window.location.hostname.toLowerCase().startsWith('hr.');
const RootApp = isHRSubdomain ? HRApp : HubApp;
// --------------------------------------

msalInstance.initialize().then(() => {
    msalInstance.handleRedirectPromise().then((tokenResponse) => {
        
        ReactDOM.createRoot(document.getElementById('root')).render(
            <React.StrictMode>
                <MsalProvider instance={msalInstance}>
                    <RootApp />
                </MsalProvider>
            </React.StrictMode>,
        );
    }).catch(error => console.error("MSAL Error:", error));
});