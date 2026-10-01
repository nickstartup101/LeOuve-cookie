import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, query, onSnapshot, addDoc, setDoc, deleteDoc, doc, serverTimestamp, updateDoc 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useTranslation } from 'react-i18next';
import { 
  BookOpen, Plus, Trash2, Edit2, Calendar, Check, AlertTriangle, 
  Package, TrendingUp, UploadCloud, Layers, ShoppingCart, RefreshCw, 
  CheckCircle, Info, Sparkles, Tag
} from 'lucide-react';
import { format } from 'date-fns';

const getSinglePackPriceLAK = (quote: any): number => {
  if (!quote) return 100000;
  if (quote.priceMode === 'total' || quote.priceMode === 'per_pack' || quote.totalPriceLAK !== undefined) {
    return Number(quote.priceLAK || 0);
  }
  const totalOriginal = Number(quote.priceOriginal || 0);
  const exchangeRate = Number(quote.exchangeRate || 1);
  const totalLAK = quote.currency === 'LAK' ? totalOriginal : totalOriginal * exchangeRate;
  return totalLAK / Number(quote.quantity || 1);
};

export function getSmartPackSize(
  productName: string,
  productUnit: string,
  configPackSize?: number,
  quoteQuantityPerUnit?: number,
  quotePriceLAK?: number
): number {
  if (quoteQuantityPerUnit && quoteQuantityPerUnit > 1) return quoteQuantityPerUnit;
  if (configPackSize && configPackSize > 1) return configPackSize;

  const name = (productName || '').toLowerCase().trim();
  const prodUnit = (productUnit || '').toLowerCase().trim();

  const numericUnitsMatch = name.match(/(\d+(?:\.\d+)?)\s*(?:g|ml|ກຣາມ|ມລ|gram|milliliter)/);
  if (numericUnitsMatch) return parseFloat(numericUnitsMatch[1]);

  const kgLMatch = name.match(/(\d+(?:\.\d+)?)\s*(?:kg|l|ກລ|ກິໂລ|ລິດ|litre|kilogram)/);
  if (kgLMatch) return parseFloat(kgLMatch[1]) * 1000;

  const laKMatch = name.match(/(\d+(?:\.\d+)?)\s*(?:ກ|k)/);
  if (laKMatch) return parseFloat(laKMatch[1]) * 1000;

  if ((prodUnit === 'g' || prodUnit === 'ml') && (quotePriceLAK || 0) > 1000) return 1000;
  return 1;
}

export function getCommercialPackSize(productName: string, unit: string): number {
  const name = (productName || '').toLowerCase().trim();
  const u = (unit || '').toLowerCase().trim();
  if (u === 'g' || u === 'ກຣາມ') {
    if (name.includes('ນ້ຳຕານ') || name.includes('sugar') || name.includes('ຄີມ') || name.includes('creamer') || name.includes('ເກືອ')) return 1000;
    if (name.includes('ກາເຟ') || name.includes('coffee') || name.includes('ເມັດ')) return 500;
    if (name.includes('ມັດຈະ') || name.includes('matcha') || name.includes('ໂກໂກ້') || name.includes('ຊາ')) return 500;
    return 500;
  }
  if (u === 'ml' || u === 'ມລ' || u === 'ລິດ' || u === 'l') return 1000;
  return 1;
}

export function getIngredientBaseQtyAndCost(
  amount: number,
  ingUnitStr: string,
  prod: any,
  costStructure: { perUnit: number; pricePerPack: number; qtyPerPack: number }
) {
  const normalizedIngUnit = (ingUnitStr || prod?.unit || 'g').toLowerCase().trim();
  const normalizedProdUnit = (prod?.unit || 'g').toLowerCase().trim();
  let packSize = costStructure.qtyPerPack || (prod ? getSmartPackSize(prod.name, prod.unit, prod.packSize) : 1);
  if (prod && packSize <= 1) {
    packSize = getCommercialPackSize(prod.name, (prod.unit || 'g').toLowerCase());
  }

  let baseUnits = amount;
  let cost = 0;

  if (normalizedIngUnit === 'pack' || normalizedIngUnit === 'box' || normalizedIngUnit === 'bag' || normalizedIngUnit === 'unit') {
    baseUnits = amount * packSize;
    cost = amount * (costStructure.pricePerPack || 0);
  } else if (normalizedIngUnit === 'kg') {
    baseUnits = amount * 1000;
    cost = baseUnits * costStructure.perUnit;
  } else if (normalizedIngUnit === 'l' || normalizedIngUnit === 'litre') {
    baseUnits = amount * 1000;
    cost = baseUnits * costStructure.perUnit;
  } else if (normalizedIngUnit === 'pcs' || normalizedIngUnit === 'piece') {
    if (normalizedProdUnit === 'pcs' || normalizedProdUnit === 'piece' || normalizedProdUnit === 'unit') {
      baseUnits = amount;
      cost = amount * costStructure.perUnit;
    } else {
      baseUnits = amount * packSize;
      cost = amount * (costStructure.pricePerPack || 0);
    }
  } else {
    baseUnits = amount;
    cost = amount * costStructure.perUnit;
  }

  return { baseUnits, cost };
}

// ໂຄງສ້າງວັດຖຸດິບໃນສູດ: ຮອງຮັບທັງເລືອກ ແລະ ພິມຊື່ໃໝ່ໄດ້ເອງໂດຍກົງ
interface RecipeIngredientRow {
  productId: string;
  name: string;
  amount: number | string;
  unit: string;
  packSize: number | string;
}

export default function Inventory() {
  const { i18n } = useTranslation();
  const [subTab, setSubTab] = useState<'sales' | 'recipes' | 'balances'>('recipes');
  
  const [products, setProducts] = useState<any[]>([]);
  const [supplierPrices, setSupplierPrices] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [salesRecords, setSalesRecords] = useState<any[]>([]);
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<any | null>(null);
  
  // Recipe Builder Form State
  const [menuName, setMenuName] = useState('');
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredientRow[]>([]);
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);

  // Sales State
  const [quantitiesSold, setQuantitiesSold] = useState<{ [recipeId: string]: number }>({});
  const [isDeducting, setIsDeducting] = useState(false);

  // 1. Realtime Listeners
  useEffect(() => {
    setLoading(true);
    const unsubP = onSnapshot(query(collection(db, 'products')), snap => {
      setProducts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, e => handleFirestoreError(e, OperationType.LIST, 'products'));

    const unsubS = onSnapshot(query(collection(db, 'supplierPrices')), snap => {
      setSupplierPrices(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, e => handleFirestoreError(e, OperationType.LIST, 'supplierPrices'));

    const unsubR = onSnapshot(query(collection(db, 'recipes')), snap => {
      setRecipes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, e => handleFirestoreError(e, OperationType.LIST, 'recipes'));

    const unsubSales = onSnapshot(query(collection(db, 'menu_sales')), snap => {
      setSalesRecords(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, e => handleFirestoreError(e, OperationType.LIST, 'menu_sales'));

    const unsubAdj = onSnapshot(query(collection(db, 'inventory')), snap => {
      setAdjustments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, e => handleFirestoreError(e, OperationType.LIST, 'inventory'));

    return () => { unsubP(); unsubS(); unsubR(); unsubSales(); unsubAdj(); };
  }, []);

  // 2. Compute Costs per product
  const productUnitCosts = useMemo(() => {
    const costMap: { [productId: string]: { perUnit: number; pricePerPack: number; label: string; qtyPerPack: number; buyUnit: string } } = {};
    products.forEach(p => {
      const pPrices = supplierPrices.filter(sp => sp.productId === p.id);
      if (pPrices.length > 0) {
        let expensiveQuote = pPrices[0];
        let maxUnitCost = -1;

        pPrices.forEach(quote => {
          const packPriceLAK = getSinglePackPriceLAK(quote);
          let size = getSmartPackSize(p.name, p.unit, p.packSize, quote.quantityPerUnit, packPriceLAK);
          if (size <= 1) size = getCommercialPackSize(p.name, (p.unit || 'g').toLowerCase());
          const unitCost = packPriceLAK / (size || 1);
          if (unitCost > maxUnitCost) {
            maxUnitCost = unitCost;
            expensiveQuote = quote;
          }
        });

        const latest = expensiveQuote;
        const singlePackPriceLAK = getSinglePackPriceLAK(latest);
        let sizePerPack = getSmartPackSize(p.name, p.unit, p.packSize, latest.quantityPerUnit, singlePackPriceLAK);
        if (sizePerPack <= 1) sizePerPack = getCommercialPackSize(p.name, (p.unit || 'g').toLowerCase());
        
        costMap[p.id] = {
          perUnit: singlePackPriceLAK / (sizePerPack || 1),
          pricePerPack: singlePackPriceLAK,
          label: p.unit || latest.unit || 'g',
          qtyPerPack: sizePerPack,
          buyUnit: latest.unit || 'PACK'
        };
      } else {
        costMap[p.id] = { perUnit: 0, pricePerPack: 0, label: p.unit || 'g', qtyPerPack: p.packSize || 1, buyUnit: 'UNIT' };
      }
    });
    return costMap;
  }, [products, supplierPrices]);

  // 3. Recipes with calculated costs
  const recipesWithCalculatedCosts = useMemo(() => {
    return recipes.map(recipe => {
      let totalCost = 0;
      const parsedIngredients = (recipe.ingredients || []).map((ing: any) => {
        const prod = products.find(p => p.id === ing.productId);
        const costStructure = productUnitCosts[ing.productId] || { perUnit: 0, pricePerPack: 0, label: 'g', qtyPerPack: 1 };
        const { cost } = getIngredientBaseQtyAndCost(
          ing.amount,
          ing.unit || prod?.unit || 'g',
          prod,
          { perUnit: costStructure.perUnit, pricePerPack: costStructure.pricePerPack, qtyPerPack: costStructure.qtyPerPack || prod?.packSize || 1 }
        );
        totalCost += cost;

        return {
          ...ing,
          productName: prod?.name || ing.name || 'Unknown item',
          unitCost: costStructure.perUnit,
          unitLabel: ing.unit || prod?.unit || 'g',
          calculatedCost: cost
        };
      });

      return { ...recipe, ingredientsDetailed: parsedIngredients, calculatedCost: totalCost };
    });
  }, [recipes, products, productUnitCosts]);

  // 4. Inventory Balances
  const inventoryBalances = useMemo(() => {
    return products.map(p => {
      const pPrices = supplierPrices.filter(sp => sp.productId === p.id);
      const totalIn = pPrices.reduce((sum, sp) => {
        let size = sp.quantityPerUnit || p.packSize || 1;
        if (size <= 1) size = getCommercialPackSize(p.name, (p.unit || 'g').toLowerCase());
        return sum + ((sp.quantity || 0) * size);
      }, 0);

      let totalConsumed = 0;
      salesRecords.forEach(sale => {
        const itemsSold = sale.itemsSold || {};
        Object.keys(itemsSold).forEach(recipeId => {
          const qtySold = itemsSold[recipeId] || 0;
          const recipe = recipes.find(r => r.id === recipeId);
          if (recipe) {
            const ingredient = (recipe.ingredients || []).find((ing: any) => ing.productId === p.id);
            if (ingredient) {
              const costStructure = productUnitCosts[p.id] || { perUnit: 0, pricePerPack: 0, qtyPerPack: p.packSize || 1 };
              const { baseUnits } = getIngredientBaseQtyAndCost(
                ingredient.amount,
                ingredient.unit || p.unit || 'g',
                p,
                { perUnit: costStructure.perUnit, pricePerPack: costStructure.pricePerPack, qtyPerPack: costStructure.qtyPerPack || p.packSize || 1 }
              );
              totalConsumed += (baseUnits * qtySold);
            }
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
        totalAdjustment,
        finalBalance,
        unitCost: priceDetails.perUnit,
        unitLabel: priceDetails.label,
        totalValuation: finalBalance * priceDetails.perUnit
      };
    });
  }, [products, supplierPrices, salesRecords, recipes, adjustments, productUnitCosts]);

  // 🚀 CORE FUNCTION: ບັນທຶກສູດ ພ້ອມສ້າງວັດຖຸດິບໃໝ່ເຂົ້າຖານຂໍ້ມູນອັດຕະໂນມັດ!
  const handleSaveRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!menuName.trim()) {
      alert("ກະລຸນາໃສ່ຊື່ເມນູ / ສູດເຄື່ອງດື່ມ");
      return;
    }
    if (recipeIngredients.length === 0) {
      alert("ກະລຸນາເພີ່ມວັດຖຸດິບຢ່າງໜ້ອຍ 1 ລາຍການ");
      return;
    }

    try {
      setIsSavingRecipe(true);
      const finalIngredientsPayload = [];
      let newProductsCreatedCount = 0;

      // ວົນລູບກວດສອບວັດຖຸດິບແຕ່ລະອັນ
      for (const ing of recipeIngredients) {
        const rawName = ing.name.trim();
        if (!rawName) continue;

        let finalProductId = ing.productId;
        const matchedProd = products.find(p => p.name.trim().toLowerCase() === rawName.toLowerCase());

        if (matchedProd) {
          finalProductId = matchedProd.id;
          // ອັບເດດ packSize ຖ້າຜູ້ໃຊ້ມີການປ່ຽນແປງ
          if (ing.packSize && Number(ing.packSize) !== matchedProd.packSize) {
            await updateDoc(doc(db, 'products', matchedProd.id), {
              packSize: Number(ing.packSize) || 1,
              updatedAt: serverTimestamp()
            });
          }
        } else if (!finalProductId) {
          // ✨ ຖ້າເປັນວັດຖຸດິບໃໝ່ທີ່ຍັງບໍ່ມີໃນລະບົບ ➔ ສ້າງເຂົ້າຖານຂໍ້ມູນ products ທັນທີ!
          const newDocRef = await addDoc(collection(db, 'products'), {
            name: rawName,
            unit: ing.unit || 'g',
            packSize: Number(ing.packSize) || 1000,
            minStock: 100,
            isApproved: true,
            createdAt: serverTimestamp()
          });
          finalProductId = newDocRef.id;
          newProductsCreatedCount++;
        }

        finalIngredientsPayload.push({
          productId: finalProductId,
          amount: parseFloat(String(ing.amount)) || 0,
          unit: ing.unit || 'g'
        });
      }

      const recipePayload = {
        menuName: menuName.trim(),
        ingredients: finalIngredientsPayload,
        updatedAt: serverTimestamp()
      };

      if (editingRecipe) {
        await setDoc(doc(db, 'recipes', editingRecipe.id), recipePayload, { merge: true });
      } else {
        await addDoc(collection(db, 'recipes'), recipePayload);
      }

      alert(
        newProductsCreatedCount > 0
          ? `ບັນທຶກສູດສຳເລັດ! ພ້ອມທັງສ້າງ ${newProductsCreatedCount} ວັດຖຸດິບໃໝ່ເຂົ້າ Dropdown ຂອງໜ້າ Suppliers ໃຫ້ແລ້ວ!`
          : "ບັນທຶກສູດເຄື່ອງດື່ມສຳເລັດແລ້ວ!"
      );

      setIsRecipeModalOpen(false);
      setEditingRecipe(null);
      setMenuName('');
      setRecipeIngredients([]);
    } catch (err: any) {
      console.error(err);
      handleFirestoreError(err, OperationType.WRITE, 'recipes');
    } finally {
      setIsSavingRecipe(false);
    }
  };

  const handleAddIngredientRow = () => {
    setRecipeIngredients(prev => [
      ...prev,
      {
        productId: '',
        name: '',
        amount: '',
        unit: 'g',
        packSize: 1000
      }
    ]);
  };

  const handleRemoveIngredientRow = (index: number) => {
    setRecipeIngredients(prev => prev.filter((_, i) => i !== index));
  };

  const handleIngredientNameChange = (index: number, val: string) => {
    const matched = products.find(p => p.name.trim().toLowerCase() === val.trim().toLowerCase());
    setRecipeIngredients(prev => prev.map((item, i) => {
      if (i === index) {
        return {
          ...item,
          name: val,
          productId: matched ? matched.id : '',
          unit: matched ? matched.unit || item.unit : item.unit,
          packSize: matched ? matched.packSize || item.packSize : item.packSize
        };
      }
      return item;
    }));
  };

  return (
    <div className="space-y-6 font-sans pb-16">
      
      {/* Datalist ສຳລັບ Autocomplete ຊື່ວັດຖຸດິບທີ່ເຄີຍມີ */}
      <datalist id="existing-products-list">
        {products.map(p => (
          <option key={p.id} value={p.name}>
            {p.name} ({p.unit || 'g'})
          </option>
        ))}
      </datalist>

      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4 p-6 bg-white dark:bg-[#141414] rounded-3xl border border-slate-200 dark:border-neutral-800 shadow-sm">
        <div>
          <span className="bg-[#052659] dark:bg-white dark:text-neutral-950 text-white text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest">
            Le Ouve Recipe & Stock
          </span>
          <h1 className="text-2xl md:text-3xl font-black text-slate-800 dark:text-white mt-1">
            {i18n.language === 'la' ? 'ສູດເຄື່ອງດື່ມ & ຕັດຍອດຄັງສາງ' : 'Recipes Builder & Stock Deductions'}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            ສ້າງສູດກ່ອນໄດ້ເລີຍ! ວັດຖຸດິບທີ່ພິມໃນສູດຈະຖືກດຶງໄປໄວ້ໃນ Dropdown ຂອງ Suppliers ໂດຍອັດຕະໂນມັດ
          </p>
        </div>

        <button
          onClick={() => {
            setEditingRecipe(null);
            setMenuName('');
            setRecipeIngredients([
              { productId: '', name: '', amount: '', unit: 'g', packSize: 1000 }
            ]);
            setIsRecipeModalOpen(true);
          }}
          className="crystal-button !py-3 !px-5 flex items-center gap-2 self-start lg:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>+ ສ້າງສູດເຄື່ອງດື່ມໃໝ່</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-neutral-800 gap-1 pb-px">
        {[
          { key: 'recipes', icon: BookOpen, label: 'ສູດເຄື່ອງດື່ມ (Recipes)' },
          { key: 'sales', icon: ShoppingCart, label: 'ຍອດຂາຍລາຍວັນ & ຕັດຍອດ' },
          { key: 'balances', icon: Layers, label: 'ຍອດຄັງສາງຄົງເຫຼືອ' }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setSubTab(tab.key as any)}
            className={`px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              subTab === tab.key 
                ? 'border-[#052659] dark:border-white text-[#052659] dark:text-white' 
                : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-white'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* TAB 1: RECIPES BUILDER */}
      {subTab === 'recipes' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recipesWithCalculatedCosts.map((recipe) => (
              <div key={recipe.id} className="high-density-card p-6 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex justify-between items-start gap-2 border-b border-slate-100 dark:border-neutral-800 pb-3">
                    <h4 className="text-base font-black text-slate-800 dark:text-white">{recipe.menuName}</h4>
                    <span className="text-xs bg-emerald-500/10 text-emerald-500 font-extrabold px-2.5 py-1 rounded-full font-mono">
                      Cost: {Math.round(recipe.calculatedCost || 0).toLocaleString()} ₭
                    </span>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-neutral-800/60 mt-3 max-h-48 overflow-y-auto pr-1">
                    {recipe.ingredientsDetailed?.map((ing: any, i: number) => (
                      <div key={i} className="flex justify-between py-1.5 text-xs">
                        <span className="text-slate-600 dark:text-slate-300 font-medium">{ing.productName}</span>
                        <span className="font-mono font-bold text-slate-800 dark:text-white">
                          {ing.amount} <span className="text-[10px] text-slate-400 font-normal">{ing.unitLabel}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-neutral-800">
                  <button 
                    onClick={() => {
                      setEditingRecipe(recipe);
                      setMenuName(recipe.menuName);
                      // Map existing ingredients into editable rows
                      const rows: RecipeIngredientRow[] = (recipe.ingredients || []).map((ing: any) => {
                        const pr = products.find(p => p.id === ing.productId);
                        return {
                          productId: ing.productId,
                          name: pr?.name || ing.name || '',
                          amount: ing.amount,
                          unit: ing.unit || pr?.unit || 'g',
                          packSize: pr?.packSize || 1000
                        };
                      });
                      setRecipeIngredients(rows.length > 0 ? rows : [{ productId: '', name: '', amount: '', unit: 'g', packSize: 1000 }]);
                      setIsRecipeModalOpen(true);
                    }} 
                    className="p-2 text-slate-400 hover:text-sky-500 rounded-lg cursor-pointer"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={async () => {
                      if (confirm("ທ່ານແນ່ໃຈບໍ່ວ່າຕ້ອງການລຶບສູດນີ້?")) {
                        await deleteDoc(doc(db, 'recipes', recipe.id));
                      }
                    }} 
                    className="p-2 text-slate-400 hover:text-rose-500 rounded-lg cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {recipes.length === 0 && (
              <div className="col-span-full py-16 text-center high-density-card">
                <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-400">ຍັງບໍ່ທັນມີສູດເຄື່ອງດື່ມ</p>
                <p className="text-xs text-slate-500 mt-1">ກົດປຸ່ມ "+ ສ້າງສູດເຄື່ອງດື່ມໃໝ່" ດ້ານເທິງເພື່ອເລີ່ມຕົ້ນໄດ້ທັນທີ</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: DAILY SALES LOGGING */}
      {subTab === 'sales' && (
        <div className="high-density-card p-6 space-y-6">
          <div className="flex justify-between items-center border-b border-slate-100 dark:border-neutral-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-white">Daily Sales Logging</h3>
              <p className="text-xs text-slate-400">ໃສ່ຈຳນວນຈອກທີ່ຂາຍໄດ້ ເພື່ອຕັດສະຕັອກວັດຖຸດິບອັດຕະໂນມັດ</p>
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
                  <span className="text-[10px] text-amber-500 font-mono font-bold">
                    Est Cost: {Math.round(rec.calculatedCost).toLocaleString()} ₭
                  </span>
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
                } catch (e: any) {
                  alert(e.message);
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

      {/* TAB 3: INVENTORY BALANCES */}
      {subTab === 'balances' && (
        <div className="high-density-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-neutral-900/60 text-[10px] font-black uppercase text-slate-400">
                <tr>
                  <th className="p-4">ຊື່ວັດຖຸດິບ (Product Resource)</th>
                  <th className="p-4 text-center">ຍອດຊື້ເຂົ້າ (Total In)</th>
                  <th className="p-4 text-center">ຍອດຕັດສາງ (Consumed)</th>
                  <th className="p-4 text-center">ຍອດຄົງເຫຼືອ (Remaining)</th>
                  <th className="p-4 text-right">ມູນຄ່າຕົ້ນທຶນ (Valuation)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                {inventoryBalances.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-neutral-800/30">
                    <td className="p-4 font-bold text-slate-800 dark:text-white">{item.name}</td>
                    <td className="p-4 text-center font-mono">{item.totalIn.toLocaleString()} {item.unitLabel}</td>
                    <td className="p-4 text-center font-mono text-rose-500">-{Math.round(item.totalConsumed).toLocaleString()} {item.unitLabel}</td>
                    <td className="p-4 text-center font-mono font-black text-emerald-500">{Math.round(item.finalBalance).toLocaleString()} {item.unitLabel}</td>
                    <td className="p-4 text-right font-mono font-black">{Math.round(item.totalValuation).toLocaleString()} ₭</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 🚀 MODAL: RECIPE BUILDER (ສ້າງສູດ + ຂຽນວັດຖຸດິບໃໝ່ໄດ້ເລີຍ) */}
      <AnimatePresence>
        {isRecipeModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              className="bg-white dark:bg-[#141414] rounded-3xl border border-slate-200 dark:border-neutral-800 w-full max-w-2xl shadow-2xl p-6 md:p-8 space-y-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center border-b border-slate-100 dark:border-neutral-800 pb-3">
                <div>
                  <h3 className="text-base font-black uppercase text-slate-800 dark:text-white flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-emerald-500" />
                    <span>{editingRecipe ? 'ແກ້ໄຂສູດເຄື່ອງດື່ມ' : 'ສ້າງສູດເຄື່ອງດື່ມ (Recipe)'}</span>
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    ພິມຊື່ວັດຖຸດິບໄດ້ເລີຍ! ຖ້າເປັນວັດຖຸດິບໃໝ່ ລະບົບຈະບັນທຶກເຂົ້າ Suppliers ໃຫ້ເອງ
                  </p>
                </div>
                <button onClick={() => setIsRecipeModalOpen(false)} className="text-slate-400 hover:text-white p-1">✕</button>
              </div>

              <form onSubmit={handleSaveRecipe} className="space-y-5">
                <div>
                  <label className="label-xs block mb-1">ຊື່ເມນູ / ເຄື່ອງດື່ມ (Menu Name)</label>
                  <input
                    type="text"
                    required
                    placeholder="ຕົວຢ່າງ: Iced Espresso, Matcha Latte 16oz..."
                    value={menuName}
                    onChange={e => setMenuName(e.target.value)}
                    className="crystal-input w-full !text-sm font-bold"
                  />
                </div>

                {/* Ingredients Form Rows */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="label-xs">ລາຍການວັດຖຸດິບ & ອັດຕາສ່ວນໃນ 1 ຈອກ</label>
                    <button
                      type="button"
                      onClick={handleAddIngredientRow}
                      className="text-xs font-bold text-sky-500 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ ເພີ່ມວັດຖຸດິບ</span>
                    </button>
                  </div>

                  <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                    {recipeIngredients.map((ing, idx) => {
                      const isExisting = products.some(p => p.name.trim().toLowerCase() === ing.name.trim().toLowerCase());
                      const isNewTyped = ing.name.trim().length > 0 && !isExisting;

                      return (
                        <div key={idx} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200/70 dark:border-neutral-800 space-y-2.5">
                          <div className="flex items-center gap-2">
                            {/* Input ຊື່ວັດຖຸດິບ: ພິມຊື່ໃໝ່ໄດ້ ຫຼື ເລືອກຈາກ datalist */}
                            <div className="flex-1 relative">
                              <input
                                type="text"
                                required
                                list="existing-products-list"
                                placeholder="ພິມຊື່ວັດຖຸດິບ (ເຊັ່ນ: ເມັດກາເຟ, ນົມສົດ, ໄຊຣັບ...)"
                                value={ing.name}
                                onChange={e => handleIngredientNameChange(idx, e.target.value)}
                                className="crystal-input w-full !text-xs font-bold"
                              />
                            </div>

                            {/* Badge ແຈ້ງສະຖານະ: ວັດຖຸດິບໃໝ່ ຫຼື ມີແລ້ວ */}
                            {isNewTyped && (
                              <span className="px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 text-[9px] font-black uppercase whitespace-nowrap flex items-center gap-1 border border-emerald-500/20">
                                <Sparkles className="w-3 h-3" />
                                <span>ວັດຖຸດິບໃໝ່</span>
                              </span>
                            )}
                            {isExisting && ing.name.trim().length > 0 && (
                              <span className="px-2 py-1 rounded-lg bg-blue-500/10 text-blue-500 text-[9px] font-black uppercase whitespace-nowrap border border-blue-500/20">
                                ມີໃນຖານແລ້ວ
                              </span>
                            )}

                            <button
                              type="button"
                              onClick={() => handleRemoveIngredientRow(idx)}
                              className="p-2 text-slate-400 hover:text-rose-500 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          {/* ຈຳນວນທີ່ໃຊ້, ຫົວໜ່ວຍ, ຂະໜາດຕໍ່ແພັກ */}
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="text-[9px] font-black uppercase text-slate-400 block mb-0.5">ຈຳນວນຕໍ່ 1 ຈອກ</label>
                              <input
                                type="number"
                                step="any"
                                required
                                placeholder="ເຊັ່ນ: 18"
                                value={ing.amount}
                                onChange={e => setRecipeIngredients(prev => prev.map((item, i) => i === idx ? { ...item, amount: e.target.value } : item))}
                                className="crystal-input w-full !text-xs font-mono font-bold text-center"
                              />
                            </div>

                            <div>
                              <label className="text-[9px] font-black uppercase text-slate-400 block mb-0.5">ຫົວໜ່ວຍ</label>
                              <select
                                value={ing.unit}
                                onChange={e => setRecipeIngredients(prev => prev.map((item, i) => i === idx ? { ...item, unit: e.target.value } : item))}
                                className="crystal-input w-full !text-xs font-bold cursor-pointer"
                              >
                                <option value="g">g (ກຣາມ)</option>
                                <option value="ml">ml (ມິນລິລິດ)</option>
                                <option value="pcs">pcs (ອັນ/ແກ້ວ)</option>
                                <option value="pack">pack (ແພັກ)</option>
                                <option value="kg">kg (ກິໂລ)</option>
                                <option value="l">l (ລິດ)</option>
                              </select>
                            </div>

                            <div>
                              <label className="text-[9px] font-black uppercase text-slate-400 block mb-0.5" title="ຂະໜາດຕໍ່ 1 ຖົງໃຫຍ່ທີ່ຊື້">
                                ຂະໜາດ/ແພັກຊື້
                              </label>
                              <input
                                type="number"
                                step="any"
                                placeholder="1000"
                                value={ing.packSize}
                                onChange={e => setRecipeIngredients(prev => prev.map((item, i) => i === idx ? { ...item, packSize: e.target.value } : item))}
                                className="crystal-input w-full !text-xs font-mono font-bold text-center"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-neutral-800">
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
                    {isSavingRecipe ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກສູດ & Sync ວັດຖຸດິບ'}
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
