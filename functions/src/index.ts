/* eslint-disable max-len */
/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {setGlobalOptions} from "firebase-functions/v2";
// import {onRequest} from "firebase-functions/https";
// import * as logger from "firebase-functions/logger";

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({
  memory: "256MiB",
  cpu: "gcf_gen1",
  concurrency: 1,
  minInstances: 0,
  maxInstances: 3,
  enforceAppCheck: true,
});

// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
export {createSale} from "./sales/createSale.js";
export {getCheckoutProduct} from "./checkout/getCheckoutProduct.js";
export {createPixPayment} from "./payments/createPixPayment.js";
export {createCardPayment} from "./payments/createCardPayment.js";
export {getSalePaymentStatus} from "./payments/getSalePaymentStatus.js";
export {mercadoPagoWebhook} from "./payments/mercadoPagoWebhook.js";
export {manageInventory} from "./sales/manageInventory.js";
export {manageSettings} from "./sales/manageSettings.js";
export {releaseExpiredReservations} from "./sales/releaseExpiredReservations.js";
export {listAdminSales} from "./sales/listAdminSales.js";
export {listSettingsAudit} from "./sales/listSettingsAudit.js";
export {manageProducts} from "./catalog/manageProducts.js";
export {getAdminReport} from "./reports/getAdminReport.js";
export {managePayment} from "./payments/managePayment.js";
export {resolveSaleStock} from "./sales/resolveSaleStock.js";
export {reconcileSaleReservation} from "./sales/reconcileSaleReservation.js";
export {manageAdminUsers} from "./auth/manageAdminUsers.js";
