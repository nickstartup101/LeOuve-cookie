import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, query, onSnapshot, addDoc, setDoc, deleteDoc, doc, serverTimestamp 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useTranslation } from 'react-i18next';
import { 
  BookOpen, Plus, Trash2, Edit2, Calendar, 
  Package, ShoppingCart, Layers, Zap, Utensils, FileText,
  DollarSign, TrendingUp, Percent, Sparkles, Tag
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

// 🍼 Bottle Gauge ສຳລັບຫົວໜ່ວຍ ml
const BottleGauge = ({ currentMl, packSize = 1000 }: { currentMl: number; packSize?: number }) => {
  const cap = packSize > 0 ? packSize : 1000;
  const activeBottleMl = currentMl <= 0 ? 0 : (currentMl % cap === 0 ? cap : currentMl % cap);
  const percent = Math.min(100, Math.max(0, Math.round((activeBottleMl / cap) * 100)));
  const fullBottles = currentMl > 0 ? Math.floor(currentMl / cap) : 0;

  return (
    <div className="flex items-center gap-2.5 p-2 bg-slate-50 dark:bg-[#1a1a1a] rounded-2xl border border-slate-200/70 dark:border-neutral-800">
      <div className="relative w-6 h-12 flex items-end justify-center shrink-0">
        <svg viewBox="0 0 32 64" className="w-6 h-12 text-slate-300 dark:text-neutral-700">
          <rect x="11" y="2" width="10" height="5" rx="1.5" fill="currentColor" opacity="0.8" />
          <rect x="12" y="7" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M 12 15 C 6 18 4 22 4 28 L 4 58 C 4 61 7 62 10 62 L 22 62 C 25 62 28 61 28 58 L 28 28 C 28 22 26 18 20 15 Z" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        
        <div 
          className="absolute bottom-1 w-4 rounded-b-md bg-gradient-to-t from-sky-500 to-sky-400 transition-all duration-700" 
          style={{ height: `${Math.max(3, (percent * 34) / 100)}px` }}
        />
      </div>

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

// ແປງຫົວໜ່ວຍ: ຮອງຮັບ ຊ້ອນຊາ (tsp), ຊ້ອນໂຕະ (tbsp), g, ml
export function getIngredientBaseQtyAndCost(
  amount: number,
  ingUnitStr: string,
  prod: any,
  costStructure: { perUnit: number; pricePerPack: number; qtyPerPack: number }
) {
  const u = (ingUnitStr || prod?.unit || 'g').toLowerCase().trim();
  const packSize = costStructure.qtyPerPack || 1000;
  let baseUnits = amount;

  if (u === 'tsp' || u === 'ຊ້ອນຊາ') {
    baseUnits = amount * 5; // 1 tsp = 5g (ຫຼື 5ml) -> 1/4 tsp = 1.25g
  } else if (u === 'tbsp' || u === 'ຊ້ອນໂຕະ') {
    baseUnits = amount * 15; // 1 tbsp = 15g (ຫຼື 15ml)
  } else if (u === 'pack' || u === 'box' || u === 'bag') {
    baseUnits = amount * packSize;
  } else if (u === 'kg' || u === 'l') {
    baseUnits = amount * 1000;
  }

  const cost = baseUnits * (costStructure.perUnit || 0);
  return { baseUnits, cost };
}

interface RecipeIngredientRow {
  productId: string;
  name: string;
  supplier: string;
  amount: number | string;
  unit: string;
  packSize: number | string;
  unitCostLAK: number;
}

export default function Inventory() {
  const { i18n } = useTranslation();
  const [subTab, setSubTab] = useState<'recipes' | 'sales' | 'balances'>('recipes');
  
  const [products, setProducts] = useState<any[]>([]);
  const [supplierPrices, setSupplierPrices] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [salesRecords, setSalesRecords] = useState<any[]>([]);
  const [adjustments, setAdjustments] = useState<any[]>([]);

  // 📝 Recipe Builder Form State
  const [menuName, setMenuName] = useState('');
  const [overheadCost, setOverheadCost] = useState<number | string>(1500); // ຄ່ານ້ຳ-ຄ່າໄຟ-ບັນຈຸພັນ
  const [sellingPrice, setSellingPrice] = useState<number | string>(35000); // ✨ ລາຄາຂາຍທີ່ຕັ້ງໄວ້ (Selling Price)
  const [pricingNote, setPricingNote] = useState(''); // ✨ Note ການຕັ້ງລາຄາ & ກຳໄລ
  const [note, setNote] = useState(''); // Note ວິທີເຮັດ & ເທັກນິກ
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredientRow[]>([]);
  const [editingRecipe, setEditingRecipe] = useState<any | null>(null);
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);

  // Sales State
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [quantitiesSold, setQuantitiesSold] = useState<{ [recipeId: string]: number }>({});
  const [isDeducting, setIsDeducting] = useState(false);

  useEffect(() => {
    const unsubP = onSnapshot(query(collection(db, 'products')), snap => setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubS = onSnapshot(query(collection(db, 'supplierPrices')), snap => setSupplierPrices(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubR = onSnapshot(query(collection(db, 'recipes')), snap => setRecipes(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubSales = onSnapshot(query(collection(db, 'menu_sales')), snap => setSalesRecords(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubAdj = onSnapshot(query(collection(db, 'inventory')), snap => setAdjustments(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { unsubP(); unsubS(); unsubR(); unsubSales(); unsubAdj(); };
  }, []);

  // 1. ດຶງລາຍການວັດຖຸດິບທີ່ມີບັນທຶກຈາກ SUPPLIER ມາເຮັດເປັນ DROPDOWN
  const supplierProductOptions = useMemo(() => {
    const map = new Map<string, {
      productId: string;
      name: string;
      supplier: string;
      unit: string;
      packSize: number;
      unitCostLAK: number;
    }>();

    const sorted = [...supplierPrices].sort((a, b) => {
      const tA = a.createdAt?.toDate?.()?.getTime() || new Date(a.date).getTime() || 0;
      const tB = b.createdAt?.toDate?.()?.getTime() || new Date(b.date).getTime() || 0;
      return tB - tA;
    });

    sorted.forEach(sp => {
      const pr = products.find(p => p.id === sp.productId);
      const prodName = pr?.name || 'ວັດຖຸດິບ';
      const key = `${sp.productId}_${sp.supplier}`;

      if (!map.has(key)) {
        const rate = sp.currency === 'LAK' ? 1 : (Number(sp.exchangeRate) || 1);
        const singlePackLAK = (sp.priceMode === 'total' 
          ? (Number(sp.priceOriginal || 0) / (Number(sp.quantity) || 1)) 
          : Number(sp.priceOriginal || 0)) * rate;
        const packSize = Number(sp.quantityPerUnit) || pr?.packSize || 1000;
        const unitCostLAK = singlePackLAK / (packSize || 1);

        map.set(key, {
          productId: sp.productId,
          name: prodName,
          supplier: sp.supplier,
          unit: sp.unit || pr?.unit || 'g',
          packSize,
          unitCostLAK
        });
      }
    });

    return Array.from(map.values());
  }, [supplierPrices, products]);

  // 💡 ຄິດໄລ່ຕົ້ນທຶນ, ລາຄາຂາຍ & ກຳໄລສຸດທິຕໍ່ໜ່ວຍ
  const recipesWithCalculatedCosts = useMemo(() => {
    return recipes.map(recipe => {
      let rawCost = 0;
      const parsedIngredients = (recipe.ingredients || []).map((ing: any) => {
        const pr = products.find(p => p.id === ing.productId);
        const unitCost = ing.unitCostLAK || 0;
        const amt = Number(ing.amount) || 0;
        const u = (ing.unit || pr?.unit || 'g').toLowerCase();

        let baseUnits = amt;
        if (u === 'tsp' || u === 'ຊ້ອນຊາ') baseUnits = amt * 5;
        else if (u === 'tbsp' || u === 'ຊ້ອນໂຕະ') baseUnits = amt * 15;

        const cost = unitCost > 0 ? baseUnits * unitCost : 0;
        rawCost += cost;

        return {
          ...ing,
          productName: pr?.name || ing.name || 'Item',
          supplier: ing.supplier || '',
          unitLabel: ing.unit || pr?.unit || 'g',
          baseUnits,
          calculatedCost: cost
        };
      });

      const overhead = Number(recipe.overheadCost) || 0;
      const totalCostPerCup = rawCost + overhead;
      const price = Number(recipe.sellingPrice) || 0;
      const netProfitPerCup = price > 0 ? price - totalCostPerCup : 0;
      const profitMarginPercent = price > 0 ? (netProfitPerCup / price) * 100 : 0;

      return {
        ...recipe,
        ingredientsDetailed: parsedIngredients,
        rawCost,
        overheadCost: overhead,
        totalCostPerCup,
        sellingPrice: price,
        netProfitPerCup,
        profitMarginPercent,
        pricingNote: recipe.pricingNote || '', // ✨ Note ການຕັ້ງລາຄາ
        note: recipe.note || ''
      };
    });
  }, [recipes, products]);

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
            if (ing) {
              const amt = Number(ing.amount) || 0;
              const u = (ing.unit || p.unit || 'g').toLowerCase();
              let baseUnits = amt;
              if (u === 'tsp' || u === 'ຊ້ອນຊາ') baseUnits = amt * 5;
              else if (u === 'tbsp' || u === 'ຊ້ອນໂຕະ') baseUnits = amt * 15;
              totalConsumed += baseUnits * qtySold;
            }
          }
        });
      });

      const pAdjs = adjustments.filter(adj => adj.productId === p.id);
      const totalAdjustment = pAdjs.reduce((sum, adj) => sum + (adj.amount || 0), 0);
      const finalBalance = Math.max(0, totalIn + totalAdjustment - totalConsumed);

      return {
        ...p,
        totalIn,
        totalConsumed,
        finalBalance,
        unitLabel: p.unit || 'g'
      };
    });
  }, [products, supplierPrices, salesRecords, recipes, adjustments]);

  // 🚀 ບັນທຶກສູດເຄື່ອງດື່ມ / Cookie (ພ້ອມ Selling Price & Pricing Note)
  const handleSaveRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!menuName.trim() || recipeIngredients.length === 0) {
      alert("ກະລຸນາໃສ່ຊື່ເມນູ ແລະ ເລືອກວັດຖຸດິບຢ່າງໜ້ອຍ 1 ລາຍການ");
      return;
    }

    try {
      setIsSavingRecipe(true);
      const payloadIngredients = recipeIngredients
        .filter(it => it.productId && Number(it.amount) > 0)
        .map(it => ({
          productId: it.productId,
          name: it.name,
          supplier: it.supplier,
          amount: parseFloat(String(it.amount)) || 0,
          unit: it.unit || 'g',
          packSize: Number(it.packSize) || 1000,
          unitCostLAK: it.unitCostLAK || 0
        }));

      const recipePayload = {
        menuName: menuName.trim(),
        overheadCost: Number(overheadCost) || 0,
        sellingPrice: Number(sellingPrice) || 0, // ✨ ບັນທຶກລາຄາຂາຍ
        pricingNote: pricingNote.trim(),         // ✨ ບັນທຶກ Note ການຕັ້ງລາຄາ & ກຳໄລ
        note: note.trim(),                       // Note ວິທີເຮັດ
        ingredients: payloadIngredients,
        updatedAt: serverTimestamp()
      };

      if (editingRecipe) {
        await setDoc(doc(db, 'recipes', editingRecipe.id), recipePayload, { merge: true });
      } else {
        await addDoc(collection(db, 'recipes'), recipePayload);
      }

      setIsRecipeModalOpen(false);
      setEditingRecipe(null);
      setMenuName('');
      setOverheadCost(1500);
      setSellingPrice(35000);
      setPricingNote('');
      setNote('');
      setRecipeIngredients([]);
      alert("ບັນທຶກສູດພ້ອມການຕັ້ງລາຄາ ແລະ ກຳໄລສຳເລັດແລ້ວ!");
    } finally {
      setIsSavingRecipe(false);
    }
  };

  const handleAddIngredientRow = () => {
    setRecipeIngredients(prev => [
      ...prev,
      { productId: '', name: '', supplier: '', amount: '', unit: 'g', packSize: 1000, unitCostLAK: 0 }
    ]);
  };

  const handleRemoveIngredientRow = (idx: number) => {
    setRecipeIngredients(prev => prev.filter((_, i) => i !== idx));
  };

  // ຄິດໄລ່ Live Modal Calculation
  const currentModalCalculation = useMemo(() => {
    const rawCost = recipeIngredients.reduce((s, it) => {
      const amt = Number(it.amount) || 0;
      const u = (it.unit || 'g').toLowerCase();
      let bUnits = amt;
      if (u === 'tsp' || u === 'ຊ້ອນຊາ') bUnits = amt * 5;
      else if (u === 'tbsp' || u === 'ຊ້ອນໂຕະ') bUnits = amt * 15;
      return s + (bUnits * (it.unitCostLAK || 0));
    }, 0);

    const overhead = Number(overheadCost) || 0;
    const totalCost = rawCost + overhead;
    const price = Number(sellingPrice) || 0;
    const netProfit = price > 0 ? price - totalCost : 0;
    const margin = price > 0 ? (netProfit / price) * 100 : 0;

    return { rawCost, overhead, totalCost, price, netProfit, margin };
  }, [recipeIngredients, overheadCost, sellingPrice]);

  return (
    <div className="space-y-6 font-sans pb-16">
      
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4 p-6 bg-white dark:bg-[#141414] rounded-3xl border border-slate-200/80 dark:border-neutral-800 shadow-sm">
        <div>
          <span className="bg-[#052659] dark:bg-white dark:text-neutral-950 text-white text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest">
            Le Ouve Recipe & Pricing Engine
          </span>
          <h1 className="text-2xl md:text-3xl font-serif text-slate-800 dark:text-white mt-1">
            ສູດເຄື່ອງດື່ມ, ລາຄາຂາຍ & ເປົ້າໝາຍກຳໄລ
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            ກຳກັບຕົ້ນທຶນວັດຖຸດິບ + ບວກຄ່າໄຟ-ນ້ຳດຳເນີນງານ + ຕັ້ງລາຄາຂາຍ ແລະ ບັນທຶກ Note ເປົ້າໝາຍກຳໄລ
          </p>
        </div>

        <button
          onClick={() => {
            setEditingRecipe(null);
            setMenuName('');
            setOverheadCost(1500);
            setSellingPrice(35000);
            setPricingNote('');
            setNote('');
            setRecipeIngredients([
              { productId: '', name: '', supplier: '', amount: '', unit: 'g', packSize: 1000, unitCostLAK: 0 }
            ]);
            setIsRecipeModalOpen(true);
          }}
          className="crystal-button !py-3 !px-5 flex items-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>+ ສ້າງສູດໃໝ່</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setSubTab('recipes')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${subTab === 'recipes' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'bg-white dark:bg-[#141414] border border-slate-200 dark:border-neutral-800 text-slate-400'}`}
        >
          ສູດເຄື່ອງດື່ມ & ລາຄາຂາຍ
        </button>
        <button
          onClick={() => setSubTab('sales')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${subTab === 'sales' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'bg-white dark:bg-[#141414] border border-slate-200 dark:border-neutral-800 text-slate-400'}`}
        >
          ຍອດຂາຍປະຈຳວັນ & ຕັດສາງ
        </button>
        <button
          onClick={() => setSubTab('balances')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${subTab === 'balances' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'bg-white dark:bg-[#141414] border border-slate-200 dark:border-neutral-800 text-slate-400'}`}
        >
          ຍອດຄັງສາງ (ຂວດ ml)
        </button>
      </div>

      {/* TAB 1: RECIPES CARDS */}
      {subTab === 'recipes' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {recipesWithCalculatedCosts.map((recipe) => (
            <div key={recipe.id} className="high-density-card p-6 flex flex-col justify-between space-y-4">
              <div>
                {/* Header: Menu Name & Selling Price */}
                <div className="flex justify-between items-start border-b border-slate-100 dark:border-neutral-800 pb-3">
                  <div>
                    <h4 className="text-base font-serif text-slate-800 dark:text-white">{recipe.menuName}</h4>
                    {recipe.sellingPrice > 0 ? (
                      <span className="text-xs font-mono font-bold text-sky-500 block mt-0.5">
                        ລາຄາຂາຍ: {Number(recipe.sellingPrice).toLocaleString()} ₭
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-light block mt-0.5">ຍັງບໍ່ກຳນົດລາຄາຂາຍ</span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-black font-mono text-slate-800 dark:text-white block">
                      {Math.round(recipe.totalCostPerCup).toLocaleString()} ₭
                    </span>
                    <span className="text-[9px] text-slate-400 block font-normal">ຕົ້ນທຶນລວມ/ໜ່ວຍ</span>
                  </div>
                </div>

                {/* 💵 Cost & Profit Calculation Box */}
                <div className="mt-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-[#1a1a1a] text-xs space-y-1.5 font-mono">
                  <div className="flex justify-between text-slate-500">
                    <span>ວັດຖຸດິບ (Raw Cost):</span>
                    <span>{Math.round(recipe.rawCost).toLocaleString()} ₭</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>+ ຄ່າໄຟ-ນ້ຳ (Overhead):</span>
                    <span>+{Math.round(recipe.overheadCost).toLocaleString()} ₭</span>
                  </div>
                  
                  {recipe.sellingPrice > 0 && (
                    <div className="border-t border-slate-200/60 dark:border-neutral-800 pt-1.5 flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-700 dark:text-neutral-200">ກຳໄລສຸດທິ/ຈອກ:</span>
                      <span className={`font-black ${recipe.netProfitPerCup >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        +{Math.round(recipe.netProfitPerCup).toLocaleString()} ₭ ({recipe.profitMarginPercent.toFixed(1)}%)
                      </span>
                    </div>
                  )}
                </div>

                {/* ✨ 1. NOTE ການຕັ້ງລາຄາ & ກຳໄລ (PRICING STRATEGY NOTE) */}
                {recipe.pricingNote && (
                  <div className="mt-3 p-3.5 rounded-2xl bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-1">
                    <span className="text-[9.5px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5" />
                      <span>Note ການຕັ້ງລາຄາ & ເປົ້າໝາຍກຳໄລ:</span>
                    </span>
                    <p className="text-slate-600 dark:text-neutral-300 font-light whitespace-pre-wrap leading-relaxed">
                      {recipe.pricingNote}
                    </p>
                  </div>
                )}

                {/* ✨ 2. NOTE ວິທີເຮັດ & ເທັກນິກ (RECIPE INSTRUCTION NOTE) */}
                {recipe.note && (
                  <div className="mt-3 p-3.5 rounded-2xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/15 text-xs space-y-1">
                    <span className="text-[9.5px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" />
                      <span>Note ວິທີເຮັດ & ເທັກນິກ:</span>
                    </span>
                    <p className="text-slate-600 dark:text-neutral-300 font-light whitespace-pre-wrap leading-relaxed">
                      {recipe.note}
                    </p>
                  </div>
                )}

                {/* Ingredients detail */}
                <div className="divide-y divide-slate-100 dark:divide-neutral-800/60 mt-3 max-h-40 overflow-y-auto pr-1">
                  {recipe.ingredientsDetailed?.map((ing: any, i: number) => {
                    const isSpoon = ing.unitLabel === 'tsp' || ing.unitLabel === 'tbsp';
                    return (
                      <div key={i} className="flex justify-between py-1.5 text-xs">
                        <div>
                          <span className="text-slate-700 dark:text-slate-200 font-bold block">{ing.productName}</span>
                          <span className="text-[9px] text-slate-400 font-light">
                            {ing.supplier ? `ຈາກ: ${ing.supplier}` : 'Supplier Quote'}
                            {isSpoon && ` (≈${ing.baseUnits}g)`}
                          </span>
                        </div>
                        <div className="text-right font-mono">
                          <span className="font-bold text-slate-800 dark:text-white block">
                            {ing.amount} {ing.unitLabel}
                          </span>
                          <span className="text-[10px] text-emerald-500">≈ {Math.round(ing.calculatedCost).toLocaleString()} ₭</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-neutral-800">
                <button
                  onClick={() => {
                    setEditingRecipe(recipe);
                    setMenuName(recipe.menuName);
                    setOverheadCost(recipe.overheadCost || 1500);
                    setSellingPrice(recipe.sellingPrice || 35000);
                    setPricingNote(recipe.pricingNote || '');
                    setNote(recipe.note || '');
                    setRecipeIngredients((recipe.ingredients || []).map((ing: any) => ({
                      productId: ing.productId,
                      name: ing.name,
                      supplier: ing.supplier || '',
                      amount: ing.amount,
                      unit: ing.unit || 'g',
                      packSize: ing.packSize || 1000,
                      unitCostLAK: ing.unitCostLAK || 0
                    })));
                    setIsRecipeModalOpen(true);
                  }}
                  className="p-2 text-slate-400 hover:text-sky-500 rounded-lg cursor-pointer"
                  title="ແກ້ໄຂສູດ, ລາຄາຂາຍ & Note"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => deleteDoc(doc(db, 'recipes', recipe.id))}
                  className="p-2 text-slate-400 hover:text-rose-500 rounded-lg cursor-pointer"
                  title="ລຶບສູດ"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 2: SALES LOGGING */}
      {subTab === 'sales' && (
        <div className="high-density-card p-6 space-y-6">
          <div className="flex justify-between items-center border-b border-slate-100 dark:border-neutral-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-white">Daily Sales Logging</h3>
              <p className="text-xs text-slate-400">ໃສ່ຈຳນວນທີ່ຂາຍໄດ້ ເພື່ອຕັດສະຕັອກວັດຖຸດິບອັດຕະໂນມັດ</p>
            </div>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="crystal-input !py-1.5 !text-xs font-mono font-bold"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recipesWithCalculatedCosts.map((rec) => (
              <div key={rec.id} className="p-4 rounded-2xl bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200/60 dark:border-neutral-800 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-white">{rec.menuName}</h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-sky-500 font-mono font-bold">
                      ຂາຍ: {Number(rec.sellingPrice || 0).toLocaleString()} ₭
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      (ຕົ້ນທຶນ: {Math.round(rec.totalCostPerCup).toLocaleString()} ₭)
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setQuantitiesSold(prev => ({ ...prev, [rec.id]: Math.max(0, (prev[rec.id] || 0) - 1) }))} 
                    className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-neutral-800 font-bold cursor-pointer"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="0"
                    value={quantitiesSold[rec.id] || 0}
                    onChange={(e) => setQuantitiesSold(prev => ({ ...prev, [rec.id]: parseInt(e.target.value) || 0 }))}
                    className="w-14 py-1 font-bold text-center border rounded-xl dark:bg-black/30 text-sm font-mono"
                  />
                  <button 
                    onClick={() => setQuantitiesSold(prev => ({ ...prev, [rec.id]: (prev[rec.id] || 0) + 1 }))} 
                    className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-neutral-800 font-bold cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-neutral-800">
            <button
              onClick={async () => {
                setIsDeducting(true);
                try {
                  await setDoc(doc(db, 'menu_sales', selectedDate), {
                    date: selectedDate,
                    itemsSold: quantitiesSold,
                    updatedAt: serverTimestamp()
                  }, { merge: true });
                  alert("ບັນທຶກຍອດຂາຍ ແລະ ຕັດສາງອັດຕະໂນມັດສຳເລັດ!");
                } finally {
                  setIsDeducting(false);
                }
              }}
              disabled={isDeducting}
              className="crystal-button"
            >
              {isDeducting ? 'Deducting...' : 'Commit & Deduct Stock'}
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: INVENTORY BALANCES WITH BOTTLE GAUGE (ml) */}
      {subTab === 'balances' && (
        <div className="high-density-card p-6 overflow-hidden space-y-4">
          <div className="border-b border-neutral-800 pb-3">
            <h3 className="text-sm font-serif text-slate-800 dark:text-white">ຍອດຄັງສາງຄົງເຫຼືອທັງໝົດ</h3>
            <p className="text-xs text-slate-400">ສິນຄ້າທີ່ເປັນ ml ຈະສະແດງລະດັບນ້ຳໃນຂວດ ແລະ %</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-neutral-900/60 text-[10px] font-black uppercase text-slate-400">
                <tr>
                  <th className="p-3">ສິນຄ້າ</th>
                  <th className="p-3">ສະຖານະຂວດນ້ຳ (ml & %)</th>
                  <th className="p-3 text-center">ຍອດຊື້ເຂົ້າ</th>
                  <th className="p-3 text-center">ຍອດຕັດອອກ</th>
                  <th className="p-3 text-center">ຍອດເຫຼືອຕົວຈິງ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                {inventoryBalances.map(item => {
                  const isLiquid = item.unit === 'ml' || item.unitLabel === 'ml';

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-neutral-800/30">
                      <td className="p-3 font-bold text-slate-800 dark:text-white">
                        <div className="flex items-center gap-2">
                          {item.productImage && (
                            <img src={item.productImage} alt={item.name} className="w-8 h-8 rounded-lg object-cover border border-neutral-700" />
                          )}
                          <span>{item.name}</span>
                        </div>
                      </td>

                      <td className="p-3">
                        {isLiquid ? (
                          <BottleGauge currentMl={item.finalBalance} packSize={item.packSize || 1000} />
                        ) : (
                          <span className="text-slate-400 font-mono">-</span>
                        )}
                      </td>

                      <td className="p-3 text-center font-mono text-slate-500">{item.totalIn.toLocaleString()} {item.unit || item.unitLabel}</td>
                      <td className="p-3 text-center font-mono text-rose-500">-{Math.round(item.totalConsumed).toLocaleString()} {item.unit || item.unitLabel}</td>
                      <td className="p-3 text-center font-mono font-black text-emerald-500 text-sm">
                        {Math.round(item.finalBalance).toLocaleString()} {item.unit || item.unitLabel}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 🚀 MODAL: RECIPE BUILDER (ມີຕັ້ງລາຄາຂາຍ + NOTE ການຕັ້ງລາຄາ & ກຳໄລ) */}
      <AnimatePresence>
        {isRecipeModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              className="bg-white dark:bg-[#141414] rounded-3xl border border-slate-200 dark:border-neutral-800 w-full max-w-2xl shadow-2xl p-6 md:p-8 space-y-6 max-h-[92vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center border-b border-slate-100 dark:border-neutral-800 pb-3">
                <div>
                  <h3 className="text-base font-serif text-slate-800 dark:text-white flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-emerald-500" />
                    <span>{editingRecipe ? 'ແກ້ໄຂສູດ & ລາຄາຂາຍ' : 'ສ້າງສູດເຄື່ອງດື່ມ / Cookie (Recipe & Pricing)'}</span>
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    ກຳນົດຕົ້ນທຶນວັດຖຸດິບ, ບວກຄ່າໄຟ-ນ້ຳ, ຕັ້ງລາຄາຂາຍ ແລະ ຂຽນ Note ເປົ້າໝາຍກຳໄລ
                  </p>
                </div>
                <button onClick={() => setIsRecipeModalOpen(false)} className="text-slate-400 hover:text-white p-1">✕</button>
              </div>

              <form onSubmit={handleSaveRecipe} className="space-y-5">
                <div>
                  <label className="label-xs block mb-1">ຊື່ເມນູ / ສູດ (Drink or Cookie Name)</label>
                  <input
                    type="text"
                    required
                    placeholder="ໃສ່ຊື່ເມນູ ເຊັ່ນ: Choc-Chip Cookie, Caramel Latte..."
                    value={menuName}
                    onChange={e => setMenuName(e.target.value)}
                    className="crystal-input w-full !text-sm font-bold"
                  />
                </div>

                {/* 💵 1. OVERHEAD & SELLING PRICE INPUTS */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  
                  {/* Overhead Cost */}
                  <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/20 space-y-1">
                    <label className="label-xs !text-sky-500 flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5" />
                      <span>ຕົ້ນທຶນດຳເນີນງານ (ຄ່ານ້ຳ, ໄຟ, ແກ້ວ/ຖົງ)</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={overheadCost}
                        onChange={e => setOverheadCost(e.target.value)}
                        className="crystal-input w-full font-mono font-bold text-center !py-1.5"
                        placeholder="1500"
                      />
                      <span className="text-xs font-mono font-bold text-slate-400 shrink-0">₭ / ໜ່ວຍ</span>
                    </div>
                  </div>

                  {/* ✨ ລາຄາຂາຍໜ້າຮ້ານ (SELLING PRICE) */}
                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
                    <label className="label-xs !text-emerald-500 flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5" />
                      <span>ລາຄາຂາຍທີ່ກຳນົດ (Target Selling Price)</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={sellingPrice}
                        onChange={e => setSellingPrice(e.target.value)}
                        className="crystal-input w-full font-mono font-bold text-center !py-1.5"
                        placeholder="35000"
                      />
                      <span className="text-xs font-mono font-bold text-emerald-500 shrink-0">₭</span>
                    </div>
                  </div>

                </div>

                {/* 🌟 2. NOTE ການຕັ້ງລາຄາ & ເປົ້າໝາຍກຳໄລ (PRICING STRATEGY NOTE) */}
                <div className="space-y-1">
                  <label className="label-xs flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                    <Tag className="w-3.5 h-3.5" />
                    <span>Note ກຳກັບການຕັ້ງລາຄາ & ເປົ້າໝາຍກຳໄລ (Pricing Strategy & Profit Target)</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="ຕົວຢ່າງ: ຕົ້ນທຶນວັດຖຸດິບ 15,000₭ ບວກຕົ້ນທຶນດຳເນີນງານ 1,500₭ = ຕົ້ນທຶນລວມ 16,500₭, ຂາຍໃນລາຄາ 35,000₭, ໄດ້ກຳໄລ 18,500₭/ຈອກ..."
                    value={pricingNote}
                    onChange={e => setPricingNote(e.target.value)}
                    className="crystal-input w-full !text-xs font-normal leading-relaxed resize-none"
                  />
                </div>

                {/* 3. NOTE ວິທີເຮັດ & ເທັກນິກ (RECIPE INSTRUCTION NOTE) */}
                <div className="space-y-1">
                  <label className="label-xs flex items-center gap-1.5 text-slate-500 dark:text-neutral-400">
                    <FileText className="w-3.5 h-3.5 text-amber-500" />
                    <span>Note ວິທີເຮັດ & ເທັກນິກ (Recipe Instructions & Method)</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="ເຊັ່ນ: ອົບອຸນຫະພູມ 175°C ເວລາ 12-14 ນາທີ, ຕີເນີຍກັບນ້ຳຕານໃຫ້ຂຶ້ນຟູກ່ອນໃສ່ໄຂ່..."
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    className="crystal-input w-full !text-xs font-normal leading-relaxed resize-none"
                  />
                </div>

                {/* INGREDIENTS LIST WITH 1/4 & 1/2 TEASPOON QUICK BUTTONS */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="label-xs">ລາຍການວັດຖຸດິບໃນສູດ</label>
                    <button
                      type="button"
                      onClick={handleAddIngredientRow}
                      className="text-xs font-bold text-sky-500 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ ເພີ່ມວັດຖຸດິບ</span>
                    </button>
                  </div>

                  <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                    {recipeIngredients.map((ing, idx) => {
                      const currentVal = ing.productId ? `${ing.productId}_${ing.supplier || ''}` : '';
                      const amt = Number(ing.amount) || 0;
                      const u = (ing.unit || 'g').toLowerCase();

                      let baseUnits = amt;
                      if (u === 'tsp' || u === 'ຊ້ອນຊາ') baseUnits = amt * 5;
                      else if (u === 'tbsp' || u === 'ຊ້ອນໂຕະ') baseUnits = amt * 15;

                      const itemTotalCost = baseUnits * (ing.unitCostLAK || 0);

                      return (
                        <div key={idx} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200/70 dark:border-neutral-800 space-y-3">
                          
                          {/* DROPDOWN SUPPLIER */}
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <select
                                required
                                value={currentVal}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const opt = supplierProductOptions.find(o => `${o.productId}_${o.supplier}` === val);
                                  if (opt) {
                                    setRecipeIngredients(prev => prev.map((it, i) => i === idx ? {
                                      ...it,
                                      productId: opt.productId,
                                      name: opt.name,
                                      supplier: opt.supplier,
                                      unit: opt.unit,
                                      packSize: opt.packSize,
                                      unitCostLAK: opt.unitCostLAK
                                    } : it));
                                  } else {
                                    const pId = val.split('_')[0];
                                    const pr = products.find(p => p.id === pId);
                                    if (pr) {
                                      setRecipeIngredients(prev => prev.map((it, i) => i === idx ? {
                                        ...it,
                                        productId: pr.id,
                                        name: pr.name,
                                        supplier: '',
                                        unit: pr.unit || 'g',
                                        packSize: pr.packSize || 1000,
                                        unitCostLAK: 0
                                      } : it));
                                    }
                                  }
                                }}
                                className="crystal-input w-full font-bold !py-2 text-xs cursor-pointer"
                              >
                                <option value="">-- ເລືອກວັດຖຸດິບຈາກ Supplier --</option>
                                {supplierProductOptions.length > 0 && (
                                  <optgroup label="📦 ລາຍການທີ່ມີບັນທຶກລາຄາຈາກ Supplier (ແນະນຳ)">
                                    {supplierProductOptions.map(opt => (
                                      <option key={`${opt.productId}_${opt.supplier}`} value={`${opt.productId}_${opt.supplier}`}>
                                        {opt.name} • {opt.supplier} (ຕົ້ນທຶນ: {Math.round(opt.unitCostLAK).toLocaleString()} ₭/{opt.unit})
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                                {products.length > 0 && (
                                  <optgroup label="📋 ສິນຄ້າທົ່ວໄປ (ຍັງບໍ່ມີໃບບິນ Supplier)">
                                    {products.map(p => (
                                      <option key={p.id} value={`${p.id}_`}>
                                        {p.name} ({p.unit || 'g'})
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                              </select>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveIngredientRow(idx)}
                              className="p-2 text-slate-400 hover:text-rose-500 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          {/* ຈຳນວນ, ຫົວໜ່ວຍ & ຕົ້ນທຶນ */}
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                            <div className="sm:col-span-5">
                              <span className="text-[9px] text-slate-400 block mb-0.5">ຈຳນວນທີ່ໃຊ້</span>
                              <input
                                type="number"
                                step="any"
                                required
                                placeholder="ເຊັ່ນ: 0.25 ຫຼື 18"
                                value={ing.amount}
                                onChange={e => setRecipeIngredients(prev => prev.map((it, i) => i === idx ? { ...it, amount: e.target.value } : it))}
                                className="crystal-input w-full !text-xs font-mono font-bold text-center !py-1.5"
                              />
                            </div>

                            <div className="sm:col-span-3">
                              <span className="text-[9px] text-slate-400 block mb-0.5">ຫົວໜ່ວຍ</span>
                              <select
                                value={ing.unit}
                                onChange={e => setRecipeIngredients(prev => prev.map((it, i) => i === idx ? { ...it, unit: e.target.value } : it))}
                                className="crystal-input w-full !text-xs font-bold text-center !py-1.5 cursor-pointer"
                              >
                                <option value="g">g (ກຣາມ)</option>
                                <option value="ml">ml (ມິນລິລິດ)</option>
                                <option value="tsp">tsp (ຊ້ອນຊາ)</option>
                                <option value="tbsp">tbsp (ຊ້ອນໂຕະ)</option>
                                <option value="pcs">pcs (ອັນ/ຊິ້ນ)</option>
                              </select>
                            </div>

                            <div className="sm:col-span-4 p-2 rounded-xl bg-slate-100 dark:bg-[#202020] text-right font-mono">
                              <span className="text-[8px] text-slate-400 block uppercase">
                                ຕົ້ນທຶນ {u === 'tsp' ? `(≈${baseUnits}g)` : u === 'tbsp' ? `(≈${baseUnits}g)` : ''}:
                              </span>
                              <span className="text-xs font-black text-emerald-500">
                                ≈ {Math.round(itemTotalCost).toLocaleString()} ₭
                              </span>
                            </div>
                          </div>

                          {/* 🥄 ປຸ່ມເລືອກດ່ວນ: 1/4 ຊ້ອນຊາ, 1/2 ຊ້ອນຊາ, 1 ຊ້ອນຊາ, 1 ຊ້ອນໂຕະ */}
                          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-200/50 dark:border-neutral-800/60">
                            <span className="text-[9px] text-slate-400 font-bold flex items-center gap-1 mr-1">
                              <Utensils className="w-3 h-3 text-amber-500" />
                              <span>ກົດໃສ່ດ່ວນ:</span>
                            </span>

                            <button
                              type="button"
                              onClick={() => setRecipeIngredients(prev => prev.map((it, i) => i === idx ? { ...it, amount: 0.25, unit: 'tsp' } : it))}
                              className="px-2 py-0.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 font-mono text-[9px] font-bold border border-amber-500/20 cursor-pointer"
                            >
                              1/4 ຊ້ອນຊາ (0.25 tsp ≈ 1.25g)
                            </button>

                            <button
                              type="button"
                              onClick={() => setRecipeIngredients(prev => prev.map((it, i) => i === idx ? { ...it, amount: 0.5, unit: 'tsp' } : it))}
                              className="px-2 py-0.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 font-mono text-[9px] font-bold border border-amber-500/20 cursor-pointer"
                            >
                              1/2 ຊ້ອນຊາ (0.50 tsp ≈ 2.5g)
                            </button>

                            <button
                              type="button"
                              onClick={() => setRecipeIngredients(prev => prev.map((it, i) => i === idx ? { ...it, amount: 1, unit: 'tsp' } : it))}
                              className="px-2 py-0.5 rounded-lg bg-neutral-200/80 dark:bg-neutral-800 hover:bg-neutral-300 text-slate-600 dark:text-neutral-300 font-mono text-[9px] font-bold cursor-pointer"
                            >
                              1 ຊ້ອນຊາ (5g)
                            </button>

                            <button
                              type="button"
                              onClick={() => setRecipeIngredients(prev => prev.map((it, i) => i === idx ? { ...it, amount: 1, unit: 'tbsp' } : it))}
                              className="px-2 py-0.5 rounded-lg bg-neutral-200/80 dark:bg-neutral-800 hover:bg-neutral-300 text-slate-600 dark:text-neutral-300 font-mono text-[9px] font-bold cursor-pointer"
                            >
                              1 ຊ້ອນໂຕະ (15g)
                            </button>
                          </div>

                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 🌟 4. LIVE PRICING & PROFIT BREAKDOWN CARD IN MODAL */}
                <div className="p-4 rounded-2xl bg-neutral-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 space-y-2 font-mono">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">ຕົ້ນທຶນວັດຖຸດິບ (Raw Cost):</span>
                    <span>{Math.round(currentModalCalculation.rawCost).toLocaleString()} ₭</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">+ ຕົ້ນທຶນດຳເນີນງານ (Overhead):</span>
                    <span>+{Math.round(currentModalCalculation.overhead).toLocaleString()} ₭</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-bold border-t border-slate-200 dark:border-neutral-800 pt-1.5">
                    <span>= ຕົ້ນທຶນຕົວຈິງລວມ:</span>
                    <span className="text-slate-900 dark:text-white">{Math.round(currentModalCalculation.totalCost).toLocaleString()} ₭</span>
                  </div>
                  <div className="flex justify-between items-center text-sm font-black border-t border-slate-200 dark:border-neutral-800 pt-1.5">
                    <span className="text-emerald-600 dark:text-emerald-400">ກຳໄລສຸດທິຄາດຄະເນ (Net Profit):</span>
                    <span className={currentModalCalculation.netProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                      +{Math.round(currentModalCalculation.netProfit).toLocaleString()} ₭ ({currentModalCalculation.margin.toFixed(1)}%)
                    </span>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-neutral-800">
                  <button
                    type="button"
                    onClick={() => setIsRecipeModalOpen(false)}
                    className="px-4 py-2.5 border border-slate-200 dark:border-neutral-800 rounded-xl text-xs font-bold text-slate-400 cursor-pointer"
                  >
                    ຍົກເລີກ
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingRecipe}
                    className="crystal-button"
                  >
                    {isSavingRecipe ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກສູດ & ການຕັ້ງລາຄາ'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
