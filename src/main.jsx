import React from 'react';
import ReactDOM from 'react-dom/client';
import HubApp from './App.jsx';
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

msalInstance.initialize().then(() => {
    // This processes the redirect from Microsoft when the page reloads
    msalInstance.handleRedirectPromise().then(() => {
        ReactDOM.createRoot(document.getElementById('root')).render(
            <React.StrictMode>
                <MsalProvider instance={msalInstance}>
                    <HubApp />
                </MsalProvider>
            </React.StrictMode>,
        );
    }).catch(error => console.error("MSAL Error:", error));
});