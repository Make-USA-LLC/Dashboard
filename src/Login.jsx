import React, { useState } from 'react';
import { signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from './firebase_config'; // Removed unused db and firestore imports
import { resetAndSeedDemo } from './utils/demoSeeder';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);

  const isDemo = import.meta.env.VITE_IS_DEMO === 'true';
  const logoUrl = "https://makeit.buzz/wp-content/uploads/2024/06/Make-Logo-Black-E.png";

  const styles = {
    container: { fontFamily: "'Segoe UI', sans-serif", background: '#f8fafc', minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' },
    card: { background: 'white', width: '100%', maxWidth: '380px', padding: '40px', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', textAlign: 'center' },
    logo: { maxWidth: '160px', marginBottom: '20px', height: 'auto', display: 'block', marginLeft: 'auto', marginRight: 'auto' },
    title: { fontSize: '22px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' },
    subtitle: { fontSize: '14px', color: '#64748b', marginBottom: '30px' },
    input: { width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', marginBottom: '15px', fontSize: '14px', boxSizing: 'border-box', outline: 'none' },
    btnPrimary: { width: '100%', padding: '12px', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: loading ? 'wait' : 'pointer', background: '#0f172a', color: 'white', marginTop: '10px' },
    btnDemo: { width: '100%', padding: '12px', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: loading ? 'wait' : 'pointer', background: '#10b981', color: 'white', marginBottom: '20px', boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.4)' },
    btnGoogle: { width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: loading ? 'wait' : 'pointer', background: 'white', color: '#334155', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' },
    btnSecondary: { width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', background: 'transparent', color: '#475569', marginTop: '10px' },
    divider: { display: 'flex', alignItems: 'center', margin: '25px 0', color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase', fontWeight: '600' },
    link: { color: '#2563eb', cursor: 'pointer', fontSize: '13px', textDecoration: 'none', marginTop: '15px', display: 'inline-block' },
    error: { color: '#ef4444', fontSize: '13px', marginTop: '15px', background: '#fee2e2', padding: '8px', borderRadius: '6px' },
    backLink: { fontSize: '13px', color: '#64748b', cursor: 'pointer', marginTop: '20px', display: 'inline-block', textDecoration: 'underline' }
  };

  const handleDemoLogin = async () => {
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, "demo@makeusa.us", "Password1!");
      console.log("Demo login clicked. Resetting and seeding database...");
      await resetAndSeedDemo(); // Forces the reseed every time the demo button is clicked
      console.log("Database seeded successfully!");
      // Note: navigate('/dashboard') or your routing logic should take over via an Auth listener, 
      // but you can explicitly add a redirect here if your app doesn't do it automatically.
    } catch (e) {
      console.error(e);
      setError("Demo environment currently unavailable.");
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => { 
      setLoading(true); 
      try { 
          await signInWithPopup(auth, new GoogleAuthProvider()); 
      } catch (e) { 
          setError(e.message); 
          setLoading(false); 
      } 
  };

  const handleEmailLogin = async () => { 
      if (!email || !password) return setError("Please enter both"); 
      setLoading(true); 
      try { 
          const userCredential = await signInWithEmailAndPassword(auth, email, password); 
          
          // Catch manual demo logins and seed the database
          if (userCredential.user.email.toLowerCase() === 'demo@makeusa.us') {
              console.log("Demo user detected via email. Wiping and seeding database...");
              await resetAndSeedDemo();
              console.log("Database seeded successfully!");
          }
      } catch (e) { 
          setError("Login failed."); 
          setLoading(false); 
      } 
  };

  const handleForgot = async () => { 
      const e = prompt("Enter email:"); 
      if (e) { 
          try { 
              await sendPasswordResetEmail(auth, e); 
              alert("Sent!"); 
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
        <p style={styles.subtitle}>{isDemo ? "Demo Environment - Feel free to explore!" : "Sign in to access your dashboard"}</p>
        
        {isDemo && (
          <button style={styles.btnDemo} onClick={handleDemoLogin} disabled={loading}>
            {loading ? 'Starting Demo...' : '🚀 Try Interactive Demo'}
          </button>
        )}
        
        <button style={styles.btnGoogle} onClick={handleGoogleLogin}>

            Sign in with Google
        </button>
        
        <div style={styles.divider}><span style={{flex:1, height:'1px', background:'#e2e8f0'}}></span><span style={{padding:'0 10px'}}>OR</span><span style={{flex:1, height:'1px', background:'#e2e8f0'}}></span></div>
        
        {!showEmailForm ? (
            <button style={styles.btnSecondary} onClick={() => setShowEmailForm(true)}>Continue with Email</button>
        ) : (
            <div>
                <input type="email" style={styles.input} placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} />
                <input type="password" style={styles.input} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button style={styles.btnPrimary} onClick={handleEmailLogin}>{loading ? 'Signing in...' : 'Sign In'}</button>
                <div style={{marginTop: '10px'}}><a style={styles.link} onClick={handleForgot}>Forgot Password?</a></div>
                <div style={styles.backLink} onClick={() => setShowEmailForm(false)}>Back</div>
            </div>
        )}
        
        {error && <div style={styles.error}>{error}</div>}
      </div>
    </div>
  );
};

export default Login;