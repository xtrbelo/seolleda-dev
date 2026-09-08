/* eslint-disable max-len */
import * as crypto from "crypto";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {defineSecret} from "firebase-functions/params";
import {onRequest, Request} from "firebase-functions/v2/https";
import {firestore} from "../lib/firebaseAdmin.js";
import {getMpPayment} from "./mercadoPagoClient.js";
import {reconcileTerminalPayment} from "./reconcilePayment.js";
import {saleDeadline} from "./pixPolicy.js";
import type {SaleItemSnapshot} from "../types/sale.js";

const MP_ACCESS_TOKEN = defineSecret("MERCADO_PAGO_ACCESS_TOKEN");
const MP_WEBHOOK_SECRET = defineSecret("MP_WEBHOOK_SECRET");

/**
 * Valida a assinatura do webhook do Mercado Pago (x-signature).
 * @param {Request} req Requisição.
 * @param {string} secret Segredo do webhook.
 * @param {string} dataId ID do evento (data.id).
 * @return {boolean} True se a assinatura for válida.
 */
function validateSignature(
  req: Request,
  secret: string,
  dataId: string,
): boolean {
  const xSignature = req.headers["x-signature"];
  const xRequestId = req.headers["x-request-id"];

  if (typeof xSignature !== "string" || typeof xRequestId !== "string") {
    return false;
  }

  // x-signature format: "ts=1690000000,v1=abc123hash..."
  const parts = xSignature.split(",");
  let ts = "";
  let v1 = "";

  for (const part of parts) {
    const [key, value] = part.trim().split("=");
    if (key === "ts") ts = value;
    if (key === "v1") v1 = value;
  }

  if (!/^\d+$/.test(ts) || !/^[a-fA-F0-9]{64}$/.test(v1)) return false;

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const computedHash = crypto
    .createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(computedHash, "hex"), Buffer.from(v1, "hex"),
  );
}

export const mercadoPagoWebhook = onRequest(
  {
    region: "southamerica-east1",
    secrets: [MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET],
  },
  async (req, res) => {
    try {
      if (req.method !== "POST") {
        res.status(405).send("Method not allowed");
        return;
      }
      const body = req.body || {};
      const queryId = req.query["data.id"] as string | undefined;
      const bodyId = body.data?.id as string | undefined;
      const dataId = typeof queryId === "string" ? queryId : "";

      if (!/^\d+$/.test(dataId) ||
          (bodyId !== undefined && String(bodyId) !== dataId)) {
        res.status(400).send("Missing data.id");
        return;
      }

      // 1. Validação de Assinatura
      const secret = MP_WEBHOOK_SECRET.value();
      const isValid = validateSignature(req, secret, dataId);

      if (!isValid) {
        console.error("mercadoPagoWebhook: Invalid signature");
        res.status(401).send("Unauthorized");
        return;
      }

      // 2. Filtrar eventos
      const type = (req.query.type as string) || body.type;
      if (type !== "payment") {
        res.status(200).send("Ignored event type");
        return;
      }

      const paymentId = dataId;

      // 3. Consultar Payment no Mercado Pago
      const accessToken = MP_ACCESS_TOKEN.value();
      const payment = await getMpPayment(paymentId, accessToken);
      const saleId = payment.externalReference;

      if (!saleId || saleId.includes("/") || saleId.length > 128) {
        console.error(
          "mercadoPagoWebhook: Missing external_reference",
          {paymentId},
        );
        res.status(200).send("Missing external_reference");
        return;
      }

      if (await reconcileTerminalPayment(saleId, payment)) {
        res.status(200).send("OK");
        return;
      }

      // 4. Iniciar Transação do Firestore
      await firestore.runTransaction(async (transaction) => {
        const saleRef = firestore.collection("sales").doc(saleId);
        const saleSnap = await transaction.get(saleRef);

        if (!saleSnap.exists) {
          console.error(
            "mercadoPagoWebhook: Sale not found",
            {saleId, paymentId},
          );
          return;
        }

        const sale = saleSnap.data()!;

        // Validações de segurança e consistência
        const attemptKey = sale.paymentMethod === "CARD" ?
          sale.cardIdempotencyKey : sale.pixIdempotencyKey;
        if (!sale.mercadoPagoPaymentId &&
            (!attemptKey || payment.attemptId !== attemptKey)) {
          // Only bind an early notification to the persisted immutable attempt.
          throw new Error("PAYMENT_LINK_PENDING");
        }
        if (sale.mercadoPagoPaymentId &&
            String(sale.mercadoPagoPaymentId) !== paymentId) {
          console.error(
            "mercadoPagoWebhook: Payment ID mismatch",
            {saleId, paymentId},
          );
          return;
        }

        const paymentTotalCents = payment.totalCents;
        if (paymentTotalCents !== sale.totalCents) {
          console.error(
            "mercadoPagoWebhook: Amount mismatch",
            {
              saleId,
              paymentId,
              paymentTotalCents,
              saleTotalCents: sale.totalCents,
            },
          );
          return;
        }

        const methodMatches = sale.paymentMethod === "PIX" ?
          payment.paymentMethod === "pix" : sale.paymentMethod === "CARD" ?
            payment.paymentMethod !== "pix" &&
            payment.paymentType === "credit_card" : false;
        if (!methodMatches || sale.paymentProvider !== "MERCADO_PAGO" ||
            payment.currency !== "BRL") {
          console.error(
            "mercadoPagoWebhook: Payment method mismatch",
            {saleId, paymentId},
          );
          return;
        }

        // Idempotência
        if (["PAID", "CANCELLED", "REFUNDED", "CHARGED_BACK"].includes(sale.status) || sale.paymentReconciliationRequired) {
          console.info(
            "mercadoPagoWebhook: Already paid (idempotency)",
            {saleId, paymentId},
          );
          return;
        }

        const isApproved = payment.status === "approved" &&
          payment.statusDetail === "accredited";

        if (!isApproved) {
          // Atualiza apenas os campos informativos sem dar baixa no estoque
          transaction.update(saleRef, {
            mercadoPagoPaymentId: paymentId,
            mercadoPagoPaymentStatus: payment.status,
            mercadoPagoPaymentStatusDetail: payment.statusDetail,
            updatedAt: FieldValue.serverTimestamp(),
          });
          console.info(
            "mercadoPagoWebhook: Payment not approved yet",
            {saleId, paymentId, status: payment.status},
          );
          return;
        }

        // Use approval time, not webhook delivery time: delayed delivery
        // must not invalidate a payment approved within the internal deadline.
        const approvedAtMs = payment.approvedAtMs;
        const deadline = saleDeadline(sale);
        if (approvedAtMs === null || approvedAtMs >= deadline ||
            sale.status !== "PENDING_PAYMENT") {
          transaction.update(saleRef, {
            mercadoPagoPaymentId: paymentId,
            status: "PAYMENT_REVIEW_REQUIRED",
            paymentStatus: "APPROVED",
            paymentReconciliationRequired: true,
            paymentReviewReason: approvedAtMs === null ?
              "MISSING_APPROVAL_DATE" : approvedAtMs >= deadline ?
                "APPROVED_AFTER_EXPIRATION" : "SALE_NOT_PENDING",
            mercadoPagoPaymentStatus: payment.status,
            mercadoPagoPaymentStatusDetail: payment.statusDetail,
            updatedAt: FieldValue.serverTimestamp(),
          });
          return;
        }

        // 5. Baixar Estoque
        const storeId = sale.storeId;
        const items = sale.items as SaleItemSnapshot[];
        if (typeof storeId !== "string" || !storeId || storeId.includes("/") ||
            !Array.isArray(items) || items.length === 0 ||
            items.some((item) => !item || typeof item.productId !== "string" ||
              !item.productId || item.productId.includes("/") ||
              !Number.isSafeInteger(item.quantity) || item.quantity <= 0) ||
            new Set(items.map((item) => item.productId)).size !==
              items.length) {
          throw new Error("INVALID_SALE_ITEMS");
        }
        let stockReconciliationRequired = false;

        const inventoryRefs = items.map((item) =>
          firestore.collection("inventory").doc(`${storeId}_${item.productId}`),
        );

        const inventorySnaps = await transaction.getAll(...inventoryRefs);

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const invSnap = inventorySnaps[i];
          const invRef = inventoryRefs[i];

          const currentQuantity =
            invSnap.exists ? Number(invSnap.get("quantity")) || 0 : 0;
          const reservedQuantity = invSnap.exists ? Number(invSnap.get("reservedQuantity") ?? 0) || 0 : 0;
          const newQuantity = currentQuantity - item.quantity;
          const reservationMissing = reservedQuantity < item.quantity;

          if (newQuantity < 0 || reservationMissing) {
            stockReconciliationRequired = true;
          }

          if (invSnap.exists) {
            transaction.update(invRef, {
              quantity: newQuantity,
              reservedQuantity: Math.max(0, reservedQuantity - item.quantity),
              updatedAt: FieldValue.serverTimestamp(),
            });
          } else {
            transaction.set(invRef, {
              storeId,
              productId: item.productId,
              quantity: newQuantity,
              reservedQuantity: 0,
              minimumQuantity: 0,
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
          }

          // Registrar Stock Movement
          const movementRef = firestore.collection("stockMovements")
            .doc(`sale_${saleId}_${item.productId}`);
          transaction.set(movementRef, {
            storeId,
            productId: item.productId,
            productName: item.name,
            productSku: item.sku,
            productBarcode: item.barcode,
            type: "SALE",
            quantity: item.quantity,
            previousQuantity: currentQuantity,
            newQuantity,
            reason: `Venda ${saleId}`,
            userId: "SYSTEM",
            userEmail: "mercadopago-webhook",
            createdAt: FieldValue.serverTimestamp(),
          });
        }

        // 6. Atualizar a Venda
        transaction.update(saleRef, {
          mercadoPagoPaymentId: paymentId,
          status: "PAID",
          paymentStatus: "APPROVED",
          reservationStatus: "CONSUMED",
          paidAt: Timestamp.fromMillis(approvedAtMs),
          mercadoPagoPaymentStatus: payment.status,
          mercadoPagoPaymentStatusDetail: payment.statusDetail,
          updatedAt: FieldValue.serverTimestamp(),
          ...(stockReconciliationRequired ?
            {stockReconciliationRequired: true} :
            {}),
        });

        console.info(
          "mercadoPagoWebhook: Payment approved and processed",
          {saleId, paymentId, stockReconciliationRequired},
        );
      });

      res.status(200).send("OK");
    } catch {
      console.error("mercadoPagoWebhook: operation failed");
      res.status(500).send("Internal Server Error");
    }
  },
);
