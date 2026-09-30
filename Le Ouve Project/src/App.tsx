import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
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

// Import All 5 Modules
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import Suppliers from './components/Suppliers';
import ProcurementPlanner from './components/ProcurementPlanner';
import Settings from './components/Settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'suppliers' | 'planner' | 'settings'>('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [userSettings, setUserSettings] = useState<any>(null);
  const [appConfig, setAppConfig] = useState<any>(null);

  // Monitor Authentication
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // Monitor Theme & Settings from Firestore
  useEffect(() => {
    if (!user) return;
    const unsubUserSettings = onSnapshot(doc(db, 'users', user.uid, 'settings', 'main'), (snap) => {
      if (snap.exists()) {
        setUserSettings(snap.data());
      }
    });

    const unsubAppConfig = onSnapshot(doc(db, 'settings', 'appConfig'), (snap) => {
      if (snap.exists()) {
        setAppConfig(snap.data());
      }
    });

    return () => {
      unsubUserSettings();
      unsubAppConfig();
    };
  }, [user]);

  // Dark Mode Class Handler
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#04162e]">
        <div className="w-10 h-10 border-4 border-[#052659] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // ຖ້າບໍ່ທັນ Login: ສະແດງໜ້າ Login Le Ouve
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-white to-slate-200 dark:from-[#031738] dark:to-[#04162e] p-6 font-sans">
        <div className="w-full max-w-md bg-white dark:bg-[#073069] rounded-[2.5rem] p-10 shadow-2xl border border-slate-200/80 dark:border-white/10 text-center space-y-6">
          <div className="w-16 h-16 bg-[#052659] text-white rounded-3xl mx-auto flex items-center justify-center shadow-xl shadow-[#052659]/20">
            <Coffee className="w-8 h-8" />
          </div>

          <div>
            <h1 className="text-3xl font-black text-[#052659] dark:text-white tracking-tight">Le Ouve</h1>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mt-1">Workspace Intelligence</p>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-300 leading-relaxed">
            ລະບົບຄຸ້ມຄອງຄັງສາງ, ຕົ້ນທຶນສູດເຄື່ອງດື່ມ, ປຽບທຽບລາຄາຜູ້ສະໜອງ ແລະ ບິນຈັດຊື້ອັດຕະໂນມັດ.
          </p>

          <button
            onClick={() => signInWithPopup(auth, googleProvider)}
            className="w-full py-4 bg-[#052659] hover:bg-[#0c3a80] text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 transition-transform active:scale-95 cursor-pointer"
          >
            <span>Sign in with Google</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#04162e] text-slate-800 dark:text-slate-100 font-sans transition-colors duration-300">
      
      {/* 🧭 Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-[#052659]/80 backdrop-blur-md border-b border-slate-200/80 dark:border-white/10 px-6 py-3.5 flex items-center justify-between">
        
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#052659] text-white rounded-xl flex items-center justify-center font-black shadow-md">
            LO
          </div>
          <div>
            <h2 className="text-base font-black tracking-tight leading-none text-[#052659] dark:text-white">
              {appConfig?.shopName || 'Le Ouve'}
            </h2>
            <span className="text-[8px] font-black uppercase tracking-[0.25em] text-slate-400">Workspace</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-100 dark:bg-black/20 p-1.5 rounded-2xl border border-slate-200/60 dark:border-white/5">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${activeTab === 'dashboard' ? 'bg-[#052659] text-white shadow-md' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => setActiveTab('inventory')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${activeTab === 'inventory' ? 'bg-[#052659] text-white shadow-md' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Inventory & Recipe</span>
          </button>

          <button
            onClick={() => setActiveTab('suppliers')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${activeTab === 'suppliers' ? 'bg-[#052659] text-white shadow-md' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>Suppliers</span>
          </button>

          <button
            onClick={() => setActiveTab('planner')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${activeTab === 'planner' ? 'bg-[#052659] text-white shadow-md' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>Procurement Bill</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${activeTab === 'settings' ? 'bg-[#052659] text-white shadow-md' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
        </nav>

        {/* Right Tools (Dark Mode, Logout) */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            onClick={() => signOut(auth)}
            className="p-2 rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition-colors cursor-pointer"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 📱 Bottom Navigation Bar ສຳລັບມືຖື */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/90 dark:bg-[#052659]/90 backdrop-blur-md border-t border-slate-200 dark:border-white/10 px-4 py-2 flex justify-around">
        {[
          { key: 'dashboard', icon: LayoutDashboard, label: 'Dash' },
          { key: 'inventory', icon: Layers, label: 'Stock' },
          { key: 'suppliers', icon: Truck, label: 'Suppliers' },
          { key: 'planner', icon: ShoppingCart, label: 'Bills' },
          { key: 'settings', icon: SettingsIcon, label: 'Setup' }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`flex flex-col items-center gap-1 text-[9px] font-black uppercase ${activeTab === tab.key ? 'text-[#052659] dark:text-sky-400' : 'text-slate-400'}`}
          >
            <tab.icon className="w-4 h-4" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* 💻 Main Workspace Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 mb-16 md:mb-0">
        {activeTab === 'dashboard' && <Dashboard userSettings={userSettings} user={user} />}
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
