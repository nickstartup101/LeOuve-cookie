import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, addDoc, query, orderBy, onSnapshot, 
  deleteDoc, doc, serverTimestamp, setDoc, getDocs, where 
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { useTranslation } from 'react-i18next';
import { 
  DollarSign, TrendingUp, TrendingDown, Wallet, CreditCard, 
  Plus, Trash2, ArrowUpRight, ArrowDownRight,
  Lock, Download, QrCode, Building2, Activity,
  CheckCircle2, Sparkles, HandCoins, Users, Receipt
} from 'lucide-react';
import { format } from 'date-fns';
import { utils, writeFile } from 'xlsx';

export type ExpenseBucket = 'cogs' | 'opex' | 'capex' | 'dividend';

export default function Finance({ userSettings }: { userSettings?: any }) {
  const { i18n } = useTranslation();
  const [subView, setSubView] = useState<'transactions' | 'debts'>('transactions');

  // Transactions & Supplier Data
  const [transactions, setTransactions] = useState<any[]>([]);
  const [supplierPrices, setSupplierPrices] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [debts, setDebts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [type, setType] = useState<'income' | 'expense'>('income');
  const [amount, setAmount] = useState<string>('');
  const [category, setCategory] = useState('ຂາຍເຄື່ອງດື່ມ & ກາເຟ (Coffee & Drinks)');
  const [expenseBucket, setExpenseBucket] = useState<ExpenseBucket>('cogs');
  const [source, setSource] = useState<'cash' | 'onepay' | 'ldb'>('onepay');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState(format(new Date(), 'HH:mm'));
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Debt Form State (AP / AR)
  const [debtType, setDebtType] = useState<'payable' | 'receivable'>('payable'); // payable = ໜີ້ຕ້ອງສົ່ງ, receivable = ໜີ້ຕ້ອງຮັບ
  const [debtPerson, setDebtPerson] = useState('');
  const [debtAmount, setDebtAmount] = useState('');
  const [debtDueDate, setDebtDueDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [debtRemark, setDebtRemark] = useState('');

  // Modal ດຶງໃບບິນຈາກ Supplier
  const [isSupplierImportOpen, setIsSupplierImportOpen] = useState(false);

  // Filter & PIN
  const [filterBucket, setFilterBucket] = useState<'all' | 'income' | ExpenseBucket>('all');
  const [isUnlocked, setIsUnlocked] = useState(!userSettings?.financialPin);
  const [enteredPin, setEnteredPin] = useState('');

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
      setLoading(false);
    });

    return () => { unsubTx(); unsubSp(); unsubPr(); unsubDebts(); };
  }, []);

  // Metrics
  const metrics = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    let cogsTotal = 0;
    let opexTotal = 0;
    let capexTotal = 0;
    let dividendTotal = 0;
    let cashBalance = 0;
    let onepayBalance = 0;
    let ldbBalance = 0;

    transactions.forEach(t => {
      const amt = Number(t.amount) || 0;
      if (t.type === 'income') {
        totalIncome += amt;
        if (t.source === 'cash') cashBalance += amt;
        else if (t.source === 'ldb') ldbBalance += amt;
        else onepayBalance += amt;
      } else {
        totalExpense += amt;
        if (t.source === 'cash') cashBalance -= amt;
        else if (t.source === 'ldb') ldbBalance -= amt;
        else onepayBalance -= amt;

        const b = (t.expenseBucket || 'cogs') as ExpenseBucket;
        if (b === 'cogs') cogsTotal += amt;
        else if (b === 'opex') opexTotal += amt;
        else if (b === 'capex') capexTotal += amt;
        else if (b === 'dividend') dividendTotal += amt;
      }
    });

    return {
      totalIncome,
      totalExpense,
      cogsTotal,
      opexTotal,
      capexTotal,
      dividendTotal,
      cashBalance,
      onepayBalance,
      ldbBalance,
      netProfit: totalIncome - totalExpense
    };
  }, [transactions]);

  // Debt Metrics
  const debtMetrics = useMemo(() => {
    const totalPayable = debts.filter(d => d.type === 'payable' && d.status !== 'settled').reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    const totalReceivable = debts.filter(d => d.type === 'receivable' && d.status !== 'settled').reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    return { totalPayable, totalReceivable };
  }, [debts]);

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawAmt = Number(amount.replace(/,/g, ''));
    if (!rawAmt || rawAmt <= 0) return;

    try {
      setIsSubmitting(true);
      await addDoc(collection(db, 'transactions'), {
        type,
        amount: rawAmt,
        category,
        expenseBucket: type === 'expense' ? expenseBucket : null,
        source,
        description: description.trim(),
        date,
        time,
        createdAt: serverTimestamp(),
      });
      setAmount('');
      setDescription('');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 📥 ດຶງລາຍການຈາກໃບບິນ Supplier ມາລົງລາຍຈ່າຍອັດຕະໂນມັດ
  const handleImportSupplierQuote = (sp: any) => {
    const prod = products.find(p => p.id === sp.productId);
    const totalLAK = sp.totalPriceLAK !== undefined ? sp.totalPriceLAK : (sp.currency === 'LAK' ? sp.priceOriginal : sp.priceOriginal * (sp.exchangeRate || 1));
    
    setType('expense');
    setExpenseBucket('cogs');
    setCategory('ຊື້ເຄື່ອງເຂົ້າຮ້ານ (ຕົ້ນທຶນວັດຖຸດິບ COGS)');
    setAmount(Number(totalLAK).toLocaleString());
    setDescription(`ຊື້ ${prod?.name || 'ວັດຖຸດິບ'} ຈາກ ${sp.supplier} (${sp.quantity}ແພັກ)`);
    setDate(sp.date || format(new Date(), 'yyyy-MM-dd'));
    setIsSupplierImportOpen(false);
  };

  // ເພີ່ມລາຍການໜີ້ສິນ AP/AR
  const handleAddDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawAmt = Number(debtAmount.replace(/,/g, ''));
    if (!rawAmt || !debtPerson.trim()) return;

    await addDoc(collection(db, 'debts'), {
      type: debtType,
      person: debtPerson.trim(),
      amount: rawAmt,
      dueDate: debtDueDate,
      remark: debtRemark.trim(),
      status: 'pending',
      createdAt: serverTimestamp()
    });
    setDebtPerson('');
    setDebtAmount('');
    setDebtRemark('');
    alert("ບັນທຶກໜີ້ສິນສຳເລັດ!");
  };

  return (
    <div className="space-y-6 font-sans pb-16">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white dark:bg-[#141414] p-6 rounded-3xl border border-slate-200/80 dark:border-neutral-800 shadow-sm">
        <div>
          <span className="bg-[#052659] dark:bg-white dark:text-neutral-950 text-white text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest">
            Le Ouve Finance & Ledger
          </span>
          <h1 className="text-2xl md:text-3xl font-serif text-slate-800 dark:text-white mt-1">
            Financial Management & Debt Tracker
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            ບັນທຶກລາຍຮັບ-ລາຍຈ່າຍ, ດຶງຈາກ Supplier ແລະ ຄຸ້ມຄອງໜີ້ຕ້ອງສົ່ງ-ໜີ້ຕ້ອງຮັບ
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setIsSupplierImportOpen(true)}
            className="crystal-button !py-2.5 !px-4 flex items-center gap-1.5"
          >
            <Receipt className="w-4 h-4" />
            <span>ດຶງຈາກໃບບິນ Supplier</span>
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs: Transactions vs Debts (AP/AR) */}
      <div className="flex gap-2">
        <button
          onClick={() => setSubView('transactions')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${subView === 'transactions' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'bg-white dark:bg-[#141414] border border-slate-200 dark:border-neutral-800 text-slate-400'}`}
        >
          ບັນຊີລາຍຮັບ-ລາຍຈ່າຍ (Transactions)
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
          {/* ✨ ປັບຂອບ CARD ໃໝ່: Minimalist Luxury Border (ບໍ່ມີແຖບສີໃຫຍ່ຕິດຂອບແລ້ວ) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            <div className="high-density-card p-5">
              <span className="label-xs flex items-center justify-between text-slate-400">
                <span>ລາຍຮັບລວມ</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              </span>
              <h2 className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-2">
                +{metrics.totalIncome.toLocaleString()} ₭
              </h2>
            </div>

            <div className="high-density-card p-5">
              <span className="label-xs flex items-center justify-between text-slate-400">
                <span>COGS ຕົ້ນທຶນວັດຖຸດິບ</span>
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              </span>
              <h2 className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-2">
                -{metrics.cogsTotal.toLocaleString()} ₭
              </h2>
            </div>

            <div className="high-density-card p-5">
              <span className="label-xs flex items-center justify-between text-slate-400">
                <span>OPEX ດຳເນີນງານ</span>
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              </span>
              <h2 className="text-xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-2">
                -{metrics.opexTotal.toLocaleString()} ₭
              </h2>
            </div>

            <div className="high-density-card p-5">
              <span className="label-xs flex items-center justify-between text-slate-400">
                <span>CAPEX & ອຸປະກອນ</span>
                <span className="w-2 h-2 rounded-full bg-purple-500"></span>
              </span>
              <h2 className="text-xl font-bold font-mono text-purple-600 dark:text-purple-400 mt-2">
                -{metrics.capexTotal.toLocaleString()} ₭
              </h2>
            </div>

            <div className="high-density-card p-5">
              <span className="label-xs flex items-center justify-between text-slate-400">
                <span>ປັນຜົນ (Dividend)</span>
                <span className="w-2 h-2 rounded-full bg-pink-500"></span>
              </span>
              <h2 className="text-xl font-bold font-mono text-pink-600 dark:text-pink-400 mt-2">
                -{metrics.dividendTotal.toLocaleString()} ₭
              </h2>
            </div>
          </div>

          {/* Form & Table */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4">
              <div className="high-density-card p-6 space-y-4 sticky top-20">
                <h3 className="text-sm font-serif text-slate-800 dark:text-white border-b border-slate-100 dark:border-neutral-800 pb-3">
                  ບັນທຶກລາຍການໃໝ່
                </h3>

                <form onSubmit={handleAddTransaction} className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-neutral-900 p-1 rounded-2xl">
                    <button
                      type="button"
                      onClick={() => setType('income')}
                      className={`py-2 text-xs font-bold rounded-xl cursor-pointer ${type === 'income' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'text-slate-500'}`}
                    >
                      + ລາຍຮັບ
                    </button>
                    <button
                      type="button"
                      onClick={() => setType('expense')}
                      className={`py-2 text-xs font-bold rounded-xl cursor-pointer ${type === 'expense' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'text-slate-500'}`}
                    >
                      - ລາຍຈ່າຍ
                    </button>
                  </div>

                  <div>
                    <label className="label-xs block mb-1">ຈຳນວນເງິນ (LAK)</label>
                    <input
                      type="text"
                      required
                      placeholder="0"
                      value={amount}
                      onChange={e => setAmount(Number(e.target.value.replace(/,/g, '') || 0).toLocaleString())}
                      className="crystal-input w-full font-mono text-lg font-bold"
                    />
                  </div>

                  {type === 'expense' && (
                    <div>
                      <label className="label-xs block mb-1">ກຸ່ມຕົ້ນທຶນ</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {[
                          { id: 'cogs', name: 'COGS (ວັດຖຸດິບ)' },
                          { id: 'opex', name: 'OPEX (ດຳເນີນງານ)' },
                          { id: 'capex', name: 'CAPEX (ອຸປະກອນ)' },
                          { id: 'dividend', name: 'ປັນຜົນ' }
                        ].map(b => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => setExpenseBucket(b.id as any)}
                            className={`p-2 rounded-xl text-xs font-bold border text-left cursor-pointer ${expenseBucket === b.id ? 'border-[#052659] dark:border-white bg-[#052659]/5 dark:bg-white/5 font-black' : 'border-slate-200 dark:border-neutral-800 text-slate-400'}`}
                          >
                            {b.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="label-xs block mb-1">ຊ່ອງທາງການຊຳລະ</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {['cash', 'onepay', 'ldb'].map(s => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setSource(s as any)}
                          className={`py-2 text-xs font-bold rounded-xl border uppercase cursor-pointer ${source === s ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950 border-transparent' : 'border-slate-200 dark:border-neutral-800 text-slate-500'}`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="label-xs block mb-1">ລາຍລະອຽດ</label>
                    <input
                      type="text"
                      placeholder="ລາຍລະອຽດ..."
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      className="crystal-input w-full !text-xs"
                    />
                  </div>

                  <button type="submit" disabled={isSubmitting} className="crystal-button w-full h-11">
                    {isSubmitting ? 'Saving...' : 'ບັນທຶກທຸລະກຳ'}
                  </button>
                </form>
              </div>
            </div>

            {/* Table */}
            <div className="lg:col-span-8">
              <div className="high-density-card p-5 overflow-hidden">
                <h3 className="text-sm font-serif text-slate-800 dark:text-white mb-4">ປະຫວັດທຸລະກຳການເງິນ</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-neutral-900/60 text-[10px] font-black uppercase text-slate-400">
                      <tr>
                        <th className="p-3">ວັນທີ</th>
                        <th className="p-3">ກຸ່ມ / ລາຍລະອຽດ</th>
                        <th className="p-3">ຊ່ອງທາງ</th>
                        <th className="p-3 text-right">ຈຳນວນເງິນ</th>
                        <th className="p-3 text-center">ລຶບ</th>
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
                            <button onClick={() => deleteDoc(doc(db, 'transactions', t.id))} className="text-slate-300 hover:text-rose-500 cursor-pointer">
                              <Trash2 className="w-4 h-4" />
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
        /* 📑 ລະບົບໜີ້ສິນ: ໜີ້ຕ້ອງສົ່ງ (AP) & ໜີ້ຕ້ອງຮັບ (AR) */
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="high-density-card p-6">
              <span className="label-xs text-rose-500">ໜີ້ຕ້ອງສົ່ງທັງໝົດ (Accounts Payable - ຕິດໜີ້ເພິ່ນ)</span>
              <h2 className="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400 mt-2">
                {debtMetrics.totalPayable.toLocaleString()} ₭
              </h2>
            </div>
            <div className="high-density-card p-6">
              <span className="label-xs text-emerald-500">ໜີ້ຕ້ອງຮັບທັງໝົດ (Accounts Receivable - ລູກຄ້າຕິດໜີ້)</span>
              <h2 className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-2">
                {debtMetrics.totalReceivable.toLocaleString()} ₭
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Form ເພີ່ມໜີ້ສິນ */}
            <div className="lg:col-span-4">
              <div className="high-density-card p-6 space-y-4">
                <h3 className="text-sm font-serif text-slate-800 dark:text-white">ບັນທຶກໜີ້ສິນ (AP/AR)</h3>
                <form onSubmit={handleAddDebt} className="space-y-3">
                  <div className="grid grid-cols-2 gap-1.5 bg-slate-100 dark:bg-neutral-900 p-1 rounded-2xl">
                    <button
                      type="button"
                      onClick={() => setDebtType('payable')}
                      className={`py-2 text-xs font-bold rounded-xl cursor-pointer ${debtType === 'payable' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'text-slate-400'}`}
                    >
                      ໜີ້ຕ້ອງສົ່ງ (AP)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDebtType('receivable')}
                      className={`py-2 text-xs font-bold rounded-xl cursor-pointer ${debtType === 'receivable' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'text-slate-400'}`}
                    >
                      ໜີ້ຕ້ອງຮັບ (AR)
                    </button>
                  </div>

                  <div>
                    <label className="label-xs block mb-1">ຊື່ບຸກຄົນ / ຮ້ານຄ້າ</label>
                    <input
                      type="text"
                      required
                      placeholder="ເຊັ່ນ: ຮ້ານ LATDA, ທ້າວ ສົມຊາຍ..."
                      value={debtPerson}
                      onChange={e => setDebtPerson(e.target.value)}
                      className="crystal-input w-full !text-xs"
                    />
                  </div>

                  <div>
                    <label className="label-xs block mb-1">ຈຳນວນເງິນ (LAK)</label>
                    <input
                      type="text"
                      required
                      placeholder="0"
                      value={debtAmount}
                      onChange={e => setDebtAmount(Number(e.target.value.replace(/,/g, '') || 0).toLocaleString())}
                      className="crystal-input w-full font-mono text-base font-bold"
                    />
                  </div>

                  <div>
                    <label className="label-xs block mb-1">ກຳນົດຊຳລະ</label>
                    <input
                      type="date"
                      required
                      value={debtDueDate}
                      onChange={e => setDebtDueDate(e.target.value)}
                      className="crystal-input w-full !text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="label-xs block mb-1">ໝາຍເຫດ</label>
                    <input
                      type="text"
                      placeholder="ໝາຍເຫດ..."
                      value={debtRemark}
                      onChange={e => setDebtRemark(e.target.value)}
                      className="crystal-input w-full !text-xs"
                    />
                  </div>

                  <button type="submit" className="crystal-button w-full h-11">
                    ບັນທຶກໜີ້ສິນ
                  </button>
                </form>
              </div>
            </div>

            {/* Debts Table */}
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
                        <th className="p-3 text-center">ສະຖານະ</th>
                        <th className="p-3 text-center">ຈັດການ</th>
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
                          <td className="p-3 text-right font-mono font-bold">
                            {Number(d.amount).toLocaleString()} ₭
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => updateDoc(doc(db, 'debts', d.id), { status: d.status === 'settled' ? 'pending' : 'settled' })}
                              className={`px-2 py-1 rounded-lg text-[9px] font-bold cursor-pointer ${d.status === 'settled' ? 'bg-emerald-500 text-white' : 'bg-amber-500/10 text-amber-500'}`}
                            >
                              {d.status === 'settled' ? 'ຊຳລະແລ້ວ ✓' : 'ຄ້າງຊຳລະ'}
                            </button>
                          </td>
                          <td className="p-3 text-center">
                            <button onClick={() => deleteDoc(doc(db, 'debts', d.id))} className="text-slate-300 hover:text-rose-500 cursor-pointer">
                              <Trash2 className="w-4 h-4" />
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

      {/* Modal ດຶງໃບບິນຈາກ Supplier */}
      {isSupplierImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsSupplierImportOpen(false)}>
          <div className="bg-white dark:bg-[#141414] rounded-3xl p-6 border border-slate-200 dark:border-neutral-800 max-w-lg w-full space-y-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-neutral-800 pb-3">
              <h3 className="text-sm font-serif text-slate-800 dark:text-white">ເລືອກໃບບິນຈາກ Supplier ເພື່ອລົງບັນຊີ</h3>
              <button onClick={() => setIsSupplierImportOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            
            <div className="space-y-2">
              {supplierPrices.map(sp => {
                const pr = products.find(p => p.id === sp.productId);
                const totalLAK = sp.totalPriceLAK !== undefined ? sp.totalPriceLAK : (sp.currency === 'LAK' ? sp.priceOriginal : sp.priceOriginal * (sp.exchangeRate || 1));
                
                return (
                  <div key={sp.id} className="p-3 rounded-2xl bg-slate-50 dark:bg-[#1c1c1c] border border-slate-200/60 dark:border-neutral-800 flex justify-between items-center">
                    <div>
                      <span className="text-xs font-bold text-slate-800 dark:text-white block">{pr?.name || 'Item'} ({sp.supplier})</span>
                      <span className="text-[10px] text-slate-400 font-mono">{sp.date} • {sp.quantity}ແພັກ</span>
                    </div>
                    <button
                      onClick={() => handleImportSupplierQuote(sp)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs font-mono cursor-pointer"
                    >
                      +{Math.round(totalLAK).toLocaleString()} ₭
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
