const { applicationDefault, initializeApp } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");

const terminalId = process.argv[2]?.trim();
if (!terminalId) {
  console.error("Uso: npm run provision-checkout -- ID_DO_TERMINAL");
  process.exitCode = 1;
} else {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.GCLOUD_PROJECT || "seolleda-dev",
  });
  const db = getFirestore();

  async function provision() {
    const stores = await db.collection("stores")
      .where("name", "==", "Loja Principal").limit(1).get();
    let storeReference = stores.docs[0]?.ref;
    if (!storeReference) {
      storeReference = db.collection("stores").doc("default-store");
      const existingStore = await storeReference.get();
      if (!existingStore.exists) {
        await storeReference.create({
          name: "Loja Principal",
          active: true,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        console.log("Loja Principal criada.");
      }
    }

    const terminalReference = db.collection("terminals").doc(terminalId);
    const terminal = await terminalReference.get();
    if (!terminal.exists) {
      await terminalReference.create({
        storeId: storeReference.id,
        active: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(`Terminal ${terminalId} criado.`);
    } else {
      const data = terminal.data();
      if (data.active !== true || data.storeId !== storeReference.id) {
        throw new Error(
          `O terminal ${terminalId} existe, mas não aponta para a Loja Principal ativa.`,
        );
      }
      console.log(`Terminal ${terminalId} validado.`);
    }

    const [products, inventory] = await Promise.all([
      db.collection("products").where("active", "==", true).limit(1).get(),
      db.collection("inventory")
        .where("storeId", "==", storeReference.id)
        .limit(1000)
        .get(),
    ]);
    const hasAvailableStock = inventory.docs.some((document) => {
      const quantity = document.data().quantity;
      return Number.isInteger(quantity) && quantity > 0;
    });
    console.log(`Produto ativo: ${products.empty ? "não" : "sim"}.`);
    console.log(`Estoque disponível: ${hasAvailableStock ? "sim" : "não"}.`);
  }

  provision().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
