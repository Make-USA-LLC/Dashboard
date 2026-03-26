import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import './ProjectSearch.css';
import Loader from '../components/Loader';
import { db } from './firebase_config.jsx';
import { collection, query, limit, where, getDocs, doc, getDoc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { useRole } from './hooks/useRole'; // <-- Imported centralized hook

const FIELD_MAPPINGS = {
    'Line Leader': ['line leader', 'line leader_1', 'leader', 'lineleader'],
    'Desc': ['desc', 'financedesc', 'description', 'project', 'project name', 'item'],
    'CUSTOMER': ['customer', 'company', 'client', 'customer name'],
    'PL#': ['pl#', 'pl', 'job id', 'job #', 'pl number', 'plnumber', 'jobid'],
    'Inv $': ['inv $', 'invoice amount', 'invoice total', 'total'],
    'Profit/ loss': ['profit/ loss', 'p/l', 'profit', 'loss', 'net profit', 'netprofit'],
    'Labor HRS': ['labor hrs', 'hours', 'total hours'],
    'Cost': ['cost', 'labor cost', 'laborcost'],
    'Units': ['units', 'total units', 'qty', 'quantity', 'totalunits'],
    'Unit/Sec': ['unit/sec', 'units per sec'],
    'Sec/Unit': ['sec/unit', 'efficiency', 'seconds per unit'],
    'Commission': ['commission', 'comm'],
    'Agent': ['agent', 'sales rep','agentname'],
    'Type': ['type', 'category', 'project type'],
    'Bonus': ['bonus', 'bonus amount'],
    'Target Price': [
        'original quote', 'quote', 'target price', 'targetprice',
        'priceperunit', 'price per unit', 'price/unit', 
        'quotedprice', 'quoted price'
    ],
    'Realized Price': [
        'recommended price/unit', 'recommendedprice', 
        'calc price', 'unit price', 'calc. price/unit'
    ],
    'Expected Units': ['expectedunits', 'expected units', 'targetunits', 'quotedunits']
};

const DEFAULT_COLUMNS = [
    'Line Leader', 'Date', 'CUSTOMER', 'PL#', 'Desc', 
    'Target Price', 'Expected Units', 'Labor HRS', 'Cost', 'Inv $', 'Units', 
    'Unit/Sec', 'Commission', 'Agent', 'Profit/ loss', 'Sec/Unit', 'Type', 
    'Realized Price', 'Actions' 
];

const ProjectSearch = () => {
    const navigate = useNavigate();
    
    // --- 1. USE THE HOOK ---
    const { user, hasPerm, isReadOnly, loading: roleLoading } = useRole();
    const canView = hasPerm('search', 'view') || hasPerm('admin', 'view') || isReadOnly;
    const canRevertToFinance = (hasPerm('finance', 'edit') || hasPerm('admin', 'edit')) && !isReadOnly; // Revert requires finance/admin edit

    const [pageLoading, setPageLoading] = useState(true);
    
    // Data
    const [combinedData, setCombinedData] = useState([]);
    const [filteredData, setFilteredData] = useState([]);
    const [categories, setCategories] = useState([]);
    const [allColumns, setAllColumns] = useState([]);
    
    const [visibleColumns, setVisibleColumns] = useState(new Set([...DEFAULT_COLUMNS, 'Source']));

    // Filters
    const [searchText, setSearchText] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [minUnits, setMinUnits] = useState('');
    const [maxUnits, setMaxUnits] = useState('');
    const [showColMenu, setShowColMenu] = useState(false);

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const rowsPerPage = 250;

    // Sorting
    const [sortCol, setSortCol] = useState('Date');
    const [sortAsc, setSortAsc] = useState(false); 

    // --- 2. STREAMLINED INITIALIZATION ---
    useEffect(() => {
        if (roleLoading) return;

        if (!user || !canView) {
            navigate('/dashboard');
            return;
        }

        initData();
    }, [user, canView, roleLoading, navigate]);

    useEffect(() => {
        setVisibleColumns(prev => {
            const next = new Set(prev);
            DEFAULT_COLUMNS.forEach(col => next.add(col));
            return next;
        });
    }, []);

    const initData = async () => {
        setPageLoading(true);
        try {
            let costPerHour = 0;
            const cSnap = await getDoc(doc(db, "config", "finance"));
            if(cSnap.exists()) {
                const d = cSnap.data();
                setCategories((d.projectTypes || []).sort());
                costPerHour = parseFloat(d.costPerHour) || 0;
            }

            const [archiveResult, reportsResult] = await Promise.allSettled([
                getDocs(query(collection(db, "archive"), limit(1000))),
                getDocs(query(collection(db, "reports"), where("financeStatus", "==", "complete"), limit(1000)))
            ]);

            const archiveList = (archiveResult.status === 'fulfilled') 
                ? archiveResult.value.docs.map(d => {
                    let flat = flattenObject(d.data());
                    if(flat['Date']) flat['Date'] = excelDateToJSDate(flat['Date']);
                    flat = normalizeRecord(flat);
                    return { _source: 'archive', id: d.id, ...flat };
                }) : [];

            const reportsList = (reportsResult.status === 'fulfilled')
                ? reportsResult.value.docs.map(d => {
                    const data = d.data();
                    const orig = data.originalSeconds || 0;
                    const final = data.finalSeconds || 0;
                    const secondsWorked = orig - final;
                    const units = data.totalUnits || 0;
                    const laborHrs = (secondsWorked / 3600);
                    const secPerUnit = (units > 0 && secondsWorked > 0) ? (secondsWorked / units) : 0;
                    const unitPerSec = (secondsWorked > 0) ? (units / secondsWorked) : 0;

                    const calculatedPricePerUnit = (units > 0) ? ((data.invoiceAmount || 0) / units) : 0;
                    const estimatedCost = laborHrs * costPerHour;
                    const estimatedProfit = (data.invoiceAmount || 0) - estimatedCost;

                    const enriched = {
                        ...data,
                        'Date': data.completedAt ? new Date(data.completedAt.seconds*1000).toLocaleDateString() : '-',
                        'Labor HRS': laborHrs,
                        'Sec/Unit': secPerUnit,
                        'Unit/Sec': unitPerSec, 
                        'Inv $': data.invoiceAmount || 0,
                        'CUSTOMER': data.company,
                        'Desc': data.project,
                        'Line Leader': data.leader,
                        'PL#': data.jobId || data.plNumber, 
                        'Type': data.jobName || data.category || '',
                        'Units': units,
                        'Cost': estimatedCost,
                        'Profit/ loss': estimatedProfit,
                        'Realized Price': calculatedPricePerUnit,
                        'Target Price': data.pricePerUnit || 0,
                        'Expected Units': data.expectedUnits || 0
                    };
                    
                    let flat = flattenObject(enriched);
                    flat = normalizeRecord(flat);
                    return { _source: 'live', id: d.id, ...flat };
                }) : [];

            let combined = [...reportsList, ...archiveList];
            const keys = new Set(['Source', 'Actions']);
            
            DEFAULT_COLUMNS.forEach(c => keys.add(c));
            
            combined.slice(0, 100).forEach(row => {
                Object.keys(row).forEach(k => {
                    if (keys.has(k)) return;
                    const kLow = k.toLowerCase();
                    const restricted = ['inv', 'cost', 'profit', 'bonus', 'commission', '$'];
                    const isRestricted = restricted.some(r => kLow.includes(r));
                    
                    if (!k.startsWith('_') && !isRestricted) {
                        keys.add(k);
                    }
                });
            });
            
            const sortedCols = Array.from(keys).sort((a, b) => {
                if (a === 'Source') return -1;
                if (b === 'Source') return 1;
                if (a === 'Actions') return 1;
                if (b === 'Actions') return -1;
                
                const idxA = DEFAULT_COLUMNS.indexOf(a);
                const idxB = DEFAULT_COLUMNS.indexOf(b);
                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                if (idxA !== -1) return -1;
                if (idxB !== -1) return 1;

                return a.localeCompare(b);
            });

            setAllColumns(sortedCols);
            setCombinedData(combined);
            setFilteredData(combined);
            
            handleSort('Date', combined, false);

        } catch(e) { console.error(e); }
        setPageLoading(false);
    };

    // --- REVERT FUNCTION ---
    const handleRevertToFinance = async (row) => {
        if (!canRevertToFinance) return alert("Read-Only Access: Only Finance Editors can revert projects.");
        const confirmMsg = `Are you sure you want to send "${row['Desc'] || row['CUSTOMER'] || 'this project'}" back to Finance Input?`;
        if (!window.confirm(confirmMsg)) return;

        try {
            if (row._source === 'live') {
                await updateDoc(doc(db, "reports", row.id), {
                    financeStatus: "pending_finance"
                });
            } else if (row._source === 'archive') {
                const archiveSnap = await getDoc(doc(db, "archive", row.id));
                if (archiveSnap.exists()) {
                    const originalData = archiveSnap.data();
                    originalData.financeStatus = "pending_finance";
                    await setDoc(doc(db, "reports", row.id), originalData);
                    await deleteDoc(doc(db, "archive", row.id));
                } else {
                    return alert("Error: Original document could not be found.");
                }
            }
            alert("Project successfully sent back to Finance Input.");
            initData();
        } catch (error) {
            console.error("Revert error:", error);
            alert("Failed to revert project: " + error.message);
        }
    };

    // --- HELPERS ---
    const isNumericCol = (key) => {
        const k = key.toLowerCase();
        return (
            k.includes('price') || k.includes('cost') || k.includes('$') || 
            k.includes('inv') || k.includes('profit') || k.includes('hrs') || 
            k.includes('sec/unit') || k.includes('commission') || 
            k.includes('unit/sec') || k.includes('bonus') || 
            k === 'units' || k === 'qty' || k === 'total units' || k.includes('amount') ||
            k.includes('expected units') || k.includes('quote')
        );
    };

    const flattenObject = (ob, prefix = '', result = null) => {
        result = result || {};
        for (const i in ob) {
            if (!Object.prototype.hasOwnProperty.call(ob, i)) continue;
            if ((typeof ob[i]) === 'object' && ob[i] !== null && !Array.isArray(ob[i]) && !(ob[i] instanceof Date)) {
                flattenObject(ob[i], prefix + i + '.', result);
            } else {
                result[prefix + i] = ob[i];
            }
        }
        return result;
    };

    const normalizeRecord = (flatData) => {
        for (const [targetKey, variations] of Object.entries(FIELD_MAPPINGS)) {
            Object.keys(flatData).forEach(dataKey => {
                const lowerDataKey = dataKey.toLowerCase().trim();
                if (variations.includes(lowerDataKey)) {
                    if (!flatData[targetKey] && flatData[dataKey] !== undefined && flatData[dataKey] !== '') {
                        flatData[targetKey] = flatData[dataKey];
                    }
                    if (dataKey !== targetKey) delete flatData[dataKey];
                }
            });
        }
        return flatData;
    };

    const excelDateToJSDate = (serial) => {
        if (!serial) return '-';
        if (typeof serial === 'string') return serial;
        const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
        return isNaN(date) ? '-' : date.toLocaleDateString();
    };

    const formatValue = (key, val) => {
        if (val === undefined || val === null) return '';
        if (typeof val === 'number') {
            const k = key.toLowerCase();
            const needsDecimals = k.includes('price') || k.includes('cost') || k.includes('$') || 
                                  k.includes('inv') || k.includes('profit') || k.includes('hrs') || 
                                  k.includes('sec/unit') || k.includes('commission')||
                                  k.includes('unit/sec') || k.includes('bonus') ||
                                  k.includes('quote');

            if (needsDecimals) return val.toFixed(2);
        }
        return val;
    };

    // --- ACTIONS ---
    const handleSearch = () => {
        const txt = searchText.toLowerCase();
        const minU = parseFloat(minUnits) || 0;
        const maxU = parseFloat(maxUnits) || 999999999;

        const result = combinedData.filter(row => {
            const rowStr = JSON.stringify(Object.values(row)).toLowerCase();
            const matchText = !txt || rowStr.includes(txt);
            const matchCat = !selectedCategory || (row['Type'] === selectedCategory);
            
            let u = 0;
            const unitVal = row['Units'] || row['totalUnits'] || 0;
            u = parseFloat(String(unitVal).replace(/,/g, '')) || 0;
            const matchUnits = (u >= minU && u <= maxU);
            
            return matchText && matchCat && matchUnits;
        });

        setFilteredData(result);
        setCurrentPage(1);
        handleSort(sortCol, result, sortAsc); 
    };

    const handleClear = () => {
        setSearchText('');
        setSelectedCategory('');
        setMinUnits('');
        setMaxUnits('');
        setFilteredData(combinedData);
        setCurrentPage(1);
    };

    const handleSort = (col, data = filteredData, ascending = true) => {
        const sorted = [...data].sort((a, b) => {
            let valA = a[col];
            let valB = b[col];
            
            const getVal = (v) => (v === undefined || v === null || v === '-') ? '' : v;
            valA = getVal(valA);
            valB = getVal(valB);

            let isNum = typeof valA === 'number' && typeof valB === 'number';
            
            if (col.includes('Date')) {
                const dA = new Date(valA);
                const dB = new Date(valB);
                if (!isNaN(dA) && !isNaN(dB)) {
                    valA = dA; valB = dB; isNum = true; 
                }
            }

            if (isNum) return ascending ? (valA - valB) : (valB - valA);
            
            valA = String(valA).toLowerCase();
            valB = String(valB).toLowerCase();
            if (valA < valB) return ascending ? -1 : 1;
            if (valA > valB) return ascending ? 1 : -1;
            return 0;
        });

        setFilteredData(sorted);
        setSortCol(col);
        setSortAsc(ascending);
    };

    const toggleColumn = (col) => {
        const newSet = new Set(visibleColumns);
        if (newSet.has(col)) newSet.delete(col);
        else newSet.add(col);
        setVisibleColumns(newSet);
    };

    const handleExport = () => {
        if (filteredData.length === 0) return alert("No data");
        const exportData = filteredData.map(row => {
            const clean = {};
            allColumns.forEach(col => {
                if (visibleColumns.has(col) && col !== 'Source' && col !== 'Actions') {
                    clean[col] = row[col];
                }
            });
            return clean;
        });
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Projects");
        XLSX.writeFile(wb, "MakeUSA_Search_Export.xlsx");
    };

    const totalPages = Math.ceil(filteredData.length / rowsPerPage);
    const startIdx = (currentPage - 1) * rowsPerPage;
    const currentData = filteredData.slice(startIdx, startIdx + rowsPerPage);

    if (roleLoading || pageLoading) return <div style={{height: '100vh', display: 'flex', alignItems: 'center', background: '#f8fafc'}}><Loader message="Loading Search..." /></div>;
    if (!canView) return null;

    return (
        <div className="ps-wrapper">
            <div className="ps-top-bar">
                <div style={{display:'flex', alignItems:'center', gap:'20px'}}>
                    <button onClick={() => navigate('/dashboard')} className="btn-link">&larr; Dashboard</button>
                    <h3 style={{margin:0}}>Global Project Search</h3>
                </div>
                <div style={{display:'flex', alignItems:'center'}}>
                    {hasPerm('finance', 'edit') && (
                        <button onClick={() => navigate('/dashboard/upload')} className="btn-upload">Upload Excel</button>
                    )}
                </div>
            </div>

            <div className="ps-container">
                <div className="ps-filter-card">
                    <div className="ps-input-group" style={{flex:2}}>
                        <label className="ps-label">Search</label>
                        <input className="ps-input" value={searchText} onChange={e => setSearchText(e.target.value)} onKeyDown={e => e.key==='Enter' && handleSearch()} placeholder="Keyword..." />
                    </div>
                    <div className="ps-input-group">
                        <label className="ps-label">Type</label>
                        <select className="ps-select" value={selectedCategory} onChange={e => { setSelectedCategory(e.target.value); handleSearch(); }}>
                            <option value="">All Types</option>
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div className="ps-input-group">
                        <label className="ps-label">Units</label>
                        <div className="ps-range-group">
                            <input className="ps-input" type="number" placeholder="Min" value={minUnits} onChange={e => setMinUnits(e.target.value)} />
                            <input className="ps-input" type="number" placeholder="Max" value={maxUnits} onChange={e => setMaxUnits(e.target.value)} />
                        </div>
                    </div>
                    
                    <div style={{display:'flex', alignItems:'flex-end', gap:'10px'}}>
                        <button className="btn btn-search" onClick={handleSearch}>Search</button>
                        <button className="btn btn-clear" onClick={handleClear}>Clear</button>
                    </div>
                    
                    <div style={{width:'1px', background:'#ddd', height:'32px', margin:'0 15px', alignSelf:'flex-end', marginBottom:'4px'}}></div>
                    
                    <div style={{display:'flex', alignItems:'flex-end', gap:'10px'}}>
                        <button className="btn btn-export" onClick={handleExport}>Export</button>
                        
                        <div style={{position:'relative'}}>
                            <button className="btn btn-cols" onClick={() => setShowColMenu(!showColMenu)}>
                                Columns {showColMenu ? '▲' : '▼'}
                            </button>
                            {showColMenu && (
                                <div className="ps-col-dropdown" style={{
                                    position: 'absolute', top: '45px', right: 0,
                                    background: 'white', border: '1px solid #ccc',
                                    borderRadius: '8px', padding: '15px', zIndex: 1000,
                                    boxShadow: '0 4px 20px rgba(0,0,0,0.15)', width: '280px',
                                    display: 'flex', flexDirection: 'column', textAlign:'left'
                                }}>
                                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px', paddingBottom:'8px', borderBottom:'1px solid #eee'}}>
                                        <span style={{fontWeight:'bold', fontSize:'14px', color:'#2c3e50'}}>Select Columns</span>
                                        <button onClick={() => setShowColMenu(false)} style={{border:'none', background:'none', cursor:'pointer', fontSize:'18px', color:'#999'}}>×</button>
                                    </div>
                                    
                                    <div style={{display:'flex', gap:'15px', marginBottom:'10px', fontSize:'12px', paddingLeft:'8px'}}>
                                        <span onClick={() => setVisibleColumns(new Set(allColumns))} style={{color:'#3498db', cursor:'pointer', fontWeight:'bold'}}>All</span>
                                        <span onClick={() => setVisibleColumns(new Set(DEFAULT_COLUMNS))} style={{color:'#3498db', cursor:'pointer'}}>Default</span>
                                        <span onClick={() => setVisibleColumns(new Set(['Source']))} style={{color:'#e74c3c', cursor:'pointer'}}>None</span>
                                    </div>

                                    <div style={{maxHeight:'350px', overflowY:'auto', display:'flex', flexDirection:'column', gap:'2px'}}>
                                        {allColumns.map(col => (
                                            <label key={col} style={{
                                                display:'flex', alignItems:'center', gap:'10px', 
                                                padding:'6px 8px', cursor:'pointer', fontSize:'13px', 
                                                userSelect:'none', borderRadius:'4px', transition:'background 0.2s'
                                            }} 
                                            onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <input 
                                                    type="checkbox" 
                                                    checked={visibleColumns.has(col)} 
                                                    onChange={() => toggleColumn(col)}
                                                    style={{margin:0, cursor:'pointer', width:'16px', height:'16px', accentColor:'#2c3e50', flexShrink: 0}} 
                                                />
                                                <span style={{
                                                    color: visibleColumns.has(col) ? '#2c3e50' : '#7f8c8d',
                                                    whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'
                                                }}>{col}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="ps-results-card">
                    <div style={{padding:'10px 15px', borderBottom:'1px solid #eee', color:'#7f8c8d', fontSize:'11px', display:'flex', justifyContent:'space-between'}}>
                        <span>{filteredData.length} Records Found</span>
                        <div style={{display:'flex', gap:'10px'}}>
                            <span style={{display:'flex', alignItems:'center', gap:'5px'}}><div style={{width:'8px', height:'8px', background:'#e8f6f3', borderRadius:'50%'}}></div> Live App</span>
                            <span style={{display:'flex', alignItems:'center', gap:'5px'}}><div style={{width:'8px', height:'8px', background:'#fff8e1', borderRadius:'50%'}}></div> Archive</span>
                        </div>
                    </div>

                    <div style={{overflowY: 'auto', maxHeight: 'calc(100vh - 220px)'}}>
                        <table className="ps-table">
                            <thead>
                                <tr>
                                    {allColumns.map(col => (
                                        visibleColumns.has(col) && (
                                            <th key={col} 
                                                onClick={() => handleSort(col, undefined, !sortAsc)}
                                                style={{
                                                    textAlign: isNumericCol(col) ? 'right' : 'left',
                                                    position: 'sticky', top: 0, background: '#f8f9fa',
                                                    zIndex: 10, boxShadow: '0 2px 2px -1px rgba(0,0,0,0.1)'
                                                }}
                                            >
                                                {col} {sortCol === col ? (sortAsc ? '▲' : '▼') : ''}
                                            </th>
                                        )
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {currentData.length === 0 ? (
                                    <tr><td colSpan="100%" className="ps-empty">No records found.</td></tr>
                                ) : (
                                    currentData.map(row => (
                                        <tr key={row.id}>
                                            {allColumns.map(col => {
                                                if (!visibleColumns.has(col)) return null;
                                                
                                                if (col === 'Source') {
                                                    return (
                                                        <td key={col}>
                                                            <span className={`ps-badge ${row._source==='live' ? 'src-live' : 'src-archive'}`}>
                                                                {row._source === 'live' ? 'LIVE' : 'ARCHIVE'}
                                                            </span>
                                                        </td>
                                                    );
                                                }

                                                if (col === 'Actions') {
                                                    return (
                                                        <td key={col} style={{textAlign: 'center'}}>
                                                            {canRevertToFinance && (
                                                                <button 
                                                                    onClick={() => handleRevertToFinance(row)}
                                                                    style={{
                                                                        background: '#f39c12', color: 'white', border: 'none', 
                                                                        padding: '5px 10px', borderRadius: '4px', cursor: 'pointer',
                                                                        fontSize: '12px', fontWeight: 'bold'
                                                                    }}
                                                                    title="Revert to Pending Finance"
                                                                >
                                                                    Revert
                                                                </button>
                                                            )}
                                                        </td>
                                                    );
                                                }

                                                const val = row[col];
                                                const isNegative = typeof val === 'number' && val < 0;
                                                
                                                return (
                                                    <td key={col} style={{
                                                        textAlign: isNumericCol(col) || typeof val==='number' ? 'right' : 'left',
                                                        color: isNegative ? '#e74c3c' : 'inherit',
                                                        fontWeight: isNegative ? 'bold' : 'normal'
                                                    }}>
                                                        {formatValue(col, val)}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="ps-pagination">
                        <button className="ps-page-btn" disabled={currentPage===1} onClick={() => setCurrentPage(currentPage-1)}>Previous</button>
                        <span>Page {currentPage} of {totalPages}</span>
                        <button className="ps-page-btn" disabled={currentPage===totalPages} onClick={() => setCurrentPage(currentPage+1)}>Next</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProjectSearch;
