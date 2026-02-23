import React, { useState } from 'react';
import JobApproval from './JobApproval';
import FiveSAudit from './FiveSAudit';
import Settings from './Settings';
import AuditHistory from './AuditHistory';
import AuditAnalytics from './AuditAnalytics';

const styles = {
    container: { padding: '20px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Segoe UI, sans-serif' },
    nav: { display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #ccc', paddingBottom: '10px', flexWrap: 'wrap' },
    tabBtn: (active) => ({
        padding: '10px 20px',
        cursor: 'pointer',
        background: active ? '#8e44ad' : '#f1f1f1',
        color: active ? 'white' : 'black',
        border: 'none',
        borderRadius: '5px',
        fontWeight: 'bold',
        transition: 'background 0.2s'
    })
};

const QCMain = () => {
    const [activeTab, setActiveTab] = useState('approval');

    return (
        <div style={styles.container}>
            {/* HIDE NAV WHEN PRINTING */}
            <div className="no-print" style={styles.nav}>
                <button style={styles.tabBtn(activeTab === 'approval')} onClick={() => setActiveTab('approval')}>Job Approval</button>
                <button style={styles.tabBtn(activeTab === 'audit')} onClick={() => setActiveTab('audit')}>New 5S Audit</button>
                <button style={styles.tabBtn(activeTab === 'history')} onClick={() => setActiveTab('history')}>Audit History</button>
                <button style={styles.tabBtn(activeTab === 'analytics')} onClick={() => setActiveTab('analytics')}>Analytics</button>
                <button style={styles.tabBtn(activeTab === 'settings')} onClick={() => setActiveTab('settings')}>Settings</button>
            </div>

            {activeTab === 'approval' && <JobApproval />}
            {activeTab === 'audit' && <FiveSAudit />}
            {activeTab === 'history' && <AuditHistory />}
            {activeTab === 'analytics' && <AuditAnalytics />}
            {activeTab === 'settings' && <Settings />}
        </div>
    );
};

export default QCMain;