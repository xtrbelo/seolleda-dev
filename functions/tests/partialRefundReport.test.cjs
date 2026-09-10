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
  assert.equal(result.report.units, 2);
  assert.equal(result.report.paid, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result.report.products)), [
    {id: "p1", name: "Produto 1", quantity: 1, total: 500},
    {id: "p2", name: "Produto 2", quantity: 1, total: 500},
  ]);
});
