import React, { useState } from 'react';
import ProductionQueue from './ProductionQueue';
import ActiveProjects from './ActiveProjects';
import { styles } from './styles';

const ProductionApp = () => {
    const [activeTab, setActiveTab] = useState('pipeline');

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h2 style={{color: '#2c3e50', margin:0}}>🏭 Production Management</h2>
            </div>
            
            <div style={styles.tabs}>
                <button style={styles.tab(activeTab === 'pipeline')} onClick={() => setActiveTab('pipeline')}>
                    Production Pipeline
                </button>
                <button style={styles.tab(activeTab === 'active_projects')} onClick={() => setActiveTab('active_projects')}>
                    All Active Projects
                </button>
            </div>

            {activeTab === 'pipeline' && <ProductionQueue />}
            {activeTab === 'active_projects' && <ActiveProjects />}
        </div>
    );
};

export default ProductionApp;