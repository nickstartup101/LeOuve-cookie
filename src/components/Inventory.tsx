import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, query, onSnapshot, addDoc, setDoc, deleteDoc, doc, serverTimestamp 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useTranslation } from 'react-i18next';
import { 
  BookOpen, Plus, Trash2, Edit2, Calendar, 
  Package, ShoppingCart, Layers, Zap, Utensils, FileText,
  DollarSign, TrendingUp, Sparkles, Tag, Upload, X, Receipt, Printer, CheckCircle2, QrCode
} from 'lucide-react';
import { format } from 'date-fns';

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
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
};

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
  const [subTab, setSubTab] = useState<'recipes' | 'sales' | 'balances'>('sales');
  
  const [products, setProducts] = useState<any[]>([]);
  const [supplierPrices, setSupplierPrices] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [salesRecords, setSalesRecords] = useState<any[]>([]);
  const [adjustments, setAdjustments] = useState<any[]>([]);

  // Recipe Builder Form State
  const [menuName, setMenuName] = useState('');
  const [batchYield, setBatchYield] = useState<number | string>(10);
  const [overheadCost, setOverheadCost] = useState<number | string>(1500);
  const [sellingPrice, setSellingPrice] = useState<number | string>(25000);
  const [pricingNote, setPricingNote] = useState('');
  const [note, setNote] = useState('');
  const [recipeImage, setRecipeImage] = useState('');
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredientRow[]>([]);
  const [editingRecipe, setEditingRecipe] = useState<any | null>(null);
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);

  // Sales State
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [quantitiesSold, setQuantitiesSold] = useState<{ [recipeId: string]: number }>({});
  const [isDeducting, setIsDeducting] = useState(false);

  // 🌟 COMBINED DAILY SALES POS RECEIPT STATE (ບິນ POS ລວມທຸກເມນູ)
  const [isCombinedBillOpen, setIsCombinedBillOpen] = useState(false);
  const [combinedBillData, setCombinedBillData] = useState<{
    date: string;
    items: any[];
    totalRevenue: number;
    totalCost: number;
    totalProfit: number;
    totalQty: number;
    billNo: string;
  } | null>(null);

  const printBillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubP = onSnapshot(query(collection(db, 'products')), snap => setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubS = onSnapshot(query(collection(db, 'supplierPrices')), snap => setSupplierPrices(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubR = onSnapshot(query(collection(db, 'recipes')), snap => setRecipes(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubSales = onSnapshot(query(collection(db, 'menu_sales')), snap => setSalesRecords(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubAdj = onSnapshot(query(collection(db, 'inventory')), snap => setAdjustments(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { unsubP(); unsubS(); unsubR(); unsubSales(); unsubAdj(); };
  }, []);

  // Pre-fill quantitiesSold when date shifts
  useEffect(() => {
    const existingRec = salesRecords.find(r => r.date === selectedDate);
    if (existingRec && existingRec.itemsSold) {
      const qSelected: { [id: string]: number } = {};
      recipes.forEach(rec => { qSelected[rec.id] = existingRec.itemsSold[rec.id] || 0; });
      setQuantitiesSold(qSelected);
    } else {
      const qClear: { [id: string]: number } = {};
      recipes.forEach(rec => { qClear[rec.id] = 0; });
      setQuantitiesSold(qClear);
    }
  }, [selectedDate, recipes, salesRecords]);

  // Dropdown options from Supplier Prices
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

  // Recipes with Calculated Costs
  const recipesWithCalculatedCosts = useMemo(() => {
    return recipes.map(recipe => {
      let totalBatchRawCost = 0;
      const yieldCount = Math.max(1, Number(recipe.batchYield) || 1);

      const parsedIngredients = (recipe.ingredients || []).map((ing: any) => {
        const pr = products.find(p => p.id === ing.productId);
        const unitCost = ing.unitCostLAK || 0;
        const amt = Number(ing.amount) || 0;
        const u = (ing.unit || pr?.unit || 'g').toLowerCase();

        let baseUnits = amt;
        if (u === 'tsp' || u === 'ຊ້ອນຊາ') baseUnits = amt * 5;
        else if (u === 'tbsp' || u === 'ຊ້ອນໂຕະ') baseUnits = amt * 15;

        const costForBatch = unitCost > 0 ? baseUnits * unitCost : 0;
        totalBatchRawCost += costForBatch;

        return {
          ...ing,
          productName: pr?.name || ing.name || 'Item',
          supplier: ing.supplier || '',
          unitLabel: ing.unit || pr?.unit || 'g',
          baseUnits,
          costForBatch,
          costPerUnit: costForBatch / yieldCount
        };
      });

      const overhead = Number(recipe.overheadCost) || 0;
      const rawCostPerUnit = totalBatchRawCost / yieldCount;
      const totalCostPerUnit = rawCostPerUnit + overhead;
      const price = Number(recipe.sellingPrice) || 0;
      const netProfitPerUnit = price > 0 ? price - totalCostPerUnit : 0;
      const profitMarginPercent = price > 0 ? (netProfitPerUnit / price) * 100 : 0;

      return {
        ...recipe,
        ingredientsDetailed: parsedIngredients,
        totalBatchRawCost,
        batchYield: yieldCount,
        rawCostPerUnit,
        overheadCost: overhead,
        totalCostPerUnit,
        sellingPrice: price,
        netProfitPerUnit,
        profitMarginPercent,
        recipeImage: recipe.recipeImage || '',
        pricingNote: recipe.pricingNote || '',
        note: recipe.note || ''
      };
    });
  }, [recipes, products]);

  // Inventory Balances with Yield-Based Consumption
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
            const yieldCount = Math.max(1, Number(recipe.batchYield) || 1);
            const ing = (recipe.ingredients || []).find((i: any) => i.productId === p.id);
            if (ing) {
              const amt = Number(ing.amount) || 0;
              const u = (ing.unit || p.unit || 'g').toLowerCase();
              let baseUnits = amt;
              if (u === 'tsp' || u === 'ຊ້ອນຊາ') baseUnits = amt * 5;
              else if (u === 'tbsp' || u === 'ຊ້ອນໂຕະ') baseUnits = amt * 15;
              totalConsumed += (baseUnits / yieldCount) * qtySold;
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

  // 🚀 CORE HANDLER: COMMIT & DEDUCT STOCK ALL ➔ ສ້າງໃບບິນ POS ລວມ + RESET ເປັນ 0
  const handleCommitAndDeductAll = async () => {
    // 1. ກັ່ນຕອງສະເພາະເມນູທີ່ມີການຂາຍ > 0
    const activeSoldItems = recipesWithCalculatedCosts
      .filter(r => (quantitiesSold[r.id] || 0) > 0)
      .map(r => {
        const qty = quantitiesSold[r.id];
        const lineRevenue = qty * (r.sellingPrice || 0);
        const lineCost = qty * (r.totalCostPerUnit || 0);
        const lineProfit = qty * (r.netProfitPerUnit || 0);
        return {
          ...r,
          soldQty: qty,
          lineRevenue,
          lineCost,
          lineProfit
        };
      });

    if (activeSoldItems.length === 0) {
      alert("ກະລຸນາໃສ່ຈຳນວນຂາຍ (+) ຢ່າງໜ້ອຍ 1 ເມນູກ່ອນກົດ Commit!");
      return;
    }

    setIsDeducting(true);
    try {
      // 2. ບັນທຶກລົງ menu_sales ເພື່ອຕັດສະຕັອກ
      await setDoc(doc(db, 'menu_sales', selectedDate), {
        date: selectedDate,
        itemsSold: quantitiesSold,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // 3. ຄິດໄລ່ຍອດລວມທັງໝົດຂອງໃບບິນ
      const totalRevenue = activeSoldItems.reduce((sum, it) => sum + it.lineRevenue, 0);
      const totalCost = activeSoldItems.reduce((sum, it) => sum + it.lineCost, 0);
      const totalProfit = activeSoldItems.reduce((sum, it) => sum + it.lineProfit, 0);
      const totalQty = activeSoldItems.reduce((sum, it) => sum + it.soldQty, 0);

      // 4. ສົ່ງລາຍຮັບເຂົ້າບັນຊີ Finance (Transactions) ອັດຕະໂນມັດ
      if (totalRevenue > 0) {
        await addDoc(collection(db, 'transactions'), {
          type: 'income',
          amount: totalRevenue,
          category: 'ຂາຍເຄື່ອງດື່ມ & ເຂົ້າໜົມ (Sales)',
          source: 'onepay',
          description: `ຍອດຂາຍລວມປະຈຳວັນ ${selectedDate} (ລວມ ${totalQty} ລາຍການ)`,
          date: selectedDate,
          time: format(new Date(), 'HH:mm'),
          createdAt: serverTimestamp()
        });
      }

      // 5. ເປີດໃບບິນ POS ລວມ (Virtual Bill) ຂຶ້ນມາສະແດງທັນທີ
      const randomBillNo = `POS-${selectedDate.replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
      setCombinedBillData({
        date: selectedDate,
        items: activeSoldItems,
        totalRevenue,
        totalCost,
        totalProfit,
        totalQty,
        billNo: randomBillNo
      });
      setIsCombinedBillOpen(true);

      // 🌟 6. ຣີເຊັດຕົວເລກ + / - ກັບມາເປັນ 0 ທັງໝົດຕາມທີ່ທ່ານຕ້ອງການ!
      const resetMap: { [id: string]: number } = {};
      recipes.forEach(rec => { resetMap[rec.id] = 0; });
      setQuantitiesSold(resetMap);

    } catch (e: any) {
      alert("Error committing sales: " + e.message);
    } finally {
      setIsDeducting(false);
    }
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  return (
    <div className="space-y-6 font-sans pb-16">
      
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4 p-6 bg-white dark:bg-[#141414] rounded-3xl border border-slate-200/80 dark:border-neutral-800 shadow-sm">
        <div>
          <span className="bg-[#052659] dark:bg-white dark:text-neutral-950 text-white text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest">
            Le Ouve Bakery & Cafe Formulation
          </span>
          <h1 className="text-2xl md:text-3xl font-serif text-slate-800 dark:text-white mt-1">
            ສູດຄຸກກີ້, ເຂົ້າໜົມ & ໃບບິນຂາຍລາຍວັນ
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            ຕັດສະຕັອກຕາມອັດຕາສ່ວນຂາຍ (Batch Yield) ແລະ ອອກໃບບິນ POS ລວມທຸກເມນູອັດຕະໂນມັດ
          </p>
        </div>

        <button
          onClick={() => {
            setEditingRecipe(null);
            setMenuName('');
            setBatchYield(10);
            setOverheadCost(1500);
            setSellingPrice(25000);
            setRecipeImage('');
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
          onClick={() => setSubTab('sales')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${subTab === 'sales' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'bg-white dark:bg-[#141414] border border-slate-200 dark:border-neutral-800 text-slate-400'}`}
        >
          <Receipt className="w-3.5 h-3.5" />
          <span>ຍອດຂາຍລາຍວັນ & Virtual Bill</span>
        </button>
        <button
          onClick={() => setSubTab('recipes')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${subTab === 'recipes' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'bg-white dark:bg-[#141414] border border-slate-200 dark:border-neutral-800 text-slate-400'}`}
        >
          ສູດທັງໝົດ (Recipes & Costing)
        </button>
        <button
          onClick={() => setSubTab('balances')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${subTab === 'balances' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'bg-white dark:bg-[#141414] border border-slate-200 dark:border-neutral-800 text-slate-400'}`}
        >
          ຍອດຄັງສາງ (ຂວດ ml)
        </button>
      </div>

      {/* 🌟 TAB 1: DAILY SALES & MENU CARDS */}
      {subTab === 'sales' && (
        <div className="space-y-6">
          <div className="high-density-card p-6 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
            <div>
              <h3 className="text-base font-serif text-slate-800 dark:text-white">Daily Sales & Menu Cards</h3>
              <p className="text-xs text-slate-400">ໃສ່ຈຳນວນທີ່ຂາຍໄດ້ ແລ້ວກົດ Commit ດ້ານລຸ່ມເພື່ອອອກບິນ POS ແລະ ຕັດສາງ</p>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="crystal-input !py-1.5 !text-xs font-mono font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recipesWithCalculatedCosts.map((rec) => {
              const qtySold = quantitiesSold[rec.id] || 0;
              const totalItemRevenue = qtySold * (rec.sellingPrice || 0);
              const totalItemProfit = qtySold * (rec.netProfitPerUnit || 0);

              return (
                <div key={rec.id} className="high-density-card p-5 space-y-4 flex flex-col justify-between">
                  <div>
                    {/* Header: Photo + Name */}
                    <div className="flex items-center gap-3">
                      {rec.recipeImage ? (
                        <img src={rec.recipeImage} alt={rec.menuName} className="w-14 h-14 rounded-2xl object-cover border border-neutral-700 shrink-0" />
                      ) : (
                        <div className="w-14 h-14 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-slate-400 shrink-0">
                          <Package className="w-6 h-6" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-slate-800 dark:text-white truncate">{rec.menuName}</h4>
                        <span className="text-[10px] text-slate-400 font-mono">
                          ຂາຍ: {Number(rec.sellingPrice).toLocaleString()} ₭ (ຕົ້ນທຶນ: {Math.round(rec.totalCostPerUnit).toLocaleString()} ₭)
                        </span>
                      </div>
                    </div>

                    {/* Sales Input Counter (+ / -) */}
                    <div className="mt-4 p-3 rounded-2xl bg-slate-50 dark:bg-[#1a1a1a] flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 dark:text-neutral-300">ຍອດຂາຍມື້ນີ້:</span>
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

                    {/* Live Row Output */}
                    {qtySold > 0 && (
                      <div className="mt-2 text-xs font-mono space-y-0.5 pt-1">
                        <div className="flex justify-between text-slate-500">
                          <span>ລາຍຮັບ:</span>
                          <span className="font-bold text-sky-500">+{totalItemRevenue.toLocaleString()} ₭</span>
                        </div>
                        <div className="flex justify-between text-slate-500">
                          <span>ກຳໄລ:</span>
                          <span className="font-bold text-emerald-500">+{Math.round(totalItemProfit).toLocaleString()} ₭</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 🌟 ປຸ່ມ COMMIT: ກົດແລ້ວອອກບິນ POS ລວມທຸກເມນູ + ຣີເຊັດຕົວເລກເປັນ 0 */}
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 pt-4 border-t border-slate-100 dark:border-neutral-800">
            <div>
              <p className="text-xs font-bold text-slate-800 dark:text-white">
                ລວມຈຳນວນທີ່ເລືອກ: {Object.values(quantitiesSold).reduce((a, b) => a + b, 0)} ລາຍການ
              </p>
              <p className="text-[10px] text-slate-400">
                ກົດປຸ່ມດ້ານຂວາເພື່ອຕັດສະຕັອກ, ອອກໃບບິນ POS ລວມ ແລະ ຣີເຊັດຕົວເລກກັບເປັນ 0
              </p>
            </div>

            <button
              onClick={handleCommitAndDeductAll}
              disabled={isDeducting || Object.values(quantitiesSold).every(v => v === 0)}
              className="crystal-button !py-3.5 !px-8 text-xs font-black tracking-wider uppercase shadow-xl flex items-center gap-2 cursor-pointer disabled:opacity-40"
            >
              <Receipt className="w-4 h-4" />
              <span>{isDeducting ? 'PROCESSING...' : 'COMMIT & DEDUCT STOCK ALL'}</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: RECIPES CARDS */}
      {subTab === 'recipes' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {recipesWithCalculatedCosts.map((recipe) => (
            <div key={recipe.id} className="high-density-card p-6 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-start gap-3 border-b border-slate-100 dark:border-neutral-800 pb-3">
                  {recipe.recipeImage ? (
                    <img src={recipe.recipeImage} alt={recipe.menuName} className="w-14 h-14 rounded-2xl object-cover border border-neutral-700 shadow-sm shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-slate-400 shrink-0">
                      <Package className="w-6 h-6" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <h4 className="text-base font-serif text-slate-800 dark:text-white truncate">{recipe.menuName}</h4>
                    <span className="text-[10px] text-slate-400 font-mono block">
                      1 ສູດ = {recipe.batchYield} ກ້ອນ/ຈອກ
                    </span>
                    <span className="text-xs font-mono font-bold text-sky-500 block mt-0.5">
                      ຂາຍ: {Number(recipe.sellingPrice).toLocaleString()} ₭
                    </span>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-sm font-black font-mono text-emerald-500 block">
                      {Math.round(recipe.totalCostPerUnit).toLocaleString()} ₭
                    </span>
                    <span className="text-[9px] text-slate-400 block font-normal">ຕົ້ນທຶນ/ກ້ອນ</span>
                  </div>
                </div>

                <div className="mt-3 p-3 rounded-2xl bg-slate-50 dark:bg-[#1a1a1a] text-xs space-y-1 font-mono">
                  <div className="flex justify-between text-slate-500">
                    <span>ວັດຖຸດິບຕໍ່ກ້ອນ ({Math.round(recipe.totalBatchRawCost).toLocaleString()} ÷ {recipe.batchYield}):</span>
                    <span>{Math.round(recipe.rawCostPerUnit).toLocaleString()} ₭</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>+ ຄ່າໄຟ-ນ້ຳຕໍ່ກ້ອນ:</span>
                    <span>+{Math.round(recipe.overheadCost).toLocaleString()} ₭</span>
                  </div>
                  
                  {recipe.sellingPrice > 0 && (
                    <div className="border-t border-slate-200 dark:border-neutral-800 pt-1 flex justify-between items-center text-xs font-bold">
                      <span className="text-slate-700 dark:text-neutral-200">ກຳໄລຕໍ່ກ້ອນ:</span>
                      <span className={`font-black ${recipe.netProfitPerUnit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        +{Math.round(recipe.netProfitPerUnit).toLocaleString()} ₭ ({recipe.profitMarginPercent.toFixed(1)}%)
                      </span>
                    </div>
                  )}
                </div>

                {recipe.pricingNote && (
                  <div className="mt-2.5 p-3 rounded-2xl bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/15 text-xs">
                    <span className="text-[9px] font-bold uppercase text-emerald-600 dark:text-emerald-400 block">💡 Note ການຕັ້ງລາຄາ:</span>
                    <p className="text-slate-600 dark:text-neutral-300 font-light mt-0.5">{recipe.pricingNote}</p>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-neutral-800">
                <button
                  onClick={() => {
                    setEditingRecipe(recipe);
                    setMenuName(recipe.menuName);
                    setBatchYield(recipe.batchYield || 10);
                    setOverheadCost(recipe.overheadCost || 1500);
                    setSellingPrice(recipe.sellingPrice || 25000);
                    setRecipeImage(recipe.recipeImage || '');
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
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => deleteDoc(doc(db, 'recipes', recipe.id))}
                  className="p-2 text-slate-400 hover:text-rose-500 rounded-lg cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: INVENTORY BALANCES */}
      {subTab === 'balances' && (
        <div className="high-density-card p-6 overflow-hidden space-y-4">
          <div className="border-b border-neutral-800 pb-3">
            <h3 className="text-sm font-serif text-slate-800 dark:text-white">ຍອດຄັງສາງຄົງເຫຼືອທັງໝົດ</h3>
            <p className="text-xs text-slate-400">ຕັດສາງຕາມອັດຕາສ່ວນຂາຍ (ຈຳນວນຂາຍ ÷ Yield) × ວັດຖຸດິບຕໍ່ເຕົາ</p>
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

      {/* 🌟 ໃບບິນ POS ລວມທຸກເມນູ (COMBINED POS SALES RECEIPT WITH PRODUCT PHOTOS) */}
      <AnimatePresence>
        {isCombinedBillOpen && combinedBillData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setIsCombinedBillOpen(false)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              className="bg-[#faf7f0] text-slate-800 w-full max-w-md rounded-3xl p-6 shadow-2xl relative border-t-8 border-dashed border-[#052659] max-h-[92vh] overflow-y-auto"
              style={{ fontFamily: "'Courier New', Courier, monospace" }}
              onClick={e => e.stopPropagation()}
              ref={printBillRef}
            >
              {/* Close Button */}
              <button 
                onClick={() => setIsCombinedBillOpen(false)} 
                className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-200/60 hover:bg-slate-300 text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Receipt Header */}
              <div className="text-center space-y-1 border-b border-dashed border-slate-300 pb-3">
                <h2 className="text-xl font-serif font-black uppercase text-slate-900 tracking-tight">
                  LE OUVE WORKSPACE
                </h2>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest leading-none">
                  Bakery & Cafe Architecture
                </p>
                <p className="text-[10px] text-slate-500">Vientiane, Lao PDR</p>
                <div className="pt-2 text-[10px] text-slate-500 flex justify-between">
                  <span>BILL: {combinedBillData.billNo}</span>
                  <span>DATE: {combinedBillData.date}</span>
                </div>
              </div>

              {/* Consolidated Line Items with Photos */}
              <div className="py-3 space-y-2.5 border-b border-dashed border-slate-300">
                <div className="text-[10px] font-bold text-slate-400 flex justify-between pb-1 border-b border-dotted border-slate-200 uppercase">
                  <span>MENU ITEM</span>
                  <span>QTY × PRICE</span>
                  <span>TOTAL (₭)</span>
                </div>

                {combinedBillData.items.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-2.5 py-1">
                    {/* 📸 ຮູບສິນຄ້າຕິດໄປໃນໃບບິນ POS */}
                    {it.recipeImage ? (
                      <img src={it.recipeImage} alt={it.menuName} className="w-9 h-9 rounded-lg object-cover border border-slate-300 shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                        <Package className="w-4 h-4" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-slate-900 truncate leading-tight">{it.menuName}</p>
                      <p className="text-[10px] text-slate-500 font-mono">
                        {it.soldQty} × {Number(it.sellingPrice).toLocaleString()}
                      </p>
                    </div>

                    <span className="text-xs font-mono font-black text-slate-900 shrink-0">
                      {it.lineRevenue.toLocaleString()} ₭
                    </span>
                  </div>
                ))}
              </div>

              {/* Totals Calculation */}
              <div className="py-3 space-y-1.5 text-xs font-mono border-b border-dashed border-slate-300">
                <div className="flex justify-between text-slate-600">
                  <span>ຈຳນວນລາຍການລວມ:</span>
                  <span>{combinedBillData.totalQty} ຊິ້ນ/ຈອກ</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>ຕົ້ນທຶນວັດຖຸດິບ (COGS ຕັດສາງ):</span>
                  <span>-{Math.round(combinedBillData.totalCost).toLocaleString()} ₭</span>
                </div>
                <div className="flex justify-between text-emerald-700 font-bold">
                  <span>ກຳໄລສຸດທິປະຈຳວັນ:</span>
                  <span>+{Math.round(combinedBillData.totalProfit).toLocaleString()} ₭</span>
                </div>
                <div className="flex justify-between text-base font-black text-slate-900 pt-1.5 border-t border-slate-300">
                  <span>ຍອດຂາຍລວມ (GRAND TOTAL):</span>
                  <span>{combinedBillData.totalRevenue.toLocaleString()} ₭</span>
                </div>
              </div>

              {/* Footer */}
              <div className="text-center pt-3 space-y-2">
                <div className="flex items-center justify-center gap-1.5 text-emerald-600 text-xs font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Deducted & Committed to Finance ✓</span>
                </div>
                <p className="text-[9px] text-slate-400 italic">
                  THANK YOU FOR SUPPORTING LE OUVE
                </p>

                {/* Print Button */}
                <div className="pt-2 flex gap-2">
                  <button
                    onClick={handlePrintReceipt}
                    className="flex-1 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white font-sans text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>ພິມໃບບິນ POS (Print)</span>
                  </button>
                  <button
                    onClick={() => setIsCombinedBillOpen(false)}
                    className="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-sans text-xs font-bold cursor-pointer"
                  >
                    ປິດ
                  </button>
                </div>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: RECIPE BUILDER */}
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
                    <span>{editingRecipe ? 'ແກ້ໄຂສູດ' : 'ສ້າງສູດ Cookie, ເຂົ້າໜົມ & ເຄື່ອງດື່ມ'}</span>
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    ກຳນົດຈຳນວນກ້ອນທີ່ຜະລິດໄດ້ຕໍ່ເຕົາ (Batch Yield) ແລະ ອັບໂຫຼດຮູບສິນຄ້າ
                  </p>
                </div>
                <button onClick={() => setIsRecipeModalOpen(false)} className="text-slate-400 hover:text-white p-1">✕</button>
              </div>

              <form onSubmit={handleSaveRecipe} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-8">
                    <label className="label-xs block mb-1">ຊື່ເມນູ / ສູດ (Menu Title)</label>
                    <input
                      type="text"
                      required
                      placeholder="ເຊັ່ນ: Macadamia Dark choc Cookie..."
                      value={menuName}
                      onChange={e => setMenuName(e.target.value)}
                      className="crystal-input w-full !text-sm font-bold"
                    />
                  </div>

                  <div className="sm:col-span-4">
                    <label className="label-xs block mb-1 text-emerald-600 dark:text-emerald-400">
                      1 ສູດໄດ້ຈັກກ້ອນ/ຈອກ (Yield)
                    </label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={batchYield}
                      onChange={e => setBatchYield(e.target.value)}
                      className="crystal-input w-full font-mono font-bold text-center !text-sm border-emerald-500/30"
                      placeholder="10"
                    />
                  </div>
                </div>

                {/* 📸 ອັບໂຫຼດຮູບຕົວຢ່າງສິນຄ້າໃນແຕ່ລະສູດ */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-neutral-800 space-y-1.5">
                  <label className="label-xs flex justify-between">
                    <span>ຮູບພາບຕົວຢ່າງສິນຄ້າ (Product Photo ທີ່ຈະໄປໂຊໃນໃບບິນ)</span>
                    <span className="text-emerald-500 font-bold text-[9px]">Ctrl+V ວາງໄດ້</span>
                  </label>
                  <div className="border border-dashed border-slate-300 dark:border-neutral-700 rounded-xl p-2.5 relative flex items-center justify-between">
                    <input type="file" accept="image/*" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) setRecipeImage(await compressImage(file));
                    }} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                    {recipeImage ? (
                      <div className="flex items-center gap-3 w-full justify-between">
                        <img src={recipeImage} alt="Recipe Preview" className="w-12 h-12 rounded-xl object-cover border border-neutral-700 shadow-sm" />
                        <span className="text-xs font-bold text-emerald-500 truncate flex-1 pl-2">ອັບໂຫຼດຮູບແລ້ວ ✓ (ຈະໄປໂຊໃນໃບບິນ POS)</span>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setRecipeImage(''); }} className="text-rose-500 p-1">✕</button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 mx-auto flex items-center gap-1.5 font-bold"><Upload className="w-3.5 h-3.5" /> ຄລິກ ຫຼື ວາງຮູບສິນຄ້າ (Ctrl+V)</span>
                    )}
                  </div>
                </div>

                {/* Overhead & Selling Price */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/20 space-y-1">
                    <label className="label-xs !text-sky-500 flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5" />
                      <span>ຄ່າໄຟ-ນ້ຳ-ບັນຈຸພັນຕໍ່ 1 ກ້ອນ</span>
                    </label>
                    <input
                      type="number"
                      value={overheadCost}
                      onChange={e => setOverheadCost(e.target.value)}
                      className="crystal-input w-full font-mono font-bold text-center !py-1.5"
                      placeholder="1500"
                    />
                  </div>

                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
                    <label className="label-xs !text-emerald-500 flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5" />
                      <span>ລາຄາຂາຍຕໍ່ 1 ກ້ອນ (Selling Price)</span>
                    </label>
                    <input
                      type="number"
                      value={sellingPrice}
                      onChange={e => setSellingPrice(e.target.value)}
                      className="crystal-input w-full font-mono font-bold text-center !py-1.5"
                      placeholder="23000"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-1">
                  <label className="label-xs flex items-center gap-1.5 text-emerald-500">
                    <Tag className="w-3.5 h-3.5" />
                    <span>Note ການຕັ້ງລາຄາ & ເປົ້າໝາຍກຳໄລ</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="ຕົວຢ່າງ: 1 ສູດໄດ້ 5 ກ້ອນ, ຕົ້ນທຶນກ້ອນລະ 10,500₭, ຂາຍ 23,000₭, ກຳໄລ 12,500₭/ກ້ອນ..."
                    value={pricingNote}
                    onChange={e => setPricingNote(e.target.value)}
                    className="crystal-input w-full !text-xs font-normal leading-relaxed resize-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="label-xs flex items-center gap-1.5 text-amber-500">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Note ວິທີເຮັດ & ເທັກນິກການອົບ</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="ອຸນຫະພູມອົບ, ເວລາ, ເທັກນິກ..."
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    className="crystal-input w-full !text-xs font-normal leading-relaxed resize-none"
                  />
                </div>

                {/* Ingredients Form Rows */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="label-xs">ວັດຖຸດິບທັງໝົດຂອງເຕົານີ້ (1 ສູດໃຫຍ່)</label>
                    <button
                      type="button"
                      onClick={() => setRecipeIngredients(prev => [...prev, { productId: '', name: '', supplier: '', amount: '', unit: 'g', packSize: 1000, unitCostLAK: 0 }])}
                      className="text-xs font-bold text-sky-500 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ ເພີ່ມວັດຖຸດິບ</span>
                    </button>
                  </div>

                  <div className="space-y-3 max-h-52 overflow-y-auto pr-1">
                    {recipeIngredients.map((ing, idx) => {
                      const currentVal = ing.productId ? `${ing.productId}_${ing.supplier || ''}` : '';
                      const amt = Number(ing.amount) || 0;
                      const u = (ing.unit || 'g').toLowerCase();
                      let bUnits = amt;
                      if (u === 'tsp' || u === 'ຊ້ອນຊາ') bUnits = amt * 5;
                      else if (u === 'tbsp' || u === 'ຊ້ອນໂຕະ') baseUnits = amt * 15;
                      const itemTotalCost = bUnits * (ing.unitCostLAK || 0);

                      return (
                        <div key={idx} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200/70 dark:border-neutral-800 space-y-2.5">
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
                                  }
                                }}
                                className="crystal-input w-full font-bold !py-2 text-xs cursor-pointer"
                              >
                                <option value="">-- ເລືອກວັດຖຸດິບຈາກ Supplier --</option>
                                {supplierProductOptions.map(opt => (
                                  <option key={`${opt.productId}_${opt.supplier}`} value={`${opt.productId}_${opt.supplier}`}>
                                    {opt.name} • {opt.supplier} ({Math.round(opt.unitCostLAK).toLocaleString()} ₭/{opt.unit})
                                  </option>
                                ))}
                              </select>
                            </div>

                            <button type="button" onClick={() => setRecipeIngredients(prev => prev.filter((_, i) => i !== idx))} className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg cursor-pointer">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                            <div className="sm:col-span-5">
                              <span className="text-[9px] text-slate-400 block mb-0.5">ຈຳນວນທີ່ໃຊ້ໃນ 1 ເຕົາ</span>
                              <input
                                type="number"
                                step="any"
                                required
                                placeholder="ເຊັ່ນ: 100"
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
                                className="crystal-input w-full !text-xs font-bold text-center !py-1.5"
                              >
                                <option value="g">g</option>
                                <option value="ml">ml</option>
                                <option value="tsp">tsp</option>
                                <option value="tbsp">tbsp</option>
                                <option value="pcs">pcs</option>
                              </select>
                            </div>

                            <div className="sm:col-span-4 p-2 rounded-xl bg-slate-100 dark:bg-[#202020] text-right font-mono">
                              <span className="text-[8px] text-slate-400 block uppercase">ຕົ້ນທຶນວັດຖຸດິບນີ້:</span>
                              <span className="text-xs font-black text-emerald-500">
                                ≈ {Math.round(itemTotalCost).toLocaleString()} ₭
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Live Breakdown */}
                <div className="p-4 rounded-2xl bg-neutral-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 space-y-1.5 font-mono text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">ຕົ້ນທຶນວັດຖຸດິບລວມ ({currentModalCalc.yieldCount} ກ້ອນ):</span>
                    <span>{Math.round(currentModalCalc.totalBatchRaw).toLocaleString()} ₭</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>ຕົ້ນທຶນວັດຖຸດິບຕໍ່ 1 ກ້ອນ ({Math.round(currentModalCalc.totalBatchRaw).toLocaleString()} ÷ {currentModalCalc.yieldCount}):</span>
                    <span className="text-sky-500">{Math.round(currentModalCalc.rawPerUnit).toLocaleString()} ₭</span>
                  </div>
                  <div className="flex justify-between font-black border-t border-slate-200 dark:border-neutral-800 pt-1">
                    <span>ຕົ້ນທຶນຕົວຈິງລວມຕໍ່ 1 ກ້ອນ (+ຄ່າໄຟ {currentModalCalc.overhead.toLocaleString()}₭):</span>
                    <span className="text-slate-900 dark:text-white text-sm">{Math.round(currentModalCalc.totalCostPerUnit).toLocaleString()} ₭</span>
                  </div>
                  <div className="flex justify-between font-black text-sm border-t border-slate-200 dark:border-neutral-800 pt-1 text-emerald-500">
                    <span>ກຳໄລສຸດທິຕໍ່ 1 ກ້ອນ (ຂາຍ {currentModalCalc.price.toLocaleString()}₭):</span>
                    <span>+{Math.round(currentModalCalc.netProfit).toLocaleString()} ₭ ({currentModalCalc.margin.toFixed(1)}%)</span>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-neutral-800">
                  <button type="button" onClick={() => setIsRecipeModalOpen(false)} className="px-4 py-2 rounded-xl border text-xs font-bold text-slate-400">ຍົກເລີກ</button>
                  <button type="submit" disabled={isSavingRecipe} className="crystal-button">ບັນທຶກສູດ</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
