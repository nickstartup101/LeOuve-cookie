import { useState, useEffect, ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Database, Lock, Key, Layout, Users, Trash2, Upload } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, setDoc, serverTimestamp, collection, query, onSnapshot, deleteDoc, getDocs, addDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { read, utils } from 'xlsx';

const TextLogoPreview = ({ name = "Le Ouve" }: { name?: string }) => (
  <div className="flex flex-col items-center text-center gap-1.5 select-none font-sans">
    <h1 className="font-serif text-3xl tracking-tight leading-none text-[#4f0303]">
      {name}
    </h1>
    <div className="flex items-center justify-center gap-2 w-full max-w-[140px]">
      <div className="h-[1px] flex-1 bg-[#4f0303] opacity-20"></div>
      <span className="text-[8px] font-black uppercase tracking-[0.35em] text-[#666666]">
        Workspace
      </span>
      <div className="h-[1px] flex-1 bg-[#4f0303] opacity-20"></div>
    </div>
  </div>
);

export default function Settings({ user, userSettings, isSuperAdmin, appConfig }: any) {
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
          <div className="w-20 h-20 rounded-full bg-[#4f0303]/10 text-[#4f0303] flex items-center justify-center font-black text-xl border border-[#4f0303]/15">
            LO
          </div>
          <div>
            <h3 className="text-2xl font-black text-[#1a1a1a] uppercase">{user?.displayName || 'Admin'}</h3>
            <p className="text-xs text-[#777777] font-bold uppercase tracking-wider">{user?.email}</p>
            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-[#4f0303]/10 text-[#4f0303] rounded-lg text-[10px] font-black uppercase">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Verified Le Ouve Admin</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-center items-center p-8 bg-white border border-[#e8e5e0] rounded-[2rem] shadow-sm">
          <TextLogoPreview name={shopName} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="glass-card p-8 space-y-6">
          <h4 className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
            <Layout className="w-4 h-4 text-[#4f0303]" />
            Branding & Languages
          </h4>
          <div>
            <label className="text-[10px] font-black uppercase text-[#777777] mb-1 block">Branding Name</label>
            <div className="flex gap-2">
              <input
                type="text"
                className="crystal-input flex-1 !text-xs font-bold"
                value={shopName}
                onChange={e => setShopName(e.target.value)}
              />
              <button onClick={handleUpdateShopInfo} className="crystal-button !px-4 !py-2">Save</button>
            </div>
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-[#e8e5e0]">
            <span className="text-xs font-bold">Language / ພາສາ</span>
            <div className="flex gap-2">
              <button onClick={() => i18n.changeLanguage('la')} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${i18n.language === 'la' ? 'bg-[#4f0303] text-white' : 'bg-[#f4f3f0] text-[#666666]'}`}>ລາວ</button>
              <button onClick={() => i18n.changeLanguage('en')} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${i18n.language === 'en' ? 'bg-[#4f0303] text-white' : 'bg-[#f4f3f0] text-[#666666]'}`}>EN</button>
            </div>
          </div>
        </div>

        <div className="glass-card p-8 space-y-6">
          <h4 className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
            <Layout className="w-4 h-4 text-[#4f0303]" />
            Integrations
          </h4>
          <div>
            <label className="text-[10px] font-black uppercase text-[#777777] mb-1 block">Google Sheets ID</label>
            <div className="flex gap-2">
              <input
                type="text"
                className="crystal-input flex-1 !text-xs font-mono"
                value={sheetsId}
                onChange={e => setSheetsId(e.target.value)}
                placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
              />
              <button onClick={handleUpdateSheets} className="crystal-button !px-4 !py-2">Sync</button>
            </div>
          </div>

          <div className="pt-4 border-t border-[#e8e5e0] space-y-2">
            <label className="text-[10px] font-black uppercase text-[#777777] block">Terminal Financial PIN</label>
            <div className="flex gap-2">
              <input
                type="password"
                maxLength={6}
                placeholder="****"
                className="crystal-input w-28 text-center font-mono !text-xs"
                value={newPin}
                onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))}
              />
              <button onClick={handleUpdatePin} className="crystal-button !px-4 !py-2">Update PIN</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
