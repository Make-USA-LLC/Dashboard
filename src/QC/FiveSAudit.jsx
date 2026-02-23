import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { collection, doc, getDoc, addDoc, serverTimestamp } from 'firebase/firestore';

const styles = {
    card: { background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', marginBottom: '20px' },
    table: { width: '100%', borderCollapse: 'collapse', marginTop: '10px' },
    th: { background: '#f8fafc', padding: '10px', textAlign: 'left', borderBottom: '2px solid #ccc' },
    td: { padding: '10px', borderBottom: '1px solid #eee', verticalAlign: 'top' },
    input: { padding: '5px', width: '100%', boxSizing: 'border-box' },
    btn: { padding: '10px 20px', background: '#8e44ad', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }
};

const FiveSAudit = () => {
    const [auditConfig, setAuditConfig] = useState(null);
    const [owners, setOwners] = useState([]);
    const [formData, setFormData] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            const configSnap = await getDoc(doc(db, "qc_settings", "five_s_config"));
            if (configSnap.exists()) {
                setAuditConfig(configSnap.data());
            }
            
            const ownersSnap = await getDoc(doc(db, "qc_settings", "owners"));
            if (ownersSnap.exists()) {
                setOwners(ownersSnap.data().list || []);
            }
        };
        fetchData();
    }, []);

    const handleInputChange = (categoryIndex, questionIndex, field, value) => {
        setFormData(prev => ({
            ...prev,
            [`${categoryIndex}-${questionIndex}`]: {
                ...prev[`${categoryIndex}-${questionIndex}`],
                [field]: value
            }
        }));
    };

    const submitAudit = async () => {
        let isComplete = true;
        let errorMessage = "";
        
        // Dynamic threshold from settings, fallback to 3
        const threshold = auditConfig.alertThreshold !== undefined ? auditConfig.alertThreshold : 3;

        // --- VALIDATION PASS ---
        for (let cIdx = 0; cIdx < auditConfig.categories.length; cIdx++) {
            const category = auditConfig.categories[cIdx];
            for (let qIdx = 0; qIdx < category.questions.length; qIdx++) {
                const key = `${cIdx}-${qIdx}`;
                const data = formData[key] || {};
                
                // 1. Check if points are filled out AT ALL
                if (data.points === undefined || data.points === "") {
                    isComplete = false;
                    errorMessage = `Please assign a score for all questions.\n\nMissing score for:\n"${category.questions[qIdx]}"`;
                    break;
                }

                // 2. Conditional check: If score is below threshold, require extra details
                const scoreGiven = parseInt(data.points);
                if (scoreGiven < threshold) {
                    if (!data.action || !data.dueDate || !data.owner) {
                        isComplete = false;
                        errorMessage = `You scored a question below a ${threshold}, so Action, Due Date, and Owner are REQUIRED.\n\nMissing details for:\n"${category.questions[qIdx]}"`;
                        break;
                    }
                }
            }
            if (!isComplete) break;
        }

        if (!isComplete) {
            alert(errorMessage);
            return;
        }
        // -----------------------

        setIsSubmitting(true);
        try {
            const formattedResults = {};
            
            Object.keys(formData).forEach(key => {
                const [cIdx, qIdx] = key.split('-');
                const questionText = auditConfig.categories[cIdx].questions[qIdx];
                
                formattedResults[key] = {
                    ...formData[key],
                    question: questionText 
                };
            });

            await addDoc(collection(db, "five_s_audits"), {
                results: formattedResults,
                timestamp: serverTimestamp(),
                status: "submitted"
            });
            
            alert("Audit submitted successfully!");
            setFormData({}); 
        } catch (error) {
            alert("Error submitting audit: " + error.message);
        }
        setIsSubmitting(false);
    };

    const getScoreOptions = (min = 0, max = 4) => {
        const options = [];
        for (let i = max; i >= min; i--) {
            options.push(i);
        }
        return options;
    };

    if (!auditConfig) return <div style={styles.card}>Loading audit configuration... Please set it up in Settings.</div>;

    // Get the global threshold to decide what highlights red
    const alertThreshold = auditConfig.alertThreshold !== undefined ? auditConfig.alertThreshold : 3;

    return (
        <div style={styles.card}>
            <h2>📋 5S Audit Execution</h2>
            <div style={{background: '#fffbeb', padding: '10px', borderLeft: '4px solid #f59e0b', marginBottom: '20px', fontSize: '14px'}}>
                ⚠️ <strong>Note:</strong> Any score <strong>below {alertThreshold}</strong> will require an Action, Due Date, and Owner assignment.
            </div>
            
            {auditConfig.categories.map((category, cIdx) => (
                <div key={cIdx} style={{ marginBottom: '30px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #8e44ad', paddingBottom: '5px' }}>
                        <h3 style={{ color: '#8e44ad', margin: 0 }}>{category.name}</h3>
                        <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', background: '#f1f5f9', padding: '3px 8px', borderRadius: '4px' }}>
                            Scale: {category.minScore ?? 0} to {category.maxScore ?? 4}
                        </span>
                    </div>
                    
                    <table style={styles.table}>
                        <thead>
                            <tr>
                                <th style={styles.th}>Question <span style={{color: 'red'}}>*</span></th>
                                <th style={styles.th} style={{width: '80px'}}>Points <span style={{color: 'red'}}>*</span></th>
                                <th style={styles.th}>Observations/Action</th>
                                <th style={styles.th} style={{width: '130px'}}>Due Date</th>
                                <th style={styles.th} style={{width: '150px'}}>Owner</th>
                            </tr>
                        </thead>
                        <tbody>
                            {category.questions.map((q, qIdx) => {
                                const fieldId = `${cIdx}-${qIdx}`;
                                const currentData = formData[fieldId] || {};
                                
                                // Validation styling checks
                                const isPointsMissing = currentData.points === undefined || currentData.points === "";
                                const scoreGiven = parseInt(currentData.points);
                                const isBelowThreshold = !isNaN(scoreGiven) && scoreGiven < alertThreshold;
                                
                                // Conditional Borders
                                const pointsBorder = isPointsMissing ? '2px solid #fca5a5' : '1px solid #ccc';
                                const detailsBorder = isBelowThreshold ? '2px solid #fca5a5' : '1px solid #ccc';

                                return (
                                    <tr key={qIdx} style={{ background: isPointsMissing ? '#fff5f5' : (isBelowThreshold ? '#fef2f2' : 'transparent') }}>
                                        <td style={styles.td}>
                                            {q}
                                            {isBelowThreshold && <div style={{color: '#ef4444', fontSize: '11px', fontWeight: 'bold', marginTop: '5px'}}>Low Score: Action Required</div>}
                                        </td>
                                        <td style={styles.td}>
                                            <select 
                                                style={{...styles.input, fontWeight: 'bold', border: pointsBorder}} 
                                                value={currentData.points || ""}
                                                onChange={(e) => handleInputChange(cIdx, qIdx, 'points', e.target.value)}
                                            >
                                                <option value="">-</option>
                                                {getScoreOptions(category.minScore, category.maxScore).map(num => (
                                                    <option key={num} value={num}>{num}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td style={styles.td}>
                                            <input 
                                                type="text" 
                                                style={{...styles.input, border: (!currentData.action && isBelowThreshold) ? detailsBorder : '1px solid #ccc'}} 
                                                value={currentData.action || ""} 
                                                placeholder={isBelowThreshold ? "Required..." : "Action..."} 
                                                onChange={(e) => handleInputChange(cIdx, qIdx, 'action', e.target.value)} 
                                            />
                                        </td>
                                        <td style={styles.td}>
                                            <input 
                                                type="date" 
                                                style={{...styles.input, border: (!currentData.dueDate && isBelowThreshold) ? detailsBorder : '1px solid #ccc'}} 
                                                value={currentData.dueDate || ""} 
                                                onChange={(e) => handleInputChange(cIdx, qIdx, 'dueDate', e.target.value)} 
                                            />
                                        </td>
                                        <td style={styles.td}>
                                            <select 
                                                style={{...styles.input, border: (!currentData.owner && isBelowThreshold) ? detailsBorder : '1px solid #ccc'}} 
                                                value={currentData.owner || ""} 
                                                onChange={(e) => handleInputChange(cIdx, qIdx, 'owner', e.target.value)}
                                            >
                                                <option value="">Select Owner</option>
                                                {owners.map((owner, i) => (
                                                    <option key={i} value={owner.email}>{owner.name}</option>
                                                ))}
                                            </select>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ))}
            
            <button 
                style={{...styles.btn, background: isSubmitting ? '#ccc' : '#8e44ad'}} 
                onClick={submitAudit} 
                disabled={isSubmitting}
            >
                {isSubmitting ? "Submitting..." : "Submit Audit"}
            </button>
        </div>
    );
};

export default FiveSAudit;