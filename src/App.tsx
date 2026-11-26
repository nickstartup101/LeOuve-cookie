import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  DollarSign,
  Layers,
  Truck,
  ShoppingCart,
  Settings as SettingsIcon,
  LogOut,
  Menu,
  X,
  Languages
} from 'lucide-react';
import { auth, googleProvider, db } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';

import Dashboard from './components/Dashboard';
import Finance from './components/Finance';
import Inventory from './components/Inventory';
import Suppliers from './components/Suppliers';
import ProcurementPlanner from './components/ProcurementPlanner';
import Settings from './components/Settings';

export default function App() {
  const { i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'finance' | 'inventory' | 'suppliers' | 'planner' | 'settings'>('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
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

  const toggleLanguage = () => {
    const nextLang = i18n.language === 'la' ? 'en' : 'la';
    i18n.changeLanguage(nextLang);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#faf9f6] text-[#1a1a1a] font-sans gap-3">
        <div className="w-8 h-8 border-2 border-[#e8e5e0] border-t-[#4f0303] rounded-full animate-spin"></div>
        <p className="text-[10px] font-light uppercase tracking-[0.3em] text-[#777777]">Loading Le Ouve...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#faf9f6] p-6">
        <div className="w-full max-w-md bg-white rounded-[2.5rem] p-12 shadow-xl border border-[#e8e5e0] text-center space-y-8 animate-in fade-in zoom-in-95 duration-300">
          <div className="flex flex-col items-center justify-center select-none pt-2">
            <h1 className="font-serif text-5xl md:text-6xl text-[#4f0303] tracking-tight leading-none">
              Le Ouve
            </h1>
            <span className="font-sans text-[9px] font-light tracking-[0.45em] uppercase text-[#777777] mt-3 leading-none">
              workspace estd 2026
            </span>
          </div>

          <div className="w-12 h-[1px] bg-[#e8e5e0] mx-auto"></div>

          <p className="font-sans text-xs font-light text-[#666666] leading-relaxed max-w-xs mx-auto">
            ລະບົບຄຸ້ມຄອງຄັງສາງ, ຕົ້ນທຶນສູດເຄື່ອງດື່ມ, ບັນຊີການເງິນ & ໃບບິນຈັດຊື້ອັດຕະໂນມັດ
          </p>

          <button
            onClick={() => signInWithPopup(auth, googleProvider)}
            className="w-full py-4 bg-[#4f0303] hover:bg-[#680404] active:bg-[#380202] text-white rounded-2xl font-sans font-medium text-xs uppercase tracking-[0.2em] shadow-lg transition-all active:scale-95 cursor-pointer"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  const navItems = [
    { key: 'dashboard', icon: LayoutDashboard, label: i18n.language === 'la' ? 'ໜ້າຫຼັກ (Dashboard)' : 'Dashboard' },
    { key: 'finance', icon: DollarSign, label: i18n.language === 'la' ? 'ການເງິນ & ໜີ້ສິນ' : 'Finance & Debts' },
    { key: 'inventory', icon: Layers, label: i18n.language === 'la' ? 'ສູດ & ຄັງສາງ' : 'Inventory & Recipe' },
    { key: 'suppliers', icon: Truck, label: i18n.language === 'la' ? 'ຜູ້ສະໜອງ & ໃບບິນ' : 'Suppliers & Quotes' },
    { key: 'planner', icon: ShoppingCart, label: i18n.language === 'la' ? 'ແຜນສັ່ງຊື້ (Bills)' : 'Procurement Bill' },
    { key: 'settings', icon: SettingsIcon, label: i18n.language === 'la' ? 'ຕັ້ງຄ່າ' : 'Settings' }
  ];

  return (
    <div className="min-h-screen flex bg-[#faf9f6] text-[#1a1a1a] font-sans transition-colors duration-200">

    <aside className="hidden lg:flex w-64 bg-white text-[#1a1a1a] flex-col justify-between fixed inset-y-0 left-0 z-40 border-r border-[#e8e5e0] shadow-sm select-none transition-colors duration-300">

        {/* Brand Header */}
      <div className="p-7 border-b border-[#e8e5e0]">
          <div className="cursor-pointer" onClick={() => setActiveTab('dashboard')}>
          <h1 className="font-serif text-3xl text-[#4f0303] tracking-tight leading-none">
              {appConfig?.shopName || 'Le Ouve'}
            </h1>
          <p className="font-sans text-[8px] font-light tracking-[0.35em] uppercase text-[#777777] mt-1.5 leading-none">
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
                    ? 'bg-[#4f0303] text-white font-bold shadow-md shadow-[#4f0303]/15 translate-x-1'
                    : 'text-[#666666] hover:text-[#4f0303] hover:bg-[#680404]/5 font-medium'
                }`}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#e8e5e0] space-y-3">

          <div className="grid grid-cols-1 gap-2">
            <button
              onClick={toggleLanguage}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[#f4f3f0] hover:bg-[#e8e5e0] text-[#4f0303] text-xs font-bold transition-all cursor-pointer border border-[#e8e5e0]"
              title="Change Language"
            >
              <Languages className="w-3.5 h-3.5" />
              <span>{i18n.language === 'la' ? 'ລາວ' : 'EN'}</span>
            </button>
          </div>

          {/* User Profile */}
          <div className="flex items-center justify-between p-2.5 rounded-2xl bg-[#f4f3f0] border border-[#e8e5e0]">
            <div className="truncate pr-2">
              <p className="text-xs font-bold text-[#1a1a1a] truncate leading-none">{user.displayName || 'Admin'}</p>
              <p className="text-[9px] text-[#777777] truncate mt-1 font-light">{user.email}</p>
            </div>
            <button
              onClick={() => signOut(auth)}
              className="p-1.5 text-[#4f0303] hover:bg-[#680404]/10 rounded-xl transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:hidden fixed top-0 inset-x-0 z-40 bg-white text-[#1a1a1a] px-5 py-3.5 flex items-center justify-between shadow-sm border-b border-[#e8e5e0]">
        <div>
          <h1 className="font-serif text-2xl text-[#4f0303] tracking-tight leading-none">Le Ouve</h1>
          <p className="text-[7.5px] font-light tracking-[0.3em] uppercase text-[#777777] mt-1">workspace estd 2026</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleLanguage} className="p-2 rounded-xl bg-[#f4f3f0] text-[#4f0303] text-xs font-bold">
            {i18n.language === 'la' ? 'LA' : 'EN'}
          </button>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 rounded-xl bg-[#f4f3f0] text-[#4f0303]">
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-[#f4f3f0]/35 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)}>
          <div className="w-72 bg-white h-full p-6 text-[#1a1a1a] flex flex-col justify-between border-r border-[#e8e5e0]" onClick={e => e.stopPropagation()}>
            <div className="space-y-6">
              <div className="border-b border-[#e8e5e0] pb-4">
                <h2 className="font-serif text-3xl text-[#4f0303]">Le Ouve</h2>
                <p className="text-[8px] uppercase tracking-[0.35em] text-[#777777] mt-1">workspace estd 2026</p>
              </div>
              <div className="space-y-1">
                {navItems.map(item => (
                  <button
                    key={item.key}
                    onClick={() => { setActiveTab(item.key as any); setIsMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs uppercase tracking-wider ${activeTab === item.key ? 'bg-[#4f0303] text-white font-bold' : 'text-[#666666] hover:bg-[#680404]/5 hover:text-[#4f0303]'}`}
                  >
                    <item.icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <button onClick={() => signOut(auth)} className="w-full py-3 rounded-xl bg-[#4f0303]/10 text-[#4f0303] text-xs font-bold uppercase flex items-center justify-center gap-2">
              <LogOut className="w-4 h-4" />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      )}

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
