const { applicationDefault, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const terminalId = process.argv[2]?.trim();
if (!terminalId) {
  console.error("Uso: npm run smoke-test -- ID_DO_TERMINAL");
  process.exitCode = 1;
} else {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.GCLOUD_PROJECT || "seolleda-dev",
  });

  async function smokeTest() {
    const db = getFirestore();
    const terminal = await db.collection("terminals").doc(terminalId).get();
    const storeId = terminal.data()?.storeId;
    if (!terminal.exists || terminal.data()?.active !== true || !storeId) {
      throw new Error("Terminal configurado não está ativo.");
    }

    const inventory = await db.collection("inventory")
      .where("storeId", "==", storeId).limit(1000).get();
    const stockedProductIds = inventory.docs
      .filter((document) => document.data().quantity > 0)
      .map((document) => document.data().productId);
    let barcode = "";
    for (const productId of stockedProductIds) {
      const product = await db.collection("products").doc(productId).get();
      const data = product.data();
      if (product.exists && data?.active === true && typeof data.barcode === "string") {
        barcode = data.barcode;
        break;
      }
    }
    if (!barcode) throw new Error("Nenhum produto ativo com estoque para o teste.");

    const [home, adminRoute, lookup] = await Promise.all([
      fetch("https://seolleda-dev.web.app/"),
      fetch("https://seolleda-dev.web.app/admin/login"),
      fetch(
        "https://southamerica-east1-seolleda-dev.cloudfunctions.net/getCheckoutProduct",
        {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({data: {terminalId, barcode}}),
        },
      ),
    ]);
    if (!home.ok || !adminRoute.ok || !lookup.ok) {
      throw new Error(
        `Smoke test falhou: home=${home.status}, admin=${adminRoute.status}, lookup=${lookup.status}`,
      );
    }
    const lookupBody = await lookup.json();
    if (!lookupBody.result?.id || lookupBody.result.availableStock <= 0) {
      throw new Error("A Function respondeu sem um produto disponível válido.");
    }
    console.log("Hosting, rota SPA e consulta de produto: OK.");
  }

  smokeTest().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
