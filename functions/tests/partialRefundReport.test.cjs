const {test} = require("node:test");
const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const vm = require("node:vm");
const {Timestamp} = require("firebase-admin/firestore");
const {HttpsError} = require("firebase-functions/v2/https");

test("reports subtract confirmed partial refunds from revenue and units", async () => {
  const createdAt = Timestamp.fromMillis(Date.parse("2026-09-09T12:00:00-03:00"));
  const sale = {
    storeId: "store1", status: "PAID", paymentStatus: "APPROVED", totalCents: 1500,
    partialRefundedCents: 500, createdAt,
    items: [
      {productId: "p1", name: "Produto 1", quantity: 2, unitPriceCents: 500, totalCents: 1000},
      {productId: "p2", name: "Produto 2", quantity: 1, unitPriceCents: 500, totalCents: 500},
    ],
    partialRefunds: [{state: "CONFIRMED", items: [{productId: "p1", quantity: 1}]}],
  };
  const snapshot = {size: 1, docs: [{data: () => sale}]};
  const query = {where: () => query, orderBy: () => query, limit: () => query, get: async () => snapshot};
  const firestore = {collection: (name) => {
    assert.equal(name, "sales");
    return query;
  }};
  const exports = {};
  vm.runInNewContext(readFileSync(require.resolve("../lib/reports/getAdminReport.js"), "utf8"), {
    exports,
    require: (name) => {
      if (name === "../lib/firebaseAdmin.js") return {firestore};
      if (name === "../auth/roles.js") return require("../lib/auth/roles.js");
      if (name === "firebase-admin/firestore") return {Timestamp};
      if (name === "firebase-functions/v2/https") return {HttpsError, onCall: (_, handler) => handler};
      throw new Error(`Unexpected import ${name}`);
    },
  });
  const result = await exports.getAdminReport({
    auth: {uid: "admin1", token: {roles: ["admin"]}},
    data: {fromMs: createdAt.toMillis() - 1000, untilMs: createdAt.toMillis() + 1000},
  });
  assert.equal(result.report.revenue, 1000);
  assert.deepEqual(JSON.parse(JSON.stringify(result.report.amounts)), {gross: 1500, refunded: 500, disputed: 0, net: 1000});
  assert.deepEqual(JSON.parse(JSON.stringify(result.report.counts)), {paid: 1, cancelled: 0, refunded: 0, chargedBack: 0});
  assert.equal(result.report.units, 2);
  assert.equal(result.report.paid, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result.report.products)), [
    {id: "p1", name: "Produto 1", quantity: 1, total: 500},
    {id: "p2", name: "Produto 2", quantity: 1, total: 500},
  ]);
});

test("financial closing groups terminal states and excludes review values", async () => {
  const firstDay = Timestamp.fromMillis(Date.parse("2026-09-09T12:00:00-03:00"));
  const secondDay = Timestamp.fromMillis(Date.parse("2026-09-10T12:00:00-03:00"));
  const sales = [
    {storeId: "store1", paymentMethod: "PIX", status: "PAID", paymentStatus: "APPROVED", totalCents: 1000, partialRefundedCents: 200, createdAt: firstDay},
    {storeId: "store1", paymentMethod: "CARD", status: "REFUNDED", paymentStatus: "REFUNDED", totalCents: 2000, paidAt: firstDay, createdAt: firstDay},
    {storeId: "store2", paymentMethod: "CARD", status: "CHARGED_BACK", paymentStatus: "CHARGED_BACK", totalCents: 1500, partialRefundedCents: 500, paidAt: firstDay, createdAt: secondDay},
    {storeId: "store1", paymentMethod: "PIX", status: "CANCELLED", paymentStatus: "CANCELLED", totalCents: 900, createdAt: secondDay},
    {storeId: "store1", paymentMethod: "PIX", status: "PAYMENT_REVIEW_REQUIRED", paymentStatus: "APPROVED", paymentReconciliationRequired: true, totalCents: 3000, createdAt: secondDay},
    {storeId: "store2", paymentMethod: "PIX", status: "REFUNDED", paymentStatus: "REFUNDED", totalCents: 700, reservationStatus: "RELEASED", createdAt: secondDay},
  ];
  const snapshot = {size: sales.length, docs: sales.map((sale) => ({data: () => sale}))};
  const query = {where: () => query, orderBy: () => query, limit: () => query, get: async () => snapshot};
  const firestore = {collection: (name) => {
    assert.equal(name, "sales");
    return query;
  }};
  const exports = {};
  vm.runInNewContext(readFileSync(require.resolve("../lib/reports/getAdminReport.js"), "utf8"), {
    exports,
    require: (name) => {
      if (name === "../lib/firebaseAdmin.js") return {firestore};
      if (name === "../auth/roles.js") return require("../lib/auth/roles.js");
      if (name === "firebase-admin/firestore") return {Timestamp};
      if (name === "firebase-functions/v2/https") return {HttpsError, onCall: (_, handler) => handler};
      throw new Error(`Unexpected import ${name}`);
    },
  });
  const request = {auth: {uid: "admin1", token: {roles: ["admin"]}}, data: {fromMs: firstDay.toMillis() - 1000, untilMs: secondDay.toMillis() + 1000}};
  const result = await exports.getAdminReport(request);
  assert.deepEqual(JSON.parse(JSON.stringify(result.report.amounts)), {gross: 4500, refunded: 2700, disputed: 1000, net: 800});
  assert.deepEqual(JSON.parse(JSON.stringify(result.report.counts)), {paid: 1, cancelled: 1, refunded: 2, chargedBack: 1});
  assert.equal(result.report.review, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result.report.availableStores)), ["store1", "store2"]);
  assert.equal(result.report.days.length, 2);
  assert.equal(result.report.stores.length, 2);
  assert.equal(result.report.methods.length, 2);
  assert.equal(result.report.rows.length, 5);

  request.data.storeId = "store2";
  request.data.paymentMethod = "CARD";
  const filtered = await exports.getAdminReport(request);
  assert.equal(filtered.report.total, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(filtered.report.amounts)), {gross: 1500, refunded: 500, disputed: 1000, net: 0});
  assert.deepEqual(JSON.parse(JSON.stringify(filtered.report.counts)), {paid: 0, cancelled: 0, refunded: 0, chargedBack: 1});
  assert.deepEqual(JSON.parse(JSON.stringify(filtered.report.availableStores)), ["store1", "store2"]);

  await assert.rejects(() => exports.getAdminReport({
    auth: {uid: "reports1", token: {roles: ["reports"], storeIds: ["store1"]}},
    data: {...request.data, storeId: "store2"},
  }), (error) => error.code === "permission-denied");
});

test("financial report preserves the one-thousand-sale query limit", async () => {
  const query = {where: () => query, orderBy: () => query, limit: () => query, get: async () => ({size: 1001, docs: []})};
  const firestore = {collection: () => query};
  const exports = {};
  vm.runInNewContext(readFileSync(require.resolve("../lib/reports/getAdminReport.js"), "utf8"), {
    exports,
    require: (name) => {
      if (name === "../lib/firebaseAdmin.js") return {firestore};
      if (name === "../auth/roles.js") return require("../lib/auth/roles.js");
      if (name === "firebase-admin/firestore") return {Timestamp};
      if (name === "firebase-functions/v2/https") return {HttpsError, onCall: (_, handler) => handler};
      throw new Error(`Unexpected import ${name}`);
    },
  });
  await assert.rejects(() => exports.getAdminReport({
    auth: {uid: "admin1", token: {roles: ["admin"]}},
    data: {fromMs: Date.parse("2026-09-09T00:00:00-03:00"), untilMs: Date.parse("2026-09-10T00:00:00-03:00")},
  }), (error) => error.code === "resource-exhausted");
});
