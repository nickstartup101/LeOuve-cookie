import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  DollarSign,
  Layers, 
  Truck, 
  ShoppingCart, 
  Settings as SettingsIcon,
  LogOut,
  Moon,
  Sun,
  Menu,
  X
} from 'lucide-react';
import { auth, googleProvider, db } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';

import Dashboard from './components/Dashboard';
import Finance from './components/Finance';
import Inventory from './components/Inventory';
import Suppliers from './components/Suppliers';
import ProcurementPlanner from './components/ProcurementPlanner';
import Settings from './components/Settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'finance' | 'inventory' | 'suppliers' | 'planner' | 'settings'>('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [userSettings, setUserSettings] = useState<any>(null);
  const [appConfig, setAppConfig] = useState<any>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubUserSettings = onSnapshot(doc(db, 'users', user.uid, 'settings', 'main'), (snap) => {
      if (snap.exists()) setUserSettings(snap.data());
    });
    const unsubAppConfig = onSnapshot(doc(db, 'settings', 'appConfig'), (snap) => {
      if (snap.exists()) setAppConfig(snap.data());
    });
    return () => { unsubUserSettings(); unsubAppConfig(); };
  }, [user]);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-[#0a0a0a] text-slate-800 dark:text-white font-sans gap-3">
        <div className="w-8 h-8 border-2 border-neutral-300 dark:border-neutral-700 border-t-[#052659] dark:border-t-white rounded-full animate-spin"></div>
        <p className="text-[10px] font-light uppercase tracking-[0.3em] text-neutral-400">Loading Le Ouve...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-[#0a0a0a] p-6 font-sans">
        <div className="w-full max-w-md bg-white dark:bg-[#141414] rounded-[2.5rem] p-12 shadow-2xl border border-slate-200/80 dark:border-neutral-800 text-center space-y-8 animate-in fade-in zoom-in-95 duration-300">
          <div className="flex flex-col items-center justify-center select-none pt-2">
            <h1 className="font-serif text-5xl md:text-6xl text-neutral-900 dark:text-white tracking-tight leading-none">
              Le Ouve
            </h1>
            <span className="font-sans text-[9px] font-light tracking-[0.45em] uppercase text-neutral-400 dark:text-neutral-500 mt-3 leading-none">
              workspace estd 2026
            </span>
          </div>

          <div className="w-12 h-[1px] bg-neutral-200 dark:bg-neutral-800 mx-auto"></div>

          <p className="font-sans text-xs font-light text-slate-500 dark:text-neutral-400 leading-relaxed max-w-xs mx-auto">
            ລະບົບຄຸ້ມຄອງຄັງສາງ, ຕົ້ນທຶນສູດ, ບັນຊີການເງິນ & ບິນຈັດຊື້ອັດຕະໂນມັດ
          </p>

          <button
            onClick={() => signInWithPopup(auth, googleProvider)}
            className="w-full py-4 bg-[#052659] hover:bg-[#0c3a80] text-white rounded-2xl font-sans font-medium text-xs uppercase tracking-[0.2em] shadow-xl transition-all active:scale-95 cursor-pointer"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  const navItems = [
    { key: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { key: 'finance', icon: DollarSign, label: 'Finance & Debts' },
    { key: 'inventory', icon: Layers, label: 'Inventory & Recipe' },
    { key: 'suppliers', icon: Truck, label: 'Suppliers & Quotes' },
    { key: 'planner', icon: ShoppingCart, label: 'Procurement Bill' },
    { key: 'settings', icon: SettingsIcon, label: 'Settings' }
  ];

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#0a0a0a] text-slate-800 dark:text-neutral-100 font-sans transition-colors duration-200">
      
      {/* 🧭 SIDEBAR ສີຟ້າເຂັ້ມ `#052659` (Desktop Permanent Sidebar) */}
      <aside className="hidden lg:flex w-64 bg-[#052659] text-white flex-col justify-between fixed inset-y-0 left-0 z-40 border-r border-[#0c3a80]/40 shadow-2xl select-none">
        
        {/* Brand Header */}
        <div className="p-7 border-b border-white/10">
          <div className="cursor-pointer" onClick={() => setActiveTab('dashboard')}>
            <h1 className="font-serif text-3xl text-white tracking-tight leading-none">
              {appConfig?.shopName || 'Le Ouve'}
            </h1>
            <p className="font-sans text-[8px] font-light tracking-[0.35em] uppercase text-white/50 mt-1.5 leading-none">
              workspace estd 2026
            </p>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="p-4 space-y-1.5 flex-1 overflow-y-auto">
          {navItems.map(item => {
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setActiveTab(item.key as any)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs uppercase tracking-wider transition-all cursor-pointer font-sans ${
                  isActive 
                    ? 'bg-white text-[#052659] font-bold shadow-lg shadow-black/20 translate-x-1' 
                    : 'text-white/70 hover:text-white hover:bg-white/10 font-light'
                }`}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer Tools */}
        <div className="p-4 border-t border-white/10 space-y-3">
          <div className="flex items-center justify-between px-2">
            <span className="text-[10px] uppercase tracking-wider text-white/40 font-light">Appearance</span>
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              title="Toggle Night Mode"
            >
              {isDarkMode ? <Sun className="w-3.5 h-3.5 text-amber-300" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="flex items-center justify-between p-2 rounded-2xl bg-black/20 border border-white/5">
            <div className="truncate pr-2">
              <p className="text-xs font-bold text-white truncate leading-none">{user.displayName || 'Admin'}</p>
              <p className="text-[9px] text-white/40 truncate mt-1 font-light">{user.email}</p>
            </div>
            <button
              onClick={() => signOut(auth)}
              className="p-2 text-rose-400 hover:bg-rose-500/20 rounded-xl transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* 📱 Mobile Top Navigation Header */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 bg-[#052659] text-white px-5 py-3.5 flex items-center justify-between shadow-md">
        <div>
          <h1 className="font-serif text-2xl text-white tracking-tight leading-none">Le Ouve</h1>
          <p className="text-[7.5px] font-light tracking-[0.3em] uppercase text-white/50 mt-1">workspace estd 2026</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 rounded-xl bg-white/10 text-white">
            {isDarkMode ? <Sun className="w-3.5 h-3.5 text-amber-300" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 rounded-xl bg-white/10 text-white">
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)}>
          <div className="w-72 bg-[#052659] h-full p-6 text-white flex flex-col justify-between" onClick={e => e.stopPropagation()}>
            <div className="space-y-6">
              <div className="border-b border-white/10 pb-4">
                <h2 className="font-serif text-3xl">Le Ouve</h2>
                <p className="text-[8px] uppercase tracking-[0.35em] text-white/50 mt-1">workspace estd 2026</p>
              </div>
              <div className="space-y-1">
                {navItems.map(item => (
                  <button
                    key={item.key}
                    onClick={() => { setActiveTab(item.key as any); setIsMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs uppercase tracking-wider ${activeTab === item.key ? 'bg-white text-[#052659] font-bold' : 'text-white/70'}`}
                  >
                    <item.icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <button onClick={() => signOut(auth)} className="w-full py-3 rounded-xl bg-rose-500/20 text-rose-300 text-xs font-bold uppercase flex items-center justify-center gap-2">
              <LogOut className="w-4 h-4" />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      )}

      {/* 💻 Content Layout (Pl-64 ໃຫ້ພໍດີກັບ Sidebar) */}
      <main className="flex-1 lg:pl-64 w-full min-w-0 pt-16 lg:pt-0">
        <div className="max-w-7xl mx-auto p-5 md:p-8">
          {activeTab === 'dashboard' && <Dashboard userSettings={userSettings} user={user} />}
          {activeTab === 'finance' && <Finance userSettings={userSettings} />}
          {activeTab === 'inventory' && <Inventory />}
          {activeTab === 'suppliers' && <Suppliers />}
          {activeTab === 'planner' && <ProcurementPlanner />}
          {activeTab === 'settings' && (
            <Settings 
              user={user} 
              isDarkMode={isDarkMode} 
              setIsDarkMode={setIsDarkMode} 
              userSettings={userSettings} 
              isSuperAdmin={true} 
              appConfig={appConfig} 
            />
          )}
        </div>
      </main>

    </div>
  );
}
