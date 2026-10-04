import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, query, onSnapshot, addDoc, setDoc, deleteDoc, doc, serverTimestamp, updateDoc 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useTranslation } from 'react-i18next';
import { 
  BookOpen, Plus, Trash2, Edit2, Calendar, AlertTriangle, 
  Package, ShoppingCart, Layers, Zap, Droplets
} from 'lucide-react';
import { format } from 'date-fns';

const getSinglePackPriceLAK = (quote: any): number => {
  if (!quote) return 100000;
  if (quote.priceMode === 'total' || quote.priceMode === 'per_pack' || quote.totalPriceLAK !== undefined) {
    return Number(quote.priceLAK || 0);
  }
  const totalOriginal = Number(quote.priceOriginal || 0);
  const exchangeRate = Number(quote.exchangeRate || 1);
  return (quote.currency === 'LAK' ? totalOriginal : totalOriginal * exchangeRate) / Number(quote.quantity || 1);
};

// 🍼 BOTTLE GAUGE COMPONENT (ຮູບຂວດນ້ຳສະແດງປະລິມານທີ່ເຫຼືອໃນຂວດ ເປັນ ml ແລະ %)
const BottleGauge = ({ currentMl, packSize = 1000 }: { currentMl: number; packSize?: number }) => {
  const cap = packSize > 0 ? packSize : 1000;
  const activeBottleMl = currentMl <= 0 ? 0 : (currentMl % cap === 0 ? cap : currentMl % cap);
  const percent = Math.min(100, Math.max(0, Math.round((activeBottleMl / cap) * 100)));
  const fullBottles = currentMl > 0 ? Math.floor(currentMl / cap) : 0;

  return (
    <div className="flex items-center gap-2.5 p-2 bg-slate-50 dark:bg-[#1a1a1a] rounded-2xl border border-slate-200/70 dark:border-neutral-800">
      {/* Bottle Silhouette SVG */}
      <div className="relative w-6 h-12 flex items-end justify-center shrink-0">
        <svg viewBox="0 0 32 64" className="w-6 h-12 text-slate-300 dark:text-neutral-700">
          <rect x="11" y="2" width="10" height="5" rx="1.5" fill="currentColor" opacity="0.8" />
          <rect x="12" y="7" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M 12 15 C 6 18 4 22 4 28 L 4 58 C 4 61 7 62 10 62 L 22 62 C 25 62 28 61 28 58 L 28 28 C 28 22 26 18 20 15 Z" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        
        {/* Animated Liquid Level */}
        <div 
          className="absolute bottom-1 w-4 rounded-b-md bg-gradient-to-t from-sky-500 to-sky-400 transition-all duration-700" 
          style={{ height: `${Math.max(3, (percent * 34) / 100)}px` }}
        />
      </div>

      {/* Numerical Levels (ml & %) */}
      <div className="flex flex-col text-left">
        <div className="flex items-center gap-1">
          <span className="text-xs font-black font-mono text-sky-500">{percent}%</span>
          <span className="text-[9px] text-slate-400 font-bold">({activeBottleMl.toLocaleString()} ml)</span>
        </div>
        <span className="text-[9px] text-slate-400 mt-0.5">
          {fullBottles > 0 ? `+${fullBottles} ຂວດເຕັມ` : `ເຫຼືອໃນຂວດ`}
        </span>
      </div>
    </div>
  );
};

export default function Inventory() {
  const { i18n } = useTranslation();
  const [subTab, setSubTab] = useState<'recipes' | 'sales' | 'balances'>('balances');
  
  const [products, setProducts] = useState<any[]>([]);
  const [supplierPrices, setSupplierPrices] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [salesRecords, setSalesRecords] = useState<any[]>([]);
  const [adjustments, setAdjustments] = useState<any[]>([]);

  // Recipe Builder Form
  const [menuName, setMenuName] = useState('');
  const [overheadCost, setOverheadCost] = useState<number | string>(1500);
  const [recipeIngredients, setRecipeIngredients] = useState<any[]>([]);
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);

  // Sales
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [quantitiesSold, setQuantitiesSold] = useState<{ [recipeId: string]: number }>({});

  useEffect(() => {
    const unsubP = onSnapshot(query(collection(db, 'products')), snap => setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubS = onSnapshot(query(collection(db, 'supplierPrices')), snap => setSupplierPrices(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubR = onSnapshot(query(collection(db, 'recipes')), snap => setRecipes(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubSales = onSnapshot(query(collection(db, 'menu_sales')), snap => setSalesRecords(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubAdj = onSnapshot(query(collection(db, 'inventory')), snap => setAdjustments(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { unsubP(); unsubS(); unsubR(); unsubSales(); unsubAdj(); };
  }, []);

  const productUnitCosts = useMemo(() => {
    const costMap: { [productId: string]: { perUnit: number; pricePerPack: number; label: string; qtyPerPack: number } } = {};
    products.forEach(p => {
      const pPrices = supplierPrices.filter(sp => sp.productId === p.id);
      if (pPrices.length > 0) {
        const latest = pPrices[0];
        const packPriceLAK = getSinglePackPriceLAK(latest);
        const sizePerPack = latest.quantityPerUnit || p.packSize || 1000;
        costMap[p.id] = { perUnit: packPriceLAK / sizePerPack, pricePerPack: packPriceLAK, label: p.unit || 'g', qtyPerPack: sizePerPack };
      } else {
        costMap[p.id] = { perUnit: 0, pricePerPack: 0, label: p.unit || 'g', qtyPerPack: p.packSize || 1000 };
      }
    });
    return costMap;
  }, [products, supplierPrices]);

  // Inventory Balances
  const inventoryBalances = useMemo(() => {
    return products.map(p => {
      const pPrices = supplierPrices.filter(sp => sp.productId === p.id);
      const totalIn = pPrices.reduce((sum, sp) => {
        let size = sp.quantityPerUnit || p.packSize || 1000;
        return sum + ((sp.quantity || 0) * size);
      }, 0);

      let totalConsumed = 0;
      salesRecords.forEach(sale => {
        const itemsSold = sale.itemsSold || {};
        Object.keys(itemsSold).forEach(recipeId => {
          const qtySold = itemsSold[recipeId] || 0;
          const recipe = recipes.find(r => r.id === recipeId);
          if (recipe) {
            const ing = (recipe.ingredients || []).find((i: any) => i.productId === p.id);
            if (ing) totalConsumed += (Number(ing.amount) || 0) * qtySold;
          }
        });
      });

      const pAdjs = adjustments.filter(adj => adj.productId === p.id);
      const totalAdjustment = pAdjs.reduce((sum, adj) => sum + (adj.amount || 0), 0);
      const finalBalance = Math.max(0, totalIn + totalAdjustment - totalConsumed);
      const priceDetails = productUnitCosts[p.id] || { perUnit: 0, label: p.unit || 'g' };

      return {
        ...p,
        totalIn,
        totalConsumed,
        finalBalance,
        unitLabel: priceDetails.label,
        totalValuation: finalBalance * priceDetails.perUnit
      };
    });
  }, [products, supplierPrices, salesRecords, recipes, adjustments, productUnitCosts]);

  return (
    <div className="space-y-6 font-sans pb-16">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white dark:bg-[#141414] p-6 rounded-3xl border border-slate-200/80 dark:border-neutral-800 shadow-xs">
        <div>
          <span className="bg-[#052659] dark:bg-white dark:text-neutral-950 text-white text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest">
            Le Ouve Stock Intelligence
          </span>
          <h1 className="text-2xl md:text-3xl font-serif text-slate-800 dark:text-white mt-1">
            Realtime Stock & Liquid Gauge (ml)
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            ສິນຄ້າຫົວໜ່ວຍ ml ຈະມີຮູບຂວດນ້ຳ Bottle Gauge ສະແດງປະລິມານທີ່ເຫຼືອຕົວຈິງ ແລະ %
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setSubTab('balances')}
            className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${subTab === 'balances' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'bg-neutral-100 dark:bg-neutral-900 text-slate-400'}`}
          >
            ຍອດຄັງສາງຄົງເຫຼືອ
          </button>
          <button
            onClick={() => setSubTab('recipes')}
            className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${subTab === 'recipes' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'bg-neutral-100 dark:bg-neutral-900 text-slate-400'}`}
          >
            ສູດເຄື່ອງດື່ມ
          </button>
        </div>
      </div>

      {/* 🍼 TAB 1: INVENTORY BALANCES WITH BOTTLE GAUGE FOR ML ITEMS */}
      {subTab === 'balances' && (
        <div className="high-density-card p-6 overflow-hidden space-y-4">
          <div className="flex justify-between items-center border-b border-neutral-800 pb-3">
            <div>
              <h3 className="text-sm font-serif text-slate-800 dark:text-white">ລາຍການສາງສິນຄ້າທັງໝົດ</h3>
              <p className="text-xs text-slate-400">ສິນຄ້າທີ່ເປັນ ml ຈະສະແດງລະດັບນ້ຳໃນຂວດ ແລະ ເປີເຊັນ</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-neutral-900/60 text-[10px] font-black uppercase text-slate-400">
                <tr>
                  <th className="p-3">ສິນຄ້າ</th>
                  <th className="p-3">ປະເພດ</th>
                  <th className="p-3">ສະຖານະຂວດນ້ຳ (ml & %)</th>
                  <th className="p-3 text-center">ຍອດຄົງເຫຼືອ</th>
                  <th className="p-3 text-right">ມູນຄ່າຕົ້ນທຶນ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                {inventoryBalances.map(item => {
                  const isLiquidMl = item.unit === 'ml' || item.unitLabel === 'ml';

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-neutral-800/30">
                      <td className="p-3 font-bold text-slate-800 dark:text-white">
                        <div className="flex items-center gap-2.5">
                          {item.productImage ? (
                            <img src={item.productImage} alt={item.name} className="w-9 h-9 rounded-xl object-cover border border-neutral-700" />
                          ) : (
                            <div className="w-9 h-9 rounded-xl bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center text-slate-400">
                              <Package className="w-4 h-4" />
                            </div>
                          )}
                          <span>{item.name}</span>
                        </div>
                      </td>

                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-neutral-100 dark:bg-neutral-800 text-slate-400">
                          {item.categoryType || 'COGS'}
                        </span>
                      </td>

                      {/* 🍼 BOTTLE GAUGE DISPLAY FOR ML ITEMS */}
                      <td className="p-3">
                        {isLiquidMl ? (
                          <BottleGauge currentMl={item.finalBalance} packSize={item.packSize || 1000} />
                        ) : (
                          <span className="text-slate-500 font-mono text-[11px]">-</span>
                        )}
                      </td>

                      <td className="p-3 text-center font-mono font-black text-emerald-500 text-sm">
                        {Math.round(item.finalBalance).toLocaleString()} {item.unit || item.unitLabel}
                      </td>

                      <td className="p-3 text-right font-mono font-bold">
                        {Math.round(item.totalValuation).toLocaleString()} ₭
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: RECIPES */}
      {subTab === 'recipes' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {recipes.map(rec => (
            <div key={rec.id} className="high-density-card p-6 space-y-3">
              <h4 className="text-base font-serif text-slate-800 dark:text-white">{rec.menuName}</h4>
              <div className="text-xs text-slate-400 space-y-1">
                {(rec.ingredients || []).map((ing: any, i: number) => {
                  const pr = products.find(p => p.id === ing.productId);
                  return (
                    <div key={i} className="flex justify-between">
                      <span>{pr?.name || ing.name}</span>
                      <span className="font-mono">{ing.amount}{ing.unit || pr?.unit}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
