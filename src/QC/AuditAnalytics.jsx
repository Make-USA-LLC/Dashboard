import React, { useState, useEffect } from 'react';
import { db } from '../firebase_config';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const styles = {
    card: { background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', marginBottom: '20px' }
};

const AuditAnalytics = () => {
    const [chartData, setChartData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAnalytics = async () => {
            // Fetch in chronological order (oldest to newest) for the chart
            const q = query(collection(db, "five_s_audits"), orderBy("timestamp", "asc"));
            const snapshot = await getDocs(q);
            
            const data = snapshot.docs.map(doc => {
                const docData = doc.data();
                let totalScore = 0;
                
                // Sum the points
                if (docData.results) {
                    Object.values(docData.results).forEach(res => {
                        if (res.points) totalScore += parseInt(res.points);
                    });
                }
                
                // Format date nicely for the X-Axis
                const dateObj = docData.timestamp ? new Date(docData.timestamp.seconds * 1000) : new Date();
                const shortDate = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;

                return {
                    name: shortDate,
                    Score: totalScore,
                    fullDate: dateObj.toLocaleDateString()
                };
            });

            setChartData(data);
            setLoading(false);
        };
        fetchAnalytics();
    }, []);

    if (loading) return <div style={styles.card}>Loading analytics data...</div>;

    return (
        <div style={styles.card}>
            <h2 style={{ color: '#8e44ad', marginTop: 0 }}>📈 5S Audit Score Trends</h2>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '30px' }}>
                This chart displays the total points scored in each audit over time.
            </p>

            {chartData.length < 2 ? (
                <div style={{ textAlign: 'center', padding: '50px', background: '#f8fafc', color: '#64748b', borderRadius: '8px' }}>
                    Need at least 2 completed audits to display trends.
                </div>
            ) : (
                <div style={{ width: '100%', height: 400 }}>
                    <ResponsiveContainer>
                        <LineChart
                            data={chartData}
                            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="name" stroke="#64748b" />
                            <YAxis stroke="#64748b" />
                            <Tooltip 
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                                labelFormatter={(label, payload) => payload[0]?.payload?.fullDate || label}
                            />
                            <Legend />
                            <Line 
                                type="monotone" 
                                dataKey="Score" 
                                stroke="#8e44ad" 
                                strokeWidth={3} 
                                activeDot={{ r: 8 }} 
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
};

export default AuditAnalytics;