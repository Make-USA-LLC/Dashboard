import React, { useState } from 'react';
import { 
  signInWithPopup, 
  GoogleAuthProvider,
  signInWithEmailAndPassword, 
  sendPasswordResetEmail 
} from 'firebase/auth';
import { auth } from './firebase_config';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // State to toggle visibility of email/password fields
  const [showEmailForm, setShowEmailForm] = useState(false);

  const logoUrl = "https://makeit.buzz/wp-content/uploads/2024/06/Make-Logo-Black-E.png";

  const styles = {
    container: {
      fontFamily: "'Segoe UI', sans-serif",
      background: '#f8fafc',
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '20px'
    },
    card: {
      background: 'white',
      width: '100%',
      maxWidth: '380px',
      padding: '40px',
      borderRadius: '16px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
      textAlign: 'center'
    },
    logo: {
      maxWidth: '160px',
      marginBottom: '20px',
      height: 'auto',
      // Explicitly center the image
      display: 'block',
      marginLeft: 'auto',
      marginRight: 'auto'
    },
    title: {
      fontSize: '22px',
      fontWeight: '700',
      color: '#1e293b',
      marginBottom: '8px'
    },
    subtitle: {
      fontSize: '14px',
      color: '#64748b',
      marginBottom: '30px'
    },
    input: {
      width: '100%',
      padding: '12px',
      border: '1px solid #cbd5e1',
      borderRadius: '8px',
      marginBottom: '15px',
      fontSize: '14px',
      boxSizing: 'border-box',
      outline: 'none',
      transition: 'border 0.2s'
    },
    btnPrimary: {
      width: '100%',
      padding: '12px',
      border: 'none',
      borderRadius: '8px',
      fontSize: '15px',
      fontWeight: '600',
      cursor: loading ? 'wait' : 'pointer',
      background: '#0f172a', // Dark slate
      color: 'white',
      marginTop: '10px'
    },
    btnGoogle: {
      width: '100%',
      padding: '12px',
      border: '1px solid #e2e8f0',
      borderRadius: '8px',
      fontSize: '15px',
      fontWeight: '600',
      cursor: loading ? 'wait' : 'pointer',
      background: 'white',
      color: '#334155',
      marginBottom: '20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '10px'
    },
    btnSecondary: {
        width: '100%',
        padding: '12px',
        border: '1px solid #cbd5e1',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'pointer',
        background: 'transparent',
        color: '#475569',
        marginTop: '10px'
    },
    divider: {
      display: 'flex',
      alignItems: 'center',
      margin: '25px 0',
      color: '#94a3b8',
      fontSize: '12px',
      textTransform: 'uppercase',
      fontWeight: '600',
      letterSpacing: '0.5px'
    },
    link: {
      color: '#2563eb',
      cursor: 'pointer',
      fontSize: '13px',
      textDecoration: 'none',
      marginTop: '15px',
      display: 'inline-block'
    },
    error: {
      color: '#ef4444',
      fontSize: '13px',
      marginTop: '15px',
      background: '#fee2e2',
      padding: '8px',
      borderRadius: '6px'
    },
    backLink: {
        fontSize: '13px',
        color: '#64748b',
        cursor: 'pointer',
        marginTop: '20px',
        display: 'inline-block',
        textDecoration: 'underline'
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try { 
      await signInWithPopup(auth, provider); 
    } catch (e) { 
      setError(e.message); 
      setLoading(false);
    }
  };

  const handleEmailLogin = async () => {
    if (!email || !password) {
        setError("Please enter both email and password");
        return;
    }
    setLoading(true);
    try { 
      await signInWithEmailAndPassword(auth, email, password); 
    } catch (e) { 
      setError("Login failed. Check your credentials."); 
      setLoading(false);
    }
  };

  const handleForgot = async () => {
    const e = prompt("Enter your email to reset password:");
    if (e) {
      try {
        await sendPasswordResetEmail(auth, e);
        alert("Password reset sent!");
      } catch (err) {
        alert(err.message);
      }
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <img src={logoUrl} alt="Make USA" style={styles.logo} />
        
        <h1 style={styles.title}>Make USA Master System</h1>
        <p style={styles.subtitle}>Sign in to access your dashboard</p>

        <button style={styles.btnGoogle} onClick={handleGoogleLogin}>
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.715H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.271C4.672 5.14 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Sign in with Google
        </button>

        <div style={styles.divider}>
          <span style={{flex:1, height:'1px', background:'#e2e8f0'}}></span>
          <span style={{padding:'0 10px'}}>OR</span>
          <span style={{flex:1, height:'1px', background:'#e2e8f0'}}></span>
        </div>

        {/* Toggle between Button and Form */}
        {!showEmailForm ? (
            <button style={styles.btnSecondary} onClick={() => setShowEmailForm(true)}>
                Continue with Email
            </button>
        ) : (
            <div>
                <input 
                  type="email" 
                  style={styles.input} 
                  placeholder="Email Address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <input 
                  type="password" 
                  style={styles.input} 
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                
                <button style={styles.btnPrimary} onClick={handleEmailLogin}>
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>

                <div style={{marginTop: '10px'}}>
                     <a style={styles.link} onClick={handleForgot}>Forgot Password?</a>
                </div>
                
                <div style={styles.backLink} onClick={() => setShowEmailForm(false)}>
                    Back
                </div>
            </div>
        )}

        {error && <div style={styles.error}>{error}</div>}
      </div>
    </div>
  );
};

export default Login;