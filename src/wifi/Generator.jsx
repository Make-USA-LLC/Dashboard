import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { collection, addDoc, serverTimestamp, onSnapshot, doc } from 'firebase/firestore';

export default function Generator() {
    const [form, setForm] = useState({ 
        firstName: '', lastName: '', email: '', 
        durationSelection: '720', 
        customValue: '14', customUnit: 'days', 
        deviceSelection: '1', 
        customDeviceValue: '10' 
    });
    const [loading, setLoading] = useState(false);
    const [voucher, setVoucher] = useState(null);
    const [error, setError] = useState('');
    const [requestId, setRequestId] = useState(null);

    const handleGenerate = async (e) => {
        e.preventDefault();
        setLoading(true); setError(''); setVoucher(null);
        
        try {
            // 1. Calculate the exact minutes to send to UniFi
            let finalDurationMins = 720;
            if (form.durationSelection === 'custom') {
                const val = parseInt(form.customValue);
                if (isNaN(val) || val <= 0) throw new Error("Please enter a valid custom duration number.");
                finalDurationMins = form.customUnit === 'days' ? val * 1440 : val * 60;
            } else {
                finalDurationMins = parseInt(form.durationSelection);
            }

            // 2. Calculate the exact number of devices
            let finalDevices = 1;
            if (form.deviceSelection === 'custom') {
                const dVal = parseInt(form.customDeviceValue);
                if (isNaN(dVal) || dVal <= 0) throw new Error("Please enter a valid number of devices.");
                finalDevices = dVal;
            } else {
                finalDevices = parseInt(form.deviceSelection);
            }

            // 3. SECURITY CHECK: Confirm if > 5 Days OR > 6 Devices
            if (finalDurationMins > 7200 || finalDevices > 6) {
                const daysToDisplay = (finalDurationMins / 1440).toFixed(1).replace('.0', '');
                const confirmed = window.confirm(
                    `⚠️ SECURITY WARNING ⚠️\n\nYou are about to generate a pass for ${daysToDisplay} days and ${finalDevices} devices.\n\nAre you sure you want to grant this much access?`
                );
                
                if (!confirmed) {
                    setLoading(false);
                    return; // Stop the generation process
                }
            }

            // 4. Submit to Firebase
            const docRef = await addDoc(collection(db, 'guest_wifi_logs'), {
                firstName: form.firstName, lastName: form.lastName, email: form.email,
                duration: finalDurationMins, devices: finalDevices,
                status: 'pending', generatedAt: serverTimestamp()
            });
            setRequestId(docRef.id);
        } catch (err) {
            setError(err.message || "Error connecting to Firebase Database."); setLoading(false);
        }
    };

    // Listen for the background script's reply
    useEffect(() => {
        if (!requestId) return;
        const unsubscribe = onSnapshot(doc(db, 'guest_wifi_logs', requestId), (snapshot) => {
            const data = snapshot.data();
            if (data && data.status === 'completed' && data.code) {
                setVoucher(data.code); setLoading(false); setRequestId(null);
            } else if (data && data.status === 'error') {
                setError(`Server Error: ${data.error_msg}`); setLoading(false); setRequestId(null);
            }
        });
        return () => unsubscribe();
    }, [requestId]);

    const handlePrint = () => window.print();
    
    // Format the text for the printed voucher based on what they selected
    const getDurationText = () => {
        if (form.durationSelection === 'custom') return `${form.customValue}-${form.customUnit === 'days' ? 'day' : 'hour'}`;
        const mapping = { '120': '2-hour', '720': '12-hour', '1440': '1-day', '4320': '3-day', '10080': '7-day' };
        return mapping[form.durationSelection] || 'temporary';
    };
    const durationText = getDurationText();
    const displayDevices = form.deviceSelection === 'custom' ? form.customDeviceValue : form.deviceSelection;

    return (
        <div style={{ background: 'white', padding: '30px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <style>{`@media print { body * { visibility: hidden; } #printable-voucher, #printable-voucher * { visibility: visible; } #printable-voucher { position: absolute; left: 0; top: 0; width: 100%; padding: 40px !important; margin: 0 !important; box-sizing: border-box; } .no-print { display: none !important; } } @media screen { .print-header { display: none; } }`}</style>

            <h2 className="no-print" style={{ marginTop: 0 }}>Office Wi-Fi Generator</h2>
            
            {!voucher && (
                <form className="no-print" onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '18px', maxWidth: '450px' }}>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <input required placeholder="First Name" value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} disabled={loading} style={{ flex: 1, padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }} />
                        <input required placeholder="Last Name" value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} disabled={loading} style={{ flex: 1, padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }} />
                    </div>
                    <input required type="email" placeholder="Guest Email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} disabled={loading} style={{ padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }} />
                    
                    {/* QUICK SELECT DURATION BUTTONS */}
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '8px' }}>Pass Duration</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {[
                                { val: '120', label: '2 Hrs' },
                                { val: '720', label: '12 Hrs' },
                                { val: '1440', label: '1 Day' },
                                { val: '10080', label: '7 Days' },
                                { val: 'custom', label: 'Custom...' }
                            ].map(btn => (
                                <button 
                                    key={btn.val} type="button" disabled={loading}
                                    onClick={() => setForm({...form, durationSelection: btn.val})}
                                    style={{ 
                                        padding: '8px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold',
                                        background: form.durationSelection === btn.val ? '#0f172a' : '#f8fafc',
                                        color: form.durationSelection === btn.val ? 'white' : '#475569',
                                        transition: 'all 0.2s'
                                    }}>
                                    {btn.label}
                                </button>
                            ))}
                        </div>

                        {/* CUSTOM DURATION POP-OUT */}
                        {form.durationSelection === 'custom' && (
                            <div style={{ display: 'flex', gap: '10px', marginTop: '12px', background: '#f1f5f9', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '4px' }}>Amount</label>
                                    <input type="number" min="1" required value={form.customValue} onChange={e => setForm({...form, customValue: e.target.value})} disabled={loading} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '4px' }}>Format</label>
                                    <select value={form.customUnit} onChange={e => setForm({...form, customUnit: e.target.value})} disabled={loading} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}>
                                        <option value="hours">Hours</option>
                                        <option value="days">Days</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* DEVICES DROPDOWN */}
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '8px' }}>Devices Allowed</label>
                        <select value={form.deviceSelection} onChange={e => setForm({...form, deviceSelection: e.target.value})} disabled={loading} style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }}>
                            <option value="1">1 Device</option>
                            <option value="2">2 Devices</option>
                            <option value="3">3 Devices</option>
                            <option value="4">4 Devices</option>
                            <option value="5">5 Devices (Vendor Team)</option>
                            <option value="custom">Custom...</option>
                        </select>
                        
                        {/* CUSTOM DEVICE POP-OUT */}
                        {form.deviceSelection === 'custom' && (
                            <div style={{ marginTop: '12px', background: '#f1f5f9', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '4px' }}>Custom Number of Devices</label>
                                <input type="number" min="1" required value={form.customDeviceValue} onChange={e => setForm({...form, customDeviceValue: e.target.value})} disabled={loading} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                            </div>
                        )}
                    </div>

                    {error && <div style={{ padding: '10px', background: '#fee2e2', border: '1px solid #ef4444', borderRadius: '5px', color: '#b91c1c', fontSize: '13px' }}><strong>⚠️ Error:</strong> {error}</div>}

                    <button type="submit" disabled={loading} style={{ padding: '14px', background: '#10b981', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', fontSize: '15px', cursor: loading ? 'not-allowed' : 'pointer', marginTop: '5px', boxShadow: '0 2px 4px rgba(16, 185, 129, 0.3)' }}>
                        {loading ? 'Generating...' : `Generate ${durationText} Pass`}
                    </button>
                </form>
            )}

            {/* VOUCHER DISPLAY */}
            {voucher && (
                <div id="printable-voucher" style={{ maxWidth: '650px', margin: '0 auto', fontFamily: 'Arial, sans-serif' }}>
                    <div className="print-header" style={{ borderBottom: '3px solid #0f172a', paddingBottom: '20px', marginBottom: '30px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <img src="/logo.png" alt="Make USA" style={{ height: '60px', width: 'auto', objectFit: 'contain' }} />
                        <div>
                            <h1 style={{ margin: 0, color: '#0f172a', fontSize: '32px', letterSpacing: '2px', textTransform: 'uppercase' }}>Make USA</h1>
                            <p style={{ margin: '5px 0 0 0', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 'bold', fontSize: '13px' }}>Secure Guest Network Access</p>
                        </div>
                    </div>

                    <h2 style={{ marginTop: 0, color: '#1e293b', fontSize: '24px' }}>Welcome, {form.firstName}!</h2>
                    <p style={{ color: '#475569', fontSize: '15px' }}>Your temporary Wi-Fi pass is valid for <strong>{durationText}</strong> and allows up to <strong>{displayDevices} device(s)</strong>.</p>
                    
                    <div style={{ margin: '35px 0', background: '#f8fafc', border: '2px dashed #cbd5e1', borderRadius: '12px', padding: '40px', textAlign: 'center' }}>
                        <p style={{ margin: 0, color: '#64748b', fontWeight: 'bold', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px' }}>Network Name (SSID)</p>
                        <h2 style={{ margin: '10px 0 30px 0', color: '#0f172a', fontSize: '26px' }}>Make-Guest</h2>
                        <p style={{ margin: 0, color: '#64748b', fontWeight: 'bold', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px' }}>Access Code</p>
                        <h1 style={{ margin: '10px 0 0 0', color: '#2563eb', fontSize: '56px', letterSpacing: '6px' }}>{voucher}</h1>
                    </div>

                    <div style={{ textAlign: 'left', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
                        <h4 style={{ margin: '0 0 10px 0', color: '#334155', fontSize: '16px' }}>How to connect:</h4>
                        <ol style={{ margin: 0, paddingLeft: '20px', color: '#475569', lineHeight: '1.6', fontSize: '15px' }}>
                            <li>Go to <strong>Settings &gt; Wi-Fi</strong> on your device.</li>
                            <li>Select the network named <strong>Make-Guest</strong>.</li>
                            <li>When the login screen appears, enter the Access Code above.</li>
                        </ol>
                    </div>

                    <div className="print-header" style={{ marginTop: '50px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '15px' }}>
                        <p style={{ margin: '0 0 5px 0' }}>Generated on {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}</p>
                        <p style={{ margin: 0 }}>For IT Support, please notify the front desk.</p>
                    </div>

                    <div className="no-print" style={{ display: 'flex', gap: '15px', justifyContent: 'center', marginTop: '40px' }}>
                        <button onClick={handlePrint} style={{ padding: '12px 24px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px' }}>🖨️ Print for Guest</button>
                        <button onClick={() => { setVoucher(null); setForm({firstName:'', lastName:'', email:'', durationSelection:'720', customValue:'14', customUnit:'days', deviceSelection:'1', customDeviceValue:'10'}); }} style={{ padding: '12px 24px', background: '#e2e8f0', color: '#333', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px' }}>Clear & Reset</button>
                    </div>
                </div>
            )}
        </div>
    );
}