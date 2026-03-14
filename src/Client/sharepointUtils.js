export const uploadToSharePoint = async (clientName, folderType, file, token, sampleName = '') => {
    if (!token) throw new Error("No Microsoft access token provided.");

    // The exact Site ID used by Production, HR, and QC
    const SITE_ID = "makeitbuzz.sharepoint.com,5f466306-673d-4008-a8cc-86bdb931024f,eb52fce7-86e8-43c9-b592-cf8da705e9ef";

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