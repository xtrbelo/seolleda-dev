const {test} = require("node:test");
const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const {Timestamp, FieldValue} = require("firebase-admin/firestore");
const {HttpsError} = require("firebase-functions/v2/https");
const partialId1 = "11111111-1111-4111-8111-111111111111";
const partialId2 = "22222222-2222-4222-8222-222222222222";

// Execute compiled production handlers with an isolated in-memory transaction
// adapter and fake HTTP provider. No credentials, network or Firebase writes.
function fixture() {
  const now = Date.now();
  const docs = new Map([
    ["sales/sale1", {
      status: "PENDING_PAYMENT", paymentStatus: "PENDING", totalCents: 1250,
      storeId: "store1", createdAt: Timestamp.fromMillis(now - 1000),
      expiresAt: Timestamp.fromMillis(now + 899000),
      items: [{productId: "p1", quantity: 2, name: "Produto",
        sku: "sku1", barcode: "123", unitPriceCents: 625, totalCents: 1250}],
    }],
    ["inventory/store1_p1", {quantity: 8}],
  ]);
  const http = [];
  const errors = [];
  let httpFailure = null;
  const payments = new Map();
  const refundRequests = new Map();
  let queue = Promise.resolve();
  let failCommit = false;
  let afterPost = null;
  const snapshot = (ref) => {
    const value = docs.get(ref.path);
    return {exists: !!value, data: () => value && {...value},
      get: (key) => value?.[key]};
  };
  const firestore = {
    collection: (name) => ({doc: (id) => ({path: name + "/" + id,
      get: async () => snapshot({path: name + "/" + id})})}),
    runTransaction: (callback) => {
      const result = queue.then(async () => {
        const writes = [];
        const tx = {
          get: async (ref) => { assert.equal(writes.length, 0); return snapshot(ref); },
          getAll: async (...refs) => {
            assert.equal(writes.length, 0);
            return refs.map(snapshot);
          },
          update: (ref, value) => writes.push([ref, value, true]),
          set: (ref, value) => writes.push([ref, value, false]),
        };
        const result = await callback(tx);
        if (failCommit && writes.some(([,value]) => value.mercadoPagoPaymentId)) {
          failCommit = false;
          throw new Error("simulated lost persistence");
        }
        for (const [ref, value, merge] of writes) {
          docs.set(ref.path, {...(merge ? docs.get(ref.path) : {}), ...value});
        }
        return result;
      });
      queue = result.catch(() => {});
      return result;
    },
  };
  const cache = new Map();
  const fakeFetch = async (url, options) => {
    http.push({url, ...options});
    if (httpFailure) return httpFailure;
    if (url.endsWith("/refunds") || options.method === "PUT") {
      const payment = [...payments.values()][0].data;
      if (url.endsWith("/refunds")) {
        const key = options.headers["X-Idempotency-Key"];
        const body = JSON.parse(options.body);
        if (refundRequests.has(key)) assert.equal(refundRequests.get(key), options.body, "retry refund payload changed");
        else {
          refundRequests.set(key, options.body);
          const previous = payment.transaction_amount_refunded ?? 0;
          payment.transaction_amount_refunded = previous + (body.amount ?? payment.transaction_amount - previous);
        }
        payment.status = payment.transaction_amount_refunded === payment.transaction_amount ? "refunded" : "approved";
        payment.status_detail = payment.status === "refunded" ? "refunded" : "accredited";
      } else payment.status = "cancelled";
      if (afterPost) await afterPost();
      return {ok: true, json: async () => ({})};
    }
    if (options.method === "POST") {
      const key = options.headers["X-Idempotency-Key"];
      const body = JSON.parse(options.body);
      const isCard = body.payment_method_id !== "pix";
      if (payments.has(key)) {
        assert.equal(payments.get(key).body, options.body, "retry payload changed");
      } else {
        payments.set(key, {body: options.body, data: {
          id: 12345, external_reference: body.external_reference,
          transaction_amount: body.transaction_amount, currency_id: "BRL",
            payment_method_id: isCard ? body.payment_method_id : "pix",
            payment_type_id: isCard ? "credit_card" : "bank_transfer",
            status: "pending", status_detail: "pending_waiting_transfer",
          metadata: body.metadata, date_approved: null,
          date_of_expiration: new Date(now + 86400000).toISOString(),
          point_of_interaction: {transaction_data: {
            qr_code: "fake-pix-code", qr_code_base64: "ZmFrZQ==",
            ticket_url: "https://www.mercadopago.com.br/payments/12345/ticket",
          }},
        }});
      }
      const copy = structuredClone(payments.get(key).data);
      if (afterPost) await afterPost();
      return {ok: true, json: async () => copy};
    }
    assert.match(url, /\/v1\/payments\/12345$/);
    return {ok: true, json: async () => structuredClone([...payments.values()][0].data)};
  };
  function load(name) {
    const file = path.resolve(__dirname, "../lib/payments", name);
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const fakeRequire = (id) => {
      if (id === "../lib/firebaseAdmin.js") return {firestore};
      if (id === "firebase-admin/firestore") return {Timestamp, FieldValue};
      if (id === "firebase-functions/params") return {defineSecret: (name) => ({
        value: () => name === "MP_WEBHOOK_SECRET" ? "test-signature-key" : "test-token",
      })};
      if (id === "firebase-functions/v2/https") return {
        HttpsError, onCall: (_options, handler) => handler,
        onRequest: (_options, handler) => handler,
      };
      if (id.startsWith("./")) return load(id.slice(2));
      if (id === "crypto") return crypto;
      if (id === "../auth/roles.js") return require("../lib/auth/roles.js");
      throw new Error("Unexpected dependency " + id);
    };
    vm.runInNewContext(readFileSync(file, "utf8"), {
      exports, require: fakeRequire, fetch: fakeFetch, Buffer, AbortSignal, Error,
      console: {info() {}, error(...args) { errors.push(args); }},
    }, {filename: file});
    return exports;
  }
  const create = load("createPixPayment.js").createPixPayment;
  const createCard = load("createCardPayment.js").createCardPayment;
  const handler = load("mercadoPagoWebhook.js").mercadoPagoWebhook;
  const manage = load("managePayment.js").managePayment;
  const webhook = async (overrides = {}) => {
    const ts = String(Date.now());
    const signature = crypto.createHmac("sha256", "test-signature-key")
      .update("id:12345;request-id:req1;ts:" + ts + ";").digest("hex");
    const req = {
      method: "POST", query: {"data.id": "12345", type: "payment"},
      body: {data: {id: 12345}, type: "payment"},
      headers: {"x-request-id": "req1", "x-signature": "ts=" + ts + ", v1=" + signature},
      ...overrides,
    };
    const res = {code: 200, status(code) { this.code = code; return this; },
      send(message) { this.message = message; return this; }};
    await handler(req, res);
    return res;
  };
  return {
    docs, http, payments, webhook, errors,
    manage: (action, auth = {uid: "admin1", token: {roles: ["admin"]}}, data = {}) => manage({
      auth, data: {saleId: "sale1", action, reason: "Solicitação do cliente", ...data},
    }),
    rejectHttp: (body) => {
      httpFailure = {ok: false, status: 401, json: async () => body};
    },
    create: (data = {}) => create({data: {saleId: "sale1", payerEmail: "a@example.com", ...data}}),
    createCard: (data = {}) => createCard({data: {
      saleId: "sale1", token: "tokenized-card-token", paymentMethodId: "visa",
      installments: 1, payerEmail: "a@example.com", ...data,
    }}),
    sale: () => docs.get("sales/sale1"),
    payment: () => [...payments.values()][0].data,
    approve: () => Object.assign([...payments.values()][0].data, {
      status: "approved", status_detail: "accredited",
      date_approved: new Date(now).toISOString(),
    }),
    failNextPersistence: () => { failCommit = true; },
    afterPost: (callback) => { afterPost = callback; },
    movementCount: () => [...docs.keys()].filter((key) => key.startsWith("stockMovements/")).length,
  };
}

test("provider diagnostics exclude response messages, tokens and payer data", async () => {
  const f = fixture();
  f.rejectHttp({error: "unauthorized", message: "private-token customer@example.com",
    cause: [{code: 1000, description: "private-token"}, {code: "private-token"}]});
  await assert.rejects(f.create(), {code: "internal"});
  const logs = JSON.stringify(f.errors);
  assert.match(logs, /MP_HTTP_401/);
  assert.match(logs, /mercado_pago/);
  assert.match(logs, /1000/);
  assert.doesNotMatch(logs, /private-token|customer@example.com|test-token/);
  assert.equal(f.movementCount(), 0);
});

test("unrecognized provider error text is not logged", async () => {
  const f = fixture();
  f.rejectHttp({error: "private-token", cause: [{code: "customer@example.com"}]});
  await assert.rejects(f.create(), {code: "internal"});
  const logs = JSON.stringify(f.errors);
  assert.match(logs, /unclassified/);
  assert.doesNotMatch(logs, /private-token|customer@example.com/);
});

test("concurrent calls reuse one payment, server amount and original deadline", async () => {
  const f = fixture();
  const expires = f.sale().expiresAt.toMillis();
  const results = await Promise.all([
    f.create({totalCents: 1}), f.create({payerEmail: "other@example.com"}),
  ]);
  assert.equal(f.payments.size, 1);
  assert.equal(results[0].paymentId, results[1].paymentId);
  assert.equal(results[0].totalCents, 1250);
  assert.equal(results[0].expiresAtMs, expires);
  assert.equal(f.sale().expiresAt.toMillis(), expires);
  assert.equal(f.sale().status, "PENDING_PAYMENT");
  assert.equal(f.sale().paymentStatus, "PENDING");
  assert.equal(f.movementCount(), 0);
  const calls = f.http.length;
  const cached = await f.create();
  assert.equal(cached.qrCodeBase64, "ZmFrZQ==");
  assert.equal(f.http.length, calls);
});

test("uncertain persistence retries with the same key and payer", async () => {
  const f = fixture();
  f.failNextPersistence();
  await assert.rejects(f.create(), {code: "internal"});
  const firstKey = f.sale().pixIdempotencyKey;
  await f.create({payerEmail: "different@example.com"});
  assert.equal(f.sale().pixIdempotencyKey, firstKey);
  assert.equal(f.payments.size, 1);
});

test("expired and legacy extended sales cannot create Pix", async () => {
  for (const legacy of [false, true]) {
    const f = fixture();
    if (legacy) {
      f.sale().createdAt = Timestamp.fromMillis(Date.now() - 20 * 60000);
      f.sale().expiresAt = Timestamp.fromMillis(Date.now() + 10 * 60000);
    } else f.sale().expiresAt = Timestamp.fromMillis(Date.now() - 1);
    await assert.rejects(f.create(), {code: "deadline-exceeded"});
    assert.equal(f.http.length, 0);
  }
});

test("incomplete legacy attempts are not replaced with a new charge", async () => {
  const f = fixture();
  Object.assign(f.sale(), {pixAttemptId: "old", pixIdempotencyKey: "old"});
  await assert.rejects(f.create(), {code: "failed-precondition"});
  assert.equal(f.http.length, 0);
});

test("invalid email and invalid sale ID never call the provider", async () => {
  const f = fixture();
  await assert.rejects(f.create({payerEmail: "invalid"}), {code: "invalid-argument"});
  await assert.rejects(f.create({saleId: "sales/nested"}), {code: "invalid-argument"});
  assert.equal(f.http.length, 0);
});

test("missing customer email uses the company payer email", async () => {
  const f = fixture();
  delete f.sale().customerEmail;
  await f.create({payerEmail: ""});
  assert.equal(f.sale().pixPayerEmail, "seolledadev@gmail.com");
  assert.equal(JSON.parse(f.http[0].body).payer.email, "seolledadev@gmail.com");
});

test("signature, method, resource type and signed ID are enforced", async () => {
  const f = fixture();
  await f.create();
  const calls = f.http.length;
  assert.equal((await f.webhook({headers: {}})).code, 401);
  assert.equal((await f.webhook({method: "GET"})).code, 405);
  assert.equal((await f.webhook({body: {data: {id: 999}}})).code, 400);
  assert.equal((await f.webhook({query: {"data.id": "12345", type: "order"}})).code, 200);
  assert.equal(f.http.length, calls);
  assert.equal(f.movementCount(), 0);
});

test("pending payment never deducts stock; duplicate approvals deduct once", async () => {
  const f = fixture();
  await f.create();
  assert.equal((await f.webhook()).code, 200);
  assert.equal(f.movementCount(), 0);
  f.approve();
  const responses = await Promise.all([f.webhook(), f.webhook()]);
  assert.ok(responses.every((r) => r.code === 200));
  assert.equal(f.sale().status, "PAID");
  assert.equal(f.sale().paymentStatus, "APPROVED");
  assert.equal(f.docs.get("inventory/store1_p1").quantity, 6);
  assert.equal(f.movementCount(), 1);
  f.payment().status = "pending";
  await f.webhook();
  assert.equal(f.sale().status, "PAID");
  assert.equal(f.sale().mercadoPagoPaymentStatus, "approved");
});

test("wrong amount, currency, payment method and linked ID cannot approve", async () => {
  for (const change of [
    {transaction_amount: 1}, {currency_id: "USD"},
    {payment_method_id: "visa"}, {external_reference: "other-sale"},
  ]) {
    const f = fixture();
    await f.create();
    f.approve();
    Object.assign(f.payment(), change);
    await f.webhook();
    assert.equal(f.sale().status, "PENDING_PAYMENT");
    assert.equal(f.movementCount(), 0);
  }
  const f = fixture();
  await f.create();
  f.approve();
  f.sale().mercadoPagoPaymentId = "987";
  await f.webhook();
  assert.equal(f.movementCount(), 0);
});

test("late or undated approval requires review without stock changes", async () => {
  for (const date of [null, new Date(Date.now() + 20 * 60000).toISOString()]) {
    const f = fixture();
    await f.create();
    f.approve();
    f.payment().date_approved = date;
    await f.webhook();
    await f.webhook();
    assert.equal(f.sale().status, "PAYMENT_REVIEW_REQUIRED");
    assert.equal(f.sale().paymentReconciliationRequired, true);
    assert.equal(f.docs.get("inventory/store1_p1").quantity, 8);
    assert.equal(f.movementCount(), 0);
  }
});

test("delayed delivery honors original approval time", async () => {
  const f = fixture();
  await f.create();
  f.approve();
  const now = Date.now();
  f.sale().createdAt = Timestamp.fromMillis(now - 20 * 60000);
  f.sale().expiresAt = Timestamp.fromMillis(now - 5 * 60000);
  f.payment().date_approved = new Date(now - 6 * 60000).toISOString();
  await f.webhook();
  assert.equal(f.sale().status, "PAID");
});

test("early approval binds metadata and creation cannot overwrite PAID", async () => {
  const f = fixture();
  f.afterPost(async () => {
    f.approve();
    assert.equal((await f.webhook()).code, 200);
  });
  await assert.rejects(f.create(), {code: "failed-precondition"});
  assert.equal(f.sale().status, "PAID");
  assert.equal(f.sale().mercadoPagoPaymentStatus, "approved");
  assert.equal(f.movementCount(), 1);
});

test("early pending webhook and failed QR persistence recover by GET", async () => {
  const f = fixture();
  f.afterPost(async () => {
    assert.equal((await f.webhook()).code, 200);
    f.failNextPersistence();
  });
  await assert.rejects(f.create(), {code: "internal"});
  assert.equal(f.sale().mercadoPagoPaymentId, "12345");
  const qr = await f.create();
  assert.equal(qr.qrCodeBase64, "ZmFrZQ==");
  assert.equal(f.http.filter((call) => call.method === "POST").length, 1);
});

test("unlinked notification without matching metadata is retried, not approved", async () => {
  const f = fixture();
  await f.create();
  f.approve();
  delete f.sale().mercadoPagoPaymentId;
  f.payment().metadata = {};
  assert.equal((await f.webhook()).code, 500);
  assert.equal(f.movementCount(), 0);
});

test("transaction failure leaves no partial stock mutation", async () => {
  const f = fixture();
  await f.create();
  f.approve();
  f.failNextPersistence();
  assert.equal((await f.webhook()).code, 500);
  assert.equal(f.docs.get("inventory/store1_p1").quantity, 8);
  assert.equal(f.movementCount(), 0);
  assert.equal((await f.webhook()).code, 200);
  assert.equal(f.movementCount(), 1);
});

test("card payment uses the server total and a single installment", async () => {
  const f = fixture();
  const result = await f.createCard({totalCents: 1});
  assert.equal(result.status, "pending");
  assert.equal(f.sale().paymentMethod, "CARD");
  assert.equal(f.http.filter((call) => call.method === "POST").length, 1);
  const body = JSON.parse(f.http[0].body);
  assert.equal(body.transaction_amount, 12.5);
  assert.equal(body.installments, 1);
  assert.equal(body.payment_method_id, "visa");
  assert.equal(body.token, "tokenized-card-token");
  assert.equal(body.external_reference, "sale1");
});

test("card payment rejects installments other than one before contacting provider", async () => {
  const f = fixture();
  await assert.rejects(f.createCard({installments: 2}), {code: "invalid-argument"});
  assert.equal(f.http.length, 0);
  assert.equal(f.sale().paymentMethod, undefined);
});

test("card payment rejects missing token before contacting provider", async () => {
  const f = fixture();
  await assert.rejects(f.createCard({token: ""}), {code: "invalid-argument"});
  assert.equal(f.http.length, 0);
  assert.equal(f.sale().paymentMethod, undefined);
});

test("approved card payment consumes the reservation exactly once", async () => {
  const f = fixture();
  await f.createCard();
  f.approve();
  assert.equal((await f.webhook()).code, 200);
  assert.equal(f.sale().status, "PAID");
  assert.equal(f.sale().paymentMethod, "CARD");
  assert.equal(f.docs.get("inventory/store1_p1").quantity, 6);
  assert.equal(f.movementCount(), 1);
  assert.equal((await f.webhook()).code, 200);
  assert.equal(f.movementCount(), 1);
});

test("payment operations reject sales role before provider access", async () => {
  const f = fixture();
  await assert.rejects(f.manage("REFUND", {uid: "sales1", token: {roles: ["sales"], storeIds: ["store1"]}}), {code: "permission-denied"});
  assert.equal(f.http.length, 0);
});

test("cancellation releases reservation once and records administrator reason", async () => {
  const f = fixture();
  f.sale().reservationStatus = "RESERVED";
  f.docs.get("inventory/store1_p1").reservedQuantity = 2;
  await f.create();
  const result = await f.manage("CANCEL");
  assert.equal(result.confirmed, true);
  assert.equal(f.sale().status, "CANCELLED");
  assert.equal(f.sale().reservationStatus, "RELEASED");
  assert.equal(f.sale().stockReconciliationRequired, false);
  assert.equal(f.docs.get("inventory/store1_p1").reservedQuantity, 0);
  assert.equal(f.docs.get("inventory/store1_p1").quantity, 8);
  const key = f.sale().paymentOperationKey;
  assert.equal(f.docs.get(`paymentOperations/${key}`).userId, "admin1");
  assert.equal(f.docs.get(`paymentOperations/${key}`).reason, "Solicitação do cliente");
  await f.manage("CANCEL");
  assert.equal((await f.webhook()).code, 200);
  assert.equal(f.http.filter((call) => call.method === "PUT").length, 1);
  assert.equal(f.docs.get("inventory/store1_p1").reservedQuantity, 0);
});

test("full refund preserves sold stock and ignores later approval notification", async () => {
  const f = fixture();
  await f.createCard();
  f.approve();
  await f.webhook();
  await f.manage("REFUND");
  assert.equal(f.sale().status, "REFUNDED");
  assert.equal(f.sale().stockReconciliationRequired, true);
  assert.equal(f.docs.get("inventory/store1_p1").quantity, 6);
  await f.manage("REFUND");
  assert.equal(f.http.filter((call) => call.url.endsWith("/refunds")).length, 1);
  f.approve();
  await f.webhook();
  assert.equal(f.sale().status, "REFUNDED");
  assert.equal(f.movementCount(), 1);
});

test("refund resolves payment review without consuming stock", async () => {
  const f = fixture();
  f.sale().reservationStatus = "RESERVED";
  f.docs.get("inventory/store1_p1").reservedQuantity = 2;
  await f.create();
  f.approve();
  Object.assign(f.sale(), {status: "PAYMENT_REVIEW_REQUIRED", paymentReconciliationRequired: true});
  await f.manage("REFUND");
  assert.equal(f.sale().status, "REFUNDED");
  assert.equal(f.sale().paymentReconciliationRequired, false);
  assert.equal(f.sale().reservationStatus, "RELEASED");
  assert.equal(f.sale().stockReconciliationRequired, false);
  assert.equal(f.docs.get("inventory/store1_p1").quantity, 8);
  assert.equal(f.docs.get("inventory/store1_p1").reservedQuantity, 0);
});

test("refund refuses mismatched provider amount before mutation", async () => {
  const f = fixture();
  await f.create();
  f.approve();
  f.payment().transaction_amount = 1;
  await assert.rejects(f.manage("REFUND"), {code: "unavailable"});
  assert.equal(f.http.filter((call) => call.url.endsWith("/refunds")).length, 0);
  assert.equal(f.sale().paymentOperationKey, undefined);
});

test("inconsistent cancellation reservation is flagged without partial release", async () => {
  const f = fixture();
  f.sale().reservationStatus = "RESERVED";
  await f.create();
  f.docs.get("inventory/store1_p1").reservedQuantity = 1;
  await f.manage("CANCEL");
  assert.equal(f.sale().status, "CANCELLED");
  assert.equal(f.sale().reservationStatus, "RELEASE_REVIEW_REQUIRED");
  assert.equal(f.sale().stockReconciliationRequired, true);
  assert.equal(f.docs.get("inventory/store1_p1").reservedQuantity, 1);
});

test("lost refund response is recovered by querying without a second refund", async () => {
  const f = fixture();
  await f.create();
  f.approve();
  f.afterPost(() => { throw new Error("lost provider response"); });
  await assert.rejects(f.manage("REFUND"), {code: "unavailable"});
  assert.ok(f.sale().paymentOperationKey);
  assert.equal(f.sale().paymentOperationState, "REQUESTED");
  f.afterPost(null);
  const result = await f.manage("CHECK");
  assert.equal(result.confirmed, true);
  assert.equal(f.sale().status, "REFUNDED");
  assert.equal(f.http.filter((call) => call.url.endsWith("/refunds")).length, 1);
});

test("consultation preserves review and cannot approve a sale manually", async () => {
  const f = fixture();
  await f.create();
  f.approve();
  Object.assign(f.sale(), {status: "PAYMENT_REVIEW_REQUIRED", paymentReconciliationRequired: true});
  await f.manage("CHECK");
  assert.equal(f.sale().status, "PAYMENT_REVIEW_REQUIRED");
  assert.equal(f.sale().paymentReconciliationRequired, true);
  assert.equal(f.movementCount(), 0);
});

test("partial refund uses persisted item prices and records the provider total", async () => {
  const f = fixture();
  await f.createCard();
  f.approve();
  await f.webhook();
  const result = await f.manage("PARTIAL_REFUND", undefined, {
    requestId: partialId1, items: [{productId: "p1", quantity: 1}],
  });
  assert.equal(result.confirmed, true);
  assert.equal(result.partialRefundedCents, 625);
  assert.equal(f.sale().status, "PAID");
  assert.equal(f.sale().partialRefundedCents, 625);
  assert.equal(f.sale().partialReturnPendingCount, 1);
  assert.equal(f.sale().stockReconciliationRequired, true);
  assert.equal(f.docs.get(`paymentOperations/partial_${partialId1}`).amountCents, 625);
  const refundCall = f.http.find((call) => call.url.endsWith("/refunds"));
  assert.equal(JSON.parse(refundCall.body).amount, 6.25);
  assert.equal(f.docs.get("inventory/store1_p1").quantity, 6);
});

test("partial refund replay and concurrent requests cannot refund twice", async () => {
  const f = fixture();
  await f.createCard();
  f.approve();
  await f.webhook();
  const data = {requestId: partialId1, items: [{productId: "p1", quantity: 1}]};
  const first = await f.manage("PARTIAL_REFUND", undefined, data);
  const replay = await f.manage("PARTIAL_REFUND", undefined, data);
  assert.equal(first.partialRefundedCents, replay.partialRefundedCents);
  assert.equal(f.http.filter((call) => call.url.endsWith("/refunds")).length, 1);
  assert.equal(f.sale().partialReturnPendingCount, 1);

  const f2 = fixture();
  await f2.createCard();
  f2.approve();
  await f2.webhook();
  const results = await Promise.allSettled([
    f2.manage("PARTIAL_REFUND", undefined, data),
    f2.manage("PARTIAL_REFUND", undefined, {requestId: partialId2, items: [{productId: "p1", quantity: 1}]}),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(f2.http.filter((call) => call.url.endsWith("/refunds")).length, 1);
  assert.equal(f2.sale().partialRefundedCents, 625);
});

test("lost partial refund response is recovered without another provider refund", async () => {
  const f = fixture();
  await f.createCard();
  f.approve();
  await f.webhook();
  const data = {requestId: partialId1, items: [{productId: "p1", quantity: 1}]};
  f.afterPost(() => { throw new Error("lost partial response"); });
  await assert.rejects(f.manage("PARTIAL_REFUND", undefined, data), {code: "unavailable"});
  assert.equal(f.sale().partialRefunds[0].state, "REQUESTED");
  f.afterPost(null);
  const recovered = await f.manage("PARTIAL_REFUND", undefined, data);
  assert.equal(recovered.confirmed, true);
  assert.equal(f.http.filter((call) => call.url.endsWith("/refunds")).length, 1);
  assert.equal(f.sale().partialRefunds[0].state, "CONFIRMED");
});

test("partial refunds cannot exceed remaining items and may complete the full amount", async () => {
  const f = fixture();
  await f.createCard();
  f.approve();
  await f.webhook();
  await assert.rejects(f.manage("PARTIAL_REFUND", undefined, {
    requestId: partialId1, items: [{productId: "p1", quantity: 3}],
  }), {code: "failed-precondition"});
  await f.manage("PARTIAL_REFUND", undefined, {
    requestId: partialId1, items: [{productId: "p1", quantity: 1}],
  });
  await assert.rejects(f.manage("REFUND"), {code: "failed-precondition"});
  const final = await f.manage("PARTIAL_REFUND", undefined, {
    requestId: partialId2, items: [{productId: "p1", quantity: 1}],
  });
  assert.equal(final.confirmed, true);
  assert.equal(final.partialRefundedCents, 1250);
  assert.equal(f.sale().status, "REFUNDED");
  assert.equal(f.sale().partialReturnPendingCount, 2);
  assert.equal(f.http.filter((call) => call.url.endsWith("/refunds")).length, 2);
});

test("untracked provider partial refund requires review without changing stock", async () => {
  const f = fixture();
  await f.createCard();
  f.approve();
  await f.webhook();
  f.payment().transaction_amount_refunded = 1;
  await f.webhook();
  assert.equal(f.sale().paymentReconciliationRequired, true);
  assert.equal(f.sale().paymentReviewReason, "PARTIAL_REFUND_MISMATCH");
  assert.equal(f.docs.get("inventory/store1_p1").quantity, 6);
});
