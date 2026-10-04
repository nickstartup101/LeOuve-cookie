import { useState, useEffect, useMemo } from 'react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import { 
  DollarSign, Percent, ShoppingBag, PieChart, TrendingUp
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { format, subDays } from 'date-fns';
import { User } from 'firebase/auth';

interface DashboardProps {
  userSettings: any;
  user?: User | null;
}

export default function Dashboard({ userSettings, user }: DashboardProps) {
  const { i18n } = useTranslation();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [supplierPrices, setSupplierPrices] = useState<any[]>([]);

  useEffect(() => {
    const unsubTx = onSnapshot(query(collection(db, 'transactions')), snap => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubPrices = onSnapshot(query(collection(db, 'supplierPrices')), snap => {
      setSupplierPrices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubTx(); unsubPrices(); };
  }, []);

  const financeKPIs = useMemo(() => {
    let totalRevenue = 0;
    let operatingExpenses = 0;

    transactions.forEach(t => {
      const amt = Number(t.amount) || 0;
      if (t.type === 'income') totalRevenue += amt;
      else operatingExpenses += amt;
    });

    let cogsPurchasing = supplierPrices.reduce((sum, sp) => {
      const total = sp.totalPriceLAK !== undefined ? Number(sp.totalPriceLAK) : (sp.currency === 'LAK' ? Number(sp.priceOriginal || 0) : Number(sp.priceOriginal || 0) * Number(sp.exchangeRate || 1));
      return sum + total;
    }, 0);

    if (cogsPurchasing === 0) {
      cogsPurchasing = transactions
        .filter(t => t.type === 'expense' && (t.category?.includes('Raw') || t.category?.includes('ວັດຖຸດິບ') || t.expenseBucket === 'cogs'))
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    }

    const grossProfit = totalRevenue - cogsPurchasing;
    const grossMarginPercent = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const totalCosts = Math.max(operatingExpenses, cogsPurchasing);
    const netProfit = totalRevenue - totalCosts;
    const netMarginPercent = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    const roiPercent = totalCosts > 0 ? (netProfit / totalCosts) * 100 : 0;

    return { totalRevenue, cogsPurchasing, grossProfit, grossMarginPercent, netProfit, netMarginPercent, roiPercent };
  }, [transactions, supplierPrices]);

  const chartData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => subDays(new Date(), 6 - i));
    return last7Days.map(date => {
      const dayStr = format(date, 'yyyy-MM-dd');
      let rev = 0;
      let exp = 0;

      transactions.forEach(t => {
        if (t.date === dayStr) {
          const amt = Number(t.amount) || 0;
          if (t.type === 'income') rev += amt;
          else exp += amt;
        }
      });

      return {
        day: format(date, 'EEE'),
        Revenue: rev,
        Expenses: exp
      };
    });
  }, [transactions]);

  return (
    <div className="space-y-6 font-sans pb-16">
      
      {/* ✨ Header: ຮຽບຫຼູ ບໍ່ມີ LO ມາກວນຕາ */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-[#141414] p-6 rounded-3xl border border-slate-200/80 dark:border-neutral-800 shadow-xs">
        <div>
          <h2 className="text-2xl font-serif text-slate-800 dark:text-white">
            {i18n.language === 'la' ? 'ພາບລວມການເງິນ & ຕົວຊີ້ວັດທຸລະກິດ' : 'Executive Business Overview'}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {i18n.language === 'la' ? 'ວິເຄາະຍອດຂາຍ, ຕົ້ນທຶນ COGS, ກຳໄລສຸດທິ ແລະ ຜົນຕອບແທນ ROI' : 'Live analytics, revenue streams, purchasing cost and net profit margins'}
          </p>
        </div>

        <span className="px-3 py-1 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 rounded-full text-[9px] font-black uppercase tracking-wider border border-neutral-200 dark:border-neutral-700">
          Live Synced
        </span>
      </div>

      {/* ✨ CARDS 5 ອັນແບບ Luxury Minimalist (ຕັດແຖບສີອອກໝົດ) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        
        {/* Total Revenue */}
        <div className="high-density-card p-5 space-y-2">
          <div className="flex justify-between items-center text-slate-400">
            <span className="label-xs">{i18n.language === 'la' ? 'ຍອດຂາຍລວມ' : 'Total Revenue'}</span>
            <DollarSign className="w-3.5 h-3.5 text-neutral-400" />
          </div>
          <h3 className="text-2xl font-serif font-bold text-slate-900 dark:text-white">
            {financeKPIs.totalRevenue.toLocaleString()} <span className="text-xs font-normal opacity-70">₭</span>
          </h3>
          <span className="text-[10px] text-slate-400 block font-light">
            {i18n.language === 'la' ? 'ລາຍຮັບຈາກການຂາຍທັງໝົດ' : 'All sales inflows'}
          </span>
        </div>

        {/* COGS */}
        <div className="high-density-card p-5 space-y-2">
          <div className="flex justify-between items-center text-slate-400">
            <span className="label-xs">{i18n.language === 'la' ? 'ຕົ້ນທຶນວັດຖຸດິບ (COGS)' : 'COGS / Purchasing'}</span>
            <ShoppingBag className="w-3.5 h-3.5 text-neutral-400" />
          </div>
          <h3 className="text-2xl font-serif font-bold text-slate-900 dark:text-white">
            {financeKPIs.cogsPurchasing.toLocaleString()} <span className="text-xs font-normal opacity-70">₭</span>
          </h3>
          <span className="text-[10px] text-slate-400 block font-light">
            {i18n.language === 'la' ? 'ຄ່າຊື້ເຄື່ອງ & ວັດຖຸດິບ' : 'Raw materials procurement'}
          </span>
        </div>

        {/* Gross Margin % */}
        <div className="high-density-card p-5 space-y-2">
          <div className="flex justify-between items-center text-slate-400">
            <span className="label-xs">{i18n.language === 'la' ? 'ອັດຕາກຳໄລຂັ້ນຕົ້ນ' : 'Gross Margin'}</span>
            <Percent className="w-3.5 h-3.5 text-neutral-400" />
          </div>
          <h3 className="text-2xl font-serif font-bold text-slate-900 dark:text-white">
            {financeKPIs.grossMarginPercent.toFixed(1)}%
          </h3>
          <span className="text-[10px] text-slate-400 block font-light">
            {i18n.language === 'la' ? `ກຳໄລຂັ້ນຕົ້ນ: ${financeKPIs.grossProfit.toLocaleString()} ₭` : `Gross: ${financeKPIs.grossProfit.toLocaleString()} ₭`}
          </span>
        </div>

        {/* Net Profit */}
        <div className="high-density-card p-5 space-y-2">
          <div className="flex justify-between items-center text-slate-400">
            <span className="label-xs">{i18n.language === 'la' ? 'ກຳໄລສຸດທິ (Net)' : 'Net Profit'}</span>
            <TrendingUp className="w-3.5 h-3.5 text-neutral-400" />
          </div>
          <h3 className={`text-2xl font-serif font-bold ${financeKPIs.netProfit >= 0 ? 'text-slate-900 dark:text-white' : 'text-rose-500'}`}>
            {financeKPIs.netProfit.toLocaleString()} <span className="text-xs font-normal opacity-70">₭</span>
          </h3>
          <span className="text-[10px] text-slate-400 block font-light">
            Net Margin: {financeKPIs.netMarginPercent.toFixed(1)}%
          </span>
        </div>

        {/* ROI % */}
        <div className="high-density-card p-5 space-y-2">
          <div className="flex justify-between items-center text-slate-400">
            <span className="label-xs">{i18n.language === 'la' ? 'ຜົນຕອບແທນ (ROI)' : 'Return on Inv.'}</span>
            <PieChart className="w-3.5 h-3.5 text-neutral-400" />
          </div>
          <h3 className={`text-2xl font-serif font-bold ${financeKPIs.roiPercent >= 0 ? 'text-slate-900 dark:text-white' : 'text-rose-500'}`}>
            {financeKPIs.roiPercent.toFixed(1)}%
          </h3>
          <span className="text-[10px] text-slate-400 block font-light">
            Performance Index
          </span>
        </div>

      </div>

      {/* Chart: Clean Minimalist Line */}
      <div className="high-density-card p-6 space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 dark:border-neutral-800 pb-3">
          <div>
            <h3 className="text-base font-serif text-slate-800 dark:text-white">
              {i18n.language === 'la' ? 'ທ່າອ່ຽງລາຍຮັບ ທຽບກັບ ລາຍຈ່າຍ (7 ວັນ)' : 'Revenue vs Expense Flow (7 Days)'}
            </h3>
            <p className="text-xs text-slate-400">
              {i18n.language === 'la' ? 'ການປຽບທຽບກະແສເງິນສົດເຂົ້າ-ອອກລາຍວັນ' : 'Cash inflows vs outflows comparison'}
            </p>
          </div>
          <div className="flex gap-4 text-xs font-mono font-medium">
            <span className="text-emerald-500">● Revenue</span>
            <span className="text-slate-400 dark:text-neutral-500">● Expenses</span>
          </div>
        </div>

        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#737373" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#737373" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#262626" opacity={0.15} />
              <XAxis dataKey="day" fontSize={11} axisLine={false} tickLine={false} />
              <YAxis fontSize={11} axisLine={false} tickLine={false} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#141414', 
                  borderRadius: '12px', 
                  border: '1px solid rgba(255,255,255,0.1)', 
                  color: '#fff',
                  fontSize: '11px' 
                }} 
              />
              <Area type="monotone" dataKey="Revenue" stroke="#10b981" fill="url(#colorRev)" strokeWidth={2} />
              <Area type="monotone" dataKey="Expenses" stroke="#737373" fill="url(#colorExp)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
