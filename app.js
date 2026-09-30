import {
  STORAGE_KEY,
  calculateSummary,
  cleanAmount,
  createId,
  makeDefaultState,
  monthKey,
  normalizeState,
  splitEvenly,
  validateSplit
} from "./model.js";

let state = loadState();
let activeView = "home";
let activityFilter = "all";
let editingTransactionId = null;

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

const els = {
  balance: $("#balance-value"),
  reserved: $("#reserved-value"),
  safe: $("#safe-value"),
  owed: $("#owed-value"),
  owedCaption: $("#owed-caption"),
  homeReserves: $("#home-reserves"),
  recentActivity: $("#recent-activity"),
  allActivity: $("#all-activity"),
  debtList: $("#debt-list"),
  dialog: $("#transaction-dialog"),
  form: $("#transaction-form"),
  kind: $("#transaction-kind"),
  amount: $("#transaction-amount"),
  date: $("#transaction-date"),
  note: $("#transaction-note"),
  category: $("#transaction-category"),
  categoryChips: $("#transaction-categories"),
  reserve: $("#transaction-reserve"),
  reserveField: $("#reserve-field"),
  splitFields: $("#split-fields"),
  standardFields: $("#standard-fields"),
  yourShare: $("#your-share"),
  friendRows: $("#friend-rows"),
  splitMessage: $("#split-total-message"),
  error: $("#transaction-error"),
  saveButton: $("#save-transaction"),
  reservesForm: $("#reserves-form"),
  quickReservesForm: $("#quick-reserves-form"),
  quickReserveFields: $("#quick-reserve-fields"),
  reserveDialog: $("#reserve-dialog"),
  currency: $("#currency-select"),
  toast: $("#toast")
};

init();

function init() {
  const today = new Date();
  $("#today-label").textContent = today.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  $("#reserve-period").textContent = today.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  els.date.value = localDate(today);
  bindEvents();
  render();
  configureServiceWorker();
}

async function configureServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const isLocalDevelopment = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  if (isLocalDevelopment) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.filter((name) => name.startsWith("pocket-pup-")).map((name) => caches.delete(name)));
    }
    return;
  }

  try {
    const alreadyControlled = Boolean(navigator.serviceWorker.controller);
    if (alreadyControlled) {
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    }
    const registration = await navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" });
    await registration.update();
  } catch {
    // The app remains usable online even if offline setup is unavailable.
  }
}

function bindEvents() {
  $$("[data-view]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
  $$("[data-go]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.go)));
  $("#settings-shortcut").addEventListener("click", () => showView("more"));
  $$("[data-open-transaction]").forEach((button) => button.addEventListener("click", () => openTransaction(button.dataset.defaultKind || "income")));
  $(".close-dialog").addEventListener("click", closeTransaction);
  els.dialog.addEventListener("click", (event) => {
    const bounds = els.dialog.getBoundingClientRect();
    const outside = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
    if (outside) closeTransaction();
  });
  $$("[data-kind]").forEach((button) => button.addEventListener("click", () => setTransactionKind(button.dataset.kind)));
  $("#add-friend-row").addEventListener("click", () => addFriendRow());
  $("#split-equally").addEventListener("click", applyEvenSplit);
  els.amount.addEventListener("input", updateSplitStatus);
  els.yourShare.addEventListener("input", updateSplitStatus);
  els.friendRows.addEventListener("input", updateSplitStatus);
  els.categoryChips.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (button) selectCategory(button.dataset.category);
  });
  els.friendRows.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove-friend]");
    if (remove && $$(".friend-row", els.friendRows).length > 1) {
      remove.closest(".friend-row").remove();
      updateSplitStatus();
    }
  });
  els.form.addEventListener("submit", saveTransaction);
  els.reservesForm.addEventListener("submit", saveReserves);
  els.quickReservesForm.addEventListener("submit", saveReserves);
  $(".close-reserves").addEventListener("click", () => els.reserveDialog.close());
  els.currency.addEventListener("change", () => {
    state.currency = els.currency.value;
    saveState();
    render();
    showToast("Currency updated");
  });
  $$("[data-filter]").forEach((button) => button.addEventListener("click", () => {
    activityFilter = button.dataset.filter;
    $$("[data-filter]").forEach((item) => item.classList.toggle("active", item === button));
    renderActivity();
  }));
  els.debtList.addEventListener("click", handleDebtAction);
  $("#export-data").addEventListener("click", exportData);
  $("#import-data").addEventListener("change", importData);
  $("#erase-data").addEventListener("click", eraseData);
}

function render() {
  const summary = calculateSummary(state);
  els.balance.textContent = money(summary.wallet);
  els.reserved.textContent = money(summary.reserved);
  els.safe.textContent = money(summary.safe);
  els.safe.classList.toggle("negative", summary.safe < 0);
  els.owed.textContent = money(summary.owed);
  els.owedCaption.textContent = summary.owed ? `${state.debts.filter((item) => !item.paid).length} payment${state.debts.filter((item) => !item.paid).length === 1 ? "" : "s"} waiting` : "All settled up. Nice!";
  $("#welcome-message").textContent = summary.safe < 0 ? "Let’s protect your essentials." : summary.wallet ? "You’re in control." : "Let’s get started.";
  $("#welcome-detail").textContent = summary.wallet ? `${money(summary.safe)} is safe to spend right now.` : "Add your first income to see what is safe to spend.";
  renderReserves(summary.reserveDetails);
  renderActivity();
  renderDebts();
  renderSettings();
  updateCurrencySymbols();
}

function renderReserves(reserves) {
  const hasTargets = reserves.some((item) => item.target > 0);
  if (!hasTargets) {
    els.homeReserves.innerHTML = emptyState("♡", "No reserves yet", "Protect rent, medical costs, and food before spending.", "Set reserves", "reserves");
    return;
  }
  els.homeReserves.innerHTML = reserves.filter((item) => item.target > 0).map((item) => {
    const percent = item.target ? Math.min(100, Math.round((item.spent / item.target) * 100)) : 0;
    return `<article class="reserve-item">
      <div class="reserve-icon ${item.color}">${item.icon}</div>
      <div class="reserve-copy">
        <div><strong>${escapeHtml(item.name)}</strong><span>${money(item.remaining)} left</span></div>
        <div class="progress-track"><i style="width:${percent}%"></i></div>
        <small>${money(item.spent)} used of ${money(item.target)}</small>
      </div>
    </article>`;
  }).join("");
}

function renderActivity() {
  const sorted = [...state.transactions].sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
  els.recentActivity.innerHTML = sorted.length ? sorted.slice(0, 4).map(transactionMarkup).join("") : emptyState("↕", "Nothing here yet", "Your income and expenses will appear here.");
  const filtered = activityFilter === "all" ? sorted : sorted.filter((item) => {
    if (activityFilter === "expense") return item.kind === "expense";
    return item.kind === activityFilter;
  });
  els.allActivity.innerHTML = filtered.length ? filtered.map(transactionMarkup).join("") : emptyState("↕", "No matching activity", "Try another filter or add a transaction.");
}

function transactionMarkup(item) {
  const positive = ["income", "repayment"].includes(item.kind);
  const hasPaidFriend = item.kind === "split" && state.debts.some((debt) => debt.transactionId === item.id && debt.paid);
  const canEdit = item.kind !== "repayment" && !hasPaidFriend;
  const icons = { income: "↓", expense: "↑", split: "♙", repayment: "✓" };
  const labels = { income: "Income", expense: "Expense", split: "Shared bill", repayment: "Friend repaid" };
  const title = item.note || item.category || labels[item.kind];
  return `<article class="activity-item">
    <div class="activity-icon ${positive ? "positive" : "negative"}">${icons[item.kind]}</div>
    <div class="activity-copy"><strong>${escapeHtml(title)}</strong><span>${labels[item.kind]} · ${formatDate(item.date)}</span></div>
    <div class="activity-side">
      <strong class="activity-amount ${positive ? "positive-text" : ""}">${positive ? "+" : "−"}${money(item.amount)}</strong>
      <div class="activity-controls">
        ${canEdit ? `<button data-edit-transaction="${item.id}" type="button">Edit</button>` : ""}
        <button class="delete-link" data-delete-transaction="${item.id}" type="button">${item.kind === "repayment" ? "Undo" : "Delete"}</button>
      </div>
    </div>
  </article>`;
}

function renderDebts() {
  const open = state.debts.filter((item) => !item.paid).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  els.debtList.innerHTML = open.length ? open.map((item) => `<article class="debt-card">
    <div class="avatar">${initials(item.name)}</div>
    <div class="debt-copy"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.note || "Shared bill")}</span></div>
    <div class="debt-action"><strong>${money(item.amount)}</strong><button data-mark-paid="${item.id}" type="button">Mark paid</button></div>
  </article>`).join("") : emptyState("🐾", "Nobody owes you", "Shared bills will appear here until your friends repay you.");
}

function renderSettings() {
  els.currency.value = state.currency;
  els.reservesForm.innerHTML = `${reserveFieldsMarkup()}<button class="primary-button full-width" type="submit">Save reserves</button>`;
}

function reserveFieldsMarkup() {
  return state.reserves.map((item) => `<label class="reserve-setting">
    <span class="reserve-icon ${item.color}">${item.icon}</span>
    <span><strong>${escapeHtml(item.name)}</strong><small>Monthly amount</small></span>
    <span class="setting-money"><i>${currencySymbol()}</i><input name="${item.id}" type="number" min="0" step="0.01" inputmode="decimal" value="${item.target || ""}" placeholder="0"></span>
  </label>`).join("");
}

function openReserves() {
  els.quickReserveFields.innerHTML = reserveFieldsMarkup();
  if (!els.reserveDialog.open) els.reserveDialog.showModal();
  setTimeout(() => $("input", els.quickReserveFields)?.focus(), 80);
}

function showView(view) {
  activeView = view;
  $$(".view").forEach((item) => item.classList.toggle("active", item.id === `${view}-view`));
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openTransaction(kind = "income", transaction = null) {
  editingTransactionId = transaction?.id || null;
  els.form.reset();
  els.date.value = localDate(new Date());
  els.error.textContent = "";
  els.friendRows.innerHTML = "";
  addFriendRow();
  setTransactionKind(kind);
  $$("[data-kind]").forEach((button) => {
    button.disabled = Boolean(transaction) && button.dataset.kind !== kind;
  });
  if (transaction) {
    els.amount.value = transaction.amount;
    els.date.value = transaction.date;
    els.note.value = transaction.note || "";
    if (kind === "split") {
      els.yourShare.value = transaction.personalAmount || "";
      els.friendRows.innerHTML = "";
      const relatedDebts = state.debts.filter((debt) => debt.transactionId === transaction.id);
      relatedDebts.forEach((debt) => addFriendRow(debt.name, debt.amount));
      if (!relatedDebts.length) addFriendRow();
      els.reserve.value = transaction.reserveId || "";
      updateSplitStatus();
    } else {
      if ([...els.category.options].some((option) => option.value === transaction.category)) {
        selectCategory(transaction.category, false);
      }
      if (kind === "expense") {
        if (transaction.reserveId) els.reserve.value = transaction.reserveId;
        else syncReserveToCategory();
      }
    }
    els.saveButton.textContent = "Update transaction";
  }
  if (!els.dialog.open) els.dialog.showModal();
  setTimeout(() => els.amount.focus(), 80);
}

function closeTransaction() {
  els.dialog.close();
  editingTransactionId = null;
  $$("[data-kind]").forEach((button) => button.disabled = false);
}

function setTransactionKind(kind) {
  els.kind.value = kind;
  $$("[data-kind]").forEach((button) => button.classList.toggle("active", button.dataset.kind === kind));
  const split = kind === "split";
  const expense = kind === "expense";
  els.splitFields.hidden = !split;
  els.standardFields.hidden = split;
  els.reserveField.hidden = !(split || expense);
  $("#amount-label").textContent = split ? "Total bill" : expense ? "Amount spent" : "Amount received";
  els.saveButton.textContent = split ? "Save shared bill" : expense ? "Save expense" : "Save income";
  const categories = kind === "income" ? ["Salary", "Freelance", "Gift", "Refund", "Other"] : ["Food", "Rent", "Medical", "Transport", "Shopping", "Other"];
  els.category.innerHTML = categories.map((item) => `<option value="${item}">${item}</option>`).join("");
  els.categoryChips.innerHTML = categories.map((item, index) => `<button class="category-chip${index === 0 ? " active" : ""}" data-category="${item}" type="button" role="radio" aria-checked="${index === 0}">${item}</button>`).join("");
  els.reserve.innerHTML = `<option value="">Don’t use a reserve</option>${state.reserves.filter((item) => item.target > 0).map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("")}`;
  if (kind === "expense") syncReserveToCategory();
  else if (kind === "split") $("#reserve-help").textContent = "Only your share counts against this reserve.";
  updateSplitStatus();
}

function selectCategory(category, syncReserve = true) {
  if (![...els.category.options].some((option) => option.value === category)) return;
  els.category.value = category;
  $$("[data-category]", els.categoryChips).forEach((button) => {
    const selected = button.dataset.category === category;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-checked", String(selected));
  });
  if (syncReserve) syncReserveToCategory();
}

function syncReserveToCategory() {
  if (els.kind.value !== "expense") return;
  const reserveByCategory = { Rent: "rent", Medical: "medical", Food: "food" };
  const matchingReserve = reserveByCategory[els.category.value] || "";
  const available = [...els.reserve.options].some((option) => option.value === matchingReserve);
  els.reserve.value = available ? matchingReserve : "";
  const reserveName = state.reserves.find((item) => item.id === matchingReserve)?.name;
  $("#reserve-help").textContent = available
    ? `This expense will use your ${reserveName} reserve.`
    : reserveName
      ? `Set a ${reserveName} reserve first to protect money for this expense.`
      : "This category is not connected to protected money.";
}

function addFriendRow(name = "", amount = "") {
  const row = document.createElement("div");
  row.className = "friend-row";
  row.innerHTML = `<input class="friend-name" type="text" maxlength="40" placeholder="Friend’s name" value="${escapeHtml(name)}" aria-label="Friend name">
    <div class="money-input compact"><span class="inline-symbol">${currencySymbol()}</span><input class="friend-amount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0" value="${amount}" aria-label="Friend share"></div>
    <button data-remove-friend type="button" aria-label="Remove friend">×</button>`;
  els.friendRows.append(row);
}

function applyEvenSplit() {
  const rows = $$(".friend-row", els.friendRows);
  const shares = splitEvenly(els.amount.value, rows.length + 1);
  if (!shares.length) {
    els.error.textContent = "Enter the total bill first.";
    return;
  }
  els.yourShare.value = shares[0].toFixed(2);
  rows.forEach((row, index) => $(".friend-amount", row).value = shares[index + 1].toFixed(2));
  els.error.textContent = "";
  updateSplitStatus();
}

function updateSplitStatus() {
  if (els.kind.value !== "split") return;
  const amounts = $$(".friend-amount", els.friendRows).map((input) => input.value);
  const result = validateSplit(els.amount.value, els.yourShare.value, amounts);
  els.splitMessage.textContent = result.valid ? "Perfect — all shares match the bill." : `${money(result.shares)} assigned of ${money(result.total)}.`;
  els.splitMessage.classList.toggle("valid", result.valid);
}

function saveTransaction(event) {
  event.preventDefault();
  const kind = els.kind.value;
  const amount = cleanAmount(els.amount.value);
  if (!amount) return formError("Enter an amount greater than zero.");
  const existing = editingTransactionId ? state.transactions.find((item) => item.id === editingTransactionId) : null;
  const base = {
    id: existing?.id || createId("tx"), kind, amount, date: els.date.value,
    note: els.note.value.trim(), createdAt: existing?.createdAt || new Date().toISOString()
  };

  if (kind === "split") {
    const rows = $$(".friend-row", els.friendRows);
    const friends = rows.map((row) => ({ name: $(".friend-name", row).value.trim(), amount: cleanAmount($(".friend-amount", row).value) }));
    if (friends.some((item) => !item.name)) return formError("Add a name for every friend.");
    const validation = validateSplit(amount, els.yourShare.value, friends.map((item) => item.amount));
    if (!validation.valid) return formError("Your share and friends’ shares must equal the total bill.");
    base.personalAmount = cleanAmount(els.yourShare.value);
    base.reserveId = els.reserve.value || null;
    base.category = "Shared bill";
    if (existing) state.debts = state.debts.filter((debt) => debt.transactionId !== existing.id);
    friends.forEach((friend) => state.debts.push({
      id: createId("debt"), transactionId: base.id, name: friend.name, amount: friend.amount,
      note: base.note, date: base.date, createdAt: base.createdAt, paid: false
    }));
  } else {
    base.category = els.category.value;
    if (kind === "expense") base.reserveId = els.reserve.value || null;
  }

  if (existing) {
    const index = state.transactions.findIndex((item) => item.id === existing.id);
    state.transactions[index] = base;
  } else {
    state.transactions.push(base);
  }
  saveState();
  closeTransaction();
  render();
  showToast(existing ? "Transaction updated" : kind === "split" ? "Shared bill saved" : kind === "expense" ? "Expense saved" : "Income saved");
}

function editTransaction(id) {
  const transaction = state.transactions.find((item) => item.id === id);
  if (!transaction || transaction.kind === "repayment") return;
  if (transaction.kind === "split" && state.debts.some((debt) => debt.transactionId === id && debt.paid)) {
    showToast("Undo repayments before editing this bill");
    return;
  }
  openTransaction(transaction.kind, transaction);
}

function deleteTransaction(id) {
  const transaction = state.transactions.find((item) => item.id === id);
  if (!transaction) return;
  const message = transaction.kind === "repayment"
    ? "Undo this repayment and mark the friend as owing you again?"
    : "Delete this transaction? Its effect on your balance will be reversed.";
  if (!window.confirm(message)) return;

  if (transaction.kind === "repayment") {
    const debt = state.debts.find((item) => item.id === transaction.debtId);
    if (debt) {
      debt.paid = false;
      delete debt.paidAt;
    }
  }

  if (transaction.kind === "split") {
    const debtIds = state.debts.filter((debt) => debt.transactionId === id).map((debt) => debt.id);
    state.debts = state.debts.filter((debt) => debt.transactionId !== id);
    state.transactions = state.transactions.filter((item) => item.id !== id && !(item.kind === "repayment" && debtIds.includes(item.debtId)));
  } else {
    state.transactions = state.transactions.filter((item) => item.id !== id);
  }

  saveState();
  render();
  showToast(transaction.kind === "repayment" ? "Repayment undone" : "Transaction deleted");
}

function saveReserves(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  state.reserves = state.reserves.map((item) => ({ ...item, target: cleanAmount(data.get(item.id)) }));
  saveState();
  render();
  if (event.currentTarget === els.quickReservesForm) els.reserveDialog.close();
  showToast("Monthly reserves saved");
}

function handleDebtAction(event) {
  const button = event.target.closest("[data-mark-paid]");
  if (!button) return;
  const debt = state.debts.find((item) => item.id === button.dataset.markPaid);
  if (!debt || debt.paid) return;
  debt.paid = true;
  debt.paidAt = new Date().toISOString();
  state.transactions.push({
    id: createId("tx"), kind: "repayment", amount: debt.amount, date: localDate(new Date()),
    note: `${debt.name} repaid you`, category: "Repayment", debtId: debt.id, createdAt: debt.paidAt
  });
  saveState();
  render();
  showToast(`${debt.name} marked as paid`);
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `pocket-pup-backup-${localDate(new Date())}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("Backup exported");
}

async function importData(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    state = normalizeState(JSON.parse(await file.text()));
    saveState();
    render();
    showToast("Backup restored");
  } catch {
    showToast("That backup could not be read");
  }
  event.target.value = "";
}

function eraseData() {
  if (!window.confirm("Erase all transactions, reserves, and friend balances from this device?")) return;
  state = makeDefaultState();
  saveState();
  render();
  showView("home");
  showToast("All data erased");
}

function updateCurrencySymbols() {
  $("#amount-symbol").textContent = currencySymbol();
  $$(".inline-symbol").forEach((item) => item.textContent = currencySymbol());
}

function formError(message) {
  els.error.textContent = message;
  els.error.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function money(amount) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: state.currency, maximumFractionDigits: 2 }).format(amount || 0);
}

function currencySymbol() {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: state.currency, currencyDisplay: "narrowSymbol" }).formatToParts(0).find((part) => part.type === "currency")?.value || state.currency;
}

function localDate(date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function formatDate(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function initials(name) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function emptyState(icon, title, detail, action, view) {
  const actionAttribute = view === "reserves" ? "data-open-reserves" : `data-go="${view}"`;
  return `<div class="empty-state"><span>${icon}</span><strong>${title}</strong><p>${detail}</p>${action ? `<button class="text-button" ${actionAttribute} type="button">${action}</button>` : ""}</div>`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function loadState() {
  try { return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
  catch { return makeDefaultState(); }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

document.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-transaction]");
  if (editButton) editTransaction(editButton.dataset.editTransaction);
  const deleteButton = event.target.closest("[data-delete-transaction]");
  if (deleteButton) deleteTransaction(deleteButton.dataset.deleteTransaction);
  if (event.target.closest("[data-open-reserves]")) openReserves();
  const go = event.target.closest("[data-go]");
  if (go) showView(go.dataset.go);
});
