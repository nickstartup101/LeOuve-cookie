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
  CheckCircle, Info 
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

export default function Inventory() {
  const { i18n } = useTranslation();
  const [subTab, setSubTab] = useState<'sales' | 'recipes' | 'balances'>('sales');
  
  const [products, setProducts] = useState<any[]>([]);
  const [supplierPrices, setSupplierPrices] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [salesRecords, setSalesRecords] = useState<any[]>([]);
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<any | null>(null);
  
  // CSV Import States
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [csvEncoding, setCsvEncoding] = useState<string>('UTF-8');
  const [csvPreview, setCsvPreview] = useState<{
    recipes: Array<{ menuName: string; ingredients: Array<{ name: string; amount: number; unit: string }> }>;
    newProducts: Array<{ name: string; unit: string }>;
    existingProductsCount: number;
  } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatusMessage, setImportStatusMessage] = useState('');
  const [importStats, setImportStats] = useState({
    productsCreated: 0,
    recipesAdded: 0,
    recipesUpdated: 0,
    recipesSkipped: 0,
    totalProducts: 0,
    totalRecipes: 0
  });

  const parseCSV = (text: string): string[][] => {
    const lines: string[][] = [];
    const cleanText = text.replace(/^\uFEFF/, '').trim();
    const rawLines = cleanText.split(/\r?\n/);
    
    let delimiter = ',';
    if (rawLines[0]) {
      const commaCount = (rawLines[0].match(/,/g) || []).length;
      const semiCount = (rawLines[0].match(/;/g) || []).length;
      if (semiCount > commaCount) delimiter = ';';
    }

    rawLines.forEach(line => {
      if (!line.trim()) return;
      const row: string[] = [];
      let inQuotes = false;
      let currentCell = '';
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === delimiter && !inQuotes) {
          row.push(currentCell.replace(/^"|"$/g, '').trim());
          currentCell = '';
        } else {
          currentCell += char;
        }
      }
      row.push(currentCell.replace(/^"|"$/g, '').trim());
      lines.push(row);
    });
    return lines;
  };

  const parseSelectedFileContent = (file: File, encoding: string) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      try {
        const parsed = parseCSV(text);
        if (parsed.length < 2) {
          alert("CSV is empty or invalid. Header row and at least one recipe row are required.");
          return;
        }

        const headers = parsed[0];
        const rows = parsed.slice(1);
        const newProductsMap = new Map<string, string>();
        const parsedRecipesList: Array<{ menuName: string; ingredients: Array<{ name: string; amount: number; unit: string }> }> = [];

        const ingredientCols: Array<{ name: string; unit: string; originalHeader: string; colIdx: number }> = [];
        for (let colIdx = 1; colIdx < headers.length; colIdx++) {
          const rawHeader = headers[colIdx];
          if (!rawHeader || !rawHeader.trim()) continue;
          
          const cleanName = rawHeader.replace(/\s*\([^)]*\)/g, '').trim();
          const unitMatch = rawHeader.match(/\(([^)]+)\)/);
          const unit = unitMatch ? unitMatch[1].trim() : 'g';
          
          if (cleanName) {
            ingredientCols.push({ name: cleanName, unit, originalHeader: rawHeader, colIdx });
          }
        }

        rows.forEach(row => {
          const drinkName = row[0]?.trim();
          if (!drinkName) return;

          const recipeIngs: Array<{ name: string; amount: number; unit: string }> = [];
          ingredientCols.forEach(col => {
            const val = parseFloat(row[col.colIdx]) || 0;
            if (val > 0) {
              recipeIngs.push({ name: col.name, amount: val, unit: col.unit });
              const exists = products.some(p => p.name.trim().toLowerCase() === col.name.toLowerCase());
              if (!exists) newProductsMap.set(col.name, col.unit);
            }
          });

          if (recipeIngs.length > 0) {
            parsedRecipesList.push({ menuName: drinkName, ingredients: recipeIngs });
          }
        });

        setCsvPreview({
          recipes: parsedRecipesList,
          newProducts: Array.from(newProductsMap.entries()).map(([name, unit]) => ({ name, unit })),
          existingProductsCount: products.length
        });
      } catch (err: any) {
        alert("Error parsing CSV: " + err.message);
      }
    };
    reader.readAsText(file, encoding);
  };

  useEffect(() => {
    if (selectedFile) parseSelectedFileContent(selectedFile, csvEncoding);
  }, [selectedFile, csvEncoding]);

  const handleCsvFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleConfirmCsvImport = async () => {
    if (!csvPreview) return;
    setIsImporting(true);
    setImportProgress(1);
    setImportStatusMessage(i18n.language === 'la' ? 'ກຳລັງຈັດລະບົບວັດຖຸດິບ...' : 'Analyzing raw materials details...');
    setImportStats({
      productsCreated: 0,
      recipesAdded: 0,
      recipesUpdated: 0,
      recipesSkipped: 0,
      totalProducts: csvPreview.newProducts.length,
      totalRecipes: csvPreview.recipes.length
    });

    try {
      const productMapByName = new Map<string, string>();
      products.forEach(p => productMapByName.set(p.name.trim().toLowerCase(), p.id));

      let prodsCreated = 0;
      if (csvPreview.newProducts.length > 0) {
        setImportStatusMessage(i18n.language === 'la' ? `ກຳລັງສ້າງວັດຖຸດິບໃໝ່...` : `Creating missing ingredients...`);
        const prodPromises = csvPreview.newProducts.map(async (newProd) => {
          const docRef = await addDoc(collection(db, 'products'), {
            name: newProd.name.trim(),
            unit: newProd.unit,
            category: 'Ingredients',
            minStock: 100,
            createdAt: serverTimestamp()
          });
          productMapByName.set(newProd.name.trim().toLowerCase(), docRef.id);
          prodsCreated++;
          setImportStats(prev => ({ ...prev, productsCreated: prodsCreated }));
          const percentage = Math.round((prodsCreated / csvPreview.newProducts.length) * 30);
          setImportProgress(percentage);
        });
        await Promise.all(prodPromises);
      }

      setImportProgress(30);
      const overwrite = confirm(
        i18n.language === 'la' 
          ? "ທ່ານມາກວດພົບສູດທີ່ມີຊື່ດຽວກັນແລ້ວ ຕ້ອງການຂຽນທັບ (Overwrite) ຫຼື ບໍ່?" 
          : "Duplicate names detected. Overwrite existing formulas with matching names?"
      );

      let recsProcessed = 0;
      setImportStatusMessage(i18n.language === 'la' ? `ກຳລັງບັນທຶກສູດເຄື່ອງດື່ມ Le Ouve...` : `Syncing formulas to database...`);

      const recipePromises = csvPreview.recipes.map(async (r) => {
        const ingredientsPayload = r.ingredients.map(ing => {
          const pId = productMapByName.get(ing.name.trim().toLowerCase());
          return { productId: pId || '', amount: ing.amount, unit: ing.unit };
        }).filter(item => item.productId !== '');

        const recipePayload = {
          menuName: r.menuName.trim(),
          ingredients: ingredientsPayload,
          updatedAt: serverTimestamp()
        };

        const existingRecipe = recipes.find(rec => rec.menuName.trim().toLowerCase() === r.menuName.trim().toLowerCase());
        let isAdded = false, isUpdated = false, isSkipped = false;

        if (ingredientsPayload.length === 0) {
          isSkipped = true;
        } else if (existingRecipe) {
          if (overwrite) {
            await setDoc(doc(db, 'recipes', existingRecipe.id), recipePayload, { merge: true });
            isUpdated = true;
          } else {
            isSkipped = true;
          }
        } else {
          await addDoc(collection(db, 'recipes'), recipePayload);
          isAdded = true;
        }

        recsProcessed++;
        setImportStats(prev => ({
          ...prev,
          recipesAdded: prev.recipesAdded + (isAdded ? 1 : 0),
          recipesUpdated: prev.recipesUpdated + (isUpdated ? 1 : 0),
          recipesSkipped: prev.recipesSkipped + (isSkipped ? 1 : 0)
        }));

        const totalRecipesCount = csvPreview.recipes.length;
        setImportProgress(30 + Math.round((recsProcessed / totalRecipesCount) * 70));
      });

      await Promise.all(recipePromises);
      setImportProgress(100);
      setImportStatusMessage(i18n.language === 'la' ? `ການນຳເຂົ້າສູດສຳເລັດສົມບູນແລ້ວ!` : `CSV integration finished successfully!`);
    } catch (err) {
      setIsImporting(false);
      handleFirestoreError(err, OperationType.WRITE, 'recipes');
    }
  };
  
  // Recipe Builder Form State
  const [menuName, setMenuName] = useState('');
  const [recipeIngredients, setRecipeIngredients] = useState<Array<{ productId: string; amount: number | string; unit?: string }>>([]);
  const [tempPackSizes, setTempPackSizes] = useState<{ [productId: string]: string | number }>({});
  
  // Sales Sheet Manual Entry
  const [quantitiesSold, setQuantitiesSold] = useState<{ [recipeId: string]: number }>({});
  const [isDeducting, setIsDeducting] = useState(false);
  
  // Adjustment Entry
  const [refutingId, setRefutingId] = useState<string | null>(null);
  const [adjustmentValue, setAdjustmentValue] = useState<number>(0);
  const [adjustmentRemark, setAdjustmentRemark] = useState<string>('');

  useEffect(() => {
    setLoading(true);
    const unsubP = onSnapshot(query(collection(db, 'products')), snap => setProducts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))), e => handleFirestoreError(e, OperationType.LIST, 'products'));
    const unsubS = onSnapshot(query(collection(db, 'supplierPrices')), snap => setSupplierPrices(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))), e => handleFirestoreError(e, OperationType.LIST, 'supplierPrices'));
    const unsubR = onSnapshot(query(collection(db, 'recipes')), snap => setRecipes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))), e => handleFirestoreError(e, OperationType.LIST, 'recipes'));
    const unsubSales = onSnapshot(query(collection(db, 'menu_sales')), snap => setSalesRecords(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))), e => handleFirestoreError(e, OperationType.LIST, 'menu_sales'));
    const unsubAdj = onSnapshot(query(collection(db, 'inventory')), snap => {
      setAdjustments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, e => handleFirestoreError(e, OperationType.LIST, 'inventory'));

    return () => { unsubP(); unsubS(); unsubR(); unsubSales(); unsubAdj(); };
  }, []);

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
        if (sizePerPack <= 1) size = getCommercialPackSize(p.name, (p.unit || 'g').toLowerCase());
        
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
          productName: prod?.name || 'Unknown item',
          unitCost: costStructure.perUnit,
          unitLabel: ing.unit || prod?.unit || 'g',
          calculatedCost: cost
        };
      });

      return { ...recipe, ingredientsDetailed: parsedIngredients, calculatedCost: totalCost };
    });
  }, [recipes, products, productUnitCosts]);

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

  const totalShopInventoryValue = useMemo(() => {
    return inventoryBalances.reduce((sum, item) => sum + item.totalValuation, 0);
  }, [inventoryBalances]);

  const handleSaveRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!menuName.trim()) { alert("Please enter a menu name."); return; }
    if (recipeIngredients.length === 0) { alert("Please add at least one ingredient mapping."); return; }

    try {
      const updatePromises = Object.entries(tempPackSizes).map(async ([prodId, sizeVal]) => {
        const parsedSize = parseFloat(String(sizeVal));
        if (!isNaN(parsedSize) && parsedSize > 0) {
          await updateDoc(doc(db, 'products', prodId), { packSize: parsedSize, updatedAt: serverTimestamp() });
        }
      });
      await Promise.all(updatePromises);

      const recipePayload = {
        menuName: menuName.trim(),
        ingredients: recipeIngredients.map(ing => ({
          productId: ing.productId,
          amount: parseFloat(String(ing.amount)) || 0,
          unit: ing.unit || 'g'
        })),
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
      setRecipeIngredients([]);
      setTempPackSizes({});
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'recipes');
    }
  };

  const handleSaveSalesDeduction = async () => {
    setIsDeducting(true);
    try {
      await setDoc(doc(db, 'menu_sales', selectedDate), {
        date: selectedDate,
        itemsSold: quantitiesSold,
        updatedAt: serverTimestamp()
      }, { merge: true });
      alert("Daily sales logged! Inventory counts updated in real-time.");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'menu_sales');
    } finally {
      setIsDeducting(false);
    }
  };

  const handleSaveAdjustment = async (productId: string) => {
    if (!adjustmentValue) return;
    try {
      await addDoc(collection(db, 'inventory'), {
        productId,
        amount: Number(adjustmentValue),
        remark: adjustmentRemark || 'Manual Adjustment',
        date: format(new Date(), 'yyyy-MM-dd'),
        timestamp: serverTimestamp()
      });
      setRefutingId(null);
      setAdjustmentValue(0);
      setAdjustmentRemark('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'inventory');
    }
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 bg-white dark:bg-[#073069] rounded-2xl border border-[#052659]/10 dark:border-white/5 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg">
              <Package className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#052659] dark:text-white">
              {i18n.language === 'la' ? 'ຄັງສາງ & ສູດເຄື່ອງດື່ມ' : 'Inventory & Cost Estimator'}
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {i18n.language === 'la' ? 'ຄິດໄລ່ຕົ້ນທຶນ Recipe ຂອງຮ້ານ Le Ouve ແລະ ຕັດຍອດສາງຕາມການຂາຍ' : 'Real-time recipe costs & automated sales deductions.'}
          </p>
        </div>

        <div className="p-4 bg-gradient-to-tr from-[#052659]/5 to-emerald-500/5 dark:from-[#052659] dark:to-emerald-500/10 border border-[#052659]/15 dark:border-white/10 rounded-xl flex items-center gap-4">
          <div className="p-3 bg-emerald-500 text-white rounded-lg shadow-md">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-black tracking-widest text-[#052659]/60 dark:text-white/60">
              {i18n.language === 'la' ? 'ມູນຄ່າສາງຄົງເຫຼືອໂດຍປະມານ' : 'Estimated Remaining Asset Value'}
            </p>
            <h2 className="text-2xl font-black text-[#052659] dark:text-emerald-400">
              {totalShopInventoryValue.toLocaleString()} <span className="text-sm font-medium">₭</span>
            </h2>
          </div>
        </div>
      </div>

      <div className="flex border-b border-slate-200 dark:border-white/10 gap-1 pb-px">
        {[
          { key: 'sales', icon: ShoppingCart, label: i18n.language === 'la' ? 'ຍອດຂາຍປະຈຳວັນ & ຕັດຍອດ' : 'Sales Deductions' },
          { key: 'recipes', icon: BookOpen, label: i18n.language === 'la' ? 'ສູດເຄື່ອງດື່ມ (Recipe)' : 'Recipes Builder' },
          { key: 'balances', icon: Layers, label: i18n.language === 'la' ? 'ຍອດສາງ & ມູນຄ່າຕົ້ນທຶນ' : 'Inventory & Costs' }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setSubTab(tab.key as any)}
            className={`px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 cursor-pointer ${subTab === tab.key ? 'border-[#052659] dark:border-white text-[#052659] dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white'}`}
          >
            <tab.icon className="w-4 h-4" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {subTab === 'sales' && (
        <div className="bg-white dark:bg-[#073069] p-6 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm space-y-6">
          <div className="flex justify-between items-center border-b border-slate-100 dark:border-white/10 pb-4">
            <div>
              <h3 className="text-base font-bold text-[#052659] dark:text-white">Daily Sales Logging</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Specify total servings sold to deduct raw stock automatically.</p>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#052659] text-[#052659] dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recipesWithCalculatedCosts.map((rec) => (
              <div key={rec.id} className="p-4 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-slate-900/40 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-[#052659] dark:text-white">{rec.menuName}</h4>
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-extrabold">
                    Est Cost: {Math.round(rec.calculatedCost).toLocaleString()} ₭
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setQuantitiesSold(prev => ({ ...prev, [rec.id]: Math.max(0, (prev[rec.id] || 0) - 1) }))} className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-white/10 font-bold">-</button>
                  <input
                    type="number"
                    min="0"
                    value={quantitiesSold[rec.id] || 0}
                    onChange={(e) => setQuantitiesSold(prev => ({ ...prev, [rec.id]: parseInt(e.target.value) || 0 }))}
                    className="w-14 py-1.5 font-bold text-center border border-slate-300 dark:border-white/10 rounded-lg dark:bg-[#052659] text-sm text-[#052659] dark:text-white"
                  />
                  <button onClick={() => setQuantitiesSold(prev => ({ ...prev, [rec.id]: (prev[rec.id] || 0) + 1 }))} className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-white/10 font-bold">+</button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-white/10">
            <button
              onClick={handleSaveSalesDeduction}
              disabled={isDeducting}
              className="px-6 py-2.5 bg-[#052659] dark:bg-emerald-600 hover:bg-[#0c408c] text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-lg cursor-pointer"
            >
              {isDeducting ? 'Deducting...' : 'Commit & Deduct'}
            </button>
          </div>
        </div>
      )}

      {subTab === 'recipes' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-white dark:bg-[#073069] p-4 rounded-xl border border-slate-200 dark:border-white/5">
            <h3 className="text-sm font-bold text-[#052659] dark:text-white">Le Ouve Recipes Database</h3>
            <div className="flex gap-2">
              <button
                onClick={() => { setCsvPreview(null); setIsCsvModalOpen(true); }}
                className="px-4 py-2 border border-slate-300 dark:border-white/10 text-xs font-black uppercase tracking-widest rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 flex items-center gap-1.5 cursor-pointer"
              >
                <UploadCloud className="w-4 h-4" />
                <span>Import CSV</span>
              </button>
              <button
                onClick={() => { setEditingRecipe(null); setMenuName(''); setRecipeIngredients([]); setIsRecipeModalOpen(true); }}
                className="px-4 py-2 bg-emerald-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-emerald-700 flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create Recipe</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recipesWithCalculatedCosts.map((recipe) => (
              <div key={recipe.id} className="bg-white dark:bg-[#073069] rounded-2xl border border-slate-200 dark:border-white/5 p-6 space-y-4 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start gap-2">
                    <h4 className="text-base font-black text-[#052659] dark:text-white">{recipe.menuName}</h4>
                    <span className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-extrabold px-2.5 py-1 rounded-full">
                      Cost: {Math.round(recipe.calculatedCost || 0).toLocaleString()} ₭
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-white/5 mt-3 max-h-40 overflow-y-auto">
                    {recipe.ingredientsDetailed?.map((ing: any, i: number) => (
                      <div key={i} className="flex justify-between py-1 text-xs">
                        <span className="text-slate-600 dark:text-slate-300">{ing.productName}</span>
                        <span className="font-bold">{ing.amount} {ing.unitLabel}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-white/10">
                  <button onClick={() => { setEditingRecipe(recipe); setMenuName(recipe.menuName); setRecipeIngredients(recipe.ingredients || []); setIsRecipeModalOpen(true); }} className="p-1.5 text-slate-500 hover:text-blue-600"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={async () => { if (confirm("Delete recipe?")) await deleteDoc(doc(db, 'recipes', recipe.id)); }} className="p-1.5 text-slate-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {subTab === 'balances' && (
        <div className="bg-white dark:bg-[#073069] rounded-2xl border border-slate-200 dark:border-white/5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-[10px] font-black uppercase text-slate-400">
                <tr>
                  <th className="p-4">Product Name</th>
                  <th className="p-4 text-center">Purchased</th>
                  <th className="p-4 text-center">Consumed</th>
                  <th className="p-4 text-center">Remaining</th>
                  <th className="p-4 text-right">Valuation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {inventoryBalances.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                    <td className="p-4 font-bold text-slate-800 dark:text-white">{item.name}</td>
                    <td className="p-4 text-center">{item.totalIn.toLocaleString()} {item.unitLabel}</td>
                    <td className="p-4 text-center">{Math.round(item.totalConsumed).toLocaleString()} {item.unitLabel}</td>
                    <td className="p-4 text-center font-black">{Math.round(item.finalBalance).toLocaleString()} {item.unitLabel}</td>
                    <td className="p-4 text-right font-black text-emerald-600 dark:text-emerald-400">{Math.round(item.totalValuation).toLocaleString()} ₭</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recipe Modal */}
      <AnimatePresence>
        {isRecipeModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white dark:bg-[#073069] rounded-2xl border border-slate-200 dark:border-white/10 w-full max-w-lg shadow-xl p-6 space-y-4">
              <h3 className="text-base font-bold text-[#052659] dark:text-white">{editingRecipe ? 'Edit Recipe' : 'Create Le Ouve Recipe'}</h3>
              <form onSubmit={handleSaveRecipe} className="space-y-4">
                <input
                  type="text"
                  required
                  placeholder="Drink Title (e.g. Iced Caramel Macchiato)"
                  value={menuName}
                  onChange={(e) => setMenuName(e.target.value)}
                  className="crystal-input w-full !text-xs font-bold"
                />

                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-400">
                    <span>Ingredients</span>
                    <button type="button" onClick={() => setRecipeIngredients(prev => [...prev, { productId: products[0]?.id || '', amount: '', unit: products[0]?.unit || 'g' }])} className="text-sky-500">+ Add Ingredient</button>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {recipeIngredients.map((ing, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <select
                          value={ing.productId}
                          onChange={(e) => {
                            const pId = e.target.value;
                            const pr = products.find(p => p.id === pId);
                            setRecipeIngredients(prev => prev.map((item, i) => i === idx ? { ...item, productId: pId, unit: pr?.unit || 'g' } : item));
                          }}
                          className="crystal-input flex-1 !text-xs"
                        >
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <input
                          type="number"
                          placeholder="Qty"
                          value={ing.amount}
                          onChange={(e) => setRecipeIngredients(prev => prev.map((item, i) => i === idx ? { ...item, amount: e.target.value } : item))}
                          className="crystal-input w-20 !text-xs text-center font-bold"
                        />
                        <button type="button" onClick={() => setRecipeIngredients(prev => prev.filter((_, i) => i !== idx))} className="text-red-500 p-1">✕</button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setIsRecipeModalOpen(false)} className="px-4 py-2 border rounded-xl text-xs font-bold">Cancel</button>
                  <button type="submit" className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold">Save Recipe</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CSV Import Modal */}
      <AnimatePresence>
        {isCsvModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white dark:bg-[#073069] rounded-2xl border border-slate-200 dark:border-white/10 w-full max-w-xl shadow-xl p-6 space-y-4">
              <h3 className="text-base font-bold text-[#052659] dark:text-white">Import Recipes (.CSV)</h3>
              
              {!csvPreview ? (
                <div className="border-2 border-dashed border-slate-300 dark:border-white/10 rounded-2xl p-8 text-center relative hover:bg-slate-50 dark:hover:bg-white/5">
                  <input type="file" accept=".csv" onChange={handleCsvFileSelect} className="absolute inset-0 opacity-0 cursor-pointer" />
                  <UploadCloud className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-700 dark:text-white">Click or Drag & Drop Recipes .CSV</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs font-bold text-emerald-600">Parsed {csvPreview.recipes.length} recipes ({csvPreview.newProducts.length} new materials detected).</p>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setCsvPreview(null)} className="px-4 py-2 border rounded-xl text-xs font-bold">Back</button>
                    <button onClick={handleConfirmCsvImport} className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold">Confirm & Sync</button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
