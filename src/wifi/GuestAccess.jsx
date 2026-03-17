import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { collection, addDoc, serverTimestamp, onSnapshot, doc } from 'firebase/firestore';
import { GoogleReCaptchaProvider, useGoogleReCaptcha } from 'react-google-recaptcha-v3';

const RECAPTCHA_SITE_KEY = "6LdcNYMsAAAAAGDn5A45rNo_6ltKibANemPEa2Vk";

function GuestForm() {
    const { executeRecaptcha } = useGoogleReCaptcha();
    const [form, setForm] = useState({ firstName: '', lastName: '', email: '', devices: '1' });
    const [loading, setLoading] = useState(false);
    const [voucher, setVoucher] = useState(null);
    const [error, setError] = useState('');
    const [requestId, setRequestId] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true); setError('');
        
        try {
            if (!executeRecaptcha) throw new Error("Verification unavailable.");
            const token = await executeRecaptcha('guest_wifi_request');
            if (!token) throw new Error("Bot verification failed.");

            const docRef = await addDoc(collection(db, 'guest_wifi_logs'), {
                firstName: form.firstName,
                lastName: form.lastName,
                email: form.email,
                devices: parseInt(form.devices), 
                duration: 720, 
                status: 'pending', 
                generatedAt: serverTimestamp()
            });
            setRequestId(docRef.id);
        } catch (err) {
            setError(`Error: ${err.message || "Network issue."}`);
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!requestId) return;
        const unsubscribe = onSnapshot(doc(db, 'guest_wifi_logs', requestId), (snapshot) => {
            const data = snapshot.data();
            if (data && data.status === 'completed' && data.code) {
                setVoucher(data.code); setLoading(false); setRequestId(null);
            } else if (data && data.status === 'error') {
                setError(`Server Error: ${data.error_msg || "Network issue."}`); setLoading(false); setRequestId(null);
            }
        });
        return () => unsubscribe();
    }, [requestId]);

    if (voucher) {
        return (
            <div style={cardStyle}>
                <img src="/logo.png" alt="Make USA" style={logoStyle} />
                <h2 style={{ color: '#0f172a', marginBottom: '5px' }}>Welcome!</h2>
                <p style={{ color: '#64748b', fontSize: '15px' }}>Your 12-hour Guest Wi-Fi pass is ready. A copy has been sent to your email.</p>
                
                <div style={{ margin: '30px 0', padding: '25px', background: '#f8fafc', border: '2px dashed #cbd5e1', borderRadius: '12px', textAlign: 'center' }}>
                    <p style={{ margin: 0, color: '#64748b', fontWeight: 'bold', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>Access Code</p>
                    <h1 style={{ fontSize: '48px', letterSpacing: '4px', color: '#2563eb', margin: '15px 0' }}>{voucher}</h1>
                </div>

                <div style={{ textAlign: 'left', background: '#ecfdf5', padding: '15px', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: '#065f46' }}>How to connect:</h4>
                    <ol style={{ margin: 0, paddingLeft: '20px', color: '#064e3b', lineHeight: '1.6', fontSize: '14px' }}>
                        <li>Open <strong>Settings &gt; Wi-Fi</strong>.</li>
                        <li>Select <strong>Make-Guest</strong>.</li>
                        <li>Enter the Access Code above.</li>
                    </ol>
                </div>
            </div>
        );
    }

    return (
        <div style={cardStyle}>
            <img src="/logo.png" alt="Make USA" style={logoStyle} />
            <h2 style={{ color: '#0f172a', marginBottom: '5px' }}>Guest Registration</h2>
            <p style={{ color: '#64748b', marginBottom: '30px', fontSize: '15px' }}>Please register for secure Wi-Fi access.</p>
            
            {error && <div style={{ background: '#fee2e2', border: '1px solid #ef4444', color: '#b91c1c', padding: '10px', borderRadius: '5px', marginBottom: '15px', fontSize: '14px' }}>⚠️ {error}</div>}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <input required placeholder="First Name" value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} disabled={loading} style={inputStyle} />
                <input required placeholder="Last Name" value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} disabled={loading} style={inputStyle} />
                <input required type="email" placeholder="Email Address" value={form.email} onChange={e => setForm({...form, email: e.target.value})} disabled={loading} style={inputStyle} />
                
                <div style={{ textAlign: 'left' }}>
                    <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#475569', marginBottom: '5px', display: 'block' }}>Number of Devices</label>
                    <select value={form.devices} onChange={e => setForm({...form, devices: e.target.value})} disabled={loading} style={inputStyle}>
                        <option value="1">1 Device (Phone only)</option>
                        <option value="2">2 Devices (e.g., Phone + Laptop)</option>
                        <option value="3">3 Devices</option>
                    </select>
                </div>

                <button type="submit" disabled={loading} style={{...buttonStyle, background: loading ? '#6ee7b7' : '#10b981', cursor: loading ? 'not-allowed' : 'pointer'}}>
                    {loading ? 'Verifying...' : 'Get Wi-Fi Code'}
                </button>
            </form>

            <p style={{ fontSize: '10px', color: '#cbd5e1', marginTop: '30px', textAlign: 'center' }}>
                Protected by reCAPTCHA. Google <a href="https://policies.google.com/privacy" style={{color:'#64748b'}}>Privacy</a> & <a href="https://policies.google.com/terms" style={{color:'#64748b'}}>Terms</a> apply.
            </p>
        </div>
    );
}

export default function GuestAccess() {
    return (
        <div style={{ minHeight: '100vh', width: '100%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box', fontFamily: 'Arial, sans-serif' }}>
            <GoogleReCaptchaProvider reCaptchaKey={RECAPTCHA_SITE_KEY}>
                <GuestForm />
            </GoogleReCaptchaProvider>
        </div>
    );
}

const cardStyle = { background: 'white', padding: '40px', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', maxWidth: '400px', width: '100%', boxSizing: 'border-box' };
const logoStyle = { height: '70px', marginBottom: '20px', display: 'block', marginLeft: 'auto', marginRight: 'auto', width: 'auto', objectFit: 'contain' };
const inputStyle = { padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px', width: '100%', boxSizing: 'border-box' };
const buttonStyle = { padding: '12px', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px', width: '100%', boxSizing: 'border-box' };