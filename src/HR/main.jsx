import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './App.css'; 

// 1. Import Microsoft Authentication tools
import { PublicClientApplication } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import { msalConfig } from "./authConfig"; // This imports the config you made in Step 3

// 2. Create the MSAL Instance
const msalInstance = new PublicClientApplication(msalConfig);

// 3. Initialize MSAL before the app starts
msalInstance.initialize().then(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      {/* 4. Wrap the App in the MsalProvider */}
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    </React.StrictMode>,
  );
});