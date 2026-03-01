export const styles = {
    container: { padding: '20px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Segoe UI, sans-serif' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
    tabs: { display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #ddd', paddingBottom: '10px' },
    tab: (active) => ({ padding: '10px 20px', cursor: 'pointer', fontWeight: 'bold', border: 'none', background: active ? '#2563eb' : '#eee', color: active ? 'white' : '#333', borderRadius: '5px' }),
    card: { background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)', marginBottom: '15px' },
    input: { padding: '8px', borderRadius: '4px', border: '1px solid #ccc', width: '100%', boxSizing: 'border-box' },
    btn: { padding: '10px 15px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontWeight: 'bold', background: '#27ae60', color: 'white' },
    table: { width: '100%', borderCollapse: 'collapse', marginTop: '10px', fontSize: '15px' },
    th: { background: '#e2efda', color: '#375623', borderBottom: '2px solid #8ea9db', padding: '10px', textAlign: 'left', fontWeight: 'bold' },
    td: { padding: '10px', borderBottom: '1px solid #d0d7e5' },
    printArea: { display: 'none' }
};

export const getGallons = (name, grams) => {
    const g = parseFloat(grams);
    if (isNaN(g)) return '-';
    const lowerName = name.toLowerCase();
    
    if (lowerName.includes('water')) return (g / 3785.41).toFixed(4) + ' gal';
    if (lowerName.includes('b40') || lowerName.includes('alcohol')) return (g * 0.000335).toFixed(4) + ' gal';
    
    return '-';
};

export const parseSizeFromText = (text) => {
    if (!text) return null;
    const match = String(text).toLowerCase().match(/([\d.]+)\s*(ml|oz|g|gal|gallon)/);
    if (match) {
        let unit = match[2];
        if (unit === 'g') unit = 'ml'; 
        if (unit === 'gallon' || unit === 'gal') unit = 'gal';
        return { weight: match[1], unit: unit };
    }
    return null;
};