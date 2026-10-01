import test from "node:test";
import assert from "node:assert/strict";
import { calculateBillExpression, calculateSummary, makeDefaultState, normalizeState, splitEvenly, validateSplit } from "../model.js";

test("calculates wallet, remaining reserves, safe money, and debts", () => {
  const state = makeDefaultState();
  state.reserves.find((item) => item.id === "rent").target = 5000;
  state.reserves.find((item) => item.id === "medical").target = 1000;
  state.transactions.push(
    { kind: "income", amount: 13500, date: "2026-09-01" },
    { kind: "expense", amount: 500, reserveId: "medical", date: "2026-09-03" },
    { kind: "split", amount: 900, personalAmount: 300, reserveId: null, date: "2026-09-04" }
  );
  state.debts.push({ name: "May", amount: 600, paid: false });
  const summary = calculateSummary(state, "2026-09");
  assert.equal(summary.wallet, 12100);
  assert.equal(summary.reserved, 5500);
  assert.equal(summary.safe, 6600);
  assert.equal(summary.owed, 600);
});

test("equal split keeps every cent", () => {
  assert.deepEqual(splitEvenly(100, 3), [33.34, 33.33, 33.33]);
  assert.equal(validateSplit(100, 33.34, [33.33, 33.33]).valid, true);
});

test("adds and subtracts items in a shared bill", () => {
  assert.deepEqual(calculateBillExpression("253 + 40 - 15"), { valid: true, total: 278, hasOperator: true });
  assert.deepEqual(calculateBillExpression("99.95"), { valid: true, total: 99.95, hasOperator: false });
  assert.equal(calculateBillExpression("253 +").valid, false);
  assert.equal(calculateBillExpression("100 - 150").valid, false);
});

test("money lent lowers the wallet and repayment restores it", () => {
  const state = makeDefaultState();
  state.transactions.push(
    { kind: "income", amount: 1000, date: "2026-10-01" },
    { kind: "loan", amount: 250, date: "2026-10-02" }
  );
  state.debts.push({ name: "May", amount: 250, paid: false });
  assert.equal(calculateSummary(state, "2026-10").wallet, 750);
  assert.equal(calculateSummary(state, "2026-10").owed, 250);

  state.debts[0].paid = true;
  state.transactions.push({ kind: "repayment", amount: 250, date: "2026-10-03" });
  assert.equal(calculateSummary(state, "2026-10").wallet, 1000);
  assert.equal(calculateSummary(state, "2026-10").owed, 0);
});

test("paying a friend lowers the wallet and can use a custom reserve", () => {
  const state = makeDefaultState();
  state.reserves.push({ id: "reserve-friend", name: "Pay friend", icon: "♡", color: "pink", custom: true, target: 300 });
  state.payables.push({ name: "May", amount: 120, paid: false });
  state.transactions.push({ kind: "income", amount: 1000, date: "2026-10-01" });
  assert.equal(calculateSummary(state, "2026-10").wallet, 1000);
  state.transactions.push({ kind: "friend-payment", amount: 120, reserveId: "reserve-friend", date: "2026-10-04" });
  const summary = calculateSummary(state, "2026-10");
  assert.equal(summary.wallet, 880);
  assert.equal(summary.reserveDetails.find((item) => item.id === "reserve-friend").remaining, 180);
});

test("normalization rejects unknown currency and unsafe shapes", () => {
  const state = normalizeState({ version: 2, currency: "NOPE", reserves: [{ id: "reserve-travel", name: "Travel", target: 500 }], transactions: [{ amount: "bad" }], debts: null, payables: [{ name: "May", amount: 100 }] });
  assert.equal(state.currency, "THB");
  assert.deepEqual(state.transactions, []);
  assert.deepEqual(state.debts, []);
  assert.equal(state.payables.length, 1);
  assert.equal(state.reserves.length, 1);
  assert.equal(state.reserves[0].name, "Travel");
});
