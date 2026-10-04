import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, query, onSnapshot, addDoc, setDoc, deleteDoc, doc, serverTimestamp, updateDoc 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useTranslation } from 'react-i18next';
import { 
  BookOpen, Plus, Trash2, Edit2, Calendar, AlertTriangle, 
  Package, ShoppingCart, Layers, Zap, Droplets, Sparkles
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

export function getSmartPackSize(productName: string, productUnit: string, configPackSize?: number, quoteQuantityPerUnit?: number): number {
  if (quoteQuantityPerUnit && quoteQuantityPerUnit > 1) return quoteQuantityPerUnit;
  if (configPackSize && configPackSize > 1) return configPackSize;
  const name = (productName || '').toLowerCase().trim();
  if (name.includes('1kg') || name.includes('1l') || name.includes('1000')) return 1000;
  if (name.includes('500g') || name.includes('500ml')) return 500;
  return 1000;
}

export function getIngredientBaseQtyAndCost(amount: number, ingUnitStr: string, prod: any, costStructure: any) {
  const packSize = costStructure.qtyPerPack || 1000;
  let baseUnits = amount;
  let cost = 0;
  const u = (ingUnitStr || 'g').toLowerCase();

  if (u === 'pack' || u === 'box' || u === 'bag') {
    baseUnits = amount * packSize;
    cost = amount * (costStructure.pricePerPack || 0);
  } else if (u === 'kg' || u === 'l') {
    baseUnits = amount * 1000;
    cost = baseUnits * costStructure.perUnit;
  } else {
    baseUnits = amount;
    cost = amount * costStructure.perUnit;
  }
  return { baseUnits, cost };
}

interface RecipeIngredientRow {
  productId: string;
  name: string;
  amount: number | string;
  unit: string;
  packSize: number | string;
}

export default function Inventory() {
  const { i18n } = useTranslation();
  const [subTab, setSubTab] = useState<'recipes' | 'sales' | 'balances'>('recipes');
  
  const [products, setProducts] = useState<any[]>([]);
  const [supplierPrices, setSupplierPrices] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [salesRecords, setSalesRecords] = useState<any[]>([]);
  const [adjustments, setAdjustments] = useState<any[]>([]);

  // Recipe Builder Form State (ມີ overheadCost: ຄ່ານ້ຳ, ຄ່າໄຟ, ແຮງງານຕໍ່ 1 ຈອກ)
  const [menuName, setMenuName] = useState('');
  const [overheadCost, setOverheadCost] = useState<number | string>(1500); // Default 1,500 ₭ ຕໍ່ຈອກ
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

  // Compute Raw Unit Costs from Supplier Quotes
  const productUnitCosts = useMemo(() => {
    const costMap: { [productId: string]: { perUnit: number; pricePerPack: number; label: string; qtyPerPack: number } } = {};
    products.forEach(p => {
      const pPrices = supplierPrices.filter(sp => sp.productId === p.id);
      if (pPrices.length > 0) {
        const latest = pPrices[0];
        const packPriceLAK = getSinglePackPriceLAK(latest);
        const sizePerPack = latest.quantityPerUnit || p.packSize || 1000;
        costMap[p.id] = {
          perUnit: packPriceLAK / sizePerPack,
          pricePerPack: packPriceLAK,
          label: p.unit || 'g',
          qtyPerPack: sizePerPack
        };
      } else {
        costMap[p.id] = { perUnit: 0, pricePerPack: 0, label: p.unit || 'g', qtyPerPack: p.packSize || 1000 };
      }
    });
    return costMap;
  }, [products, supplierPrices]);

  // 💡 Recipes Calculation: ວັດຖຸດິບ + Overhead (ຄ່ານ້ຳ-ຄ່າໄຟ) = ຕົ້ນທຶນຕົວຈິງ
  const recipesWithCalculatedCosts = useMemo(() => {
    return recipes.map(recipe => {
      let rawCost = 0;
      const parsedIngredients = (recipe.ingredients || []).map((ing: any) => {
        const prod = products.find(p => p.id === ing.productId);
        const costStructure = productUnitCosts[ing.productId] || { perUnit: 0, pricePerPack: 0, label: 'g', qtyPerPack: 1000 };
        const { cost } = getIngredientBaseQtyAndCost(ing.amount, ing.unit || prod?.unit || 'g', prod, costStructure);
        rawCost += cost;

        return {
          ...ing,
          productName: prod?.name || ing.name || 'Item',
          unitLabel: ing.unit || prod?.unit || 'g',
          calculatedCost: cost
        };
      });

      const overhead = Number(recipe.overheadCost) || 0;
      const totalCostPerCup = rawCost + overhead;

      return {
        ...recipe,
        ingredientsDetailed: parsedIngredients,
        rawCost,
        overheadCost: overhead,
        totalCostPerCup
      };
    });
  }, [recipes, products, productUnitCosts]);

  // Handle Save Recipe
  const handleSaveRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!menuName.trim() || recipeIngredients.length === 0) return;

    try {
      setIsSavingRecipe(true);
      const finalIngredientsPayload = [];

      for (const ing of recipeIngredients) {
        const rawName = ing.name.trim();
        if (!rawName) continue;

        let finalProductId = ing.productId;
        const matchedProd = products.find(p => p.name.trim().toLowerCase() === rawName.toLowerCase());

        if (matchedProd) {
          finalProductId = matchedProd.id;
        } else if (!finalProductId) {
          // Auto create product if newly typed
          const newDocRef = await addDoc(collection(db, 'products'), {
            name: rawName,
            unit: ing.unit || 'g',
            packSize: Number(ing.packSize) || 1000,
            minStock: 100,
            createdAt: serverTimestamp()
          });
          finalProductId = newDocRef.id;
        }

        finalIngredientsPayload.push({
          productId: finalProductId,
          amount: parseFloat(String(ing.amount)) || 0,
          unit: ing.unit || 'g'
        });
      }

      const recipePayload = {
        menuName: menuName.trim(),
        overheadCost: Number(overheadCost) || 0,
        ingredients: finalIngredientsPayload,
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
      setRecipeIngredients([]);
      alert("ບັນທຶກສູດເຄື່ອງດື່ມພ້ອມຕົ້ນທຶນຄ່ານ້ຳ-ຄ່າໄຟສຳເລັດ!");
    } finally {
      setIsSavingRecipe(false);
    }
  };

  return (
    <div className="space-y-6 font-sans pb-16">
      
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4 p-6 bg-white dark:bg-[#141414] rounded-3xl border border-slate-200/80 dark:border-neutral-800 shadow-sm">
        <div>
          <span className="bg-[#052659] dark:bg-white dark:text-neutral-950 text-white text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest">
            Le Ouve Recipe & Cost Engineering
          </span>
          <h1 className="text-2xl md:text-3xl font-serif text-slate-800 dark:text-white mt-1">
            Drink Cost Engine (ຕົ້ນທຶນວັດຖຸດິບ + ຄ່ານ້ຳ-ຄ່າໄຟ)
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            ຄິດໄລ່ຕົ້ນທຶນຕໍ່ 1 ຈອກ ຈາກລາຄາຊື້ Supplier ບວກກັບຄ່ານ້ຳ, ຄ່າໄຟ ແລະ ບັນຈຸພັນ
          </p>
        </div>

        <button
          onClick={() => {
            setEditingRecipe(null);
            setMenuName('');
            setOverheadCost(1500);
            setRecipeIngredients([{ productId: '', name: '', amount: '', unit: 'g', packSize: 1000 }]);
            setIsRecipeModalOpen(true);
          }}
          className="crystal-button !py-3 !px-5 flex items-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>+ ສ້າງສູດເຄື່ອງດື່ມໃໝ່</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setSubTab('recipes')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${subTab === 'recipes' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'bg-white dark:bg-[#141414] border border-slate-200 dark:border-neutral-800 text-slate-400'}`}
        >
          ສູດເຄື່ອງດື່ມ & ຕົ້ນທຶນຕໍ່ຈອກ
        </button>
        <button
          onClick={() => setSubTab('sales')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${subTab === 'sales' ? 'bg-[#052659] text-white dark:bg-white dark:text-neutral-950' : 'bg-white dark:bg-[#141414] border border-slate-200 dark:border-neutral-800 text-slate-400'}`}
        >
          ຍອດຂາຍປະຈຳວັນ & ຕັດສາງ
        </button>
      </div>

      {/* Recipe Cards */}
      {subTab === 'recipes' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {recipesWithCalculatedCosts.map((rec) => (
            <div key={rec.id} className="high-density-card p-6 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex justify-between items-start border-b border-slate-100 dark:border-neutral-800 pb-3">
                  <h4 className="text-base font-serif text-slate-800 dark:text-white">{rec.menuName}</h4>
                  <div className="text-right">
                    <span className="text-sm font-black font-mono text-emerald-500 block">
                      {Math.round(rec.totalCostPerCup).toLocaleString()} ₭
                    </span>
                    <span className="text-[9px] text-slate-400 block">ຕົ້ນທຶນຕົວຈິງ/ຈອກ</span>
                  </div>
                </div>

                {/* 💡 Breakdown: ວັດຖຸດິບ + ຄ່ານ້ຳ-ຄ່າໄຟ */}
                <div className="mt-3 p-3 rounded-2xl bg-slate-50 dark:bg-[#1a1a1a] text-xs space-y-1 font-mono">
                  <div className="flex justify-between text-slate-500">
                    <span>ວັດຖຸດິບ (Raw Materials):</span>
                    <span>{Math.round(rec.rawCost).toLocaleString()} ₭</span>
                  </div>
                  <div className="flex justify-between text-sky-500">
                    <span>ຄ່ານ້ຳ-ຄ່າໄຟ/ອຸປະກອນ (Overhead):</span>
                    <span>+{Math.round(rec.overheadCost).toLocaleString()} ₭</span>
                  </div>
                </div>

                {/* Ingredients detail */}
                <div className="divide-y divide-slate-100 dark:divide-neutral-800/60 mt-3 max-h-36 overflow-y-auto">
                  {rec.ingredientsDetailed?.map((ing: any, i: number) => (
                    <div key={i} className="flex justify-between py-1 text-xs">
                      <span className="text-slate-500">{ing.productName}</span>
                      <span className="font-mono">{ing.amount}{ing.unitLabel}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-neutral-800">
                <button
                  onClick={() => {
                    setEditingRecipe(rec);
                    setMenuName(rec.menuName);
                    setOverheadCost(rec.overheadCost || 1500);
                    setRecipeIngredients((rec.ingredients || []).map((ing: any) => ({
                      productId: ing.productId,
                      name: products.find(p => p.id === ing.productId)?.name || '',
                      amount: ing.amount,
                      unit: ing.unit || 'g',
                      packSize: 1000
                    })));
                    setIsRecipeModalOpen(true);
                  }}
                  className="p-2 text-slate-400 hover:text-sky-500 cursor-pointer"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => deleteDoc(doc(db, 'recipes', rec.id))}
                  className="p-2 text-slate-400 hover:text-rose-500 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Recipe Builder with Overhead Input */}
      <AnimatePresence>
        {isRecipeModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white dark:bg-[#141414] rounded-3xl border border-slate-200 dark:border-neutral-800 p-6 max-w-xl w-full space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center border-b border-slate-100 dark:border-neutral-800 pb-3">
                <h3 className="text-base font-serif text-slate-800 dark:text-white">ຕັ້ງຄ່າສູດ & ຕົ້ນທຶນຄ່ານ້ຳ-ຄ່າໄຟ</h3>
                <button onClick={() => setIsRecipeModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
              </div>

              <form onSubmit={handleSaveRecipe} className="space-y-4">
                <div>
                  <label className="label-xs block mb-1">ຊື່ເມນູ / ສູດເຄື່ອງດື່ມ</label>
                  <input
                    type="text"
                    required
                    placeholder="ເຊັ່ນ: Iced Latte 16oz..."
                    value={menuName}
                    onChange={e => setMenuName(e.target.value)}
                    className="crystal-input w-full font-bold"
                  />
                </div>

                {/* Overhead Input (ຄ່ານ້ຳ, ຄ່າໄຟ, ແຮງງານຕໍ່ 1 ຈອກ) */}
                <div className="p-4 rounded-2xl bg-sky-500/10 border border-sky-500/20 space-y-1">
                  <label className="label-xs !text-sky-500 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5" />
                    <span>ຕົ້ນທຶນຄ່ານ້ຳ, ຄ່າໄຟ, ບັນຈຸພັນ (Overhead ຕໍ່ 1 ຈອກ)</span>
                  </label>
                  <input
                    type="number"
                    value={overheadCost}
                    onChange={e => setOverheadCost(e.target.value)}
                    className="crystal-input w-full font-mono font-bold"
                    placeholder="1,500"
                  />
                  <span className="text-[10px] text-slate-400 block pt-0.5">
                    ລະບົບຈະບວກຍອດນີ້ເຂົ້າກັບຕົ້ນທຶນວັດຖຸດິບ ເພື່ອຫາຕົ້ນທຶນຕົວຈິງຕໍ່ຈອກ
                  </span>
                </div>

                {/* Ingredients Rows */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="label-xs">ວັດຖຸດິບໃນ 1 ຈອກ</label>
                    <button
                      type="button"
                      onClick={() => setRecipeIngredients(prev => [...prev, { productId: '', name: '', amount: '', unit: 'g', packSize: 1000 }])}
                      className="text-xs font-bold text-sky-500 hover:underline cursor-pointer"
                    >
                      + ເພີ່ມວັດຖຸດິບ
                    </button>
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {recipeIngredients.map((ing, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <input
                          type="text"
                          required
                          placeholder="ຊື່ວັດຖຸດິບ..."
                          value={ing.name}
                          onChange={e => setRecipeIngredients(prev => prev.map((item, i) => i === idx ? { ...item, name: e.target.value } : item))}
                          className="crystal-input flex-1 !text-xs font-bold"
                        />
                        <input
                          type="number"
                          required
                          placeholder="ຈຳນວນ"
                          value={ing.amount}
                          onChange={e => setRecipeIngredients(prev => prev.map((item, i) => i === idx ? { ...item, amount: e.target.value } : item))}
                          className="crystal-input w-20 !text-xs font-mono font-bold text-center"
                        />
                        <select
                          value={ing.unit}
                          onChange={e => setRecipeIngredients(prev => prev.map((item, i) => i === idx ? { ...item, unit: e.target.value } : item))}
                          className="crystal-input w-20 !text-xs font-bold cursor-pointer"
                        >
                          <option value="g">g</option>
                          <option value="ml">ml</option>
                          <option value="pcs">pcs</option>
                        </select>
                        <button type="button" onClick={() => setRecipeIngredients(prev => prev.filter((_, i) => i !== idx))} className="text-rose-500 p-1">✕</button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setIsRecipeModalOpen(false)} className="px-4 py-2 border rounded-xl text-xs font-bold">ຍົກເລີກ</button>
                  <button type="submit" disabled={isSavingRecipe} className="crystal-button">
                    {isSavingRecipe ? 'Saving...' : 'ບັນທຶກສູດ & ຕົ້ນທຶນ'}
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
