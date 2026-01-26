import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

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
    // Handle the redirect response (the return trip from Microsoft)
    msalInstance.handleRedirectPromise().then((tokenResponse) => {
        // Render the App
        ReactDOM.createRoot(document.getElementById('root')).render(
            <React.StrictMode>
                <MsalProvider instance={msalInstance}>
                    <App />
                </MsalProvider>
            </React.StrictMode>,
        );
    }).catch(error => console.error("MSAL Error:", error));
});