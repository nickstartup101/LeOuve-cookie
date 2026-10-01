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
  Sun
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

  // ✨ ໜ້າ Login ແບບ Editorial Minimalism (ບໍ່ມີໄອຄອນ LO)
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-[#0a0a0a] p-6">
        <div className="w-full max-w-md bg-white dark:bg-[#141414] rounded-[2.5rem] p-12 shadow-2xl border border-slate-200/80 dark:border-neutral-800 text-center space-y-8 animate-in fade-in zoom-in-95 duration-300">
          
          {/* Brand Wordmark ໃຫຍ່ໆເດັ່ນໆ */}
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
            ລະບົບຄຸ້ມຄອງຄັງສາງ, ຕົ້ນທຶນສູດເຄື່ອງດື່ມ, ບັນຊີການເງິນ ແລະ ໃບບິນຈັດຊື້ອັດຕະໂນມັດ
          </p>

          <button
            onClick={() => signInWithPopup(auth, googleProvider)}
            className="w-full py-4 bg-[#052659] hover:bg-[#0c3a80] dark:bg-white dark:hover:bg-neutral-200 dark:text-neutral-950 text-white rounded-2xl font-sans font-medium text-xs uppercase tracking-[0.2em] shadow-xl transition-all active:scale-95 cursor-pointer"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#0a0a0a] text-slate-800 dark:text-neutral-100 transition-colors duration-200">
      
      {/* 🧭 Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-[#0a0a0a]/90 backdrop-blur-md border-b border-slate-200/80 dark:border-neutral-800 px-6 py-3.5 flex items-center justify-between">
        
        {/* ✨ Brand Header (ເອົາສັນຍາລັກ LO ອອກ ➔ ໃສ່ Le Ouve ໃຫຍ່ໆ + workspace estd 2026 ບາງນ້ອຍ) */}
        <div 
          className="flex flex-col cursor-pointer select-none group pr-4" 
          onClick={() => setActiveTab('dashboard')}
        >
          <h1 className="font-serif text-2xl md:text-3xl text-neutral-900 dark:text-white tracking-tight leading-none group-hover:opacity-85 transition-opacity">
            {appConfig?.shopName || 'Le Ouve'}
          </h1>
          <span className="font-sans text-[8px] md:text-[8.5px] font-light tracking-[0.35em] uppercase text-neutral-400 dark:text-neutral-500 mt-1 leading-none">
            workspace estd 2026
          </span>
        </div>

        {/* Desktop Navbar Tabs */}
        <nav className="hidden lg:flex items-center gap-1 bg-slate-100 dark:bg-neutral-900 p-1.5 rounded-2xl border border-slate-200/60 dark:border-neutral-800">
          {[
            { key: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
            { key: 'finance', icon: DollarSign, label: 'Finance' },
            { key: 'inventory', icon: Layers, label: 'Inventory & Recipe' },
            { key: 'suppliers', icon: Truck, label: 'Suppliers' },
            { key: 'planner', icon: ShoppingCart, label: 'Procurement Bill' },
            { key: 'settings', icon: SettingsIcon, label: 'Settings' }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer font-sans ${
                activeTab === tab.key 
                  ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950 font-medium shadow-sm' 
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white font-light'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* Right Tools (Dark Mode, Logout) */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 rounded-xl bg-slate-100 dark:bg-neutral-900 text-slate-600 dark:text-neutral-300 hover:bg-slate-200 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Toggle Night Mode"
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            onClick={() => signOut(auth)}
            className="p-2 rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition-colors cursor-pointer"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 📱 Mobile Floating Bottom Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#0a0a0a]/95 backdrop-blur-md border-t border-slate-200 dark:border-neutral-800 px-2 py-2 flex justify-around items-center">
        {[
          { key: 'dashboard', icon: LayoutDashboard, label: 'Dash' },
          { key: 'finance', icon: DollarSign, label: 'Finance' },
          { key: 'inventory', icon: Layers, label: 'Stock' },
          { key: 'suppliers', icon: Truck, label: 'Suppliers' },
          { key: 'planner', icon: ShoppingCart, label: 'Bills' },
          { key: 'settings', icon: SettingsIcon, label: 'Setup' }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`flex flex-col items-center gap-1 text-[9px] font-sans uppercase py-1 px-2 rounded-xl cursor-pointer ${
              activeTab === tab.key 
                ? 'text-[#052659] dark:text-white font-semibold scale-105' 
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-light'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* 💻 Main Workspace Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 mb-16 lg:mb-0">
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
      </main>
    </div>
  );
}
