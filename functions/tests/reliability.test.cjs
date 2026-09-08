const {test} = require("node:test");
const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {Timestamp} = require("firebase-admin/firestore");

function loadCompiled(relativePath, dependencies) {
  const file = path.resolve(__dirname, "../lib", relativePath);
  const exports = {};
  vm.runInNewContext(readFileSync(file, "utf8"), {
    exports,
    require: (name) => dependencies(name),
    console,
    Date,
    Set,
  }, {filename: file});
  return exports;
}

test("sales pagination uses timestamp and document ID as a stable cursor", async () => {
  const operations = [];
  const createdAt = Timestamp.fromMillis(1700000000000);
  const query = {
    where(field, operator, value) {
      operations.push(["where", field, operator, value]);
      return this;
    },
    orderBy(field, direction) {
      operations.push(["orderBy", field, direction]);
      return this;
    },
    limit(value) {
      operations.push(["limit", value]);
      return this;
    },
    startAfter(...values) {
      operations.push(["startAfter", ...values]);
      return this;
    },
    async get() {
      return {size: 1, docs: [{id: "sale-a", data: () => ({
        status: "PAID", paymentStatus: "APPROVED", storeId: "store-a",
        terminalId: "terminal-a", totalCents: 100, createdAt, items: [],
      })}]};
    },
  };
  const firestore = {collection: () => query};
  const roles = {
    requireAnyRole() {}, hasRole: () => true, claimStoreIds: () => [],
  };
  const {listAdminSales} = loadCompiled("sales/listAdminSales.js", (name) => {
    if (name === "firebase-admin/firestore") {
      return {Timestamp, FieldPath: {documentId: () => "__name__"}};
    }
    if (name === "firebase-functions/v2/https") {
      return {HttpsError: Error, onCall: (_options, handler) => handler};
    }
    if (name === "../lib/firebaseAdmin.js") return {firestore};
    if (name === "../auth/roles.js") return roles;
    throw new Error(`Unexpected dependency ${name}`);
  });
  const result = await listAdminSales({data: {
    fromMs: 1699990000000, untilMs: 1700010000000,
    cursor: {createdAtMs: createdAt.toMillis(), id: "sale-b"},
  }});
  assert.deepEqual(
    operations.filter(([operation]) => operation === "orderBy"),
    [["orderBy", "createdAt", "desc"], ["orderBy", "__name__", "desc"]],
  );
  const cursor = operations.find(([operation]) => operation === "startAfter");
  assert.equal(cursor[1].toMillis(), createdAt.toMillis());
  assert.equal(cursor[2], "sale-b");
  assert.equal(result.cursor.id, "sale-a");
});

function reservationFixture(validCount, paidCount = 0, malformed = false) {
  const now = Date.now();
  const docs = new Map();
  for (let index = 0; index < validCount; index += 1) {
    docs.set(`sales/pending-${index}`, {
      status: "PENDING_PAYMENT", paymentStatus: "PENDING",
      reservationStatus: "RESERVED", storeId: "store-a",
      expiresAt: Timestamp.fromMillis(now - 1000 - index),
      items: [{productId: `product-${index}`, quantity: 1}],
    });
    docs.set(`inventory/store-a_product-${index}`, {reservedQuantity: 1});
  }
  for (let index = 0; index < paidCount; index += 1) {
    docs.set(`sales/paid-${index}`, {
      status: "PAID", expiresAt: Timestamp.fromMillis(now - 100000 - index),
      items: [],
    });
  }
  if (malformed) {
    docs.set("sales/malformed", {
      status: "PENDING_PAYMENT", paymentStatus: "PENDING", storeId: "store-a",
      expiresAt: Timestamp.fromMillis(now - 200000), items: [],
    });
  }
  const queryOperations = [];
  let queryReads = 0;
  const snapshot = (ref) => {
    const value = docs.get(ref.path);
    return {
      exists: value !== undefined,
      data: () => value === undefined ? undefined : {...value},
      get: (field) => value?.[field],
    };
  };
  const salesQuery = {
    where(field, operator, value) {
      queryOperations.push(["where", field, operator, value]);
      return this;
    },
    orderBy(field, direction) {
      queryOperations.push(["orderBy", field, direction]);
      return this;
    },
    limit(value) {
      queryOperations.push(["limit", value]);
      return this;
    },
    async get() {
      queryReads += 1;
      const expired = [...docs.entries()]
        .filter(([key, value]) => key.startsWith("sales/") &&
          value.status === "PENDING_PAYMENT" &&
          value.expiresAt instanceof Timestamp && value.expiresAt.toMillis() <= now)
        .sort(([, left], [, right]) => left.expiresAt.toMillis() - right.expiresAt.toMillis())
        .slice(0, 100)
        .map(([key]) => ({id: key.slice(6), ref: {path: key}}));
      return {empty: expired.length === 0, size: expired.length, docs: expired};
    },
  };
  let transactionQueue = Promise.resolve();
  const firestore = {
    collection(name) {
      if (name === "sales") return salesQuery;
      return {doc: (id) => ({path: `${name}/${id}`})};
    },
    runTransaction(callback) {
      const result = transactionQueue.then(async () => {
        const writes = [];
        const transaction = {
          get: async (ref) => snapshot(ref),
          getAll: async (...refs) => refs.map(snapshot),
          update: (ref, data) => writes.push([ref.path, data]),
        };
        await callback(transaction);
        for (const [key, data] of writes) {
          docs.set(key, {...docs.get(key), ...data});
        }
      });
      transactionQueue = result.catch(() => {});
      return result;
    },
  };
  const {releaseExpiredReservations} = loadCompiled(
    "sales/releaseExpiredReservations.js", (name) => {
      if (name === "firebase-admin/firestore") {
        return {Timestamp, FieldValue: {serverTimestamp: () => "server-time"}};
      }
      if (name === "firebase-functions/v2/scheduler") {
        return {onSchedule: (_options, handler) => handler};
      }
      if (name === "../lib/firebaseAdmin.js") return {firestore};
      throw new Error(`Unexpected dependency ${name}`);
    },
  );
  return {
    docs, queryOperations, run: releaseExpiredReservations,
    queryReads: () => queryReads,
  };
}

test("expired reservation cleanup drains batches without paid-sale starvation", async () => {
  const fixture = reservationFixture(205, 120, true);
  await fixture.run();
  assert.equal(fixture.queryReads(), 3);
  for (let index = 0; index < 205; index += 1) {
    assert.equal(fixture.docs.get(`sales/pending-${index}`).status, "EXPIRED");
    assert.equal(
      fixture.docs.get(`inventory/store-a_product-${index}`).reservedQuantity,
      0,
    );
  }
  assert.equal(fixture.docs.get("sales/paid-0").status, "PAID");
  assert.equal(fixture.docs.get("sales/malformed").status, "EXPIRED");
  assert.equal(fixture.docs.get("sales/malformed").stockReconciliationRequired, true);
  assert.ok(fixture.queryOperations.some((operation) =>
    operation[0] === "where" && operation[1] === "status" &&
    operation[2] === "==" && operation[3] === "PENDING_PAYMENT"));
});

test("concurrent cleanup invocations release a reservation once", async () => {
  const fixture = reservationFixture(1);
  await Promise.all([fixture.run(), fixture.run()]);
  assert.equal(fixture.docs.get("sales/pending-0").status, "EXPIRED");
  assert.equal(fixture.docs.get("inventory/store-a_product-0").reservedQuantity, 0);
});
