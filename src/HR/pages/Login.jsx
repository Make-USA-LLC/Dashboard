import React, { useState } from 'react';
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useNavigate, useLocation } from 'react-router-dom'; // <--- Added useLocation
import { logFailedLogin } from '../utils/logger'; 

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation(); // <--- Get current location state
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Determine where to send the user after login
  // If they were redirected here by ProtectedRoute, 'from' will hold that path.
  // Otherwise, default to "/" (Home).
  const from = location.state?.from?.pathname || "/";

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      // Check Whitelist
      const docRef = doc(db, "authorized_users", user.email);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        // SUCCESS: Send them to their intended destination
        navigate(from, { replace: true }); 
      } else {
        logFailedLogin(user.email);
        alert("Access Denied: Your email is not authorized.");
        await auth.signOut(); 
        setIsLoggingIn(false);
      }

    } catch (error) {
      console.error("Login failed", error);
      setIsLoggingIn(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        
        {/* Logo / Header */}
        <div style={styles.header}>
          <div style={styles.badge}>Make USA</div>
          <h1 style={styles.title}>HR Suite</h1>
          <p style={styles.text}>Secure Personnel System</p>
        </div>

        {/* Login Button */}
        <button 
          onClick={handleLogin} 
          disabled={isLoggingIn}
          style={{
            ...styles.button,
            opacity: isLoggingIn ? 0.7 : 1,
            cursor: isLoggingIn ? 'not-allowed' : 'pointer'
          }}
        >
          {/* Google Icon */}
          <div style={styles.iconContainer}>
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.715H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.271C4.672 5.14 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
          </div>
          <span style={styles.btnText}>
            {isLoggingIn ? "Signing in..." : "Sign in with Google"}
          </span>
        </button>

        <div style={styles.footer}>
          Authorized Use Only
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', 
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: '#f1f5f9',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999
  },
  card: {
    backgroundColor: 'white',
    padding: '40px',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
    width: '100%',
    maxWidth: '380px',
    textAlign: 'center'
  },
  header: {
    marginBottom: '30px'
  },
  badge: {
    backgroundColor: '#0f172a',
    color: 'white',
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    display: 'inline-block',
    marginBottom: '15px'
  },
  title: {
    fontSize: '26px',
    fontWeight: '800',
    color: '#1e293b',
    margin: '0 0 5px 0'
  },
  text: {
    fontSize: '14px',
    color: '#64748b',
    margin: 0
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    width: '100%',
    padding: '12px',
    fontSize: '16px',
    fontWeight: '600',
    color: '#334155',
    transition: 'background 0.2s',
    cursor: 'pointer'
  },
  iconContainer: {
    marginRight: '12px',
    display: 'flex',
    alignItems: 'center'
  },
  btnText: {
    marginTop: '1px' 
  },
  footer: {
    marginTop: '25px',
    fontSize: '11px',
    color: '#94a3b8',
    borderTop: '1px solid #f1f5f9',
    paddingTop: '15px'
  }
};