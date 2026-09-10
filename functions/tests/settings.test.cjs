const {test} = require("node:test");
const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const vm = require("node:vm");
const {HttpsError} = require("firebase-functions/v2/https");

function fixture(initial = []) {
  const docs = new Map(initial);
  const calls = [];
  let sequence = 0;
  const snapshot = (path) => ({exists: docs.has(path), data: () => docs.get(path)});
  const query = (name, filters = [], maximum) => ({
    query: true,
    name,
    filters,
    maximum,
    where(field, operator, value) { return query(name, [...filters, {field, operator, value}], maximum); },
    limit(value) { return query(name, filters, value); },
    async get() { return querySnapshot(this); },
  });
  function querySnapshot(value) {
    const matches = [...docs.entries()].filter(([path, data]) => path.startsWith(`${value.name}/`) && value.filters.every((filter) =>
      filter.operator === "==" && data[filter.field] === filter.value)).slice(0, value.maximum);
    return {empty: matches.length === 0, size: matches.length, docs: matches.map(([path, data]) => ({id: path.split("/")[1], data: () => data}))};
  }
  const firestore = {
    collection(name) {
      return {
        doc(id) {
          const resolvedId = id ?? `auto-${++sequence}`;
          return {id: resolvedId, path: `${name}/${resolvedId}`};
        },
        where(field, operator, value) { return query(name, [{field, operator, value}]); },
        limit(value) { return query(name, [], value); },
      };
    },
    async runTransaction(handler) {
      const writes = [];
      const transaction = {
        async get(target) { return target.query ? querySnapshot(target) : snapshot(target.path); },
        async getAll(...refs) { return refs.map((ref) => snapshot(ref.path)); },
        create(ref, data) { writes.push({method: "create", ref, data}); },
        update(ref, data) { writes.push({method: "update", ref, data}); },
        set(ref, data, options) { writes.push({method: "set", ref, data, options}); },
      };
      const result = await handler(transaction);
      for (const write of writes) {
        calls.push(write);
        docs.set(write.ref.path, {...(write.method === "set" && write.options?.merge ? docs.get(write.ref.path) : write.method === "update" ? docs.get(write.ref.path) : {}), ...write.data});
      }
      return result;
    },
  };
  const exports = {};
  vm.runInNewContext(readFileSync(require.resolve("../lib/sales/manageSettings.js"), "utf8"), {
    exports,
    require: (name) => {
      if (name === "../lib/firebaseAdmin.js") return {firestore};
      if (name === "../auth/roles.js") return require("../lib/auth/roles.js");
      if (name === "firebase-functions/v2/https") return {HttpsError, onCall: (_, handler) => handler};
      if (name === "firebase-admin/firestore") return {FieldValue: {serverTimestamp: () => "server-time"}};
      throw new Error(`Unexpected import ${name}`);
    },
  });
  const call = (data, auth = {uid: "settings-user", token: {roles: ["settings"]}}) => exports.manageSettings({auth, data});
  return {call, calls, docs};
}

test("settings role creates an inactive store with automatic ID and audit", async () => {
  const f = fixture();
  await assert.rejects(f.call({action: "store", create: true, name: "Loja B", address: "Rua B", contact: "11", active: false}, {uid: "inventory", token: {roles: ["inventory"]}}), {code: "permission-denied"});
  const result = await f.call({action: "store", create: true, name: "Loja B", address: "Rua B", contact: "11", active: false});
  assert.equal(result.id, "auto-1");
  assert.deepEqual(JSON.parse(JSON.stringify(f.docs.get("stores/auto-1"))), {name: "Loja B", address: "Rua B", contact: "11", active: false, createdAt: "server-time", updatedAt: "server-time"});
  const audit = [...f.docs.entries()].find(([path]) => path.startsWith("settingsAudit/"))[1];
  assert.equal(audit.action, "store");
  assert.equal(audit.changes.operation, "created");
});

test("only the master profile accesses settings", async () => {
  const f = fixture([
    ["stores/store-a", {name: "Loja A", active: true}],
    ["terminals/terminal-a", {name: "Caixa", storeId: "store-a", active: true}],
  ]);
  const master = await f.call({action: "list"}, {uid: "master-user", token: {roles: ["master"]}});
  await assert.rejects(f.call({action: "list"}, {uid: "admin-user", token: {roles: ["admin"]}}), {code: "permission-denied"});
  await assert.rejects(f.call({action: "list"}, {uid: "legacy-admin", token: {admin: true}}), {code: "permission-denied"});
  assert.equal(master.stores.length, 1);
  assert.equal(master.terminals.length, 1);
});

test("new stores cannot start active and active terminals block deactivation", async () => {
  const f = fixture([
    ["stores/store-a", {name: "Loja A", active: true}],
    ["terminals/terminal-a", {name: "Caixa", storeId: "store-a", active: true}],
  ]);
  await assert.rejects(f.call({action: "store", create: true, name: "Loja B", address: "", contact: "", active: true}), {code: "failed-precondition"});
  await assert.rejects(f.call({action: "store", create: false, id: "store-a", name: "Loja A", address: "", contact: "", active: false}), {code: "failed-precondition"});
  f.docs.get("terminals/terminal-a").active = false;
  await f.call({action: "store", create: false, id: "store-a", name: "Loja A", address: "", contact: "", active: false});
  assert.equal(f.docs.get("stores/store-a").active, false);
});

test("an active terminal must be disabled before moving to another store", async () => {
  const f = fixture([
    ["stores/store-a", {name: "Loja A", active: true}],
    ["stores/store-b", {name: "Loja B", active: true}],
    ["terminals/terminal-a", {name: "Caixa", storeId: "store-a", active: true}],
  ]);
  await assert.rejects(f.call({action: "terminal", create: false, id: "terminal-a", name: "Caixa", storeId: "store-b", active: false}), {code: "failed-precondition"});
  await f.call({action: "terminal", create: false, id: "terminal-a", name: "Caixa", storeId: "store-a", active: false});
  await f.call({action: "terminal", create: false, id: "terminal-a", name: "Caixa", storeId: "store-b", active: false});
  assert.equal(f.docs.get("terminals/terminal-a").storeId, "store-b");
});
