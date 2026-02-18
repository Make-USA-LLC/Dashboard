export const msalConfig = {
    auth: {
        clientId: "635b5faf-de93-4995-bde7-f12d874e4ca8", // Your Client ID
        authority: "https://login.microsoftonline.com/e2def1cc-04e8-45a9-8ee0-f0418e97578a", // Your Tenant
        
        // Ensure this matches your Azure Portal EXACTLY (No trailing slash)
        // Automatically detects if you are on localhost or makeit.buzz
redirectUri: window.location.origin,
    },
    cache: {
        // CHANGED: Use localStorage to prevent "lost state" in popups
        cacheLocation: "localStorage", 
        storeAuthStateInCookie: false,
    },
};

export const graphConfig = {
    graphMeEndpoint: "https://graph.microsoft.com/v1.0/me",
    uploadScope: ["Sites.ReadWrite.All", "Files.ReadWrite.All"]
};