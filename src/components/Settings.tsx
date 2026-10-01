import { useState, useEffect, ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Moon, Sun, ShieldCheck, Database, Lock, Key, Layout, Users, Trash2, Upload } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, setDoc, serverTimestamp, collection, query, onSnapshot, deleteDoc, getDocs, addDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { read, utils } from 'xlsx';

const TextLogoPreview = ({ dark = false, name = "Le Ouve" }: { dark?: boolean, name?: string }) => (
  <div className="flex flex-col items-center text-center gap-1.5 select-none font-sans">
    <h1 className={`text-3xl font-extrabold tracking-tight leading-none ${dark ? 'text-white' : 'text-[#052659] dark:text-white'}`}>
      {name}
    </h1>
    <div className="flex items-center justify-center gap-2 w-full max-w-[140px]">
      <div className={`h-[1px] flex-1 opacity-20 ${dark ? 'bg-white' : 'bg-[#052659]'}`}></div>
      <span className={`text-[8px] font-black uppercase tracking-[0.35em] ${dark ? 'text-white/70' : 'text-[#052659]/70 dark:text-white/50'}`}>
        Workspace
      </span>
      <div className={`h-[1px] flex-1 opacity-20 ${dark ? 'bg-white' : 'bg-[#052659]'}`}></div>
    </div>
  </div>
);

export default function Settings({ user, isDarkMode, setIsDarkMode, userSettings, isSuperAdmin, appConfig }: any) {
  const { t, i18n } = useTranslation();
  const [newPin, setNewPin] = useState('');
  const [oldPinConfirm, setOldPinConfirm] = useState('');
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [sheetsId, setSheetsId] = useState(userSettings?.googleSheetsId || '');
  const [shopName, setShopName] = useState(appConfig?.shopName || 'Le Ouve');
  const [saveLoading, setSaveLoading] = useState(false);

  const [importLoading, setImportLoading] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const [resetPin, setResetPin] = useState('');
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);
  const [resetConfirmationText, setResetConfirmationText] = useState('');

  const handleUpdateShopInfo = async () => {
    try {
      setSaveLoading(true);
      await setDoc(doc(db, 'settings', 'appConfig'), {
        shopName: shopName,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      }, { merge: true });
      alert("Shop Information Updated to " + shopName);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'appConfig');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleUpdatePin = async () => {
    if (newPin.length < 4) { alert("PIN must be at least 4 digits"); return; }
    try {
      setSaveLoading(true);
      await setDoc(doc(db, 'users', user.uid, 'settings', 'main'), {
        financialPin: newPin,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setNewPin('');
      setIsChangingPin(false);
      alert("Financial PIN Updated Successfully");
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'userSettings');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleUpdateSheets = async () => {
    try {
      setSaveLoading(true);
      await setDoc(doc(db, 'users', user.uid, 'settings', 'main'), {
        googleSheetsId: sheetsId,
        updatedAt: serverTimestamp()
      }, { merge: true });
      alert("Sheets Integration Updated");
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'userSettings');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleResetFinancials = async () => {
    if (userSettings?.financialPin && resetPin !== userSettings.financialPin) {
      alert("Invalid Financial PIN");
      return;
    }
    if (resetConfirmationText.trim().toUpperCase() !== 'CONFIRM') {
      alert("Please type CONFIRM to authorize data reset.");
      return;
    }

    try {
      setSaveLoading(true);
      const txSnap = await getDocs(collection(db, 'transactions'));
      await Promise.all(txSnap.docs.map(docRef => deleteDoc(doc(db, 'transactions', docRef.id))));
      alert("Financial data wiped successfully!");
      setIsConfirmingReset(false);
    } catch (e) {
      alert("Error resetting data.");
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-10 pb-20 font-sans">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 glass-card p-8 flex items-center gap-6">
          <div className="w-20 h-20 rounded-full bg-[#052659] text-white flex items-center justify-center font-black text-xl shadow-lg">
            LO
          </div>
          <div>
            <h3 className="text-2xl font-black text-slate-800 dark:text-white uppercase">{user?.displayName || 'Admin'}</h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">{user?.email}</p>
            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-600 rounded-lg text-[10px] font-black uppercase">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Verified Le Ouve Admin</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-center items-center p-8 bg-[#052659] rounded-[2rem] shadow-xl">
          <TextLogoPreview dark={true} name={shopName} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="glass-card p-8 space-y-6">
          <h4 className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
            <Sun className="w-4 h-4 text-amber-500" />
            Branding & Languages
          </h4>
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 mb-1 block">Branding Name</label>
            <div className="flex gap-2">
              <input
                type="text"
                className="crystal-input flex-1 !text-xs font-bold"
                value={shopName}
                onChange={e => setShopName(e.target.value)}
              />
              <button onClick={handleUpdateShopInfo} className="px-4 py-2 bg-[#052659] text-white rounded-xl text-xs font-bold uppercase cursor-pointer">Save</button>
            </div>
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-slate-100 dark:border-white/5">
            <span className="text-xs font-bold">{t('night_mode')}</span>
            <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 rounded-xl bg-slate-100 dark:bg-white/10 cursor-pointer">
              {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-slate-100 dark:border-white/5">
            <span className="text-xs font-bold">Language / ພາສາ</span>
            <div className="flex gap-2">
              <button onClick={() => i18n.changeLanguage('la')} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${i18n.language === 'la' ? 'bg-[#052659] text-white' : 'bg-slate-100 dark:bg-white/5'}`}>ລາວ</button>
              <button onClick={() => i18n.changeLanguage('en')} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${i18n.language === 'en' ? 'bg-[#052659] text-white' : 'bg-slate-100 dark:bg-white/5'}`}>EN</button>
            </div>
          </div>
        </div>

        <div className="glass-card p-8 space-y-6">
          <h4 className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
            <Layout className="w-4 h-4 text-sky-500" />
            Integrations
          </h4>
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 mb-1 block">Google Sheets ID</label>
            <div className="flex gap-2">
              <input
                type="text"
                className="crystal-input flex-1 !text-xs font-mono"
                value={sheetsId}
                onChange={e => setSheetsId(e.target.value)}
                placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
              />
              <button onClick={handleUpdateSheets} className="px-4 py-2 bg-[#052659] text-white rounded-xl text-xs font-bold uppercase cursor-pointer">Sync</button>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-white/5 space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400 block">Terminal Financial PIN</label>
            <div className="flex gap-2">
              <input
                type="password"
                maxLength={6}
                placeholder="****"
                className="crystal-input w-28 text-center font-mono !text-xs"
                value={newPin}
                onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))}
              />
              <button onClick={handleUpdatePin} className="px-4 py-2 bg-[#052659] text-white rounded-xl text-xs font-bold uppercase cursor-pointer">Update PIN</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
