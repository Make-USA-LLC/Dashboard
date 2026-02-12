// src/components/AccessDenied.jsx
import React from 'react';
import { Link } from 'react-router-dom';

const AccessDenied = ({ systemName }) => {
  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      background: '#f8fafc',
      color: '#1e293b',
      fontFamily: 'Segoe UI, sans-serif'
    }}>
      <div style={{
        background: 'white',
        padding: '40px',
        borderRadius: '16px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
        textAlign: 'center',
        maxWidth: '450px',
        border: '1px solid #e2e8f0'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>🔒</div>
        <h1 style={{ margin: '0 0 10px 0', fontSize: '24px', fontWeight: 'bold' }}>
          {systemName} Access Restricted
        </h1>
        <p style={{ color: '#64748b', marginBottom: '30px', lineHeight: '1.5' }}>
          You do not have permission to view this application. <br/>
          Access must be granted by a Master Administrator.
        </p>
        
        <Link to="/" style={{
          display: 'inline-block',
          padding: '12px 24px',
          background: '#1e293b',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '8px',
          fontWeight: '600',
          transition: 'background 0.2s'
        }}>
          Return to Command Center
        </Link>
      </div>
    </div>
  );
};

export default AccessDenied;