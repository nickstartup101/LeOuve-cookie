import React, { useState } from 'react';
import { 
  X, 
  CheckCircle, 
  UploadCloud, 
  Receipt, 
  AlertCircle, 
  DollarSign,
  Gift,
  Coffee
} from 'lucide-react';
import { doc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export interface PosBillItemSettlement {
  recipeId: string;
  recipeName: string;
  totalMadeQty: number;   // ຈຳນວນທີ່ເຮັດອອກມາທັງໝົດ
  actualSoldQty: number;  // ຈຳນວນທີ່ຂາຍໄດ້ເງິນຈິງ
  sampleQty: number;      // ຈຳນວນທີ່ຊິມເອງ ຫຼື ແຖມລູກຄ້າ
  pricePerUnit: number;
}

export interface PosBillToSettle {
  id: string;
  billNumber: string;
  customerName: string;
  orderDate: string;
  items: PosBillItemSettlement[];
  arDebtId?: string; // ID ຂອງ ໜີ້ຕ້ອງຮັບ AR ທີ່ຜູກໄວ້
}

interface SettlePosBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  bill: PosBillToSettle | null;
  onSettledSuccess?: () => void;
}

export const SettlePosBillModal: React.FC<SettlePosBillModalProps> = ({
  isOpen,
  onClose,
  bill,
  onSettledSuccess
}) => {
  if (!isOpen || !bill) return null;

  const [items, setItems] = useState<PosBillItemSettlement[]>(
    bill.items.map(it => ({
      ...it,
      actualSoldQty: it.actualSoldQty ?? it.totalMadeQty,
      sampleQty: it.sampleQty ?? 0
    }))
  );
  const [paymentMethod, setPaymentMethod] = useState<'BCEL_ONE' | 'CASH'>('BCEL_ONE');
  const [slipImage, setSlipImage] = useState<string | null>(null);
  const [isSettling, setIsSettling] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ຄຳນວນຍອດເງິນທີ່ຕ້ອງຮຽກເກັບຕົວຈິງ (ຂາຍຈິງ * ລາຄາ)
  const actualRevenueLAK = items.reduce(
    (sum, it) => sum + (it.actualSoldQty * it.pricePerUnit), 
    0
  );

  const totalSampleCount = items.reduce((sum, it) => sum + it.sampleQty, 0);

  // ຮອງຮັບ Paste ຮູບສະລິບ (Ctrl+V)
  const handlePaste = (e: React.ClipboardEvent) => {
    const clipItems = e.clipboardData?.items;
    if (!clipItems) return;
    for (const item of clipItems) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = () => setSlipImage(reader.result as string);
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const updateItemQty = (index: number, field: 'actualSoldQty' | 'sampleQty', val: number) => {
    const updated = [...items];
    const target = updated[index];
    const newQty = Math.max(0, val);

    if (field === 'actualSoldQty') {
      target.actualSoldQty = newQty;
    } else {
      target.sampleQty = newQty;
    }
    setItems(updated);
  };

  // ກົດຢືນຢັນເຄຍບິນ
  const handleConfirmSettlement = async () => {
    setIsSettling(true);
    setErrorMsg(null);

    try {
      // 1. ບັນທຶກລາຍຮັບຕົວຈິງເຂົ້າ finance_transactions (ເພື່ອໃຫ້ Dashboard ດຶງໄປສະແດງທັນທີ)
      const financeDocRef = await addDoc(collection(db, 'finance_transactions'), {
        type: 'INCOME',
        category: 'SALES',
        amountLAK: actualRevenueLAK,
        date: new Date().toISOString().split('T')[0],
        description: `ຍອດຂາຍ POS #${bill.billNumber} (${bill.customerName})`,
        remark: `[ເຄຍບິນແລ້ວ] ຂາຍຈິງ: ${items.map(i => `${i.recipeName} x${i.actualSoldQty}`).join(', ')}${totalSampleCount > 0 ? ` | ແຖມ/ຊິມ: ${totalSampleCount} ອັນ` : ''}`,
        sourceBillId: bill.id,
        paymentMethod,
        slipImageUrl: slipImage || '',
        createdAt: serverTimestamp()
      });

      // 2. ອັບເດດສະຖານະບິນ POS ເປັນ SETTLED
      await updateDoc(doc(db, 'pos_bills', bill.id), {
        status: 'SETTLED',
        settledAt: serverTimestamp(),
        actualRevenueLAK,
        items,
        slipImageUrl: slipImage || '',
        financeTxId: financeDocRef.id
      });

      // 3. ຖ້າມີໜີ້ຕ້ອງຮັບ (AR) ຜູກຢູ່, ໃຫ້ປ່ຽນເປັນ SETTLED
      if (bill.arDebtId) {
        await updateDoc(doc(db, 'debts_apar', bill.arDebtId), {
          status: 'SETTLED',
          settledDate: new Date().toISOString().split('T')[0],
          proofImageUrl: slipImage || ''
        });
      }

      if (onSettledSuccess) onSettledSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg('ເກີດຂໍ້ຜິດພາດໃນການເຄຍບິນ');
    } finally {
      setIsSettling(false);
    }
  };

  return (
    <div 
      onPaste={handlePaste}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
    >
      <div className="bg-white border border-[#e8e5e0] rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-xl overflow-hidden font-sans text-[#1a1a1a]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#e8e5e0] bg-[#f4f3f0] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#4f0303]/10 border border-[#4f0303]/15 flex items-center justify-center text-[#4f0303]">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif text-lg text-[#4f0303] flex items-center gap-2">
                ເຄຍບິນ POS & ຢືນຢັນການຊຳລະເງິນ
                <span className="text-xs font-mono font-normal text-[#4f0303] bg-[#4f0303]/5 border border-[#4f0303]/15 px-2 py-0.5 rounded-full">
                  #{bill.billNumber}
                </span>
              </h2>
              <p className="text-[11px] text-[#777777]">
                ລູກຄ້າ: <strong className="text-[#1a1a1a]">{bill.customerName}</strong> • ເມື່ອກົດເຄຍບິນແລ້ວ ຍອດຂາຍຈຶ່ງຈະຂຶ້ນ Dashboard
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-[#777777] hover:text-[#4f0303]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-[#4f0303]/10 border border-[#4f0303]/20 text-xs text-[#4f0303] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Table: ແຍກຍອດຂາຍຈິງ vs ຊິມເອງ/ແຖມ */}
          <div className="border border-[#e8e5e0] rounded-xl overflow-hidden bg-[#faf9f6]">
            <div className="px-4 py-2.5 bg-[#f4f3f0] border-b border-[#e8e5e0] flex justify-between items-center text-xs">
              <span className="font-medium text-[#777777]">ລາຍການທີ່ເຮັດອອກມາ & ຕົວເລກຂາຍຕົວຈິງ</span>
              <span className="text-[11px] text-[#4f0303]">ກວດສອບຈຳນວນທີ່ແຖມ ຫຼື ຊິມເອງ</span>
            </div>

            <div className="divide-y divide-[#e8e5e0] text-xs">
              {items.map((item, idx) => (
                <div key={idx} className="p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[#1a1a1a] text-sm">{item.recipeName}</span>
                    <span className="text-[#777777] font-mono">
                      ລາຄາ: @{item.pricePerUnit.toLocaleString()} ₭
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    {/* ຂາຍຕົວຈິງ */}
                    <div className="p-2.5 bg-[#f4f3f0] border border-[#e8e5e0]/80 rounded-xl flex items-center justify-between">
                      <span className="text-[11px] text-[#777777] flex items-center gap-1">
                        <DollarSign className="w-3.5 h-3.5 text-[#4f0303]" /> ຂາຍຕົວຈິງ:
                      </span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          value={item.actualSoldQty}
                          onChange={(e) => updateItemQty(idx, 'actualSoldQty', parseInt(e.target.value) || 0)}
                          className="w-14 bg-[#faf9f6] border border-[#e8e5e0] rounded px-2 py-1 text-center font-mono text-[#4f0303] font-bold focus:outline-none"
                        />
                        <span className="text-[#666666] text-[11px]">ກ້ອນ</span>
                      </div>
                    </div>

                    {/* ຊິມເອງ / ແຖມ */}
                    <div className="p-2.5 bg-[#f4f3f0] border border-[#e8e5e0]/80 rounded-xl flex items-center justify-between">
                      <span className="text-[11px] text-[#777777] flex items-center gap-1">
                        <Gift className="w-3.5 h-3.5 text-[#4f0303]" /> ແຖມ / ຊິມເອງ:
                      </span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          value={item.sampleQty}
                          onChange={(e) => updateItemQty(idx, 'sampleQty', parseInt(e.target.value) || 0)}
                          className="w-14 bg-[#faf9f6] border border-[#e8e5e0] rounded px-2 py-1 text-center font-mono text-[#4f0303] font-bold focus:outline-none"
                        />
                        <span className="text-[#666666] text-[11px]">ກ້ອນ</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Payment Method & Slip Upload */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            {/* ວິທີຊຳລະ */}
            <div className="space-y-2">
              <label className="text-[#777777] block">ວິທີການຊຳລະເງິນ</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('BCEL_ONE')}
                  className={`py-2 px-3 rounded-xl border text-center transition-all ${
                    paymentMethod === 'BCEL_ONE'
                      ? 'border-[#4f0303]/60 bg-[#4f0303]/20 text-[#4f0303] font-medium'
                      : 'border-[#e8e5e0] bg-[#f4f3f0] text-[#777777]'
                  }`}
                >
                  BCEL One (ໂອນ)
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('CASH')}
                  className={`py-2 px-3 rounded-xl border text-center transition-all ${
                    paymentMethod === 'CASH'
                      ? 'border-[#4f0303]/60 bg-[#4f0303]/20 text-[#4f0303] font-medium'
                      : 'border-[#e8e5e0] bg-[#f4f3f0] text-[#777777]'
                  }`}
                >
                  ເງິນສົດ (Cash)
                </button>
              </div>
            </div>

            {/* Slip Box (ຮອງຮັບ Ctrl+V) */}
            <div className="space-y-2">
              <label className="text-[#777777] block">ຫຼັກຖານການໂອນ (ສະລິບ)</label>
              <div className="border border-dashed border-[#e8e5e0] hover:border-[#e8e5e0] rounded-xl p-3 bg-[#faf9f6] text-center min-h-[75px] flex items-center justify-center">
                {slipImage ? (
                  <div className="relative">
                    <img src={slipImage} alt="Slip" className="max-h-20 rounded shadow" />
                    <button
                      type="button"
                      onClick={() => setSlipImage(null)}
                      className="absolute -top-2 -right-2 p-1 bg-white border border-[#e8e5e0] rounded-full text-[#4f0303]"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <span className="text-[11px] text-[#666666]">
                    ກົດ <kbd className="px-1 py-0.5 bg-[#f4f3f0] border border-[#e8e5e0] rounded text-[#777777]">Ctrl + V</kbd> ເພື່ອວາງສະລິບໂອນເງິນ
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Grand Summary */}
          <div className="p-4 bg-[#f4f3f0] border border-[#e8e5e0] rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-xs text-[#777777] block">ຍອດເງິນຕົວຈິງທີ່ຈະຮັບຮູ້ເຂົ້າ Dashboard:</span>
              <span className="text-[11px] text-[#666666]">
                (ຄິດໄລ່ສະເພາະຈຳນວນທີ່ຂາຍໄດ້ຈິງ • ຕັດຍອດແຖມອອກ)
              </span>
            </div>
            <span className="font-serif text-2xl font-bold text-[#4f0303] font-mono">
              {actualRevenueLAK.toLocaleString()} ₭
            </span>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#e8e5e0] bg-[#f4f3f0] flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs bg-[#f4f3f0] border border-[#e8e5e0] text-[#666666] rounded-xl hover:bg-[#e8e5e0]"
          >
            ຍົກເລີກ
          </button>
          <button
            type="button"
            disabled={isSettling}
            onClick={handleConfirmSettlement}
            className="px-5 py-2 text-xs bg-[#4f0303] hover:bg-[#680404] text-white font-semibold rounded-xl flex items-center gap-2 transition-all shadow-md disabled:opacity-50"
          >
            <CheckCircle className="w-4 h-4 text-white" />
            <span>{isSettling ? 'ກຳລັງເຄຍບິນ...' : 'ຢືນຢັນເຄຍບິນ & ເພີ່ມຍອດຂາຍ'}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
