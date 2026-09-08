const {test} = require("node:test");
const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const vm = require("node:vm");
const {Timestamp, FieldValue} = require("firebase-admin/firestore");
const {HttpsError} = require("firebase-functions/v2/https");
const roles = require("../lib/auth/roles.js");

function fixture() {
  const items = [
    {productId: "p1", quantity: 2, name: "Produto 1", sku: "sku1", barcode: "1", unitPriceCents: 500, totalCents: 1000},
    {productId: "p2", quantity: 1, name: "Produto 2", sku: "sku2", barcode: "2", unitPriceCents: 500, totalCents: 500},
  ];
  const docs = new Map([["sales/sale1", {storeId: "s", status: "REFUNDED", reservationStatus: "CONSUMED",
    stockReconciliationRequired: true, paymentReconciliationRequired: false, items}]]);
  for (const item of items) {
    docs.set(`inventory/s_${item.productId}`, {storeId: "s", productId: item.productId, quantity: 5, reservedQuantity: 3});
    docs.set(`stockMovements/sale_sale1_${item.productId}`, {storeId: "s", productId: item.productId,
      type: "SALE", quantity: item.quantity, previousQuantity: 5 + item.quantity, newQuantity: 5});
  }
  let queue = Promise.resolve();
  let failCommit = false;
  const firestore = {
    collection: (name) => ({doc: (id) => ({path: `${name}/${id}`})}),
    runTransaction: (callback) => {
      const result = queue.then(async () => {
        const writes = [];
        const tx = {
          getAll: async (...refs) => {
            assert.equal(writes.length, 0, "all reads must precede writes");
            return refs.map((ref) => ({exists: docs.has(ref.path), data: () => docs.get(ref.path)}));
          },
          set: (ref, data) => writes.push({ref, data, merge: false}),
          update: (ref, data) => {
            assert.ok(docs.has(ref.path), "cannot update missing document");
            writes.push({ref, data, merge: true});
          },
        };
        const result = await callback(tx);
        if (failCommit) { failCommit = false; throw new Error("simulated commit failure"); }
        for (const {ref, data, merge} of writes) docs.set(ref.path, {...(merge ? docs.get(ref.path) : {}), ...data});
        return result;
      });
      queue = result.catch(() => {});
      return result;
    },
  };
  const exports = {};
  vm.runInNewContext(readFileSync(require.resolve("../lib/sales/resolveSaleStock.js"), "utf8"), {
    exports,
    require: (name) => {
      if (name === "../lib/firebaseAdmin.js") return {firestore};
      if (name === "../auth/roles.js") return roles;
      if (name === "firebase-admin/firestore") return {Timestamp, FieldValue};
      if (name === "firebase-functions/v2/https") return {HttpsError, onCall: (_, fn) => fn};
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return {
    docs, sale: () => docs.get("sales/sale1"),
    call: (data = {}, auth = {uid: "admin1", token: {roles: ["admin"]}}) => exports.resolveSaleStock({
      auth, data: {saleId: "sale1", action: "RETURN_ALL", reason: "Produtos recebidos e conferidos", physicallyChecked: true, ...data},
    }),
    failNextCommit: () => { failCommit = true; },
  };
}

test("return requires authenticated administrator and physical confirmation", async () => {
  const f = fixture();
  await assert.rejects(f.call({}, null), {code: "unauthenticated"});
  await assert.rejects(f.call({}, {uid: "stock1", token: {roles: ["inventory"], storeIds: ["s"]}}), {code: "permission-denied"});
  await assert.rejects(f.call({physicallyChecked: false}), {code: "invalid-argument"});
  await assert.rejects(f.call({reason: "  "}), {code: "invalid-argument"});
  assert.equal(f.docs.size, 5);
});

test("full return restores quantities, preserves reservations and records one resolution", async () => {
  const f = fixture();
  const response = await f.call();
  assert.equal(response.resolution.action, "RETURN_ALL");
  assert.equal(f.docs.get("inventory/s_p1").quantity, 7);
  assert.equal(f.docs.get("inventory/s_p2").quantity, 6);
  assert.equal(f.docs.get("inventory/s_p1").reservedQuantity, 3);
  assert.equal(f.sale().status, "REFUNDED");
  assert.equal(f.sale().reservationStatus, "RETURNED");
  assert.equal(f.sale().stockReconciliationRequired, false);
  assert.equal(f.docs.get("saleStockResolutions/sale1").userId, "admin1");
  assert.equal(f.docs.get("stockMovements/return_sale1_p1").quantity, 2);
  assert.equal(f.docs.get("stockMovements/return_sale1_p1").saleId, "sale1");
  assert.ok(response.resolution.resolvedAtMs > 0);
});

test("concurrent return requests and replay cannot replenish twice", async () => {
  const f = fixture();
  const results = await Promise.all([f.call(), f.call(), f.call()]);
  assert.equal(f.docs.get("inventory/s_p1").quantity, 7);
  assert.equal(f.docs.size, 8);
  assert.equal(results[0].resolution.resolvedAtMs, results[2].resolution.resolvedAtMs);
  await assert.rejects(f.call({action: "NO_RETURN"}), {code: "already-exists"});
  await assert.rejects(f.call({reason: "Outro motivo de devolução"}), {code: "already-exists"});
});

test("no-return resolution closes review without inventory movements", async () => {
  const f = fixture();
  await f.call({action: "NO_RETURN"});
  assert.equal(f.docs.get("inventory/s_p1").quantity, 5);
  assert.equal(f.docs.has("stockMovements/return_sale1_p1"), false);
  assert.equal(f.sale().stockReconciliationRequired, false);
  assert.equal(f.sale().reservationStatus, "CONSUMED");
  assert.equal(f.sale().stockResolution.action, "NO_RETURN");
  await assert.rejects(f.call(), {code: "already-exists"});
});

test("pending, paid and unconsumed sales cannot receive a return", async () => {
  for (const patch of [{status: "PAID"}, {status: "PENDING_PAYMENT"}, {reservationStatus: "RELEASED"},
    {reservationStatus: "RELEASE_REVIEW_REQUIRED"}, {stockReconciliationRequired: false}, {paymentReconciliationRequired: true}]) {
    const f = fixture();
    Object.assign(f.sale(), patch);
    await assert.rejects(f.call(), {code: "failed-precondition"});
    assert.equal(f.docs.size, 5);
  }
});

test("charged-back sale with consumed inventory permits physical return", async () => {
  const f = fixture();
  f.sale().status = "CHARGED_BACK";
  await f.call();
  assert.equal(f.sale().status, "CHARGED_BACK");
  assert.equal(f.docs.get("inventory/s_p2").quantity, 6);
});

test("invalid second original movement leaves all inventory and review unchanged", async () => {
  const f = fixture();
  f.docs.get("stockMovements/sale_sale1_p2").quantity = 99;
  await assert.rejects(f.call(), {code: "failed-precondition"});
  assert.equal(f.docs.get("inventory/s_p1").quantity, 5);
  assert.equal(f.sale().stockReconciliationRequired, true);
  assert.equal(f.docs.size, 5);
});

test("existing return movement blocks a second replenishment even without a resolution", async () => {
  const f = fixture();
  f.docs.set("stockMovements/return_sale1_p1", {quantity: 2});
  await assert.rejects(f.call(), {code: "failed-precondition"});
  assert.equal(f.docs.get("inventory/s_p1").quantity, 5);
});

test("bad quantities, duplicate items and inventory ownership fail before mutation", async () => {
  for (const corrupt of [
    (f) => { f.sale().items[1].quantity = 0; },
    (f) => { f.sale().items.push(f.sale().items[0]); },
    (f) => { f.docs.get("inventory/s_p2").productId = "other"; },
    (f) => { f.docs.get("inventory/s_p2").quantity = Number.MAX_SAFE_INTEGER; },
    (f) => { f.docs.get("inventory/s_p2").reservedQuantity = 10; },
  ]) {
    const f = fixture();
    corrupt(f);
    await assert.rejects(f.call(), {code: "failed-precondition"});
    assert.equal(f.docs.get("inventory/s_p1").quantity, 5);
    assert.equal(f.docs.size, 5);
  }
});

test("commit failure is atomic and retry replenishes once", async () => {
  const f = fixture();
  f.failNextCommit();
  await assert.rejects(f.call(), /simulated commit failure/);
  assert.equal(f.docs.get("inventory/s_p1").quantity, 5);
  assert.equal(f.sale().stockReconciliationRequired, true);
  assert.equal(f.docs.size, 5);
  await f.call();
  assert.equal(f.docs.get("inventory/s_p1").quantity, 7);
});

test("no-return cannot hide a stock deficit", async () => {
  const f = fixture();
  f.docs.get("inventory/s_p1").quantity = -1;
  await assert.rejects(f.call({action: "NO_RETURN"}), {code: "failed-precondition"});
  assert.equal(f.sale().stockReconciliationRequired, true);
});
