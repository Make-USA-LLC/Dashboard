// src/authConfig.js
export const msalConfig = {
    auth: {
        clientId: "635b5faf-de93-4995-bde7-f12d874e4ca8", // Your App ID
        authority: "https://login.microsoftonline.com/e2def1cc-04e8-45a9-8ee0-f0418e97578a", // Your Tenant ID
        redirectUri: window.location.origin, // Automatically detects localhost or web.app
    },
    cache: {
        cacheLocation: "sessionStorage", 
        storeAuthStateInCookie: false,
    },
};

// Requests the ability to read/write files
export const graphConfig = {
    graphMeEndpoint: "https://graph.microsoft.com/v1.0/me",
    uploadScope: ["Sites.ReadWrite.All", "Files.ReadWrite.All"]
};