import React from 'react';
import { useRole } from '../hooks/useRole.jsx';
import { Link } from 'react-router-dom';

export default function RoleRoute({ children, system, feature, action = 'view' }) {
  const { checkAccess, loading } = useRole();

  if (loading) return <div style={{padding: '50px', textAlign: 'center'}}>Verifying Security...</div>;

  if (!checkAccess(system, feature, action)) {
    return (
      <div style={{ padding: '100px 20px', textAlign: 'center', fontFamily: 'Segoe UI, sans-serif' }}>
        <h1 style={{fontSize: '64px', margin: 0}}>🚫</h1>
        <h2>Access Denied</h2>
        <p>You do not have permission for the <strong>{system}</strong> module.</p>
        <Link to="/" style={{display: 'inline-block', marginTop: '20px', padding: '10px 20px', background: '#2563eb', color: 'white', textDecoration: 'none', borderRadius: '8px'}}>
          Return Home
        </Link>
      </div>
    );
  }

  return children;
}