// src/Client/sharepointUtils.js

const SITE_ID = "makeitbuzz.sharepoint.com,5f466306-673d-4008-a8cc-86bdb931024f,eb52fce7-86e8-43c9-b592-cf8da705e9ef";

/**
 * Fetches files for a specific client.
 * In Demo Mode, it returns mock data if no token is available.
 */
export const getClientFiles = async (clientName, token = null) => {
    // --- DEMO MOCK DATA ---
    // If we are in demo mode and don't have a token, show fake files so it looks populated
    if (import.meta.env.VITE_IS_DEMO === 'true' && !token) {
        return [
            { name: "W9_Form_2024.pdf", lastModifiedDateTime: new Date().toISOString(), webUrl: "#" },
            { name: "Client_Agreement_Final.pdf", lastModifiedDateTime: new Date().toISOString(), webUrl: "#" },
            { name: "Brand_Guidelines.png", lastModifiedDateTime: new Date().toISOString(), webUrl: "#" }
        ];
    }

    if (!token) return [];

    try {
        const path = `/Documents/Make USA LLC/Clients_Dashboard/${clientName}`;
        const endpoint = `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive/root:${path}:/children`;
        
        const res = await fetch(endpoint, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) return [];
        const data = await res.json();
        return data.value || [];
    } catch (error) {
        console.error("Error fetching SharePoint files:", error);
        return [];
    }
};

/**
 * Uploads a file to a specific SharePoint directory.
 */
export const uploadToSharePoint = async (clientName, folderType, file, token, sampleName = '') => {
    if (!token) throw new Error("No Microsoft access token provided.");

    // Path updated to include /Documents/ before Make USA LLC
    let path = `/Documents/Make USA LLC/Clients_Dashboard/${clientName}/${folderType}/${file.name}`;
    
    if (folderType === 'Samples' && sampleName) {
        path = `/Documents/Make USA LLC/Clients_Dashboard/${clientName}/Samples/${sampleName}/${file.name}`;
    }

    // Fully qualified endpoint matching Production's logic
    const graphEndpoint = `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive/root:${path}:/content?@microsoft.graph.conflictBehavior=rename`;

    const uploadRes = await fetch(graphEndpoint, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': file.type
        },
        body: file
    });

    if (!uploadRes.ok) {
        const err = await uploadRes.json();
        console.error("SharePoint Upload Error:", err);
        throw new Error(err.error?.message || "SharePoint upload failed");
    }
    
    const data = await uploadRes.json();
    return data.webUrl; 
};