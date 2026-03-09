import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase_config';
import { useRole } from '../hooks/useRole';

export default function OrgChart() {
    const [employees, setEmployees] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [deptManagers, setDeptManagers] = useState({});
    const [loading, setLoading] = useState(true);
    
    // Live Print scaling
    const [printScale, setPrintScale] = useState(1.0); 

    // Modal State
    const [selectedNode, setSelectedNode] = useState(null);
    const [tempManagerId, setTempManagerId] = useState("");

    const { checkAccess } = useRole();
    
    // <-- UPDATED THIS LINE to check org_chart instead of employees -->
    const canEdit = checkAccess('org_chart', 'edit'); 

    useEffect(() => {
        const unsubEmp = onSnapshot(collection(db, "employees"), (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setEmployees(list.filter(emp => emp.status !== "Inactive"));
        });

        // Pull departments directly from your existing global settings
        const unsubSettings = onSnapshot(doc(db, "settings", "global_options"), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setDepartments(data.departments || []);
                setDeptManagers(data.departmentManagers || {});
                setLoading(false);
            }
        });

        return () => { unsubEmp(); unsubSettings(); };
    }, []);

    // Intelligent Auto-Grouping logic
    const getComputedManagerId = (emp) => {
        if (emp.managerId === 'TOP_LEVEL') return null; 
        if (emp.managerId) return emp.managerId; 
        if (emp.department) return 'DEPT_' + emp.department; 
        return null;
    };

    // --- ORPHAN DETECTION LOGIC ---
    // 1. Map all valid IDs that currently exist in the roster
    const validIds = new Set([
        ...departments.map(d => 'DEPT_' + d),
        ...employees.map(e => e.id)
    ]);

    // 2. Build the nodes, replacing missing managers with the 'UNMANAGED' flag
    const allNodes = [
        ...departments.map(d => {
            let mgrId = deptManagers[d] || null;
            if (mgrId && !validIds.has(mgrId)) mgrId = 'UNMANAGED';
            return { 
                id: 'DEPT_' + d, 
                name: d, 
                nodeType: 'department', 
                effectiveManagerId: mgrId 
            }
        }),
        ...employees.map(e => {
            let mgrId = getComputedManagerId(e);
            if (mgrId && !validIds.has(mgrId)) mgrId = 'UNMANAGED';
            return { 
                ...e, 
                nodeType: 'employee', 
                effectiveManagerId: mgrId
            }
        })
    ];

    // 3. If any nodes are flagged as unmanaged, spawn a virtual bucket to hold them
    if (allNodes.some(n => n.effectiveManagerId === 'UNMANAGED')) {
        allNodes.push({
            id: 'UNMANAGED',
            name: '⚠️ Unmanaged',
            department: 'Manager Missing / Inactive',
            nodeType: 'department', 
            effectiveManagerId: null, // Sits at the very top level
            isVirtual: true // Custom flag for red styling
        });
    }

    // FOOLPROOF HELPER: Bypasses Firebase path character limitations (fixes "Blending/3pl")
    const updateDeptManagerSafe = async (deptName, newManagerId) => {
        const globalRef = doc(db, "settings", "global_options");
        const snap = await getDoc(globalRef);
        const data = snap.exists() ? snap.data() : {};
        const dManagers = data.departmentManagers || {};
        dManagers[deptName] = newManagerId;
        await updateDoc(globalRef, { departmentManagers: dManagers });
    };

    // --- Drag and Drop Handlers ---
    const handleDragStart = (e, nodeId, nodeType) => {
        if (!canEdit) return e.preventDefault();
        e.dataTransfer.setData("nodeId", nodeId);
        e.dataTransfer.setData("nodeType", nodeType);
    };

    const handleDrop = async (e, targetId) => {
        e.preventDefault();
        e.stopPropagation();
        // Prevent dropping ONTO the unmanaged virtual bucket
        if (!canEdit || targetId === 'UNMANAGED') return;

        const draggedId = e.dataTransfer.getData("nodeId");
        const draggedType = e.dataTransfer.getData("nodeType");

        if (draggedId && draggedId !== targetId) {
            try {
                if (draggedType === 'department') {
                    const deptName = draggedId.replace('DEPT_', '');
                    await updateDeptManagerSafe(deptName, targetId === 'TOP_LEVEL' ? null : targetId);
                } else {
                    await updateDoc(doc(db, "employees", draggedId), { 
                        managerId: targetId 
                    });
                }
            } catch (err) {
                console.error("Error updating manager:", err);
                alert("Failed to update reporting structure.");
            }
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDropToRoot = async (e) => {
        e.preventDefault();
        if (!canEdit) return;
        
        const draggedId = e.dataTransfer.getData("nodeId");
        const draggedType = e.dataTransfer.getData("nodeType");
        
        if (draggedId) {
            try {
                if (draggedType === 'department') {
                    const deptName = draggedId.replace('DEPT_', '');
                    await updateDeptManagerSafe(deptName, null);
                } else {
                    await updateDoc(doc(db, "employees", draggedId), { 
                        managerId: 'TOP_LEVEL' 
                    });
                }
            } catch (err) {
                console.error("Error removing manager:", err);
            }
        }
    };

    // --- Modal Click Handlers ---
    const handleNodeClick = (node) => {
        // Prevent opening the edit modal for the virtual bucket
        if (!canEdit || node.isVirtual) return;
        setSelectedNode(node);
        setTempManagerId(node.nodeType === 'department' ? (deptManagers[node.name] || "") : (node.managerId || ""));
    };

    const handleSaveManagerModal = async () => {
        if (!canEdit || !selectedNode) return;
        try {
            if (selectedNode.nodeType === 'department') {
                const deptName = selectedNode.name;
                await updateDeptManagerSafe(deptName, tempManagerId || null);
            } else {
                await updateDoc(doc(db, "employees", selectedNode.id), {
                    managerId: tempManagerId || null 
                });
            }
            setSelectedNode(null);
        } catch (err) {
            console.error("Error updating via modal:", err);
            alert("Failed to update manager.");
        }
    };

    const getDisplayName = (node) => {
        if (node.nodeType === 'department') return `${node.name}`;
        return (node.firstName && node.lastName) ? `${node.firstName} ${node.lastName}` : (node.name || "Unknown");
    };

    const handlePrint = () => {
        window.print();
    };

    // Recursive Component
    const OrgNode = ({ node }) => {
        const directReports = allNodes.filter(n => n.effectiveManagerId === node.id);
        
        const employeeReports = directReports.filter(n => n.nodeType === 'employee').sort((a,b) => getDisplayName(a).localeCompare(getDisplayName(b)));
        const deptReports = directReports.filter(n => n.nodeType === 'department').sort((a,b) => a.name.localeCompare(b.name));
        
        const managingEmployees = employeeReports.filter(emp => allNodes.some(n => n.effectiveManagerId === emp.id));
        const leafEmployees = employeeReports.filter(emp => !allNodes.some(n => n.effectiveManagerId === emp.id));

        const isDept = node.nodeType === 'department';
        const isVirtual = node.isVirtual;

        const employeeNodes = [];
	const deptNodes = [];

        // 1. The Space-Saving Team Box
        if (leafEmployees.length > 0) {
            employeeNodes.push(
                <div key="leaf-tray" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', margin: '0 15px', flexShrink: 0, height: 'max-content' }}>
                    <div style={{ width: '2px', height: '20px', background: '#cbd5e1' }}></div>
                    <div 
                        onDrop={(e) => handleDrop(e, node.id)} 
                        onDragOver={handleDragOver}
                        style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            justifyContent: 'center',
                            gap: '10px',
                            padding: '12px',
                            background: 'rgba(241, 245, 249, 0.5)',
                            border: '2px dashed #cbd5e1',
                            borderRadius: '12px',
                            maxWidth: '650px',
                            minWidth: '150px'
                        }}
                    >
                        {leafEmployees.map(leaf => (
                            <div
                                key={leaf.id}
                                draggable={canEdit}
                                onDragStart={(e) => handleDragStart(e, leaf.id, leaf.nodeType)}
                                onDrop={(e) => handleDrop(e, leaf.id)}
                                onDragOver={handleDragOver}
                                onClick={(e) => { e.stopPropagation(); handleNodeClick(leaf); }}
                                style={{
                                    padding: '8px 12px',
                                    background: 'white',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '6px',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                    cursor: canEdit ? 'pointer' : 'default',
                                    minWidth: '120px',
                                    textAlign: 'center',
                                    zIndex: 2,
                                    transition: 'transform 0.1s ease-in-out'
                                }}
                                title={canEdit ? "Click to edit or drag to move" : ""}
                            >
                                <strong style={{ display: 'block', fontSize: '13px', color: '#0f172a' }}>
                                    {getDisplayName(leaf)}
                                </strong>
                                <span style={{ fontSize: '10px', color: '#64748b', display: 'block', marginTop: '2px' }}>
                                    {leaf.department || 'General'}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        // 2. Managing Employees
        managingEmployees.forEach(emp => {
            employeeNodes.push(<OrgNode key={emp.id} node={emp} />);
        });

        // 3. Departments
        deptReports.forEach(dept => {
            deptNodes.push(<OrgNode key={dept.id} node={dept} />);
        });

        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', margin: '0 15px', flexShrink: 0, height: 'max-content' }}>
                {node.effectiveManagerId && <div style={{ width: '2px', height: '20px', background: '#cbd5e1' }}></div>}
                
                {/* Parent Node Card */}
                <div
                    draggable={canEdit && !isVirtual}
                    onDragStart={(e) => handleDragStart(e, node.id, node.nodeType)}
                    onDrop={(e) => handleDrop(e, node.id)}
                    onDragOver={handleDragOver}
                    onClick={(e) => { e.stopPropagation(); handleNodeClick(node); }}
                    style={{
                        padding: isDept ? '8px 16px' : '12px 16px',
                        background: isVirtual ? '#fef2f2' : isDept ? '#f0f9ff' : 'white',
                        border: isVirtual ? '2px dashed #ef4444' : isDept ? '2px solid #38bdf8' : '2px solid #cbd5e1',
                        borderRadius: '8px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                        cursor: (canEdit && !isVirtual) ? 'pointer' : 'default',
                        minWidth: '140px',
                        textAlign: 'center',
                        position: 'relative',
                        zIndex: 2,
                        transition: 'transform 0.1s ease-in-out'
                    }}
                    title={(canEdit && !isVirtual) ? "Click to edit or drag to move" : ""}
                >
                    {isVirtual ? (
                         <div style={{fontSize: '10px', color: '#ef4444', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '2px'}}>
                            Needs Reassignment
                         </div>
                    ) : isDept && (
                        <div style={{fontSize: '10px', color: '#0284c7', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '2px'}}>
                            🏢 Department
                        </div>
                    )}
                    <strong style={{ display: 'block', fontSize: '14px', color: isVirtual ? '#b91c1c' : isDept ? '#0369a1' : '#0f172a' }}>
                        {getDisplayName(node)}
                    </strong>
                    {!isDept && !isVirtual && (
                        <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '4px' }}>
                            {node.department || 'General'}
                        </span>
                    )}
                </div>

                {/* Subordinates Layer */}
                {(employeeNodes.length > 0 || deptNodes.length > 0) && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', height: 'max-content' }}>
                        
                        <div style={{ width: '2px', height: '20px', background: '#cbd5e1' }}></div>
                        
                        {isDept ? (
                            /* RULE A: Parent is a GROUP -> Employees render OVER Sub-Groups (Tiered) */
                            <>
                                {employeeNodes.length > 0 && (
                                    <div style={{ display: 'flex', alignItems: 'flex-start', borderTop: employeeNodes.length > 1 ? '2px solid #cbd5e1' : 'none', position: 'relative', justifyContent: 'center' }}>
                                        {employeeNodes}
                                    </div>
                                )}

                                {employeeNodes.length > 0 && deptNodes.length > 0 && (
                                    <div style={{ width: '2px', height: '30px', background: '#cbd5e1' }}></div>
                                )}

                                {deptNodes.length > 0 && (
                                    <div style={{ 
                                        display: 'flex', 
                                        alignItems: 'flex-start', 
                                        borderTop: (deptNodes.length > 1 && employeeNodes.length === 0) ? '2px solid #cbd5e1' : 'none', 
                                        position: 'relative', 
                                        justifyContent: 'center',
                                        flexWrap: 'wrap', 
                                        maxWidth: '1400px', 
                                        marginTop: (employeeNodes.length > 0 && deptNodes.length > 1) ? '10px' : '0'
                                    }}>
                                        {deptNodes}
                                    </div>
                                )}
                            </>
                        ) : (
                            /* RULE B: Parent is a PERSON -> Everyone sits on the EXACT SAME line side-by-side */
                            <div style={{ display: 'flex', alignItems: 'flex-start', borderTop: (employeeNodes.length + deptNodes.length) > 1 ? '2px solid #cbd5e1' : 'none', position: 'relative', justifyContent: 'center' }}>
                                {deptNodes}
                                {employeeNodes}
                            </div>
                        )}
                        
                    </div>
                )}
            </div>
        );
    };

    if (loading) return <div style={{ padding: 20 }}>Loading Org Chart...</div>;

    // Grab all top-level elements, making sure the "Unmanaged" block gets pushed to the far right.
    const topLevelNodes = allNodes
        .filter(n => !n.effectiveManagerId)
        .sort((a, b) => {
            if (a.id === 'UNMANAGED') return 1;
            if (b.id === 'UNMANAGED') return -1;
            return 0;
        });

    return (
        <div>
            {/* PRINT ISOLATION STYLESHEET */}
            <style>
                {`
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    html, body, #root, .App {
                        height: 100% !important;
                        width: 100% !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        overflow: visible !important;
                        position: static !important;
                        background: white !important;
                    }
                    .org-chart-canvas, .org-chart-canvas * {
                        visibility: visible;
                    }
                    .org-chart-canvas {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100vw !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        border: none !important;
                        background: white !important;
                        min-height: auto !important;
                        overflow: visible !important;
                        display: flex !important;
                        justify-content: center !important;
                        align-items: flex-start !important;
                        
                        transform: scale(${printScale}) !important;
                        transform-origin: top center !important;
                    }
                    .org-chart-canvas div {
                        box-shadow: none !important;
                    }
                    @page {
                        size: letter landscape;
                        margin: 0.25in;
                    }
                }
                `}
            </style>

            <div className="no-print" style={{ background: 'white', padding: 20, borderRadius: 12, boxShadow: '0 2px 4px rgba(0,0,0,0.05)', marginBottom: 20, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                    <h2 style={{ margin: 0 }}>Organization Chart</h2>
                    <p style={{ margin: '5px 0 0 0', color: '#64748b', fontSize: '13px' }}>
                        Drag to move. Groups under Groups are tiered. Groups under People sit side-by-side.
                    </p>
                </div>
                
                <div style={{display: 'flex', gap: '15px', alignItems: 'center'}}>
                    {/* LIVE PRINT SCALE SLIDER */}
                    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#f8fafc', padding: '5px 10px', borderRadius: '8px', border: '1px solid #e2e8f0'}}>
                        <label style={{fontSize: '11px', fontWeight: 'bold', color: '#64748b'}}>Zoom / Scale ({(printScale * 100).toFixed(0)}%)</label>
                        <input 
                            type="range" 
                            min="0.1" 
                            max="1.5" 
                            step="0.05" 
                            value={printScale} 
                            onChange={(e) => setPrintScale(parseFloat(e.target.value))} 
                            style={{width: '100px', cursor: 'pointer'}}
                        />
                    </div>

                    <button 
                        onClick={handlePrint} 
                        style={{background: 'white', color: '#0f172a', border: '1px solid #cbd5e1', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'}}
                    >
                        🖨️ Print
                    </button>
                    
                    {canEdit && (
                        <div
                            onDrop={handleDropToRoot}
                            onDragOver={handleDragOver}
                            style={{
                                padding: '10px 20px',
                                border: '2px dashed #94a3b8',
                                borderRadius: '8px',
                                color: '#475569',
                                fontSize: '13px',
                                background: '#f8fafc'
                            }}
                        >
                            🗑️ Drop here to make Top-Level
                        </div>
                    )}
                </div>
            </div>

            {/* Tree Canvas */}
            {/* Tree Canvas */}
            <div className="org-chart-canvas" style={{ 
                overflowX: 'auto', 
                padding: '40px 20px', 
                background: '#f8fafc', 
                borderRadius: 12, 
                border: '1px solid #e2e8f0', 
                minHeight: '600px' 
                /* Removed display: 'flex' and justifyContent: 'center' from here */
            }}>
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'center', 
                    alignItems: 'flex-start', 
                    minWidth: 'max-content',
                    height: 'max-content', 
                    margin: '0 auto', /* <--- This adds safe centering */
                    transform: `scale(${printScale})`,
                    transformOrigin: 'top center',
                    transition: 'transform 0.2s ease-in-out'
                }}>
                    {topLevelNodes.length === 0 ? (
                        <p style={{ color: '#94a3b8', textAlign: 'center' }}>No structure found.</p>
                    ) : (
                        topLevelNodes.map(node => (
                            <OrgNode key={node.id} node={node} />
                        ))
                    )}
                </div>
            </div>

            {selectedNode && (
                <div className="modal-overlay no-print" onClick={() => setSelectedNode(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth: '400px'}}>
                        <h3 style={{marginTop: 0}}>Edit Reporting</h3>
                        <p style={{fontSize: '14px', color: '#64748b', marginBottom: '15px'}}>
                            Assigning manager for <strong>{getDisplayName(selectedNode)}</strong>.
                        </p>
                        
                        <label style={{display:'block', marginBottom:'5px', fontWeight:'bold', fontSize:'12px'}}>Reports To</label>
                        <select 
                            value={tempManagerId} 
                            onChange={e => setTempManagerId(e.target.value)}
                            style={{width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1'}}
                        >
                            {selectedNode.nodeType === 'employee' && <option value="">-- Default (Auto-Group to Department) --</option>}
                            {selectedNode.nodeType === 'department' && <option value="">-- Top Level (No Manager) --</option>}
                            
                            {selectedNode.nodeType === 'employee' && <option value="TOP_LEVEL">-- Top Level (No Manager) --</option>}
                            
                            <optgroup label="Departments">
                                {departments.map(d => (
                                    (!selectedNode.id || selectedNode.id !== `DEPT_${d}`) && <option key={d} value={`DEPT_${d}`}>🏢 {d}</option>
                                ))}
                            </optgroup>
                            <optgroup label="Specific People">
                                {employees.map(emp => (
                                    emp.id !== selectedNode.id && <option key={emp.id} value={emp.id}>{getDisplayName(emp)}</option>
                                ))}
                            </optgroup>
                        </select>

                        <div style={{marginTop: '25px', display: 'flex', gap: '10px'}}>
                            <button type="button" onClick={() => setSelectedNode(null)} style={{flex: 1, background: '#f1f5f9', color: '#0f172a', border: '1px solid #cbd5e1'}}>Cancel</button>
                            <button type="button" className="primary" onClick={handleSaveManagerModal} style={{flex: 1}}>Save Changes</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}