export const styles = {
  container: { padding: '20px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Segoe UI, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #eee', paddingBottom: '10px' },
  card: { background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)', marginBottom: '15px', border: '1px solid #e0e0e0' },
  btn: { padding: '10px 15px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontWeight: 'bold', marginRight: '10px' },
  input: { padding: '8px', borderRadius: '4px', border: '1px solid #ccc', width: '100%', boxSizing: 'border-box' },
  label: { display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px', color: '#555' },
  badge: { padding: '4px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' },
  linkList: { listStyleType: 'none', padding: 0, margin: '5px 0 0 0', fontSize: '12px' },
  linkItem: { color: '#2563eb', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' },
  tabs: { display: 'flex', gap: '10px', marginBottom: '20px' },
  tab: (active) => ({ padding: '10px 20px', borderRadius: '5px', border: 'none', background: active ? '#2c3e50' : '#e2e8f0', color: active ? 'white' : '#333', cursor: 'pointer', fontWeight: 'bold' })
};