const {test} = require("node:test");
const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const vm = require("node:vm");
const {HttpsError} = require("firebase-functions/v2/https");

function user(uid, values = {}) {
  return {
    uid,
    email: `${uid}@example.com`,
    displayName: `User ${uid}`,
    disabled: false,
    emailVerified: false,
    customClaims: {},
    metadata: {creationTime: "2026-09-10T10:00:00.000Z", lastSignInTime: "2026-09-10T11:00:00.000Z"},
    ...values,
  };
}

function fixture(overrides = {}) {
  const records = new Map([
    ["admin1", user("admin1", {customClaims: {roles: ["admin"]}})],
    ["admin2", user("admin2", {customClaims: {admin: true, externalClaim: "preserved"}})],
  ]);
  const calls = [];
  const adminAuth = {
    listUsers: async (limit, pageToken) => {
      calls.push({method: "listUsers", limit, pageToken});
      return {users: [...records.values()], pageToken: "next"};
    },
    createUser: async (properties) => {
      calls.push({method: "createUser", properties});
      const created = user("created", {email: properties.email, displayName: properties.displayName});
      records.set(created.uid, created);
      return created;
    },
    deleteUser: async (uid) => { calls.push({method: "deleteUser", uid}); records.delete(uid); },
    getUser: async (uid) => {
      calls.push({method: "getUser", uid});
      const record = records.get(uid);
      if (!record) throw Object.assign(new Error("missing"), {code: "auth/user-not-found"});
      return record;
    },
    setCustomUserClaims: async (uid, claims) => {
      calls.push({method: "setCustomUserClaims", uid, claims});
      records.get(uid).customClaims = claims;
    },
    updateUser: async (uid, properties) => {
      calls.push({method: "updateUser", uid, properties});
      Object.assign(records.get(uid), properties);
      return records.get(uid);
    },
    revokeRefreshTokens: async (uid) => { calls.push({method: "revokeRefreshTokens", uid}); },
    ...overrides,
  };
  const exports = {};
  vm.runInNewContext(readFileSync(require.resolve("../lib/auth/manageAdminUsers.js"), "utf8"), {
    exports,
    console: {info: () => undefined},
    require: (name) => {
      if (name === "../lib/firebaseAdmin.js") return {adminAuth};
      if (name === "./roles.js") return require("../lib/auth/roles.js");
      if (name === "firebase-functions/v2/https") return {HttpsError, onCall: (_, handler) => handler};
      throw new Error(`Unexpected import ${name}`);
    },
  });
  const call = (data, auth = {uid: "admin1", token: {roles: ["admin"]}}) => exports.manageAdminUsers({auth, data});
  return {adminAuth, calls, records, call};
}

test("user management requires administrator and lists at most one hundred accounts", async () => {
  const f = fixture();
  await assert.rejects(f.call({action: "list"}, {uid: "settings1", token: {roles: ["settings"]}}), {code: "permission-denied"});
  const result = await f.call({action: "list", pageToken: "page-2"});
  assert.deepEqual(f.calls.find((entry) => entry.method === "listUsers"), {method: "listUsers", limit: 100, pageToken: "page-2"});
  assert.equal(result.nextPageToken, "next");
  assert.deepEqual(JSON.parse(JSON.stringify(result.users[0].roles)), ["admin"]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.users[0].storeIds)), []);
  f.records.get("admin1").customClaims = {roles: ["settings"]};
  await assert.rejects(f.call({action: "list"}), {code: "permission-denied"});
});

test("creating an account never sends or stores a password and requires scoped stores", async () => {
  const f = fixture();
  await assert.rejects(f.call({action: "create", email: "stock@example.com", displayName: "Stock User", roles: ["inventory"], storeIds: []}), {code: "invalid-argument"});
  const result = await f.call({action: "create", email: "STOCK@example.com", displayName: "Stock User", roles: ["inventory", "catalog"], storeIds: ["store1"]});
  const creation = f.calls.find((entry) => entry.method === "createUser");
  assert.deepEqual(JSON.parse(JSON.stringify(creation.properties)), {email: "stock@example.com", displayName: "Stock User", disabled: false});
  assert.equal("password" in creation.properties, false);
  const claims = f.calls.find((entry) => entry.method === "setCustomUserClaims");
  assert.deepEqual(JSON.parse(JSON.stringify(claims.claims)), {roles: ["inventory", "catalog"], storeIds: ["store1"]});
  assert.equal(result.user.uid, "created");
});

test("updates preserve unrelated claims, remove legacy admin and revoke refresh tokens", async () => {
  const f = fixture();
  await assert.rejects(f.call({action: "update", uid: "admin1", displayName: "Self", roles: ["admin"], storeIds: [], disabled: false}), {code: "failed-precondition"});
  const result = await f.call({action: "update", uid: "admin2", displayName: "Sales User", roles: ["sales"], storeIds: ["store1"], disabled: true});
  const claims = f.calls.find((entry) => entry.method === "setCustomUserClaims");
  assert.deepEqual(JSON.parse(JSON.stringify(claims.claims)), {externalClaim: "preserved", roles: ["sales"], storeIds: ["store1"]});
  assert.equal(f.calls.some((entry) => entry.method === "revokeRefreshTokens" && entry.uid === "admin2"), true);
  assert.equal(result.user.disabled, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result.user.roles)), ["sales"]);
});

test("failed claim initialization removes the newly created account", async () => {
  let deleted = "";
  const f = fixture({
    setCustomUserClaims: async () => { throw new Error("claim failure"); },
    deleteUser: async (uid) => { deleted = uid; },
  });
  await assert.rejects(f.call({action: "create", email: "new@example.com", displayName: "New User", roles: ["catalog"], storeIds: []}), {code: "unavailable"});
  assert.equal(deleted, "created");
});
