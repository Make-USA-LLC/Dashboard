import React, { useState, useEffect, useMemo } from 'react';
import { 
  onAuthStateChanged, 
  signOut, 
  signInWithPopup 
} from "firebase/auth";
import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  serverTimestamp 
} from "firebase/firestore";
import { 
  Warehouse, User, LogOut, Search, Package, History, 
  Plus, Minus, MapPin, Clock, Edit2, Trash2, Save, X 
} from 'lucide-react';
import { auth, db } from "../firebase_config"; 
import { GoogleAuthProvider } from "firebase/auth";

const COLLECTION_ROOT = 'shed_inventory_v1'; 

const App = () => {
    const [user, setUser] = useState(null);
    const [username, setUsername] = useState('');
    const [isAuthLoading, setIsAuthLoading] = useState(true);
    const [currentView, setCurrentView] = useState('inventory');
    const [items, setItems] = useState([]);
    const [logs, setLogs] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [formData, setFormData] = useState({ name: '', quantity: '1', location: '', notes: '' });

    // Helper: Date Format
    const formatDate = (timestamp) => {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return new Intl.DateTimeFormat('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        }).format(date);
    };

    // 1. Auth Listener
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setIsAuthLoading(false);
            if (currentUser && currentUser.displayName) {
                setUsername(currentUser.displayName);
            }
        });
        return () => unsubscribe();
    }, []);

    // 2. Data Listeners
    useEffect(() => {
        if (!user) return;

        // Items
        const itemsRef = collection(db, COLLECTION_ROOT, 'public', 'items');
        const unsubscribeItems = onSnapshot(itemsRef, (snapshot) => {
            const loadedItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            loadedItems.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            setItems(loadedItems);
        }, (err) => console.error("Items Error:", err));

        // Logs
        const logsRef = collection(db, COLLECTION_ROOT, 'public', 'logs');
        const unsubscribeLogs = onSnapshot(logsRef, (snapshot) => {
            const loadedLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            loadedLogs.sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));
            setLogs(loadedLogs);
        }, (err) => console.error("Logs Error:", err));

        return () => {
            unsubscribeItems();
            unsubscribeLogs();
        };
    }, [user]);

    // 3. Logic
    const addLog = async (action, details) => {
        if (!user) return;
        try {
            await addDoc(collection(db, COLLECTION_ROOT, 'public', 'logs'), {
                action,
                details,
                user: username || 'Someone',
                userId: user.uid,
                timestamp: serverTimestamp()
            });
        } catch (e) { console.error("Log failed", e); }
    };

    const handleQuickUpdate = async (item, change) => {
        if (!user) return;
        const currentQty = parseInt(item.quantity) || 0;
        const newQty = currentQty + change;
        if (newQty < 0) return; // Prevent negative stock

        try {
            const ref = doc(db, COLLECTION_ROOT, 'public', 'items', item.id);
            await updateDoc(ref, {
                quantity: newQty,
                updatedBy: username,
                updatedAt: serverTimestamp()
            });
            
            const actionType = change > 0 ? 'Restocked' : 'Used';
            await addLog('Quantity Change', `${username} ${actionType.toLowerCase()} ${item.name}. (Qty: ${currentQty} → ${newQty})`);
        } catch (e) {
            console.error("Quick update failed", e);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!user || !formData.name.trim()) return;

        try {
            if (editingItem) {
                const ref = doc(db, COLLECTION_ROOT, 'public', 'items', editingItem.id);
                const changes = [];
                if (editingItem.quantity !== formData.quantity) changes.push(`Qty: ${editingItem.quantity}→${formData.quantity}`);
                if (editingItem.location !== formData.location) changes.push(`Moved to ${formData.location}`);
                if (editingItem.name !== formData.name) changes.push(`Renamed to ${formData.name}`);
                
                await updateDoc(ref, {
                    ...formData,
                    updatedBy: username,
                    updatedAt: serverTimestamp()
                });
                const logMsg = changes.length > 0 ? changes.join(', ') : 'Updated details';
                await addLog('Modified Item', `${username} updated ${formData.name}. ${logMsg}`);
            } else {
                await addDoc(collection(db, COLLECTION_ROOT, 'public', 'items'), {
                    ...formData,
                    createdBy: username,
                    createdAt: serverTimestamp(),
                    updatedBy: username,
                    updatedAt: serverTimestamp()
                });
                await addLog('Added Item', `${username} added ${formData.name} (Qty: ${formData.quantity})`);
            }
            closeModal();
        } catch (err) {
            console.error("Save Error:", err);
            alert("Failed to save item. Check console.");
        }
    };

    const handleDelete = async (item) => {
        if (!confirm(`Permanently remove ${item.name}?`)) return;
        try {
            await deleteDoc(doc(db, COLLECTION_ROOT, 'public', 'items', item.id));
            await addLog('Deleted Item', `${username} removed ${item.name}`);
        } catch (e) { console.error("Delete failed", e); }
    };

    const handleGoogleLogin = async () => {
        try { 
            const result = await signInWithPopup(auth, googleProvider);
            const user = result.user;
            
            if (user.email && !user.email.endsWith('@makeit.buzz')) {
                await signOut(auth);
                alert("Access Denied: This app is restricted to @makeit.buzz email addresses.");
                return;
            }
        } catch (error) { 
            console.error("Google Auth Error:", error); 
            alert("Login failed: " + error.message);
        }
    };

    const handleLogout = () => {
        signOut(auth);
        setUsername('');
    };

    // Modal Logic
    const openAddModal = () => { setEditingItem(null); setFormData({ name: '', quantity: '1', location: '', notes: '' }); setIsModalOpen(true); };
    const openEditModal = (item) => { setEditingItem(item); setFormData({ name: item.name, quantity: item.quantity, location: item.location, notes: item.notes }); setIsModalOpen(true); };
    const closeModal = () => { setIsModalOpen(false); setEditingItem(null); };

    const filteredItems = useMemo(() => {
        const term = searchTerm.toLowerCase();
        return items.filter(i => 
            (i.name || '').toLowerCase().includes(term) ||
            (i.location || '').toLowerCase().includes(term) ||
            (i.notes || '').toLowerCase().includes(term)
        );
    }, [items, searchTerm]);

    if (isAuthLoading) {
        return <div className="flex h-screen w-full items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-500"></div></div>;
    }

    if (!user || !username) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 text-center">
                <div className="w-full max-w-sm rounded-2xl bg-slate-900 p-8 shadow-2xl border border-slate-800">
                    <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-red-600 shadow-lg">
                        <Warehouse className="h-10 w-10 text-white" />
                    </div>
                    <h1 className="mb-2 text-3xl font-bold text-white">Shed Access</h1>
                    <p className="mb-8 text-slate-400">Sign in to manage inventory</p>
                    
                    <div className="space-y-4">
                        <button onClick={handleGoogleLogin} className="flex w-full items-center justify-center gap-3 rounded-xl bg-white p-4 text-slate-900 transition-all hover:bg-slate-200 active:scale-95">
                            <span className="font-bold">Sign in with makeit.buzz</span>
                        </button>
                        <p className="text-xs text-slate-500">Authorized personnel only.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen w-full flex-col bg-slate-950 text-slate-100 font-sans">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-900/95 px-4 py-3 backdrop-blur-sm safe-top">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-600"><Warehouse className="h-6 w-6 text-white" /></div>
                    <div>
                        <h1 className="text-lg font-bold leading-tight text-white">The Shed</h1>
                        <div className="flex items-center gap-1 text-xs text-orange-400"><User className="h-3 w-3" /><span>{username}</span></div>
                    </div>
                </div>
                
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-950 p-4 pb-24 safe-bottom">
                {currentView === 'inventory' ? (
                    <>
                        <div className="relative mb-6">
                            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                            <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full rounded-xl border border-slate-800 bg-slate-900 py-3 pl-12 pr-4 text-white placeholder-slate-500 shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
                        </div>
                        <div className="space-y-3">
                            {filteredItems.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-slate-600"><Package className="mb-3 h-12 w-12 opacity-50" /><p>No items found.</p></div>
                            ) : (
                                filteredItems.map((item) => (
                                    <div key={item.id} className="group relative flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-sm transition-all hover:border-slate-700">
                                        
                                        {/* Left Info */}
                                        <div className="flex-1 min-w-0">
                                            <h3 className="truncate text-lg font-semibold text-white">{item.name}</h3>
                                            <div className="flex items-center gap-4 text-sm text-slate-400 mt-1">
                                                {item.location && (<div className="flex items-center gap-1"><MapPin className="h-3 w-3" /><span className="truncate max-w-[100px]">{item.location}</span></div>)}
                                                {item.updatedAt && (<div className="flex items-center gap-1 text-xs opacity-70"><Clock className="h-3 w-3" /><span>{formatDate(item.updatedAt).split(',')[0]}</span></div>)}
                                            </div>
                                            {item.notes && <p className="mt-1 text-xs text-slate-500 line-clamp-1">{item.notes}</p>}
                                        </div>

                                        {/* Right Controls */}
                                        <div className="flex items-center gap-3">
                                            {/* Qty Stepper */}
                                            <div className="flex items-center rounded-lg bg-slate-950 border border-slate-700">
                                                <button 
                                                    onClick={() => handleQuickUpdate(item, -1)} 
                                                    className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                                                    disabled={item.quantity <= 0}
                                                >
                                                    <Minus className="h-4 w-4" />
                                                </button>
                                                <span className="w-8 text-center text-sm font-bold text-white select-none">{item.quantity}</span>
                                                <button 
                                                    onClick={() => handleQuickUpdate(item, 1)} 
                                                    className="p-2 text-slate-400 hover:text-green-400 transition-colors"
                                                >
                                                    <Plus className="h-4 w-4" />
                                                </button>
                                            </div>

                                            <button onClick={() => openEditModal(item)} className="rounded-lg bg-slate-800 p-2 text-slate-300 hover:bg-orange-600 hover:text-white transition-colors">
                                                <Edit2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="h-16"></div>
                    </>
                ) : (
                    <div className="space-y-6">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2"><History className="h-5 w-5 text-orange-500" /> Recent Activity</h2>
                        <div className="relative border-l-2 border-slate-800 ml-3 space-y-8 pl-6">
                            {logs.map((log) => (
                                <div key={log.id} className="relative">
                                    <div className="absolute -left-[31px] top-1 h-4 w-4 rounded-full border-2 border-slate-800 bg-slate-900"></div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs font-semibold text-orange-500 uppercase tracking-wider">{formatDate(log.timestamp)}</span>
                                        <p className="text-sm text-slate-300"><span className="font-bold text-white">{log.user}</span> {log.action.toLowerCase()}.</p>
                                        <p className="text-xs text-slate-500 bg-slate-900 p-2 rounded border border-slate-800 inline-block mt-1">{log.details}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {currentView === 'inventory' && (
                <button onClick={openAddModal} className="fixed bottom-24 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-orange-600 text-white shadow-xl shadow-orange-900/20 hover:bg-orange-500 active:scale-90 transition-transform z-20">
                    <Plus className="h-7 w-7" />
                </button>
            )}

            <div className="fixed bottom-0 left-0 right-0 border-t border-slate-800 bg-slate-900 px-6 pb-6 pt-3 z-30 safe-bottom">
                <div className="flex items-center justify-around">
                    <button onClick={() => setCurrentView('inventory')} className={`flex flex-col items-center gap-1 ${currentView === 'inventory' ? 'text-orange-500' : 'text-slate-500'}`}>
                        <Package className="h-6 w-6" /><span className="text-xs font-medium">Inventory</span>
                    </button>
                    <button onClick={() => setCurrentView('logs')} className={`flex flex-col items-center gap-1 ${currentView === 'logs' ? 'text-orange-500' : 'text-slate-500'}`}>
                        <History className="h-6 w-6" /><span className="text-xs font-medium">History</span>
                    </button>
                </div>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4">
                    <div className="w-full max-w-lg animate-in slide-in-from-bottom-10 bg-slate-900 sm:rounded-2xl rounded-t-2xl border-t sm:border border-slate-700 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-slate-800 p-4">
                            <h2 className="text-lg font-bold text-white">{editingItem ? 'Edit Item' : 'New Item'}</h2>
                            <button onClick={closeModal} className="rounded-full p-1 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-6 w-6" /></button>
                        </div>
                        <div className="p-6">
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-400">Item Name</label>
                                    <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-800 p-3 text-white focus:border-orange-500 focus:outline-none" placeholder="e.g. Cordless Drill" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="mb-1 block text-sm font-medium text-slate-400">Quantity</label>
                                        <input type="number" required min="0" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-800 p-3 text-white focus:border-orange-500 focus:outline-none" />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-sm font-medium text-slate-400">Location</label>
                                        <input type="text" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-800 p-3 text-white focus:border-orange-500 focus:outline-none" placeholder="e.g. Shelf 2" />
                                    </div>
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-400">Notes (Optional)</label>
                                    <textarea rows="2" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-800 p-3 text-white focus:border-orange-500 focus:outline-none" placeholder="Brand, condition, or details..." />
                                </div>
                                <div className="flex gap-3 pt-4">
                                    {editingItem && (
                                        <button type="button" onClick={() => handleDelete(editingItem)} className="flex items-center justify-center rounded-xl border border-red-900/50 bg-red-900/20 px-4 py-3 text-red-400 hover:bg-red-900/40"><Trash2 className="h-5 w-5" /></button>
                                    )}
                                    <button type="submit" className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 font-bold text-slate-900 hover:bg-slate-200 active:scale-95"><Save className="h-5 w-5" /> Save Changes</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;