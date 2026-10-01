import React, { useState } from 'react';
import { ShieldAlert, X } from 'lucide-react';

interface ApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApprove: () => void;
  actionType: string;
  actionData?: any;
}

export default function ApprovalModal({
  isOpen,
  onClose,
  onApprove,
  actionType,
  actionData
}: ApprovalModalProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length >= 4) {
      onApprove();
      setPin('');
      setError(false);
    } else {
      setError(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200 font-sans">
      <div className="bg-white dark:bg-[#073069] w-full max-w-sm rounded-[2rem] p-6 shadow-2xl border border-slate-200 dark:border-white/10 space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 text-rose-500">
            <ShieldAlert className="w-5 h-5" />
            <h4 className="text-xs font-black uppercase tracking-wider">Admin Approval Required</h4>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-300">
          ຢືນຢັນການດຳເນີນການ: <b className="text-rose-500 uppercase">{actionType}</b>
          {actionData?.item && <span> ສຳລັບລາຍການ "{actionData.item}"</span>}
        </p>

        <form onSubmit={handleConfirm} className="space-y-4">
          <input
            type="password"
            autoFocus
            maxLength={6}
            placeholder="ໃສ່ລະຫັດ PIN"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, ''));
              setError(false);
            }}
            className="w-full text-center text-lg tracking-[0.4em] font-mono py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20 outline-none focus:ring-2 focus:ring-rose-500/30 text-slate-850 dark:text-white font-bold"
          />
          {error && <p className="text-[10px] text-rose-500 text-center font-bold">ກະລຸນາໃສ່ PIN ຢ່າງໜ້ອຍ 4 ຕົວເລກ</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold uppercase cursor-pointer"
            >
              ຍົກເລີກ
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md shadow-rose-600/20 cursor-pointer"
            >
              ຢືນຢັນ
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
