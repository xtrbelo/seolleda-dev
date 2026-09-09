const {test} = require("node:test");
const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const crypto = require("node:crypto");
const vm = require("node:vm");
const {Timestamp} = require("firebase-admin/firestore");
const {HttpsError} = require("firebase-functions/v2/https");
const roles = require("../lib/auth/roles.js");

function fixture() {
  const targetItems = [
    {productId: "p1", quantity: 2, name: "Produto 1", sku: "sku1", barcode: "1"},
    {productId: "p2", quantity: 1, name: "Produto 2", sku: "sku2", barcode: "2"},
  ];
  const docs = new Map([
    ["sales/review", {storeId: "s", status: "EXPIRED", reservationStatus: "RELEASE_REVIEW_REQUIRED",
      stockReconciliationRequired: true, paymentReconciliationRequired: false, items: targetItems}],
    ["sales/open1", {storeId: "s", status: "PENDING_PAYMENT", reservationStatus: "RESERVED",
      items: [{productId: "p1", quantity: 2}, {productId: "p2", quantity: 1}]}],
    ["sales/open2", {storeId: "s", status: "PENDING_PAYMENT", reservationStatus: "RESERVED",
      items: [{productId: "p1", quantity: 1}]}],
    ["sales/other-store", {storeId: "other", status: "PENDING_PAYMENT", reservationStatus: "RESERVED",
      items: [{productId: "p1", quantity: 100}]}],
    ["inventory/s_p1", {storeId: "s", productId: "p1", quantity: 10, reservedQuantity: 7}],
    ["inventory/s_p2", {storeId: "s", productId: "p2", quantity: 5, reservedQuantity: 0}],
  ]);
  let queue = Promise.resolve();
  let failCommit = false;
  function collection(name, filters = [], cap = Infinity) {
    return {
      kind: "query", name, filters, cap,
      doc: (id) => ({kind: "doc", path: `${name}/${id}`}),
      where: (field, operator, value) => {
        assert.equal(operator, "==");
        return collection(name, [...filters, {field, value}], cap);
      },
      limit: (value) => collection(name, filters, value),
    };
  }
  const documentSnapshot = (ref) => ({exists: docs.has(ref.path), data: () => docs.get(ref.path)});
  const firestore = {
    collection,
    runTransaction: (callback) => {
      const result = queue.then(async () => {
        const writes = [];
        const tx = {
          getAll: async (...refs) => {
            assert.equal(writes.length, 0, "all reads must precede writes");
            return refs.map(documentSnapshot);
          },
          get: async (query) => {
            assert.equal(writes.length, 0, "all reads must precede writes");
            const prefix = `${query.name}/`;
            const matches = [...docs.entries()].filter(([path, data]) => path.startsWith(prefix) &&
              query.filters.every(({field, value}) => data[field] === value)).slice(0, query.cap);
            return {size: matches.length, docs: matches.map(([path, data]) => ({id: path.slice(prefix.length), data: () => data}))};
          },
          set: (ref, data) => writes.push({ref, data, merge: false}),
          update: (ref, data) => {
            assert.ok(docs.has(ref.path), "cannot update a missing document");
            writes.push({ref, data, merge: true});
          },
        };
        const response = await callback(tx);
        if (failCommit && writes.length > 0) { failCommit = false; throw new Error("simulated commit failure"); }
        for (const {ref, data, merge} of writes) docs.set(ref.path, {...(merge ? docs.get(ref.path) : {}), ...data});
        return response;
      });
      queue = result.catch(() => {});
      return result;
    },
  };
  const exports = {};
  vm.runInNewContext(readFileSync(require.resolve("../lib/sales/reconcileSaleReservation.js"), "utf8"), {
    exports,
    require: (name) => {
      if (name === "../lib/firebaseAdmin.js") return {firestore};
      if (name === "../auth/roles.js") return roles;
      if (name === "firebase-admin/firestore") return {Timestamp};
      if (name === "crypto") return crypto;
      if (name === "firebase-functions/v2/https") return {HttpsError, onCall: (_, handler) => handler};
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return {
    docs, sale: () => docs.get("sales/review"),
    preview: (auth = {uid: "admin1", token: {roles: ["admin"]}}) => exports.reconcileSaleReservation({
      auth, data: {saleId: "review", action: "PREVIEW", reason: "", confirmed: false},
    }),
    apply: async (data = {}, auth = {uid: "admin1", token: {roles: ["admin"]}}) => {
      const preview = await exports.reconcileSaleReservation({
        auth, data: {saleId: "review", action: "PREVIEW", reason: "", confirmed: false},
      });
      return exports.reconcileSaleReservation({auth, data: {saleId: "review", action: "APPLY",
        reason: "Conferência das reservas abertas", confirmed: true,
        previewToken: preview.previewToken ?? "0".repeat(64), ...data}});
    },
    failNextCommit: () => { failCommit = true; },
  };
}

test("reconciliation requires administrator and confirmation", async () => {
  const f = fixture();
  await assert.rejects(f.preview(null), {code: "unauthenticated"});
  await assert.rejects(f.preview({uid: "inventory1", token: {roles: ["inventory"], storeIds: ["s"]}}), {code: "permission-denied"});
  await assert.rejects(f.apply({confirmed: false}), {code: "invalid-argument"});
  await assert.rejects(f.apply({reason: "  "}), {code: "invalid-argument"});
  assert.equal(f.docs.has("reservationReconciliations/review"), false);
});

test("preview calculates reservations from active sales without writing", async () => {
  const f = fixture();
  const result = await f.preview();
  assert.equal(result.resolved, false);
  assert.match(result.previewToken, /^[a-f0-9]{64}$/);
  assert.deepEqual(JSON.parse(JSON.stringify(result.items)), [
    {productId: "p1", name: "Produto 1", currentReserved: 7, expectedReserved: 3, adjustment: -4},
    {productId: "p2", name: "Produto 2", currentReserved: 0, expectedReserved: 1, adjustment: 1},
  ]);
  assert.equal(f.docs.get("inventory/s_p1").reservedQuantity, 7);
  assert.equal(f.sale().stockReconciliationRequired, true);
});

test("apply preserves open reservations and closes the review atomically", async () => {
  const f = fixture();
  const result = await f.apply();
  assert.equal(result.resolved, true);
  assert.equal(f.docs.get("inventory/s_p1").reservedQuantity, 3);
  assert.equal(f.docs.get("inventory/s_p2").reservedQuantity, 1);
  assert.equal(f.sale().reservationStatus, "RELEASED");
  assert.equal(f.sale().stockReconciliationRequired, false);
  assert.equal(f.docs.get("sales/open1").reservationStatus, "RESERVED");
  const audit = f.docs.get("reservationReconciliations/review");
  assert.equal(audit.activeSalesCount, 2);
  assert.equal(audit.userId, "admin1");
  assert.equal(audit.items[0].expectedReserved, 3);
});

test("concurrent applies and later replay cannot change inventory twice", async () => {
  const f = fixture();
  const results = await Promise.all([f.apply(), f.apply(), f.apply()]);
  assert.equal(f.docs.get("inventory/s_p1").reservedQuantity, 3);
  assert.equal(results[0].resolution.resolvedAtMs, results[2].resolution.resolvedAtMs);
  const replay = await f.apply({reason: "Uma justificativa diferente"});
  assert.equal(replay.resolution.reason, "Conferência das reservas abertas");
  assert.equal(f.docs.get("inventory/s_p1").reservedQuantity, 3);
});

test("invalid active sale prevents every correction", async () => {
  const f = fixture();
  f.docs.get("sales/open2").items = [{productId: "p1", quantity: 1}, {productId: "p1", quantity: 2}];
  await assert.rejects(f.apply(), {code: "failed-precondition"});
  assert.equal(f.docs.get("inventory/s_p1").reservedQuantity, 7);
  assert.equal(f.sale().stockReconciliationRequired, true);
});

test("apply rejects a stale preview when another reservation changes", async () => {
  const f = fixture();
  const preview = await f.preview();
  f.docs.get("sales/open2").items[0].quantity = 2;
  await assert.rejects(f.apply({previewToken: preview.previewToken}), {code: "failed-precondition"});
  assert.equal(f.docs.get("inventory/s_p1").reservedQuantity, 7);
  assert.equal(f.sale().stockReconciliationRequired, true);
});

test("expected reservations cannot exceed physical stock", async () => {
  const f = fixture();
  f.docs.get("inventory/s_p1").quantity = 2;
  await assert.rejects(f.apply(), {code: "failed-precondition"});
  assert.equal(f.docs.get("inventory/s_p1").reservedQuantity, 7);
});

test("only terminal release-review sales are eligible", async () => {
  for (const patch of [{status: "PAID"}, {reservationStatus: "RESERVED"},
    {stockReconciliationRequired: false}, {paymentReconciliationRequired: true}]) {
    const f = fixture();
    Object.assign(f.sale(), patch);
    await assert.rejects(f.preview(), {code: "failed-precondition"});
    assert.equal(f.docs.get("inventory/s_p1").reservedQuantity, 7);
  }
});

test("more than 500 active reservations are rejected", async () => {
  const f = fixture();
  f.docs.delete("sales/open1");
  f.docs.delete("sales/open2");
  for (let index = 0; index < 501; index += 1) {
    f.docs.set(`sales/open-${index}`, {storeId: "s", reservationStatus: "RESERVED",
      items: [{productId: "p1", quantity: 1}]});
  }
  f.docs.get("inventory/s_p1").quantity = 1000;
  await assert.rejects(f.preview(), {code: "resource-exhausted"});
  assert.equal(f.docs.get("inventory/s_p1").reservedQuantity, 7);
});

test("commit failure leaves no partial correction and retry succeeds", async () => {
  const f = fixture();
  f.failNextCommit();
  await assert.rejects(f.apply(), /simulated commit failure/);
  assert.equal(f.docs.get("inventory/s_p1").reservedQuantity, 7);
  assert.equal(f.docs.get("inventory/s_p2").reservedQuantity, 0);
  assert.equal(f.sale().stockReconciliationRequired, true);
  await f.apply();
  assert.equal(f.docs.get("inventory/s_p1").reservedQuantity, 3);
  assert.equal(f.docs.get("inventory/s_p2").reservedQuantity, 1);
});
