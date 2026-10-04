import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, addDoc, query, orderBy, onSnapshot, 
  deleteDoc, doc, serverTimestamp, setDoc, getDocs, where, updateDoc 
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { useTranslation } from 'react-i18next';
import { 
  DollarSign, TrendingUp, TrendingDown, Wallet, CreditCard, 
  Plus, Trash2, ArrowUpRight, ArrowDownRight,
  Lock, Download, QrCode, Building2, Activity,
  CheckCircle2, Sparkles, HandCoins, Receipt, Upload, Eye, Check
} from 'lucide-react';
import { format } from 'date-fns';
import { utils, writeFile } from 'xlsx';

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

export type ExpenseBucket = 'cogs' | 'opex' | 'capex' | 'dividend';

export default function Finance({ userSettings }: { userSettings?: any }) {
  const { i18n } = useTranslation();
  const [subView, setSubView] = useState<'transactions' | 'debts'>('transactions');

  const [transactions, setTransactions] = useState<any[]>([]);
  const [supplierPrices, setSupplierPrices] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [debts, setDebts] = useState<any[]>([]);

  // Form State
  const [type, setType] = useState<'income' | 'expense'>('income');
  const [amount, setAmount] = useState<string>('');
  const [category, setCategory] = useState('ຂາຍເຄື່ອງດື່ມ & ກາເຟ (Coffee & Drinks)');
  const [expenseBucket, setExpenseBucket] = useState<ExpenseBucket>('cogs');
  const [source, setSource] = useState<'cash' | 'onepay' | 'ldb'>('onepay');
  const [description, setDescription] = useState('');
  const [receiptImage, setReceiptImage] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState(format(new Date(), 'HH:mm'));
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Debt Form State (AP / AR)
  const [debtType, setDebtType] = useState<'payable' | 'receivable'>('payable');
  const [debtPerson, setDebtPerson] = useState('');
  const [debtAmount, setDebtAmount] = useState('');
  const [debtDueDate, setDebtDueDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [debtReceiptImage, setDebtReceiptImage] = useState('');
  const [debtRemark, setDebtRemark] = useState('');

  // 📥 Drawer: ດຶງຈາກ Supplier ຕາມວັນທີ ພ້ອມ Checkbox ເລືອກຕິກ
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [selectedSupplierItems, setSelectedSupplierItems] = useState<{ [id: string]: boolean }>({});
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // In-App Dialog / Delete Modal
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string; type: 'tx' | 'debt' }>({ isOpen: false, id: '', type: 'tx' });

  useEffect(() => {
    const unsubTx = onSnapshot(query(collection(db, 'transactions'), orderBy('date', 'desc'), orderBy('time', 'desc')), snap => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubSp = onSnapshot(query(collection(db, 'supplierPrices'), orderBy('date', 'desc')), snap => {
      setSupplierPrices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubPr = onSnapshot(query(collection(db, 'products')), snap => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubDebts = onSnapshot(query(collection(db, 'debts'), orderBy('createdAt', 'desc')), snap => {
      setDebts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubTx(); unsubSp(); unsubPr(); unsubDebts(); };
  }, []);

  // 📋 ຮອງຮັບ Paste ຮູບ (Ctrl+V) ທັງໃນ Transaction ແລະ Debt Form
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            const base64 = await compressImage(file);
            if (subView === 'transactions') setReceiptImage(base64);
            else setDebtReceiptImage(base64);
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [subView]);

  // Metrics
  const metrics = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    let cogsTotal = 0;
    let opexTotal = 0;
    let capexTotal = 0;
    let dividendTotal = 0;

    transactions.forEach(t => {
      const amt = Number(t.amount) || 0;
      if (t.type === 'income') {
        totalIncome += amt;
      } else {
        totalExpense += amt;
        const b = (t.expenseBucket || 'cogs') as ExpenseBucket;
        if (b === 'cogs') cogsTotal += amt;
        else if (b === 'opex') opexTotal += amt;
        else if (b === 'capex') capexTotal += amt;
        else if (b === 'dividend') dividendTotal += amt;
      }
    });

    return { totalIncome, totalExpense, cogsTotal, opexTotal, capexTotal, dividendTotal };
  }, [transactions]);

  const debtMetrics = useMemo(() => {
    const totalPayable = debts.filter(d => d.type === 'payable' && d.status !== 'settled').reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    const totalReceivable = debts.filter(d => d.type === 'receivable' && d.status !== 'settled').reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    return { totalPayable, totalReceivable };
  }, [debts]);

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawAmt = Number(amount.replace(/,/g, ''));
    if (!rawAmt) return;

    try {
      setIsSubmitting(true);
      await addDoc(collection(db, 'transactions'), {
        type,
        amount: rawAmt,
        category,
        expenseBucket: type === 'expense' ? expenseBucket : null,
        source,
        description: description.trim(),
        receiptImage,
        date,
        time,
        createdAt: serverTimestamp()
      });
      setAmount('');
      setDescription('');
      setReceiptImage('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawAmt = Number(debtAmount.replace(/,/g, ''));
    if (!rawAmt || !debtPerson.trim()) return;

    await addDoc(collection(db, 'debts'), {
      type: debtType,
      person: debtPerson.trim(),
      amount: rawAmt,
      dueDate: debtDueDate,
      receiptImage: debtReceiptImage,
      remark: debtRemark.trim(),
      status: 'pending',
      createdAt: serverTimestamp()
    });
    setDebtPerson('');
    setDebtAmount('');
    setDebtReceiptImage('');
    setDebtRemark('');
  };

  // 📥 ດຶງຫຼາຍລາຍການຈາກໃບບິນ Supplier ທີ່ເລືອກຕິກ ມາລົງລາຍຈ່າຍ COGS ພ້ອມກັນ
  const handleConfirmImportSupplierItems = async () => {
    const selectedIds = Object.keys(selectedSupplierItems).filter(id => selectedSupplierItems[id]);
    if (selectedIds.length === 0) return;

    const itemsToImport = supplierPrices.filter(sp => selectedIds.includes(sp.id));
    const promises = itemsToImport.map(sp => {
      const prod = products.find(p => p.id === sp.productId);
      const totalLAK = sp.totalPriceLAK || (sp.currency === 'LAK' ? sp.priceOriginal : sp.priceOriginal * sp.exchangeRate);

      return addDoc(collection(db, 'transactions'), {
        type: 'expense',
        amount: totalLAK,
        category: 'ຊື້ເຄື່ອງເຂົ້າຮ້ານ (ຕົ້ນທຶນວັດຖຸດິບ COGS)',
        expenseBucket: 'cogs',
        source: 'onepay',
        description: `ຊື້ ${prod?.name || 'ວັດຖຸດິບ'} ຈາກ ${sp.supplier} (${sp.quantity}ແພັກ)`,
        receiptImage: sp.receiptImage || '',
        date: sp.date || format(new Date(), 'yyyy-MM-dd'),
        time: sp.time || '12:00',
        createdAt: serverTimestamp()
      });
    });

    await Promise.all(promises);
    setSelectedSupplierItems({});
    setIsSupplierModalOpen(false);
  };

  // Group supplier prices by Date
  const groupedSupplierPricesByDate = useMemo(() => {
    const groups: { [dateStr: string]: any[] } = {};
    supplierPrices.forEach(sp => {
      const d = sp.date || 'No Date';
      if (!groups[d]) groups[d] = [];
      groups[d].push(sp);
    });
    return groups;
  }, [supplierPrices]);

  return (
    <div className="space-y-6 font-sans pb-16">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white dark:bg-[#141414] p-6 rounded-3xl border border-slate-200/80 dark:border-neutral-800 shadow-sm">
        <div>
          <span className="bg-[#052659] dark:bg-white dark:text-neutral-950 text-white text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest">
            Le Ouve Ledger & AP/AR
          </span>
          <h1 className="text-2xl md:text-3xl font-serif text-slate-800 dark:text-white mt-1">
            Financial Transactions & Debt Accounts
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            ບັນທຶກລາຍຮັບ-ລາຍຈ່າຍພ້ອມໃບບິນ, ດຶງໃບບິນຈາກ Supplier ຕາມວັນທີ, ແລະ ຄຸ້ມຄອງໜີ້ສິນ
          </p>
        </div>

        <button
          onClick={() => setIsSupplierModalOpen(true)}
          className="crystal-button !py-2.5 !px-4 flex items-center gap-2 cursor-pointer"
        >
          <Receipt className="w-4 h-4" />
          <span>ດຶງຈາກໃບບິນ Supplier</span>
        </button>
      </div>

      {/* Sub Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setSubView('transactions')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${subView === 'transactions' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'bg-white dark:bg-[#141414] border border-slate-200 dark:border-neutral-800 text-slate-400'}`}
        >
          ບັນຊີລາຍຮັບ-ລາຍຈ່າຍ
        </button>
        <button
          onClick={() => setSubView('debts')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${subView === 'debts' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'bg-white dark:bg-[#141414] border border-slate-200 dark:border-neutral-800 text-slate-400'}`}
        >
          <HandCoins className="w-3.5 h-3.5" />
          <span>ໜີ້ຕ້ອງສົ່ງ & ໜີ້ຕ້ອງຮັບ (AP / AR)</span>
        </button>
      </div>

      {subView === 'transactions' ? (
        <>
          {/* ✨ CARDS ປົດຂອບສີອອກໝົດ: Minimalist Clean Border */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            <div className="high-density-card p-5">
              <span className="label-xs flex justify-between"><span>ລາຍຮັບລວມ</span><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span></span>
              <h2 className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-2">+{metrics.totalIncome.toLocaleString()} ₭</h2>
            </div>
            <div className="high-density-card p-5">
              <span className="label-xs flex justify-between"><span>COGS ຕົ້ນທຶນວັດຖຸດິບ</span><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span></span>
              <h2 className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-2">-{metrics.cogsTotal.toLocaleString()} ₭</h2>
            </div>
            <div className="high-density-card p-5">
              <span className="label-xs flex justify-between"><span>OPEX ດຳເນີນງານ</span><span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span></span>
              <h2 className="text-xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-2">-{metrics.opexTotal.toLocaleString()} ₭</h2>
            </div>
            <div className="high-density-card p-5">
              <span className="label-xs flex justify-between"><span>CAPEX & ອຸປະກອນ</span><span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span></span>
              <h2 className="text-xl font-bold font-mono text-purple-600 dark:text-purple-400 mt-2">-{metrics.capexTotal.toLocaleString()} ₭</h2>
            </div>
            <div className="high-density-card p-5">
              <span className="label-xs flex justify-between"><span>ປັນຜົນ (Dividend)</span><span className="w-1.5 h-1.5 rounded-full bg-pink-500"></span></span>
              <h2 className="text-xl font-bold font-mono text-pink-600 dark:text-pink-400 mt-2">-{metrics.dividendTotal.toLocaleString()} ₭</h2>
            </div>
          </div>

          {/* Form & Table */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4">
              <div className="high-density-card p-6 space-y-4 sticky top-20">
                <h3 className="text-sm font-serif text-slate-800 dark:text-white border-b border-slate-100 dark:border-neutral-800 pb-3">ບັນທຶກລາຍການໃໝ່</h3>
                
                <form onSubmit={handleAddTransaction} className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-neutral-900 p-1 rounded-2xl">
                    <button type="button" onClick={() => setType('income')} className={`py-2 text-xs font-bold rounded-xl ${type === 'income' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'text-slate-400'}`}>+ ລາຍຮັບ</button>
                    <button type="button" onClick={() => setType('expense')} className={`py-2 text-xs font-bold rounded-xl ${type === 'expense' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'text-slate-400'}`}>- ລາຍຈ່າຍ</button>
                  </div>

                  <div>
                    <label className="label-xs block mb-1">ຈຳນວນເງິນ (LAK)</label>
                    <input type="text" required placeholder="0" value={amount} onChange={e => setAmount(Number(e.target.value.replace(/,/g, '') || 0).toLocaleString())} className="crystal-input w-full font-mono text-lg font-bold" />
                  </div>

                  {type === 'expense' && (
                    <div>
                      <label className="label-xs block mb-1">ກຸ່ມຕົ້ນທຶນ</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {[
                          { id: 'cogs', name: 'COGS ວັດຖຸດິບ' },
                          { id: 'opex', name: 'OPEX ດຳເນີນງານ' },
                          { id: 'capex', name: 'CAPEX ອຸປະກອນ' },
                          { id: 'dividend', name: 'ປັນຜົນ' }
                        ].map(b => (
                          <button key={b.id} type="button" onClick={() => setExpenseBucket(b.id as any)} className={`p-2 rounded-xl text-xs font-bold border text-left ${expenseBucket === b.id ? 'border-[#052659] dark:border-white bg-[#052659]/5 dark:bg-white/5 font-black' : 'border-slate-200 dark:border-neutral-800 text-slate-400'}`}>
                            {b.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="label-xs block mb-1">ຊ່ອງທາງຊຳລະ</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {['cash', 'onepay', 'ldb'].map(s => (
                        <button key={s} type="button" onClick={() => setSource(s as any)} className={`py-2 text-xs font-bold rounded-xl border uppercase ${source === s ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950 border-transparent' : 'border-slate-200 dark:border-neutral-800 text-slate-500'}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 📸 Image Upload / Paste for Transactions */}
                  <div>
                    <label className="label-xs flex justify-between mb-1">
                      <span>ຮູບໃບບິນ (Ctrl+V ວາງໄດ້)</span>
                    </label>
                    <div className="border border-dashed border-slate-300 dark:border-neutral-700 rounded-xl p-2 relative flex items-center justify-between">
                      <input type="file" accept="image/*" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) setReceiptImage(await compressImage(file));
                      }} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                      {receiptImage ? (
                        <div className="flex items-center gap-2 w-full justify-between">
                          <img src={receiptImage} alt="Receipt" className="w-8 h-8 rounded-lg object-cover" />
                          <span className="text-[10px] text-emerald-500 font-bold">ອັບໂຫຼດຮູບແລ້ວ ✓</span>
                          <button type="button" onClick={(e) => { e.stopPropagation(); setReceiptImage(''); }} className="text-rose-500 p-1">✕</button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 mx-auto flex items-center gap-1.5"><Upload className="w-3.5 h-3.5" /> ຄລິກ ຫຼື ວາງຮູບ (Ctrl+V)</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="label-xs block mb-1">ລາຍລະອຽດ</label>
                    <input type="text" placeholder="ລາຍລະອຽດ..." value={description} onChange={e => setDescription(e.target.value)} className="crystal-input w-full !text-xs" />
                  </div>

                  <button type="submit" disabled={isSubmitting} className="crystal-button w-full h-11">
                    {isSubmitting ? 'Saving...' : 'ບັນທຶກລາຍການ'}
                  </button>
                </form>
              </div>
            </div>

            {/* Table */}
            <div className="lg:col-span-8">
              <div className="high-density-card p-5 overflow-hidden">
                <h3 className="text-sm font-serif text-slate-800 dark:text-white mb-4">ປະຫວັດທຸລະກຳ</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-neutral-900/60 text-[10px] font-black uppercase text-slate-400">
                      <tr>
                        <th className="p-3">ວັນທີ</th>
                        <th className="p-3">ລາຍລະອຽດ</th>
                        <th className="p-3">ຊ່ອງທາງ</th>
                        <th className="p-3 text-right">ຈຳນວນເງິນ</th>
                        <th className="p-3 text-center">ໃບບິນ</th>
                        <th className="p-3 text-center">ຈັດການ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                      {transactions.map(t => (
                        <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-neutral-800/30">
                          <td className="p-3 font-mono text-slate-400">{t.date}</td>
                          <td className="p-3">
                            <span className="font-bold text-slate-800 dark:text-white block">{t.description || t.category}</span>
                            <span className="text-[9px] uppercase text-slate-400 font-mono">{t.expenseBucket || 'Income'}</span>
                          </td>
                          <td className="p-3 uppercase font-mono text-[10px]">{t.source}</td>
                          <td className={`p-3 text-right font-mono font-bold ${t.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {t.type === 'income' ? '+' : '-'}{Number(t.amount).toLocaleString()} ₭
                          </td>
                          <td className="p-3 text-center">
                            {t.receiptImage ? (
                              <button onClick={() => setPreviewImage(t.receiptImage)} className="p-1 rounded bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 cursor-pointer">
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            ) : <span className="text-slate-500">-</span>}
                          </td>
                          <td className="p-3 text-center">
                            <button onClick={() => setDeleteModal({ isOpen: true, id: t.id, type: 'tx' })} className="text-slate-400 hover:text-rose-500 cursor-pointer">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* 📑 ໜີ້ສິນ (AP/AR) + ອັບໂຫຼດຮູບໃບບິນ */
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="high-density-card p-6">
              <span className="label-xs text-rose-500">ໜີ້ຕ້ອງສົ່ງທັງໝົດ (AP - ຕິດໜີ້ເພິ່ນ)</span>
              <h2 className="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400 mt-2">{debtMetrics.totalPayable.toLocaleString()} ₭</h2>
            </div>
            <div className="high-density-card p-6">
              <span className="label-xs text-emerald-500">ໜີ້ຕ້ອງຮັບທັງໝົດ (AR - ລູກຄ້າຕິດໜີ້)</span>
              <h2 className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-2">{debtMetrics.totalReceivable.toLocaleString()} ₭</h2>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4">
              <div className="high-density-card p-6 space-y-4">
                <h3 className="text-sm font-serif text-slate-800 dark:text-white">ບັນທຶກໜີ້ສິນ (AP/AR)</h3>
                <form onSubmit={handleAddDebt} className="space-y-3">
                  <div className="grid grid-cols-2 gap-1.5 bg-slate-100 dark:bg-neutral-900 p-1 rounded-2xl">
                    <button type="button" onClick={() => setDebtType('payable')} className={`py-2 text-xs font-bold rounded-xl ${debtType === 'payable' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'text-slate-400'}`}>ໜີ້ຕ້ອງສົ່ງ (AP)</button>
                    <button type="button" onClick={() => setDebtType('receivable')} className={`py-2 text-xs font-bold rounded-xl ${debtType === 'receivable' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'text-slate-400'}`}>ໜີ້ຕ້ອງຮັບ (AR)</button>
                  </div>

                  <div>
                    <label className="label-xs block mb-1">ຊື່ຄູ່ຄ້າ / ບຸກຄົນ</label>
                    <input type="text" required placeholder="ເຊັ່ນ: ຮ້ານ LATDA..." value={debtPerson} onChange={e => setDebtPerson(e.target.value)} className="crystal-input w-full !text-xs font-bold" />
                  </div>

                  <div>
                    <label className="label-xs block mb-1">ຈຳນວນເງິນ (LAK)</label>
                    <input type="text" required placeholder="0" value={debtAmount} onChange={e => setDebtAmount(Number(e.target.value.replace(/,/g, '') || 0).toLocaleString())} className="crystal-input w-full font-mono text-base font-bold" />
                  </div>

                  <div>
                    <label className="label-xs block mb-1">ກຳນົດຊຳລະ</label>
                    <input type="date" required value={debtDueDate} onChange={e => setDebtDueDate(e.target.value)} className="crystal-input w-full !text-xs font-mono" />
                  </div>

                  {/* 📸 Debt Receipt Upload */}
                  <div>
                    <label className="label-xs flex justify-between mb-1"><span>ຮູບຫຼັກຖານໜີ້ສິນ (Ctrl+V)</span></label>
                    <div className="border border-dashed border-slate-300 dark:border-neutral-700 rounded-xl p-2 relative flex items-center justify-between">
                      <input type="file" accept="image/*" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) setDebtReceiptImage(await compressImage(file));
                      }} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                      {debtReceiptImage ? (
                        <div className="flex items-center gap-2 w-full justify-between">
                          <img src={debtReceiptImage} alt="Receipt" className="w-8 h-8 rounded-lg object-cover" />
                          <span className="text-[10px] text-emerald-500 font-bold">ອັບໂຫຼດຮູບແລ້ວ ✓</span>
                          <button type="button" onClick={(e) => { e.stopPropagation(); setDebtReceiptImage(''); }} className="text-rose-500 p-1">✕</button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 mx-auto flex items-center gap-1.5"><Upload className="w-3.5 h-3.5" /> ວາງຮູບຫຼັກຖານ</span>
                      )}
                    </div>
                  </div>

                  <button type="submit" className="crystal-button w-full h-11">ບັນທຶກໜີ້ສິນ</button>
                </form>
              </div>
            </div>

            <div className="lg:col-span-8">
              <div className="high-density-card p-5 overflow-hidden">
                <h3 className="text-sm font-serif text-slate-800 dark:text-white mb-4">ລາຍການໜີ້ສິນທັງໝົດ</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-neutral-900/60 text-[10px] font-black uppercase text-slate-400">
                      <tr>
                        <th className="p-3">ປະເພດ</th>
                        <th className="p-3">ຊື່ຄູ່ຄ້າ</th>
                        <th className="p-3">ກຳນົດຊຳລະ</th>
                        <th className="p-3 text-right">ຈຳນວນເງິນ</th>
                        <th className="p-3 text-center">ໃບບິນ</th>
                        <th className="p-3 text-center">ສະຖານະ</th>
                        <th className="p-3 text-center">ລຶບ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                      {debts.map(d => (
                        <tr key={d.id} className="hover:bg-slate-50/50 dark:hover:bg-neutral-800/30">
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${d.type === 'payable' ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                              {d.type === 'payable' ? 'ໜີ້ຕ້ອງສົ່ງ' : 'ໜີ້ຕ້ອງຮັບ'}
                            </span>
                          </td>
                          <td className="p-3 font-bold text-slate-800 dark:text-white">{d.person}</td>
                          <td className="p-3 font-mono text-slate-400">{d.dueDate}</td>
                          <td className="p-3 text-right font-mono font-bold">{Number(d.amount).toLocaleString()} ₭</td>
                          <td className="p-3 text-center">
                            {d.receiptImage ? (
                              <button onClick={() => setPreviewImage(d.receiptImage)} className="p-1 rounded bg-emerald-500/10 text-emerald-500">
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            ) : '-'}
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => updateDoc(doc(db, 'debts', d.id), { status: d.status === 'settled' ? 'pending' : 'settled' })}
                              className={`px-2.5 py-1 rounded-xl text-[9px] font-bold cursor-pointer ${d.status === 'settled' ? 'bg-emerald-500 text-white' : 'bg-amber-500/10 text-amber-500'}`}
                            >
                              {d.status === 'settled' ? 'ຊຳລະແລ້ວ ✓' : 'ຄ້າງຊຳລະ'}
                            </button>
                          </td>
                          <td className="p-3 text-center">
                            <button onClick={() => setDeleteModal({ isOpen: true, id: d.id, type: 'debt' })} className="text-slate-400 hover:text-rose-500 cursor-pointer">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 📥 MODAL ດຶງໃບບິນຈາກ SUPPLIER: ແຍກຕາມວັນທີ & ເລືອກຕິກລາຍການໄດ້! */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setIsSupplierModalOpen(false)}>
          <div className="bg-white dark:bg-[#141414] rounded-3xl p-6 border border-slate-200 dark:border-neutral-800 max-w-2xl w-full space-y-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-neutral-800 pb-3">
              <div>
                <h3 className="text-sm font-serif text-slate-800 dark:text-white">ດຶງລາຍການຈາກໃບບິນ Supplier ມາລົງລາຍຈ່າຍ (COGS)</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">ເລືອກຕິກເອົາສະເພາະລາຍການທີ່ຕ້ອງການດຶງເຂົ້າບັນຊີ</p>
              </div>
              <button onClick={() => setIsSupplierModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="space-y-4">
              {Object.keys(groupedSupplierPricesByDate).length === 0 ? (
                <p className="text-center py-8 text-xs text-slate-400">ຍັງບໍ່ມີລາຍການຊື້ຈາກ Supplier</p>
              ) : (
                Object.keys(groupedSupplierPricesByDate).map(dateKey => (
                  <div key={dateKey} className="space-y-2 border border-slate-200/80 dark:border-neutral-800 rounded-2xl p-4">
                    <div className="flex justify-between items-center border-b border-slate-100 dark:border-neutral-800/80 pb-2">
                      <span className="text-xs font-bold font-mono text-slate-700 dark:text-slate-200">📅 ວັນທີ: {dateKey}</span>
                      <span className="text-[10px] text-slate-400">{groupedSupplierPricesByDate[dateKey].length} ລາຍການ</span>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      {groupedSupplierPricesByDate[dateKey].map(sp => {
                        const pr = products.find(p => p.id === sp.productId);
                        const total = sp.totalPriceLAK || (sp.currency === 'LAK' ? sp.priceOriginal : sp.priceOriginal * sp.exchangeRate);
                        const isChecked = !!selectedSupplierItems[sp.id];

                        return (
                          <div 
                            key={sp.id} 
                            onClick={() => setSelectedSupplierItems(prev => ({ ...prev, [sp.id]: !prev[sp.id] }))}
                            className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${isChecked ? 'bg-emerald-500/10 border-emerald-500' : 'bg-slate-50 dark:bg-[#1a1a1a] border-slate-200/50 dark:border-neutral-800'}`}
                          >
                            <div className="flex items-center gap-3">
                              <input 
                                type="checkbox" 
                                checked={isChecked} 
                                onChange={() => {}} 
                                className="w-4 h-4 rounded text-emerald-500" 
                              />
                              <div>
                                <span className="text-xs font-bold text-slate-800 dark:text-white block">{pr?.name || 'Item'} ({sp.supplier})</span>
                                <span className="text-[10px] text-slate-400">{sp.quantity}ແພັກ × {sp.quantityPerUnit}{sp.unit}</span>
                              </div>
                            </div>
                            <span className="text-xs font-mono font-bold text-emerald-500">+{Math.round(total).toLocaleString()} ₭</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-neutral-800">
              <span className="text-xs text-slate-400">ເລືອກແລ້ວ: {Object.values(selectedSupplierItems).filter(Boolean).length} ລາຍການ</span>
              <button onClick={handleConfirmImportSupplierItems} className="crystal-button !py-2.5 !px-6">ດຶງເຂົ້າບັນຊີ COGS ທັນທີ</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal ເບິ່ງຮູບເຕັມ */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-xl max-h-[85vh] bg-[#141414] rounded-3xl p-3 border border-neutral-800" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewImage(null)} className="absolute top-4 right-4 p-2 rounded-full bg-black/60 text-white cursor-pointer">✕</button>
            <img src={previewImage} alt="Receipt" className="w-full h-auto max-h-[80vh] object-contain rounded-2xl" />
          </div>
        </div>
      )}

      {/* 💬 In-App Delete Confirm Dialog */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#141414] rounded-3xl p-6 border border-slate-200 dark:border-neutral-800 max-w-sm w-full space-y-4">
            <h3 className="text-sm font-serif text-slate-800 dark:text-white">ຢືນຢັນການລຶບ</h3>
            <p className="text-xs text-slate-400">ທ່ານແນ່ໃຈບໍ່ວ່າຕ້ອງການລຶບລາຍການນີ້ອອກຈາກລະບົບ?</p>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setDeleteModal({ isOpen: false, id: '', type: 'tx' })} className="flex-1 py-2.5 rounded-xl border text-xs font-bold text-slate-400">ຍົກເລີກ</button>
              <button 
                onClick={async () => {
                  if (deleteModal.type === 'tx') await deleteDoc(doc(db, 'transactions', deleteModal.id));
                  else await deleteDoc(doc(db, 'debts', deleteModal.id));
                  setDeleteModal({ isOpen: false, id: '', type: 'tx' });
                }} 
                className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-bold"
              >
                ລຶບທັນທີ
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
