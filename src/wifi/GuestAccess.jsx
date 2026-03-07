import React, { useState } from 'react';
import { functions } from '../firebase_config';
import { httpsCallable } from 'firebase/functions';

export default function GuestAccess() {
    const [form, setForm] = useState({ firstName: '', lastName: '', email: '' });
    const [loading, setLoading] = useState(false);
    const [voucher, setVoucher] = useState(null);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        
        try {
            const generateCode = httpsCallable(functions, 'generateGuestVoucher');
            const result = await generateCode(form);
            if (result.data.success) {
                setVoucher(result.data.code);
            }
        } catch (err) {
            setError("Error generating code. Please ask the front desk.");
        } finally {
            setLoading(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    if (voucher) {
        return (
            <div style={{ textAlign: 'center', padding: '40px', fontFamily: 'sans-serif', maxWidth: '500px', margin: '0 auto' }}>
                {/* Print styling hides buttons when printing */}
                <style>{`@media print { .no-print { display: none !important; } }`}</style>
                
                <h2>Welcome to MakeUSA, {form.firstName}!</h2>
                <p>Your 12-hour Guest Wi-Fi pass has been generated.</p>
                
                <div style={{ margin: '30px 0', padding: '20px', background: '#f8fafc', border: '2px dashed #cbd5e1', borderRadius: '10px' }}>
                    <p style={{ margin: 0, color: '#64748b', fontWeight: 'bold' }}>ACCESS CODE</p>
                    <h1 style={{ fontSize: '48px', letterSpacing: '2px', color: '#0f172a', margin: '10px 0' }}>
                        {voucher}
                    </h1>
                </div>

                <div style={{ textAlign: 'left', background: '#ecfdf5', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: '#065f46' }}>How to connect:</h4>
                    <ol style={{ margin: 0, paddingLeft: '20px', color: '#064e3b' }}>
                        <li>Go to your device's Wi-Fi settings.</li>
                        <li>Select the network: <strong>MakeUSA_Guest</strong></li>
                        <li>When the login screen appears, enter the code above.</li>
                    </ol>
                </div>

                <button onClick={handlePrint} className="no-print" style={{ padding: '12px 24px', fontSize: '16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                    🖨️ Print Details
                </button>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: '400px', margin: '50px auto', padding: '20px', fontFamily: 'sans-serif' }}>
            <h2 style={{ textAlign: 'center', color: '#333' }}>Guest Wi-Fi Registration</h2>
            <p style={{ textAlign: 'center', color: '#666', marginBottom: '30px' }}>Please register to receive your secure access code.</p>
            
            {error && <p style={{ color: 'red', textAlign: 'center' }}>{error}</p>}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <input required placeholder="First Name" value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} style={{ padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }} />
                <input required placeholder="Last Name" value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} style={{ padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }} />
                <input required type="email" placeholder="Email Address" value={form.email} onChange={e => setForm({...form, email: e.target.value})} style={{ padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }} />
                
                <button type="submit" disabled={loading} style={{ padding: '12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer' }}>
                    {loading ? 'Generating Code...' : 'Get Wi-Fi Code'}
                </button>
            </form>
        </div>
    );
}