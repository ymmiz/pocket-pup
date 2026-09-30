import test from "node:test";
import assert from "node:assert/strict";
import { calculateSummary, makeDefaultState, normalizeState, splitEvenly, validateSplit } from "../model.js";

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

test("normalization rejects unknown currency and unsafe shapes", () => {
  const state = normalizeState({ currency: "NOPE", transactions: [{ amount: "bad" }], debts: null });
  assert.equal(state.currency, "THB");
  assert.deepEqual(state.transactions, []);
  assert.deepEqual(state.debts, []);
});
