import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  DollarSign,
  Layers, 
  Truck, 
  ShoppingCart, 
  Settings as SettingsIcon,
  Coffee,
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0a0a0a] text-slate-800 dark:text-white font-sans">
        <div className="w-10 h-10 border-4 border-[#052659] dark:border-white border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-[#0a0a0a] p-6 font-sans">
        <div className="w-full max-w-md bg-white dark:bg-[#141414] rounded-3xl p-10 shadow-2xl border border-slate-200 dark:border-neutral-800 text-center space-y-6">
          <div className="w-16 h-16 bg-[#052659] text-white rounded-3xl mx-auto flex items-center justify-center">
            <Coffee className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white">Le Ouve</h1>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mt-1">Workspace Intelligence</p>
          </div>
          <button
            onClick={() => signInWithPopup(auth, googleProvider)}
            className="w-full py-3.5 bg-[#052659] hover:bg-[#0c3a80] text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl cursor-pointer"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#0a0a0a] text-slate-800 dark:text-neutral-100 font-sans transition-colors duration-200">
      
      {/* 🧭 Top Navigation Bar (Desktop) */}
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-[#0a0a0a]/90 backdrop-blur-md border-b border-slate-200/80 dark:border-neutral-800 px-6 py-3 flex items-center justify-between">
        
        {/* Brand */}
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
          <div className="w-9 h-9 bg-[#052659] dark:bg-white text-white dark:text-neutral-950 rounded-xl flex items-center justify-center font-black shadow-sm">
            LO
          </div>
          <div>
            <h2 className="text-base font-black tracking-tight leading-none text-[#052659] dark:text-white">
              {appConfig?.shopName || 'Le Ouve'}
            </h2>
            <span className="text-[8px] font-black uppercase tracking-[0.25em] text-slate-400">Workspace</span>
          </div>
        </div>

        {/* Desktop Navbar */}
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
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === tab.key 
                  ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* Right Tools */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 rounded-xl bg-slate-100 dark:bg-neutral-900 text-slate-600 dark:text-neutral-300 hover:bg-slate-200 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            onClick={() => signOut(auth)}
            className="p-2 rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition-colors cursor-pointer"
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
            className={`flex flex-col items-center gap-1 text-[9px] font-black uppercase py-1 px-2 rounded-xl cursor-pointer ${
              activeTab === tab.key 
                ? 'text-[#052659] dark:text-white font-extrabold scale-105' 
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* 💻 Content Layout */}
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
