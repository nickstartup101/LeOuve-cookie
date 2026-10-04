import { useState, useEffect, useMemo } from 'react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import { 
  TrendingUp, DollarSign, Percent, 
  ShoppingBag, PieChart
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
        fullDate: dayStr,
        Revenue: rev,
        Expenses: exp
      };
    });
  }, [transactions]);

  return (
    <div className="space-y-6 font-sans pb-16">
      
      {/* ✨ Header: ເອົາສັນຍາລັກ LO ອອກແລ້ວ */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-[#141414] p-6 rounded-3xl border border-slate-200/80 dark:border-neutral-800">
        <div>
          <h2 className="text-xl font-serif text-slate-800 dark:text-white">
            Le Ouve Executive Dashboard
          </h2>
          <p className="text-[10px] text-slate-400 font-sans uppercase mt-0.5">
            Live Business Analytics & Financial Metrics
          </p>
        </div>

        <span className="px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-full text-[9px] font-black uppercase tracking-wider border border-emerald-500/20">
          Realtime Synced
        </span>
      </div>

      {/* ✨ CARDS ປົດຂອບສີດ້ານເທິງອອກໝົດ: Minimalist Clean Border */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        
        <div className="high-density-card p-5">
          <div className="flex justify-between items-center">
            <span className="label-xs">Total Revenue (ຍອດຂາຍ)</span>
            <DollarSign className="w-4 h-4 text-sky-500" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white font-mono mt-2">
            {financeKPIs.totalRevenue.toLocaleString()} ₭
          </h3>
          <span className="text-[9px] text-slate-400 font-bold uppercase mt-1 block">ລາຍຮັບລວມທັງໝົດ</span>
        </div>

        <div className="high-density-card p-5">
          <div className="flex justify-between items-center">
            <span className="label-xs">COGS / Purchasing (ຕົ້ນທຶນ)</span>
            <ShoppingBag className="w-4 h-4 text-amber-500" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white font-mono mt-2">
            {financeKPIs.cogsPurchasing.toLocaleString()} ₭
          </h3>
          <span className="text-[9px] text-amber-500 font-bold uppercase mt-1 block">ຄ່າຈັດຊື້ & ວັດຖຸດິບ</span>
        </div>

        <div className="high-density-card p-5">
          <div className="flex justify-between items-center">
            <span className="label-xs">Gross Margin %</span>
            <Percent className="w-4 h-4 text-indigo-500" />
          </div>
          <h3 className={`text-xl font-bold font-mono mt-2 ${financeKPIs.grossMarginPercent >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-rose-500'}`}>
            {financeKPIs.grossMarginPercent.toFixed(1)}%
          </h3>
          <span className="text-[9px] text-slate-400 font-bold uppercase mt-1 block">ກຳໄລຂັ້ນຕົ້ນ</span>
        </div>

        <div className="high-density-card p-5">
          <div className="flex justify-between items-center">
            <span className="label-xs">Net Profit (ກຳໄລສຸດທິ)</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <h3 className={`text-xl font-bold font-mono mt-2 ${financeKPIs.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
            {financeKPIs.netProfit.toLocaleString()} ₭
          </h3>
          <span className={`text-[9px] font-bold uppercase mt-1 block ${financeKPIs.netProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
            Net Margin: {financeKPIs.netMarginPercent.toFixed(1)}%
          </span>
        </div>

        <div className="high-density-card p-5">
          <div className="flex justify-between items-center">
            <span className="label-xs">ROI % (ຜົນຕອບແທນ)</span>
            <PieChart className="w-4 h-4 text-purple-500" />
          </div>
          <h3 className={`text-xl font-bold font-mono mt-2 ${financeKPIs.roiPercent >= 0 ? 'text-purple-600 dark:text-purple-400' : 'text-rose-500'}`}>
            {financeKPIs.roiPercent.toFixed(1)}%
          </h3>
          <span className="text-[9px] text-purple-500 font-bold uppercase mt-1 block">Return on Investment</span>
        </div>

      </div>

      {/* Chart */}
      <div className="high-density-card p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-sm font-serif text-slate-800 dark:text-white">Revenue vs Expenses Trend (7 ວັນ)</h3>
          <div className="flex gap-4 text-xs font-bold font-mono">
            <span className="text-emerald-500">● Revenue</span>
            <span className="text-rose-500">● Expenses</span>
          </div>
        </div>

        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#262626" opacity={0.2} />
              <XAxis dataKey="day" fontSize={10} axisLine={false} tickLine={false} />
              <YAxis fontSize={10} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: '#141414', borderRadius: '12px', border: '1px solid #262626', color: '#fff', fontSize: '11px' }} />
              <Area type="monotone" dataKey="Revenue" stroke="#10b981" fill="#10b981" fillOpacity={0.15} strokeWidth={2} />
              <Area type="monotone" dataKey="Expenses" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
