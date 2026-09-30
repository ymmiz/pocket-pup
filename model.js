export const STORAGE_KEY = "pocket-pup-state-v1";

export const reservePresets = [
  { id: "rent", name: "Rent", icon: "⌂", color: "rose" },
  { id: "medical", name: "Medical", icon: "+", color: "peach" },
  { id: "food", name: "Food", icon: "♡", color: "pink" }
];

export function makeDefaultState() {
  return {
    version: 1,
    currency: "THB",
    reserves: reservePresets.map((item) => ({ ...item, target: 0 })),
    transactions: [],
    debts: []
  };
}

export function normalizeState(value) {
  const base = makeDefaultState();
  if (!value || typeof value !== "object") return base;
  const knownCurrencies = new Set(["THB", "USD", "EUR", "GBP", "JPY", "MMK"]);
  const incomingReserves = Array.isArray(value.reserves) ? value.reserves : [];
  return {
    version: 1,
    currency: knownCurrencies.has(value.currency) ? value.currency : base.currency,
    reserves: base.reserves.map((preset) => {
      const match = incomingReserves.find((item) => item.id === preset.id);
      return { ...preset, target: cleanAmount(match?.target) };
    }),
    transactions: Array.isArray(value.transactions) ? value.transactions.filter(validTransaction) : [],
    debts: Array.isArray(value.debts) ? value.debts.filter(validDebt) : []
  };
}

function validTransaction(item) {
  return item && ["income", "expense", "split", "repayment"].includes(item.kind) && cleanAmount(item.amount) > 0;
}

function validDebt(item) {
  return item && typeof item.name === "string" && cleanAmount(item.amount) > 0;
}

export function cleanAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0;
}

export function calculateBillExpression(value) {
  const expression = String(value ?? "").replaceAll(",", "").replace(/\s+/g, "");
  if (!/^\d*\.?\d+(?:[+-]\d*\.?\d+)*$/.test(expression)) {
    return { valid: false, total: 0, hasOperator: /[+-]/.test(expression) };
  }

  const parts = expression.match(/[+-]?\d*\.?\d+/g) || [];
  const total = parts.reduce((sum, part) => sum + Number(part), 0);
  const rounded = round(total);
  return { valid: Number.isFinite(rounded) && rounded > 0, total: rounded > 0 ? rounded : 0, hasOperator: /[+-]/.test(expression) };
}

export function monthKey(date = new Date()) {
  const value = typeof date === "string" ? new Date(`${date}T12:00:00`) : date;
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

export function calculateSummary(state, currentMonth = monthKey()) {
  const wallet = state.transactions.reduce((total, item) => {
    const amount = cleanAmount(item.amount);
    return total + (["income", "repayment"].includes(item.kind) ? amount : -amount);
  }, 0);

  const reserveSpent = Object.fromEntries(state.reserves.map((item) => [item.id, 0]));
  state.transactions.forEach((item) => {
    if (monthKey(item.date) !== currentMonth || !item.reserveId || !(item.reserveId in reserveSpent)) return;
    const personalAmount = item.kind === "split" ? cleanAmount(item.personalAmount) : cleanAmount(item.amount);
    reserveSpent[item.reserveId] += personalAmount;
  });

  const reserveDetails = state.reserves.map((item) => {
    const target = cleanAmount(item.target);
    const spent = reserveSpent[item.id] || 0;
    return { ...item, target, spent, remaining: Math.max(target - spent, 0) };
  });
  const reserved = reserveDetails.reduce((total, item) => total + item.remaining, 0);
  const owed = state.debts.filter((item) => !item.paid).reduce((total, item) => total + cleanAmount(item.amount), 0);

  return {
    wallet: round(wallet),
    reserved: round(reserved),
    safe: round(wallet - reserved),
    owed: round(owed),
    reserveDetails
  };
}

export function validateSplit(total, personalAmount, friendAmounts) {
  const bill = cleanAmount(total);
  const yours = cleanAmount(personalAmount);
  const friends = friendAmounts.map(cleanAmount);
  const shares = round(yours + friends.reduce((sum, amount) => sum + amount, 0));
  return {
    valid: bill > 0 && yours > 0 && friends.length > 0 && friends.every((amount) => amount > 0) && Math.abs(bill - shares) < 0.01,
    total: bill,
    shares
  };
}

export function splitEvenly(total, participantCount) {
  const bill = cleanAmount(total);
  if (!bill || participantCount < 2) return [];
  const cents = Math.round(bill * 100);
  const base = Math.floor(cents / participantCount);
  const remainder = cents - base * participantCount;
  return Array.from({ length: participantCount }, (_, index) => (base + (index < remainder ? 1 : 0)) / 100);
}

export function createId(prefix = "item") {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
