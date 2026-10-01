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

// ນຳເຂົ້າທັງ 6 Modules ຫຼັກຂອງ Le Ouve Workspace
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

  // 1. ຕິດຕາມສະຖານະການເຂົ້າສູ່ລະບົບ (Firebase Auth)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // 2. ດຶງຂໍ້ມູນການຕັ້ງຄ່າ ແລະ Shop Config ແບບ Realtime ຈາກ Firestore
  useEffect(() => {
    if (!user) return;
    
    // ດຶງ Settings ສ່ວນບຸກຄົນ (ເຊັ່ນ Google Sheet ID, Financial PIN)
    const unsubUserSettings = onSnapshot(doc(db, 'users', user.uid, 'settings', 'main'), (snap) => {
      if (snap.exists()) {
        setUserSettings(snap.data());
      }
    });

    // ດຶງ Global App Config ຂອງຮ້ານ (ເຊັ່ນ ຊື່ຮ້ານ Le Ouve, ໂລໂກ້)
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

  // 3. ຈັດການ Dark Mode Toggle
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Loading Screen ຂະນະກວດສອບ Session
  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-[#04162e] text-slate-800 dark:text-white font-sans gap-3">
        <div className="w-10 h-10 border-4 border-[#052659] dark:border-sky-400 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Loading Le Ouve Workspace...</p>
      </div>
    );
  }

  // 4. ຖ້າບໍ່ທັນ Login: ສະແດງໜ້າ Login ແບບ Clean UI
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-white to-slate-200 dark:from-[#031738] dark:to-[#04162e] p-6 font-sans">
        <div className="w-full max-w-md bg-white dark:bg-[#073069] rounded-[2.5rem] p-10 shadow-2xl border border-slate-200/80 dark:border-white/10 text-center space-y-6 animate-in fade-in zoom-in-95 duration-300">
          <div className="w-16 h-16 bg-[#052659] text-white rounded-3xl mx-auto flex items-center justify-center shadow-xl shadow-[#052659]/20">
            <Coffee className="w-8 h-8" />
          </div>

          <div>
            <h1 className="text-3xl font-black text-[#052659] dark:text-white tracking-tight">Le Ouve</h1>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mt-1">Workspace Intelligence</p>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-300 leading-relaxed">
            ລະບົບຄຸ້ມຄອງຄັງສາງ, ບັນຊີການເງິນ, ຕົ້ນທຶນສູດເຄື່ອງດື່ມ, ປຽບທຽບລາຄາຜູ້ສະໜອງ ແລະ ບິນຈັດຊື້ອັດຕະໂນມັດ.
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

  // 5. ເມື່ອ Login ແລ້ວ: ສະແດງໜ້າ Dashboard ຫຼັກພ້ອມ Navigation
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#04162e] text-slate-800 dark:text-slate-100 font-sans transition-colors duration-300">
      
      {/* 🧭 Top Navigation Bar (Desktop) */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-[#052659]/80 backdrop-blur-md border-b border-slate-200/80 dark:border-white/10 px-6 py-3.5 flex items-center justify-between">
        
        {/* Brand Logo */}
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
          <div className="w-9 h-9 bg-[#052659] dark:bg-[#0c3a80] text-white rounded-xl flex items-center justify-center font-black shadow-md border border-white/10">
            LO
          </div>
          <div>
            <h2 className="text-base font-black tracking-tight leading-none text-[#052659] dark:text-white">
              {appConfig?.shopName || 'Le Ouve'}
            </h2>
            <span className="text-[8px] font-black uppercase tracking-[0.25em] text-slate-400">Workspace</span>
          </div>
        </div>

        {/* Desktop Navigation Tabs (6 ປຸ່ມຄົບຖ້ວນ) */}
        <nav className="hidden lg:flex items-center gap-1 bg-slate-100 dark:bg-black/20 p-1.5 rounded-2xl border border-slate-200/60 dark:border-white/5">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${activeTab === 'dashboard' ? 'bg-[#052659] text-white shadow-md' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => setActiveTab('finance')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${activeTab === 'finance' ? 'bg-[#052659] text-white shadow-md' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Finance</span>
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
            className="p-2 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="Toggle Theme"
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

      {/* 📱 Bottom Navigation Bar (ສຳລັບຈໍມືຖື ແລະ Tablet ຂະໜາດນ້ອຍ) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#052659]/95 backdrop-blur-md border-t border-slate-200 dark:border-white/10 px-2 py-2 flex justify-around items-center">
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
            className={`flex flex-col items-center gap-1 text-[9px] font-black uppercase transition-all py-1 px-2 rounded-xl cursor-pointer ${
              activeTab === tab.key 
                ? 'text-[#052659] dark:text-sky-400 font-extrabold scale-105' 
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* 💻 Main Workspace Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 mb-16 lg:mb-0">
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
