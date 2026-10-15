import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  BookOpen,
  Plus,
  Trash2,
  Edit3,
  Receipt,
  CheckCircle,
  AlertCircle,
  X,
  Save,
  DollarSign,
  Gift,
  Clock,
  Layers,
  Search,
  Droplet,
  Coffee,
  User,
  Calendar,
  CreditCard,
  ArrowRight
} from 'lucide-react';

// ==========================================
// 1. TYPE DEFINITIONS
// ==========================================

export type UnitType = 'g' | 'ml' | 'pcs' | 'tsp' | 'tbsp';

export interface RecipeIngredient {
  id: string;
  name: string;
  amountPerBatch: number;
  unit: UnitType;
  costPerUnitLAK: number;
  totalCostLAK: number;
}

export interface Recipe {
  id: string;
  name: string;
  category: 'COOKIE' | 'BAKERY' | 'BEVERAGE';
  batchYield: number; // ຈຳນວນກ້ອນ/ຈອກຕໍ່ 1 ເຕົາ
  overheadCostPerPiece: number; // ຄ່າໄຟ/ນ້ຳ/ຄ່າແຮງງານຕໍ່ກ້ອນ
  sellingPrice: number;
  ingredients: RecipeIngredient[];
  totalBatchCost: number;
  costPerPiece: number;
  profitPerPiece: number;
  marginPercent: number;
  prepNotes?: string;
  pricingNotes?: string;
  currentLiquidMl?: number; // bottle gauge
  maxLiquidMl?: number;
}

export interface PosBillItem {
  recipeId: string;
  recipeName: string;
  totalMadeQty: number; // ຈຳນວນທີ່ອົບອອກມາ
  actualSoldQty: number; // ຈຳນວນທີ່ຂາຍໄດ້ເງິນ
  sampleQty: number; // ຈຳນວນທີ່ຊິມເອງ ຫຼື ແຖມ
  pricePerUnit: number;
  totalPrice: number;
}

export interface PosBill {
  id: string;
  billNumber: string;
  customerName: string;
  orderDate: string;
  status: 'PENDING_SETTLEMENT' | 'SETTLED';
  items: PosBillItem[];
  estimatedTotalLAK: number;
  actualRevenueLAK?: number;
  paymentMethod: 'BCEL_ONE' | 'CASH' | 'TRANSFER';
  notes?: string;
  slipImageUrl?: string;
  arDebtId?: string;
  financeTxId?: string;
  createdAt?: any;
}

// ຕົວແປງຫົວໜ່ວຍຊ້ອນຊາ/ຊ້ອນໂຕະເປັນກຣາມ
export const unitToGramMultiplier = (unit: UnitType): number => {
  switch (unit) {
    case 'tsp': return 5;
    case 'tbsp': return 15;
    default: return 1;
  }
};

export const Inventory: React.FC = () => {
  // ==========================================
  // 2. STATE MANAGEMENT
  // ==========================================
  const [activeTab, setActiveTab] = useState<'pos_terminal' | 'pos_bills' | 'recipes'>('pos_terminal');

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [posBills, setPosBills] = useState<PosBill[]>([]);

  // POS Daily Terminal Cart State
  const [cart, setCart] = useState<{ [recipeId: string]: number }>({});
  const [posCustomer, setPosCustomer] = useState('');
  const [posNotes, setPosNotes] = useState('');

  // Modals
  const [editingBill, setEditingBill] = useState<PosBill | null>(null);
  const [settlingBill, setSettlingBill] = useState<PosBill | null>(null);
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);

  // In-App Confirm Dialog
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Bill Filter
  const [billFilter, setBillFilter] = useState<'ALL' | 'PENDING' | 'SETTLED'>('ALL');
  const [searchBillQuery, setSearchBillQuery] = useState('');

  // ==========================================
  // 3. FIRESTORE REALTIME SYNC
  // ==========================================
  useEffect(() => {
    // 1. ດຶງສູດ Recipes
    const qRecipes = query(collection(db, 'recipes'), orderBy('name', 'asc'));
    const unsubRecipes = onSnapshot(qRecipes, (snap) => {
      setRecipes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Recipe)));
    });

    // 2. ດຶງບິນ POS
    const qBills = query(collection(db, 'pos_bills'), orderBy('orderDate', 'desc'));
    const unsubBills = onSnapshot(qBills, (snap) => {
      setPosBills(snap.docs.map(d => ({ id: d.id, ...d.data() } as PosBill)));
    });

    return () => {
      unsubRecipes();
      unsubBills();
    };
  }, []);

  // ==========================================
  // 4. POS TERMINAL: ISSUE BILL (PENDING -> AR)
  // ==========================================
  const cartSummary = useMemo(() => {
    let totalEstimated = 0;
    const items: PosBillItem[] = [];

    Object.entries(cart).forEach(([recipeId, qty]) => {
      if (qty > 0) {
        const r = recipes.find(item => item.id === recipeId);
        if (r) {
          const itemTotal = qty * r.sellingPrice;
          totalEstimated += itemTotal;
          items.push({
            recipeId: r.id,
            recipeName: r.name,
            totalMadeQty: qty,
            actualSoldQty: qty,
            sampleQty: 0,
            pricePerUnit: r.sellingPrice,
            totalPrice: itemTotal
          });
        }
      }
    });

    return { items, totalEstimated };
  }, [cart, recipes]);

  const handleIssuePosBill = async () => {
    if (cartSummary.items.length === 0) return;

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const billNumber = `POS-${Date.now().toString().slice(-6)}`;
      const customer = posCustomer.trim() || 'ລູກຄ້າ POS ທົ່ວໄປ';

      // 1. ສ້າງ ໜີ້ຕ້ອງຮັບ (AR) ໃນ Finance ໄວ້ກ່ອນ
      const arRef = await addDoc(collection(db, 'debts_apar'), {
        type: 'AR',
        counterparty: customer,
        amountLAK: cartSummary.totalEstimated,
        dueDate: todayStr,
        status: 'PENDING',
        description: `ບິນ POS #${billNumber} (ລໍຖ້າເຄຍບິນ)`,
        createdAt: serverTimestamp()
      });

      // 2. ສ້າງໃບບິນ POS ທີ່ມີສະຖານະ PENDING_SETTLEMENT
      await addDoc(collection(db, 'pos_bills'), {
        billNumber,
        customerName: customer,
        orderDate: todayStr,
        status: 'PENDING_SETTLEMENT',
        items: cartSummary.items,
        estimatedTotalLAK: cartSummary.totalEstimated,
        paymentMethod: 'BCEL_ONE',
        notes: posNotes.trim(),
        arDebtId: arRef.id,
        createdAt: serverTimestamp()
      });

      // 3. Reset Cart
      setCart({});
      setPosCustomer('');
      setPosNotes('');
      setActiveTab('pos_bills');
    } catch (err) {
      console.error('Error creating POS bill:', err);
    }
  };

  // ==========================================
  // 5. FILTERED POS BILLS
  // ==========================================
  const filteredBills = useMemo(() => {
    return posBills.filter(bill => {
      if (billFilter === 'PENDING' && bill.status !== 'PENDING_SETTLEMENT') return false;
      if (billFilter === 'SETTLED' && bill.status !== 'SETTLED') return false;

      if (searchBillQuery.trim()) {
        const q = searchBillQuery.toLowerCase();
        const matchNum = bill.billNumber.toLowerCase().includes(q);
        const matchCustomer = bill.customerName.toLowerCase().includes(q);
        if (!matchNum && !matchCustomer) return false;
      }
      return true;
    });
  }, [posBills, billFilter, searchBillQuery]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-neutral-200 font-sans p-6 space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-neutral-800/80 pb-5">
        <div>
          <h1 className="font-serif text-2xl md:text-3xl text-white tracking-wide flex items-center gap-3">
            Inventory & POS System
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            ສູດຂະໜົມ, ຕັດສະຕັອກຕາມເຕົາ, ອອກບິນ POS ເຂົ້າ AR, ແລະ ເຄຍບິນຂຶ້ນ Dashboard
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-[#141414] border border-neutral-800 rounded-xl p-1 text-xs">
          <button
            onClick={() => setActiveTab('pos_terminal')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'pos_terminal'
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            ອອກບິນ POS ປະຈຳວັນ
          </button>
          <button
            onClick={() => setActiveTab('pos_bills')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
              activeTab === 'pos_bills'
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <span>ປະຫວັດບິນ & ເຄຍບິນ</span>
            {posBills.filter(b => b.status === 'PENDING_SETTLEMENT').length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('recipes')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'recipes'
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            ສູດຂະໜົມ & ຕົ້ນທຶນ ({recipes.length})
          </button>
        </div>
      </div>

      {/* ==========================================
          TAB 1: POS TERMINAL
          ========================================== */}
      {activeTab === 'pos_terminal' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Menu Selection */}
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              ເລືອກເມນູທີ່ອົບ/ຜະລິດອອກມາປະຈຳວັນ
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {recipes.map(recipe => {
                const currentQty = cart[recipe.id] || 0;
                return (
                  <div
                    key={recipe.id}
                    className="p-4 rounded-2xl bg-[#141414] border border-neutral-800/80 hover:border-neutral-700 transition-all flex flex-col justify-between space-y-3"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-400 font-mono">
                          {recipe.category}
                        </span>
                        <span className="text-xs font-mono font-medium text-emerald-400">
                          {recipe.sellingPrice.toLocaleString()} ₭
                        </span>
                      </div>
                      <h4 className="font-serif text-base text-white mt-2">{recipe.name}</h4>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        ຕົ້ນທຶນ: {recipe.costPerPiece?.toLocaleString() || 0} ₭ / ກ້ອນ
                      </p>
                    </div>

                    <div className="flex items-center justify-between border-t border-neutral-800/80 pt-3">
                      <span className="text-xs text-neutral-400">ຈຳນວນທີ່ອົບ:</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCart(prev => ({ ...prev, [recipe.id]: Math.max(0, currentQty - 1) }))}
                          className="w-7 h-7 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-300 hover:text-white"
                        >
                          -
                        </button>
                        <span className="w-8 text-center font-mono text-sm font-bold text-white">
                          {currentQty}
                        </span>
                        <button
                          type="button"
                          onClick={() => setCart(prev => ({ ...prev, [recipe.id]: currentQty + 1 }))}
                          className="w-7 h-7 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-300 hover:text-white"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cart Checkout Box */}
          <div className="bg-[#141414] border border-neutral-800 rounded-2xl p-5 flex flex-col justify-between space-y-4 h-fit">
            <div className="space-y-4">
              <div className="border-b border-neutral-800 pb-3 flex items-center justify-between">
                <h3 className="font-serif text-base text-white flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-amber-400" />
                  ສະຫຼຸບໃບບິນ POS (ລໍຖ້າເຄຍ)
                </h3>
                <span className="text-[11px] text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-800/40">
                  AR Pending
                </span>
              </div>

              {/* Customer Info */}
              <div className="space-y-2 text-xs">
                <div>
                  <label className="text-neutral-400 block mb-1">ຊື່ລູກຄ້າ / ໂຕະ / ເລກອໍເດີ</label>
                  <input
                    type="text"
                    placeholder="ຕົວຢ່າງ: ໂຕະ 1, ລູກຄ້າ Pre-order..."
                    value={posCustomer}
                    onChange={(e) => setPosCustomer(e.target.value)}
                    className="w-full bg-[#0a0a0a] border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-neutral-400 block mb-1">ໝາຍເຫດ (Notes)</label>
                  <input
                    type="text"
                    placeholder="ໃສ່ກ່ອງ, ຫວານໜ້ອຍ..."
                    value={posNotes}
                    onChange={(e) => setPosNotes(e.target.value)}
                    className="w-full bg-[#0a0a0a] border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Cart List */}
              <div className="space-y-2 text-xs divide-y divide-neutral-800/60 max-h-56 overflow-y-auto pt-2">
                {cartSummary.items.length === 0 ? (
                  <div className="py-8 text-center text-neutral-500">ຍັງບໍ່ມີເມນູໃນບິນ</div>
                ) : (
                  cartSummary.items.map(it => (
                    <div key={it.recipeId} className="pt-2 flex justify-between items-center">
                      <div>
                        <div className="text-white font-medium">{it.recipeName}</div>
                        <div className="text-[11px] text-neutral-500 font-mono">
                          {it.totalMadeQty} ກ້ອນ @ {it.pricePerUnit.toLocaleString()}
                        </div>
                      </div>
                      <span className="font-mono text-neutral-200 font-medium">
                        {it.totalPrice.toLocaleString()} ₭
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Total and Submit */}
            <div className="space-y-3 pt-3 border-t border-neutral-800">
              <div className="flex justify-between items-center">
                <span className="text-xs text-neutral-400">ຍອດປະເມີນລວມ:</span>
                <span className="font-serif text-xl font-bold text-amber-400 font-mono">
                  {cartSummary.totalEstimated.toLocaleString()} ₭
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-[11px] text-neutral-400 leading-relaxed">
                ℹ️ <strong>ໝາຍເຫດ:</strong> ເມື່ອກົດອອກບິນ ຍອດຈະແລ່ນໄປຢູ່ <strong>ໜີ້ຕ້ອງຮັບ (AR)</strong> ທັນທີ. ຫຼັງຈາກລູກຄ້າຊຳລະແລ້ວ ໃຫ້ມາກົດ <em>"ເຄຍບິນ"</em> ເພື່ອເພີ່ມຍອດຂາຍເຂົ້າ Dashboard.
              </div>

              <button
                type="button"
                disabled={cartSummary.items.length === 0}
                onClick={handleIssuePosBill}
                className="w-full py-2.5 bg-white hover:bg-neutral-200 text-black font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-40 shadow-md"
              >
                <span>ອອກບິນ POS (ສົ່ງເຂົ້າ AR)</span>
                <ArrowRight className="w-4 h-4 text-black" />
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ==========================================
          TAB 2: POS BILLS & SETTLEMENT
          ========================================== */}
      {activeTab === 'pos_bills' && (
        <div className="space-y-4">
          
          {/* Controls Bar */}
          <div className="bg-[#141414] border border-neutral-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* Status Tabs */}
            <div className="flex items-center bg-[#0a0a0a] border border-neutral-800 rounded-xl p-1">
              <button
                onClick={() => setBillFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  billFilter === 'ALL' ? 'bg-neutral-800 text-white' : 'text-neutral-400'
                }`}
              >
                ທັງໝົດ ({posBills.length})
              </button>
              <button
                onClick={() => setBillFilter('PENDING')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  billFilter === 'PENDING' ? 'bg-amber-950/70 text-amber-300 border border-amber-800/40' : 'text-neutral-400'
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                ລໍຖ້າເຄຍ (AR) ({posBills.filter(b => b.status === 'PENDING_SETTLEMENT').length})
              </button>
              <button
                onClick={() => setBillFilter('SETTLED')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  billFilter === 'SETTLED' ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/40' : 'text-neutral-400'
                }`}
              >
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                ເຄຍແລ້ວ (Dashboard) ({posBills.filter(b => b.status === 'SETTLED').length})
              </button>
            </div>

            {/* Search */}
            <div className="flex items-center gap-2 bg-[#0a0a0a] border border-neutral-800 rounded-xl px-3 py-1.5 w-64">
              <Search className="w-3.5 h-3.5 text-neutral-500" />
              <input
                type="text"
                placeholder="ຄົ້ນຫາເລກບິນ ຫຼື ຊື່ລູກຄ້າ..."
                value={searchBillQuery}
                onChange={(e) => setSearchBillQuery(e.target.value)}
                className="bg-transparent text-white focus:outline-none w-full"
              />
            </div>
          </div>

          {/* Bills List */}
          <div className="space-y-3">
            {filteredBills.length === 0 ? (
              <div className="py-12 text-center text-neutral-500 text-xs border border-neutral-800 rounded-2xl bg-[#141414]">
                ບໍ່ພົບລາຍການໃບບິນ POS ຕາມ Filter
              </div>
            ) : (
              filteredBills.map(bill => {
                const isPending = bill.status === 'PENDING_SETTLEMENT';
                return (
                  <div
                    key={bill.id}
                    className="p-4 rounded-2xl bg-[#141414] border border-neutral-800 hover:border-neutral-700/80 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs"
                  >
                    {/* Bill Info */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-serif font-bold text-white text-base">
                          #{bill.billNumber}
                        </span>
                        <span className="text-neutral-300 font-medium">• {bill.customerName}</span>
                        {isPending ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950/40 border border-amber-800/50 text-amber-300 font-mono">
                            ລໍຖ້າຊຳລະ (AR)
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/40 border border-emerald-800/50 text-emerald-400 font-mono">
                            ✓ ເຄຍແລ້ວ (Dashboard)
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-neutral-400">
                        ວັນທີ: {bill.orderDate} | {bill.items.map(it => `${it.recipeName} (${it.totalMadeQty})`).join(', ')}
                        {bill.notes ? ` • Note: ${bill.notes}` : ''}
                      </p>
                    </div>

                    {/* Amount & Actions */}
                    <div className="flex items-center justify-between md:justify-end gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-neutral-800/60">
                      <div className="text-right">
                        <span className="text-[10px] text-neutral-500 block">
                          {isPending ? 'ຍອດປະເມີນ:' : 'ຍອດຂາຍຈິງ:'}
                        </span>
                        <span className={`font-mono font-bold text-base ${isPending ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {(bill.actualRevenueLAK || bill.estimatedTotalLAK).toLocaleString()} ₭
                        </span>
                      </div>

                      {/* 🔴 ປຸ່ມແກ້ໄຂບິນ POS (Edit Button) */}
                      <button
                        type="button"
                        onClick={() => setEditingBill(bill)}
                        className="p-2 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-amber-500/50 text-neutral-300 hover:text-amber-300 transition-colors flex items-center gap-1.5"
                        title="ແກ້ໄຂບິນ"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-[11px]">ແກ້ໄຂ</span>
                      </button>

                      {/* ⚡ ປຸ່ມເຄຍບິນ POS (Settle Button) */}
                      {isPending ? (
                        <button
                          type="button"
                          onClick={() => setSettlingBill(bill)}
                          className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs flex items-center gap-1.5 transition-all shadow-md"
                        >
                          <CheckCircle className="w-3.5 h-3.5 text-black" />
                          <span>ເຄຍບິນ (ຮັບເງິນ)</span>
                        </button>
                      ) : (
                        bill.slipImageUrl && (
                          <a
                            href={bill.slipImageUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2.5 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 text-[11px] text-neutral-300 hover:text-white"
                          >
                            ເບິ່ງສະລິບ
                          </a>
                        )
                      )}

                      {/* ປຸ່ມລຶບ */}
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmModal({
                            isOpen: true,
                            title: 'ຢືນຢັນການລຶບໃບບິນ POS',
                            message: `ທ່ານຕ້ອງການລຶບໃບບິນ #${bill.billNumber} ແທ້ຫຼືບໍ່?`,
                            onConfirm: async () => {
                              await deleteDoc(doc(db, 'pos_bills', bill.id));
                              if (bill.arDebtId) await deleteDoc(doc(db, 'debts_apar', bill.arDebtId));
                              setConfirmModal(null);
                            }
                          });
                        }}
                        className="p-2 rounded-xl text-neutral-500 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ==========================================
          TAB 3: RECIPES & STOCK
          ========================================== */}
      {activeTab === 'recipes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-200">
              ລາຍການສູດຂະໜົມ & ຕົ້ນທຶນ (Recipe & Batch Yield)
            </h3>
            <button
              onClick={() => {
                setEditingRecipe(null);
                setIsRecipeModalOpen(true);
              }}
              className="px-3.5 py-2 rounded-xl bg-white text-black text-xs font-medium hover:bg-neutral-200 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>ສ້າງສູດໃໝ່</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {recipes.map(recipe => (
              <div key={recipe.id} className="p-4 rounded-2xl bg-[#141414] border border-neutral-800 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-400 font-mono">
                    {recipe.category}
                  </span>
                  <span className="font-mono text-emerald-400 font-bold text-sm">
                    {recipe.sellingPrice.toLocaleString()} ₭
                  </span>
                </div>

                <div>
                  <h4 className="font-serif text-lg text-white">{recipe.name}</h4>
                  <p className="text-[11px] text-neutral-400 mt-1">
                    1 ເຕົາອົບໄດ້: <strong className="text-white font-mono">{recipe.batchYield}</strong> ກ້ອນ
                  </p>
                </div>

                {/* Bottle Gauge (ຖ້າມີ liquid ml) */}
                {recipe.maxLiquidMl && (
                  <div className="space-y-1 pt-1">
                    <div className="flex justify-between text-[10px] text-neutral-400">
                      <span>Bottle Level</span>
                      <span>{recipe.currentLiquidMl || 0} / {recipe.maxLiquidMl} ml</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                      <div
                        className="h-full bg-sky-400 rounded-full"
                        style={{ width: `${Math.min(100, ((recipe.currentLiquidMl || 0) / recipe.maxLiquidMl) * 100)}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-neutral-800/80 flex justify-between items-center text-[11px]">
                  <span className="text-neutral-500">ກຳໄລຕໍ່ກ້ອນ:</span>
                  <span className="font-mono text-emerald-400 font-medium">
                    {recipe.profitPerPiece?.toLocaleString()} ₭ ({recipe.marginPercent}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: EDIT POS BILL (ແກ້ໄຂບິນ POS)
          ========================================== */}
      {editingBill && (
        <EditPosBillModal
          isOpen={!!editingBill}
          bill={editingBill}
          onClose={() => setEditingBill(null)}
          onBillUpdated={() => setEditingBill(null)}
        />
      )}

      {/* ==========================================
          MODAL: SETTLE POS BILL (ເຄຍບິນ POS)
          ========================================== */}
      {settlingBill && (
        <SettlePosBillModal
          isOpen={!!settlingBill}
          bill={settlingBill}
          onClose={() => setSettlingBill(null)}
          onSettledSuccess={() => setSettlingBill(null)}
        />
      )}

      {/* ==========================================
          MODAL: IN-APP CONFIRM
          ========================================== */}
      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="bg-[#0f0f0f] border border-neutral-800 rounded-2xl w-full max-w-sm p-5 shadow-2xl font-sans text-neutral-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-950/40 border border-rose-900/60 flex items-center justify-center text-rose-400 shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif text-base text-white">{confirmModal.title}</h3>
                <p className="text-xs text-neutral-400 mt-1 leading-relaxed">{confirmModal.message}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-800/80">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-3.5 py-1.5 text-xs bg-neutral-900 border border-neutral-800 text-neutral-400 rounded-lg hover:text-white"
              >
                ຍົກເລີກ
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                className="px-4 py-1.5 text-xs bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-lg transition-colors"
              >
                ຢືນຢັນລຶບ
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// ==========================================
// SUB-COMPONENT: EDIT POS BILL MODAL
// ==========================================
interface EditPosBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  bill: PosBill;
  onBillUpdated: () => void;
}

const EditPosBillModal: React.FC<EditPosBillModalProps> = ({ isOpen, onClose, bill, onBillUpdated }) => {
  if (!isOpen) return null;

  const [customerName, setCustomerName] = useState(bill.customerName);
  const [orderDate, setOrderDate] = useState(bill.orderDate);
  const [notes, setNotes] = useState(bill.notes || '');
  const [items, setItems] = useState<PosBillItem[]>(bill.items);
  const [isSaving, setIsSaving] = useState(false);

  const calculatedTotal = items.reduce((s, it) => s + (it.totalMadeQty * it.pricePerUnit), 0);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const billRef = doc(db, 'pos_bills', bill.id);
      await updateDoc(billRef, {
        customerName: customerName.trim() || 'ລູກຄ້າທົ່ວໄປ',
        orderDate,
        notes: notes.trim(),
        items,
        estimatedTotalLAK: calculatedTotal,
        actualRevenueLAK: bill.status === 'SETTLED' ? calculatedTotal : bill.actualRevenueLAK,
        updatedAt: serverTimestamp()
      });

      // ຖ້າມີ AR ຜູກຢູ່ ໃຫ້ປັບຍອດ AR ໃຫ້ກົງກັນ
      if (bill.arDebtId) {
        await updateDoc(doc(db, 'debts_apar', bill.arDebtId), {
          counterparty: customerName.trim() || 'ລູກຄ້າທົ່ວໄປ',
          amountLAK: calculatedTotal
        });
      }

      onBillUpdated();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
      <div className="bg-[#0f0f0f] border border-neutral-800 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden font-sans text-neutral-200">
        <div className="px-6 py-4 border-b border-neutral-800 bg-[#141414] flex items-center justify-between">
          <h3 className="font-serif text-lg text-white">ແກ້ໄຂບິນ POS #{bill.billNumber}</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-neutral-400 block mb-1">ຊື່ລູກຄ້າ</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full bg-[#141414] border border-neutral-800 rounded-xl px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="text-neutral-400 block mb-1">ວັນທີບິນ</label>
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="w-full bg-[#141414] border border-neutral-800 rounded-xl px-3 py-2 text-white"
              />
            </div>
          </div>

          <div className="border border-neutral-800 rounded-xl overflow-hidden bg-[#0a0a0a]">
            <div className="px-3 py-2 bg-[#141414] border-b border-neutral-800 text-neutral-400 font-medium">
              ລາຍການເມນູ
            </div>
            <div className="divide-y divide-neutral-900 p-2 space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="flex items-center justify-between gap-2 pt-1">
                  <span className="font-medium text-white flex-1">{it.recipeName}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-neutral-500">ຈຳນວນ:</span>
                    <input
                      type="number"
                      min="1"
                      value={it.totalMadeQty}
                      onChange={(e) => {
                        const updated = [...items];
                        updated[idx].totalMadeQty = parseInt(e.target.value) || 1;
                        updated[idx].actualSoldQty = parseInt(e.target.value) || 1;
                        updated[idx].totalPrice = updated[idx].totalMadeQty * updated[idx].pricePerUnit;
                        setItems(updated);
                      }}
                      className="w-14 bg-[#141414] border border-neutral-700 rounded px-2 py-1 text-center font-mono text-white"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-neutral-500">ລາຄາ:</span>
                    <input
                      type="number"
                      value={it.pricePerUnit}
                      onChange={(e) => {
                        const updated = [...items];
                        updated[idx].pricePerUnit = parseFloat(e.target.value) || 0;
                        updated[idx].totalPrice = updated[idx].totalMadeQty * updated[idx].pricePerUnit;
                        setItems(updated);
                      }}
                      className="w-20 bg-[#141414] border border-neutral-700 rounded px-2 py-1 text-right font-mono text-white"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-neutral-400 block mb-1">ໝາຍເຫດ</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-[#141414] border border-neutral-800 rounded-xl px-3 py-2 text-white"
            />
          </div>

          <div className="p-3 bg-[#141414] border border-neutral-800 rounded-xl flex justify-between items-center">
            <span className="text-neutral-400">ຍອດລວມໃໝ່:</span>
            <span className="font-serif text-lg font-bold text-amber-400 font-mono">
              {calculatedTotal.toLocaleString()} ₭
            </span>
          </div>

          <div className="pt-3 border-t border-neutral-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-neutral-900 border border-neutral-800 text-neutral-400 rounded-xl hover:text-white"
            >
              ຍົກເລີກ
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 bg-white text-black font-medium rounded-xl hover:bg-neutral-200"
            >
              {isSaving ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກການແກ້ໄຂ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ==========================================
// SUB-COMPONENT: SETTLE POS BILL MODAL
// ==========================================
interface SettlePosBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  bill: PosBill;
  onSettledSuccess: () => void;
}

const SettlePosBillModal: React.FC<SettlePosBillModalProps> = ({ isOpen, onClose, bill, onSettledSuccess }) => {
  if (!isOpen) return null;

  const [items, setItems] = useState<PosBillItem[]>(
    bill.items.map(it => ({
      ...it,
      actualSoldQty: it.actualSoldQty ?? it.totalMadeQty,
      sampleQty: it.sampleQty ?? 0
    }))
  );
  const [paymentMethod, setPaymentMethod] = useState<'BCEL_ONE' | 'CASH'>('BCEL_ONE');
  const [slipImage, setSlipImage] = useState<string | null>(null);
  const [isSettling, setIsSettling] = useState(false);

  // ຄຳນວນຍອດເງິນຂາຍຈິງ (ຕັດຍອດແຖມອອກ)
  const actualRevenueLAK = items.reduce((s, it) => s + (it.actualSoldQty * it.pricePerUnit), 0);
  const totalSamples = items.reduce((s, it) => s + it.sampleQty, 0);

  // Paste ສະລິບ (Ctrl+V)
  const handlePaste = (e: React.ClipboardEvent) => {
    const clipItems = e.clipboardData?.items;
    if (!clipItems) return;
    for (const item of clipItems) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = () => setSlipImage(reader.result as string);
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const handleConfirmSettlement = async () => {
    setIsSettling(true);
    try {
      // 1. ສົ່ງລາຍຮັບຕົວຈິງເຂົ້າ finance_transactions (Dashboard ຈະດຶງໄປສະແດງທັນທີ!)
      const financeRef = await addDoc(collection(db, 'finance_transactions'), {
        type: 'INCOME',
        category: 'SALES',
        amountLAK: actualRevenueLAK,
        date: new Date().toISOString().split('T')[0],
        description: `ຍອດຂາຍ POS #${bill.billNumber} (${bill.customerName})`,
        remark: `[ເຄຍບິນ POS] ຂາຍຈິງ: ${items.map(i => `${i.recipeName} x${i.actualSoldQty}`).join(', ')}${totalSamples > 0 ? ` | ແຖມ/ຊິມ: ${totalSamples} ອັນ` : ''}`,
        sourceBillId: bill.id,
        createdAt: serverTimestamp()
      });

      // 2. ອັບເດດສະຖານະບິນ POS ເປັນ SETTLED
      await updateDoc(doc(db, 'pos_bills', bill.id), {
        status: 'SETTLED',
        actualRevenueLAK,
        items,
        paymentMethod,
        slipImageUrl: slipImage || '',
        financeTxId: financeRef.id,
        settledAt: serverTimestamp()
      });

      // 3. ປິດສະຖານະໜີ້ຕ້ອງຮັບ (AR)
      if (bill.arDebtId) {
        await updateDoc(doc(db, 'debts_apar', bill.arDebtId), {
          status: 'SETTLED',
          proofImageUrl: slipImage || '',
          settledDate: new Date().toISOString().split('T')[0]
        });
      }

      onSettledSuccess();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSettling(false);
    }
  };

  return (
    <div onPaste={handlePaste} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
      <div className="bg-[#0f0f0f] border border-neutral-800 rounded-2xl w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-sans text-neutral-200">
        <div className="px-6 py-4 border-b border-neutral-800 bg-[#141414] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-950/40 border border-emerald-800/60 flex items-center justify-center text-emerald-400">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif text-base text-white">ເຄຍບິນ POS #{bill.billNumber}</h3>
              <p className="text-[11px] text-neutral-400">ລູກຄ້າ: {bill.customerName} • ເມື່ອເຄຍແລ້ວຍອດຈະຂຶ້ນ Dashboard ທັນທີ</p>
            </div>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {/* ແຍກຍອດຂາຍຈິງ vs ແຖມ/ຊິມ */}
          <div className="border border-neutral-800 rounded-xl overflow-hidden bg-[#0a0a0a]">
            <div className="px-3 py-2 bg-[#141414] border-b border-neutral-800 font-medium text-neutral-300">
              ກວດສອບຍອດຂາຍຈິງ vs ແຖມ / ຊິມເອງ
            </div>
            <div className="divide-y divide-neutral-900 p-3 space-y-3">
              {items.map((it, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex justify-between font-medium text-white">
                    <span>{it.recipeName}</span>
                    <span className="font-mono text-neutral-400">@{it.pricePerUnit.toLocaleString()} ₭</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-[#141414] border border-neutral-800 rounded-lg flex items-center justify-between">
                      <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                        <DollarSign className="w-3.5 h-3.5" /> ຂາຍຈິງ:
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={it.actualSoldQty}
                        onChange={(e) => {
                          const updated = [...items];
                          updated[idx].actualSoldQty = parseInt(e.target.value) || 0;
                          setItems(updated);
                        }}
                        className="w-14 bg-[#0a0a0a] border border-neutral-700 rounded px-2 py-0.5 text-center font-mono text-emerald-400 font-bold"
                      />
                    </div>
                    <div className="p-2 bg-[#141414] border border-neutral-800 rounded-lg flex items-center justify-between">
                      <span className="text-[11px] text-amber-400 flex items-center gap-1">
                        <Gift className="w-3.5 h-3.5" /> ແຖມ/ຊິມ:
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={it.sampleQty}
                        onChange={(e) => {
                          const updated = [...items];
                          updated[idx].sampleQty = parseInt(e.target.value) || 0;
                          setItems(updated);
                        }}
                        className="w-14 bg-[#0a0a0a] border border-neutral-700 rounded px-2 py-0.5 text-center font-mono text-amber-400 font-bold"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Payment Method & Slip */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-neutral-400 block mb-1">ວິທີຊຳລະ</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full bg-[#141414] border border-neutral-800 rounded-xl px-3 py-2 text-white"
              >
                <option value="BCEL_ONE">BCEL One (ໂອນ)</option>
                <option value="CASH">ເງິນສົດ (Cash)</option>
              </select>
            </div>
            <div>
              <label className="text-neutral-400 block mb-1">ຫຼັກຖານ (Ctrl+V)</label>
              <div className="border border-dashed border-neutral-800 rounded-xl p-2 bg-[#0a0a0a] text-center min-h-[42px] flex items-center justify-center">
                {slipImage ? (
                  <span className="text-emerald-400 text-[11px]">✓ ມີຮູບສະລິບແລ້ວ</span>
                ) : (
                  <span className="text-neutral-500 text-[10px]">ວາງຮູບສະລິບທີ່ນີ້</span>
                )}
              </div>
            </div>
          </div>

          {/* Real Revenue Highlight */}
          <div className="p-3.5 bg-[#141414] border border-neutral-800 rounded-xl flex justify-between items-center">
            <div>
              <span className="text-neutral-400 block">ຍອດຂາຍຕົວຈິງທີ່ຈະເຂົ້າ Dashboard:</span>
              <span className="text-[10px] text-neutral-500">(ຄິດສະເພາະຈຳນວນທີ່ຂາຍຈິງ)</span>
            </div>
            <span className="font-serif text-xl font-bold text-emerald-400 font-mono">
              {actualRevenueLAK.toLocaleString()} ₭
            </span>
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-neutral-900 border border-neutral-800 text-neutral-400 rounded-xl hover:text-white"
            >
              ຍົກເລີກ
            </button>
            <button
              type="button"
              disabled={isSettling}
              onClick={handleConfirmSettlement}
              className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-medium rounded-xl flex items-center gap-2 shadow-md"
            >
              <CheckCircle className="w-4 h-4 text-black" />
              <span>{isSettling ? 'ກຳລັງເຄຍ...' : 'ຢືນຢັນເຄຍບິນ & ເພີ່ມຍອດຂາຍ'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Inventory;
