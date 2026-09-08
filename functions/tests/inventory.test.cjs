const {test} = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const {HttpsError} = require("firebase-functions/v2/https");
function fixture() {
  const docs = new Map([["stores/s", {active:true}], ["products/p", {name:"Produto",sku:"sku",barcode:"123"}], ["inventory/s_p", {quantity:5,minimumQuantity:1}]]);
  const firestore = {collection: name => ({doc: id => ({path:`${name}/${id}`})}), runTransaction: async fn => {
    const writes=[];
    const result = await fn({getAll: async (...refs) => refs.map(ref => ({exists:docs.has(ref.path),data:()=>docs.get(ref.path)})), set:(ref,data,opts)=>writes.push([ref.path,data,opts])});
    for(const [path,data,opts] of writes) docs.set(path,{...(opts?.merge ? docs.get(path):{}),...data});
    return result;
  }};
  const exports={};
  const roles = {requireRole: (request, role) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Faça login para continuar.");
    const claims = request.auth.token || {};
    if (claims.admin !== true && !(Array.isArray(claims.roles) && (claims.roles.includes(role) || claims.roles.includes("admin")))) {
      throw new HttpsError("permission-denied", "Você não tem permissão para esta operação.");
    }
  }, requireStoreAccess: (request, storeId) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Faça login para continuar.");
    const claims = request.auth.token || {};
    if (claims.admin === true || (Array.isArray(claims.roles) && claims.roles.includes("admin"))) return;
    if (!Array.isArray(claims.storeIds) || !claims.storeIds.includes(storeId)) {
      throw new HttpsError("permission-denied", "Você não tem acesso a esta loja.");
    }
  }};
  vm.runInNewContext(fs.readFileSync(require.resolve("../lib/sales/manageInventory.js"),"utf8"),{exports,require: name => name.includes("firebaseAdmin") ? {firestore} : name.includes("/auth/roles.js") ? roles : name === "firebase-functions/v2/https" ? {onCall:(_,fn)=>fn,HttpsError} : {FieldValue:{serverTimestamp:()=>0}}});
  const call = (data={}, auth={uid:"admin",token:{email:"admin@example.com",roles:["admin"]}})=>exports.manageInventory({auth,data:{storeId:"s",productId:"p",operationId:"op",type:"EXIT",quantity:2,reason:"Teste",...data}});
  return {docs,call};
}
test("requires authentication",async()=>{const f=fixture();await assert.rejects(f.call({},null),{code:"unauthenticated"});assert.equal(f.docs.get("inventory/s_p").quantity,5);});
test("atomic movement and idempotent replay",async()=>{const f=fixture();await f.call();await f.call();assert.equal(f.docs.get("inventory/s_p").quantity,3);assert.equal(f.docs.get("stockMovements/op").userId,"admin");await assert.rejects(f.call({quantity:1}),{code:"already-exists"});});
test("rejects overselling and forged sale movement",async()=>{const f=fixture();await assert.rejects(f.call({quantity:6}),{message:"INSUFFICIENT_STOCK"});await assert.rejects(f.call({type:"SALE"}),{code:"invalid-argument"});assert.equal(f.docs.size,3);});
test("minimum preserves quantity without movement",async()=>{const f=fixture();await f.call({type:"MINIMUM",quantity:9});assert.equal(f.docs.get("inventory/s_p").quantity,5);assert.equal(f.docs.get("inventory/s_p").minimumQuantity,9);assert.equal(f.docs.has("stockMovements/op"),false);});
test("adjustment to zero and invalid quantities",async()=>{const f=fixture();await assert.rejects(f.call({quantity:1.5}),{code:"invalid-argument"});await f.call({type:"ADJUSTMENT",quantity:0});assert.equal(f.docs.get("inventory/s_p").quantity,0);});
test("reserved units cannot be consumed by manual movement",async()=>{const f=fixture();f.docs.get("inventory/s_p").reservedQuantity=3;await assert.rejects(f.call({quantity:3}),{message:"INSUFFICIENT_STOCK"});await assert.rejects(f.call({type:"ADJUSTMENT",quantity:2}),{message:"RESERVED_STOCK"});});
