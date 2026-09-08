const fs = require("node:fs");
const path = require("node:path");
const {test, before, after, beforeEach} = require("node:test");
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");
const {doc, getDoc, setDoc, deleteDoc} = require("firebase/firestore");

let environment;
const rules = fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8");

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "seolleda-rules-test",
    firestore: {rules},
  });
});

after(async () => environment.cleanup());
beforeEach(async () => environment.clearFirestore());

function db(uid, claims) {
  return environment.authenticatedContext(uid, claims).firestore();
}

async function seed(path, data) {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

test("catalog can read products but cannot write directly", async () => {
  await seed("products/product-a", {name: "Produto", active: true});
  const catalog = db("catalog-user", {roles: ["catalog"]});
  await assertSucceeds(getDoc(doc(catalog, "products/product-a")));
  await assertFails(setDoc(doc(catalog, "products/product-b"), {name: "Outro"}));
});

test("inventory role reads only assigned store inventory", async () => {
  await seed("inventory/store-a_product", {storeId: "store-a", productId: "product"});
  await seed("inventory/store-b_product", {storeId: "store-b", productId: "product"});
  const inventory = db("inventory-user", {roles: ["inventory"], storeIds: ["store-a"]});
  await assertSucceeds(getDoc(doc(inventory, "inventory/store-a_product")));
  await assertFails(getDoc(doc(inventory, "inventory/store-b_product")));
  await assertFails(deleteDoc(doc(inventory, "inventory/store-a_product")));
});

test("stock movement reads enforce store scope", async () => {
  await seed("stockMovements/store-a_move", {storeId: "store-a", productId: "product"});
  await seed("stockMovements/store-b_move", {storeId: "store-b", productId: "product"});
  const sales = db("sales-user", {roles: ["sales"], storeIds: ["store-a"]});
  await assertSucceeds(getDoc(doc(sales, "stockMovements/store-a_move")));
  await assertFails(getDoc(doc(sales, "stockMovements/store-b_move")));
  await assertFails(getDoc(doc(sales, "sales/sale-a")));
});

test("admin remains global but direct sales writes stay blocked", async () => {
  await seed("inventory/store-b_product", {storeId: "store-b", productId: "product"});
  const admin = db("admin-user", {admin: true});
  await assertSucceeds(getDoc(doc(admin, "inventory/store-b_product")));
  await assertFails(setDoc(doc(admin, "sales/sale-a"), {status: "PAID"}));
});

test("stock resolutions and return movements cannot be forged or deleted from clients", async () => {
  const admin = db("admin-user", {admin: true});
  await seed("saleStockResolutions/sale-a", {action: "RETURN_ALL", storeId: "store-a"});
  await assertFails(getDoc(doc(admin, "saleStockResolutions/sale-a")));
  await assertFails(setDoc(doc(admin, "saleStockResolutions/sale-b"), {action: "RETURN_ALL"}));
  await assertFails(setDoc(doc(admin, "saleStockResolutions/sale-a"), {action: "NO_RETURN"}));
  await assertFails(deleteDoc(doc(admin, "saleStockResolutions/sale-a")));
  await assertFails(setDoc(doc(admin, "stockMovements/return_sale-a_product"), {storeId: "store-a", type: "REFUND", quantity: 2}));
});
