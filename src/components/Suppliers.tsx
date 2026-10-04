import React, { useState, useEffect, useMemo } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, addDoc, onSnapshot, query, orderBy, 
  deleteDoc, doc, serverTimestamp 
} from 'firebase/firestore';
import { 
  Plus, Trash2, Save, X, Search, 
  Receipt, Upload, Eye, Calculator, CheckCircle2
} from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';

const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 800;
        let width = img.width;
        let height = img.height;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.65));
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

interface BillItemRow {
  productId: string;
  name: string;
  quantity: number | string;
  quantityPerUnit: number | string;
  unit: string;
  priceOriginal: number | string;
  priceMode: 'total' | 'per_pack';
  remark: string;
}

export default function Suppliers() {
  const { i18n } = useTranslation();
  const [products, setProducts] = useState<any[]>([]);
  const [supplierPrices, setSupplierPrices] = useState<any[]>([]);
  const [supplierList, setSupplierList] = useState<string[]>(['ລັກຂະນາແພກ', 'LATDA', 'CHANHOM', 'DMART', 'HEAVENLY']);
  const [filter, setFilter] = useState('');

  // 1. ຫົວໃບບິນ: ຮ້ານຄ້າ, ວັນທີ, ສະກຸນເງິນ (THB/LAK/USD), ເລດແລກປ່ຽນ, ຮູບໃບບິນ
  const [billSupplier, setBillSupplier] = useState('ລັກຂະນາແພກ');
  const [billCurrency, setBillCurrency] = useState<'THB' | 'LAK' | 'USD'>('THB');
  const [billExchangeRate, setBillExchangeRate] = useState<number>(680); // ເລດເງິນບາດ
  const [billDate, setBillDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [billTime, setBillTime] = useState(format(new Date(), 'HH:mm'));
  const [billReceiptImage, setBillReceiptImage] = useState('');
  
  // 2. ລາຍການເຄື່ອງໃນບິນ (Multi-items)
  const [billItems, setBillItems] = useState<BillItemRow[]>([
    { productId: '', name: '', quantity: 1, quantityPerUnit: 1000, unit: 'g', priceOriginal: '', priceMode: 'total', remark: '' }
  ]);

  const [saveLoading, setSaveLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // In-App Popups
  const [appModal, setAppModal] = useState<{
    isOpen: boolean;
    title: string;
    type: 'add_supplier' | 'add_product' | 'delete_quote' | 'alert';
    data?: any;
    inputValue?: string;
    unitValue?: string;
  }>({ isOpen: false, title: '', type: 'alert' });

  useEffect(() => {
    const unsubP = onSnapshot(query(collection(db, 'products'), orderBy('name')), snap => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubS = onSnapshot(query(collection(db, 'supplierPrices'), orderBy('createdAt', 'desc')), snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSupplierPrices(data);
      const unique = Array.from(new Set([...supplierList, ...data.map(d => d.supplier).filter(Boolean)]));
      setSupplierList(unique);
    });
    return () => { unsubP(); unsubS(); };
  }, []);

  // Ctrl+V Paste Receipt
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            const base64 = await compressImage(file);
            setBillReceiptImage(base64);
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
      const base64 = await compressImage(files[0]);
      setBillReceiptImage(base64);
    }
  };

  const handleImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const base64 = await compressImage(file);
      setBillReceiptImage(base64);
    }
  };

  const handleAddBillItemRow = () => {
    setBillItems(prev => [
      ...prev,
      { productId: '', name: '', quantity: 1, quantityPerUnit: 1000, unit: 'g', priceOriginal: '', priceMode: 'total', remark: '' }
    ]);
  };

  const handleRemoveBillItemRow = (idx: number) => {
    if (billItems.length <= 1) return;
    setBillItems(prev => prev.filter((_, i) => i !== idx));
  };

  // 💡 ຄິດໄລ່ຍອດລວມທັງໝົດຂອງໃບບິນ (Grand Total Live Check)
  const billSummary = useMemo(() => {
    let grandTotalOriginal = 0;

    billItems.forEach(it => {
      const rawPrice = Number(String(it.priceOriginal).replace(/,/g, '')) || 0;
      const qty = Number(it.quantity) || 1;
      const totalForItem = it.priceMode === 'total' ? rawPrice : rawPrice * qty;
      grandTotalOriginal += totalForItem;
    });

    const rate = billCurrency === 'LAK' ? 1 : (Number(billExchangeRate) || 1);
    const grandTotalLAK = grandTotalOriginal * rate;

    return {
      grandTotalOriginal,
      grandTotalLAK,
      itemCount: billItems.filter(it => it.productId).length
    };
  }, [billItems, billCurrency, billExchangeRate]);

  // 🚀 ບັນທຶກທຸກລາຍການໃນໃບບິນ
  const handleSaveWholeBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billSupplier) {
      setAppModal({ isOpen: true, title: 'ແຈ້ງເຕືອນ', type: 'alert', data: 'ກະລຸນາເລືອກຮ້ານຄ້າ' });
      return;
    }

    const validItems = billItems.filter(it => it.productId && Number(String(it.priceOriginal).replace(/,/g, '')) > 0);
    if (validItems.length === 0) {
      setAppModal({ isOpen: true, title: 'ແຈ້ງເຕືອນ', type: 'alert', data: 'ກະລຸນາເລືອກສິນຄ້າ ແລະ ໃສ່ລາຄາຢ່າງໜ້ອຍ 1 ລາຍການ' });
      return;
    }

    try {
      setSaveLoading(true);
      const rate = billCurrency === 'LAK' ? 1 : (Number(billExchangeRate) || 1);

      const batchPromises = validItems.map(item => {
        const rawPrice = Number(String(item.priceOriginal).replace(/,/g, ''));
        const qty = Number(item.quantity) || 1;
        const singlePrice = item.priceMode === 'total' ? rawPrice / qty : rawPrice;
        const priceLAK = singlePrice * rate;
        const totalOriginal = item.priceMode === 'total' ? rawPrice : rawPrice * qty;
        const totalPriceLAK = totalOriginal * rate;

        return addDoc(collection(db, 'supplierPrices'), {
          productId: item.productId,
          supplier: billSupplier,
          currency: billCurrency,
          exchangeRate: rate,
          priceOriginal: singlePrice,
          priceLAK,
          totalPriceOriginal: totalOriginal,
          totalPriceLAK,
          quantity: qty,
          quantityPerUnit: Number(item.quantityPerUnit) || 1,
          unit: item.unit || 'g',
          remark: item.remark || '',
          receiptImage: billReceiptImage || '',
          date: billDate,
          time: billTime,
          priceMode: item.priceMode,
          createdAt: serverTimestamp(),
          userId: auth.currentUser?.uid || 'admin',
          userEmail: auth.currentUser?.email || 'admin@leouve.com'
        });
      });

      await Promise.all(batchPromises);

      setBillReceiptImage('');
      setBillItems([
        { productId: '', name: '', quantity: 1, quantityPerUnit: 1000, unit: 'g', priceOriginal: '', priceMode: 'total', remark: '' }
      ]);
      setAppModal({ 
        isOpen: true, 
        title: 'ສຳເລັດ', 
        type: 'alert', 
        data: `ບັນທຶກສຳເລັດແລ້ວທັງໝົດ ${validItems.length} ລາຍການ! ຍອດລວມ: ${billSummary.grandTotalOriginal.toLocaleString()} ${billCurrency} (${Math.round(billSummary.grandTotalLAK).toLocaleString()} ₭)` 
      });
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <div className="space-y-6 font-sans pb-16">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white dark:bg-[#141414] p-6 rounded-3xl border border-slate-200/80 dark:border-neutral-800 shadow-xs">
        <div>
          <span className="bg-[#052659] dark:bg-white dark:text-neutral-950 text-white text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest">
            Le Ouve Procurement
          </span>
          <h1 className="text-2xl md:text-3xl font-serif text-slate-800 dark:text-white mt-1">
            Supplier Quotes & Batch Invoices
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            ຄີພ້ອມກັນຫຼາຍລາຍການໃນບິນດຽວ (ຮອງຮັບເງິນບາດ THB, ກີບ LAK, ໂດລາ USD) ພ້ອມຕິດຮູບໃບບິນ
          </p>
        </div>

        <button
          onClick={() => setAppModal({ isOpen: true, title: 'ເພີ່ມວັດຖຸດິບໃໝ່', type: 'add_product', inputValue: '', unitValue: 'g' })}
          className="crystal-button !py-2.5 !px-4 flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>+ ເພີ່ມວັດຖຸດິບໃໝ່</span>
        </button>
      </div>

      {/* Form Batch Bill */}
      <div className="high-density-card p-6 space-y-6">
        <form onSubmit={handleSaveWholeBill} className="space-y-6">
          
          {/* ສ່ວນຫົວໃບບິນ: ຮ້ານຄ້າ, ວັນທີ, ສະກຸນເງິນ, ເລດ, ຮູບໃບບິນ */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border-b border-slate-100 dark:border-neutral-800 pb-6">
            
            {/* 1. ຮ້ານຄ້າ */}
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="label-xs">ຮ້ານຄ້າ (Supplier)</label>
                <button
                  type="button"
                  onClick={() => setAppModal({ isOpen: true, title: 'ເພີ່ມຊື່ຮ້ານຄ້າໃໝ່', type: 'add_supplier', inputValue: '' })}
                  className="text-[10px] text-sky-500 hover:underline cursor-pointer"
                >
                  + ເພີ່ມຮ້ານ
                </button>
              </div>
              <select
                value={billSupplier}
                onChange={e => setBillSupplier(e.target.value)}
                className="crystal-input w-full font-bold cursor-pointer"
              >
                {supplierList.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* 2. ວັນທີ */}
            <div className="space-y-1">
              <label className="label-xs">ວັນທີຕາມໃບບິນ</label>
              <input
                type="date"
                required
                value={billDate}
                onChange={e => setBillDate(e.target.value)}
                className="crystal-input w-full font-mono text-xs font-bold"
              />
            </div>

            {/* 3. ສະກຸນເງິນ & ເລດແລກປ່ຽນ (ສຳຄັນຫຼາຍສຳລັບບິນໄທ) */}
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="label-xs">ສະກຸນເງິນ</label>
                {billCurrency !== 'LAK' && (
                  <span className="text-[10px] text-amber-500 font-bold">ເລດ (1 {billCurrency} = ... ₭)</span>
                )}
              </div>
              <div className="flex gap-2">
                <select
                  value={billCurrency}
                  onChange={e => {
                    const c = e.target.value as any;
                    setBillCurrency(c);
                    if (c === 'LAK') setBillExchangeRate(1);
                    else if (c === 'THB') setBillExchangeRate(680);
                    else if (c === 'USD') setBillExchangeRate(22000);
                  }}
                  className="crystal-input w-28 font-bold cursor-pointer"
                >
                  <option value="THB">THB (฿)</option>
                  <option value="LAK">LAK (₭)</option>
                  <option value="USD">USD ($)</option>
                </select>

                <input
                  type="number"
                  disabled={billCurrency === 'LAK'}
                  placeholder="ເລດເງິນ"
                  value={billCurrency === 'LAK' ? 1 : billExchangeRate}
                  onChange={e => setBillExchangeRate(parseFloat(e.target.value) || 1)}
                  className="crystal-input flex-1 font-mono font-bold text-center disabled:opacity-40"
                />
              </div>
            </div>

            {/* 4. ຮູບໃບບິນ (Drag/Drop/Ctrl+V) */}
            <div className="space-y-1">
              <label className="label-xs flex justify-between">
                <span>ຮູບໃບບິນ (Receipt Image)</span>
                <span className="text-emerald-500 font-bold text-[9px]">Ctrl+V ວາງໄດ້</span>
              </label>

              <div
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
                className="border border-dashed border-slate-300 dark:border-neutral-700 rounded-xl p-2 text-center hover:bg-slate-50 dark:hover:bg-neutral-800/40 relative cursor-pointer flex items-center justify-between"
              >
                <input type="file" accept="image/*" onChange={handleImageFileSelect} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                {billReceiptImage ? (
                  <div className="flex items-center gap-2 text-left w-full justify-between">
                    <img src={billReceiptImage} alt="Receipt" className="w-8 h-8 object-cover rounded-lg border border-neutral-700" />
                    <span className="text-[11px] font-bold text-emerald-500 truncate flex-1 pl-1">ຕິດຮູບໃບບິນແລ້ວ ✓</span>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setBillReceiptImage(''); }} className="text-rose-500 p-1">✕</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mx-auto text-slate-400 text-xs">
                    <Upload className="w-3.5 h-3.5" />
                    <span>ຄລິກ ຫຼື ວາງຮູບ (Ctrl+V)</span>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* ລາຍການສິນຄ້າພາຍໃນໃບບິນ */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-serif uppercase tracking-wider text-slate-800 dark:text-white">
                ລາຍການສິນຄ້າໃນໃບບິນນີ້ ({billItems.length} ລາຍການ)
              </h4>
              <button
                type="button"
                onClick={handleAddBillItemRow}
                className="text-xs font-bold text-sky-500 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ ເພີ່ມລາຍການຊື້ໃນບິນນີ້</span>
              </button>
            </div>

            <div className="space-y-3">
              {billItems.map((item, idx) => (
                <div key={idx} className="p-4 rounded-2xl bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200/70 dark:border-neutral-800 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-neutral-800 text-[10px] font-bold flex items-center justify-center font-mono">
                      {idx + 1}
                    </span>

                    {/* ເລືອກວັດຖຸດິບ */}
                    <div className="flex-1">
                      <select
                        value={item.productId}
                        onChange={e => {
                          const pId = e.target.value;
                          const pr = products.find(p => p.id === pId);
                          setBillItems(prev => prev.map((it, i) => i === idx ? { 
                            ...it, 
                            productId: pId, 
                            unit: pr?.unit || 'g', 
                            quantityPerUnit: pr?.packSize || 1000 
                          } : it));
                        }}
                        className="crystal-input w-full font-bold !py-2 text-xs"
                      >
                        <option value="">-- ເລືອກວັດຖຸດິບ --</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
                      </select>
                    </div>

                    {/* ລາຄາລວມ ຫຼື ລາຄາຕໍ່ແພັກ */}
                    <div className="flex bg-slate-200 dark:bg-neutral-800 rounded-xl p-0.5 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setBillItems(prev => prev.map((it, i) => i === idx ? { ...it, priceMode: 'total' } : it))}
                        className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${item.priceMode === 'total' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'text-slate-400'}`}
                      >
                        ລາຄາລວມ
                      </button>
                      <button
                        type="button"
                        onClick={() => setBillItems(prev => prev.map((it, i) => i === idx ? { ...it, priceMode: 'per_pack' } : it))}
                        className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${item.priceMode === 'per_pack' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'text-slate-400'}`}
                      >
                        ຕໍ່ແພັກ
                      </button>
                    </div>

                    {/* ຊ່ອງໃສ່ລາຄາຕາມບິນ */}
                    <div className="w-40">
                      <div className="relative">
                        <input
                          type="text"
                          placeholder={`ລາຄາ (${billCurrency})`}
                          value={item.priceOriginal ? Number(item.priceOriginal).toLocaleString() : ''}
                          onChange={e => {
                            const raw = Number(e.target.value.replace(/,/g, '')) || 0;
                            setBillItems(prev => prev.map((it, i) => i === idx ? { ...it, priceOriginal: raw } : it));
                          }}
                          className="crystal-input w-full !py-2 font-mono font-bold text-right text-xs pr-8"
                        />
                        <span className="absolute right-2.5 top-2 text-[10px] text-slate-400 font-bold">{billCurrency}</span>
                      </div>
                    </div>

                    {billItems.length > 1 && (
                      <button type="button" onClick={() => handleRemoveBillItemRow(idx)} className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg cursor-pointer">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* ແຖວ 2: ຈຳນວນແພັກ, ຂະໜາດ/ແພັກ, ຫົວໜ່ວຍ, ໝາຍເຫດ */}
                  <div className="grid grid-cols-4 gap-2 text-xs pt-1">
                    <div>
                      <span className="text-[9px] text-slate-400 block mb-0.5">ຈຳນວນແພັກ/ຖົງ</span>
                      <input
                        type="number"
                        min="1"
                        placeholder="ເຊັ່ນ: 1 ຫຼື 2"
                        value={item.quantity}
                        onChange={e => setBillItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: parseFloat(e.target.value) || 1 } : it))}
                        className="crystal-input w-full !py-1 text-center font-bold"
                      />
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block mb-0.5">ຂະໜາດຕໍ່ແພັກ (ເຊັ່ນ 1kg = 1000)</span>
                      <input
                        type="number"
                        placeholder="1000"
                        value={item.quantityPerUnit}
                        onChange={e => setBillItems(prev => prev.map((it, i) => i === idx ? { ...it, quantityPerUnit: parseFloat(e.target.value) || 1 } : it))}
                        className="crystal-input w-full !py-1 text-center font-bold"
                      />
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block mb-0.5">ຫົວໜ່ວຍສູດ (g/ml/pcs/pack)</span>
                      <input
                        type="text"
                        placeholder="g"
                        value={item.unit}
                        onChange={e => setBillItems(prev => prev.map((it, i) => i === idx ? { ...it, unit: e.target.value } : it))}
                        className="crystal-input w-full !py-1 text-center font-bold"
                      />
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block mb-0.5">ໝາຍເຫດ</span>
                      <input
                        type="text"
                        placeholder="ໝາຍເຫດ..."
                        value={item.remark}
                        onChange={e => setBillItems(prev => prev.map((it, i) => i === idx ? { ...it, remark: e.target.value } : it))}
                        className="crystal-input w-full !py-1"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 🌟 ແຖບກວດສອບຍອດລວມທັງໝົດຂອງໃບບິນ (GRAND TOTAL VERIFICATION) */}
          <div className="p-4 rounded-2xl bg-[#052659]/5 dark:bg-white/5 border border-[#052659]/10 dark:border-white/10 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
            <div>
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                <Calculator className="w-3.5 h-3.5" />
                <span>ກວດສອບຍອດລວມທັງໝົດຂອງໃບບິນ (Grand Total Check)</span>
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                ກວດເບິ່ງວ່າຍອດລວມນີ້ ກົງກັບຕົວເລກ Grand Total ໃນເຈ້ຍບິນແລ້ວຫຼືບໍ່
              </p>
            </div>

            <div className="text-right">
              <span className="text-2xl font-serif font-bold text-slate-800 dark:text-white font-mono block">
                {billSummary.grandTotalOriginal.toLocaleString()} {billCurrency}
              </span>
              {billCurrency !== 'LAK' && (
                <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 block mt-0.5">
                  ≈ {Math.round(billSummary.grandTotalLAK).toLocaleString()} ₭
                </span>
              )}
            </div>
          </div>

          {/* ປຸ່ມ Action */}
          <div className="flex justify-between items-center pt-2">
            <button
              type="button"
              onClick={handleAddBillItemRow}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-800 text-xs font-bold cursor-pointer"
            >
              + ເພີ່ມແຖວສິນຄ້າ
            </button>
            <button
              type="submit"
              disabled={saveLoading}
              className="crystal-button !py-3 !px-8 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>{saveLoading ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກໃບບິນ (ທຸກລາຍການ)'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* ຕາຕະລາງປະຫວັດລາຄາ */}
      <div className="high-density-card p-6 overflow-hidden">
        <div className="flex justify-between items-center border-b border-slate-100 dark:border-neutral-800 pb-3 mb-4">
          <div>
            <h3 className="text-sm font-serif text-slate-800 dark:text-white">ປະຫວັດລາຄາ & ໃບບິນທັງໝົດ</h3>
            <p className="text-xs text-slate-400">ກົດໄອຄອນຕາເພື່ອເບິ່ງຮູບໃບບິນ</p>
          </div>
          <input
            type="text"
            placeholder="ຄົ້ນຫາ..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="crystal-input !py-1.5 !text-xs w-48"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-neutral-900/60 text-[10px] font-black uppercase text-slate-400">
              <tr>
                <th className="p-3">ວັນທີ</th>
                <th className="p-3">ສິນຄ້າ</th>
                <th className="p-3">ຮ້ານຄ້າ</th>
                <th className="p-3 text-right">ລາຄາເດີມ</th>
                <th className="p-3 text-right">ລາຄາກີບ (LAK)</th>
                <th className="p-3 text-center">ໃບບິນ</th>
                <th className="p-3 text-center">ຈັດການ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
              {supplierPrices
                .filter(p => {
                  const prod = products.find(pr => pr.id === p.productId)?.name || '';
                  return prod.toLowerCase().includes(filter.toLowerCase()) || (p.supplier || '').toLowerCase().includes(filter.toLowerCase());
                })
                .map(item => {
                  const prod = products.find(pr => pr.id === item.productId);
                  const total = item.totalPriceLAK || (item.currency === 'LAK' ? item.priceOriginal : item.priceOriginal * item.exchangeRate);
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-neutral-800/30">
                      <td className="p-3 font-mono text-slate-400">{item.date}</td>
                      <td className="p-3 font-bold text-slate-800 dark:text-white">
                        {prod?.name || 'Item'}
                        <span className="text-[10px] text-slate-400 block font-normal">{item.quantity}ແພັກ × {item.quantityPerUnit}{item.unit}</span>
                      </td>
                      <td className="p-3 font-medium">{item.supplier}</td>
                      <td className="p-3 text-right font-mono font-medium whitespace-nowrap">
                        {item.totalPriceOriginal ? Number(item.totalPriceOriginal).toLocaleString() : Number(item.priceOriginal).toLocaleString()} {item.currency}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-500 whitespace-nowrap">
                        {Math.round(total).toLocaleString()} ₭
                      </td>
                      <td className="p-3 text-center">
                        {item.receiptImage ? (
                          <button onClick={() => setPreviewImage(item.receiptImage)} className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 cursor-pointer">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        ) : <span className="text-slate-500">-</span>}
                      </td>
                      <td className="p-3 text-center">
                        <button onClick={() => setAppModal({ isOpen: true, title: 'ຢືນຢັນການລຶບ', type: 'delete_quote', data: item.id })} className="p-1.5 text-slate-400 hover:text-rose-500 cursor-pointer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Preview Image */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-xl max-h-[85vh] bg-[#141414] rounded-3xl p-3 border border-neutral-800" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewImage(null)} className="absolute top-4 right-4 p-2 rounded-full bg-black/60 text-white cursor-pointer">✕</button>
            <img src={previewImage} alt="Receipt" className="w-full h-auto max-h-[80vh] object-contain rounded-2xl" />
          </div>
        </div>
      )}

      {/* In-App Popups */}
      {appModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" onClick={() => setAppModal({ ...appModal, isOpen: false })}>
          <div className="bg-white dark:bg-[#141414] rounded-3xl p-6 border border-slate-200 dark:border-neutral-800 max-w-md w-full space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-neutral-800 pb-3">
              <h3 className="text-sm font-serif text-slate-800 dark:text-white">{appModal.title}</h3>
              <button onClick={() => setAppModal({ ...appModal, isOpen: false })} className="text-slate-400 hover:text-white">✕</button>
            </div>

            {appModal.type === 'alert' && (
              <div className="space-y-4 text-xs text-slate-600 dark:text-slate-300">
                <p>{appModal.data}</p>
                <button onClick={() => setAppModal({ ...appModal, isOpen: false })} className="crystal-button w-full">ເຂົ້າໃຈແລ້ວ</button>
              </div>
            )}

            {appModal.type === 'delete_quote' && (
              <div className="space-y-4 text-xs">
                <p className="text-slate-600 dark:text-slate-300">ທ່ານແນ່ໃຈບໍ່ວ່າຕ້ອງການລຶບລາຍການລາຄານີ້?</p>
                <div className="flex gap-2">
                  <button onClick={() => setAppModal({ ...appModal, isOpen: false })} className="flex-1 py-2.5 rounded-xl border text-slate-400">ຍົກເລີກ</button>
                  <button 
                    onClick={async () => {
                      if (appModal.data) await deleteDoc(doc(db, 'supplierPrices', appModal.data));
                      setAppModal({ ...appModal, isOpen: false });
                    }} 
                    className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white font-bold"
                  >
                    ລຶບທັນທີ
                  </button>
                </div>
              </div>
            )}

            {appModal.type === 'add_supplier' && (
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="ໃສ່ຊື່ຜູ້ສະໜອງໃໝ່..."
                  value={appModal.inputValue || ''}
                  onChange={e => setAppModal({ ...appModal, inputValue: e.target.value })}
                  className="crystal-input w-full !text-xs font-bold"
                />
                <button
                  onClick={() => {
                    const name = appModal.inputValue?.trim();
                    if (name) {
                      setSupplierList(prev => Array.from(new Set([...prev, name])));
                      setBillSupplier(name);
                    }
                    setAppModal({ ...appModal, isOpen: false });
                  }}
                  className="crystal-button w-full"
                >
                  ບັນທຶກຊື່ຮ້ານຄ້າ
                </button>
              </div>
            )}

            {appModal.type === 'add_product' && (
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="ຊື່ວັດຖຸດິບ..."
                  value={appModal.inputValue || ''}
                  onChange={e => setAppModal({ ...appModal, inputValue: e.target.value })}
                  className="crystal-input w-full !text-xs font-bold"
                />
                <input
                  type="text"
                  placeholder="ຫົວໜ່ວຍ (ເຊັ່ນ: g, ml, pcs)..."
                  value={appModal.unitValue || 'g'}
                  onChange={e => setAppModal({ ...appModal, unitValue: e.target.value })}
                  className="crystal-input w-full !text-xs font-bold"
                />
                <button
                  onClick={async () => {
                    const name = appModal.inputValue?.trim();
                    if (name) {
                      await addDoc(collection(db, 'products'), {
                        name,
                        unit: appModal.unitValue || 'g',
                        packSize: 1000,
                        minStock: 100,
                        createdAt: serverTimestamp()
                      });
                    }
                    setAppModal({ ...appModal, isOpen: false });
                  }}
                  className="crystal-button w-full"
                >
                  ບັນທຶກວັດຖຸດິບ
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
