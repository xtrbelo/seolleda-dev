/** Payments API only. Never log provider responses or credentials. */
const MP_PAYMENTS_URL = "https://api.mercadopago.com/v1/payments";

/** @param {Response} response Failed provider response.
 * @return {Promise<void>} Logs only allowlisted categories and numeric codes.
 */
async function reportHttpError(response: Response): Promise<void> {
  const body = record(await response.json().catch(() => null));
  const categories = [
    "bad_request", "unauthorized", "forbidden", "not_found",
    "invalid_token", "invalid_access_token", "invalid_credentials",
    "internal_error", "internal_server_error", "too_many_requests",
  ];
  const category = typeof body.error === "string" &&
    categories.includes(body.error) ? body.error : "unclassified";
  const causes = Array.isArray(body.cause) ? body.cause : [];
  const causeCodes = causes.map((cause) => record(cause).code)
    .filter((code) => (typeof code === "number" || typeof code === "string") &&
      /^\d{1,10}$/.test(String(code)))
    .slice(0, 10).map(String);
  console.error("Mercado Pago request rejected", {
    httpStatus: response.status, category, causeCodes,
  });
}

export type MpPayment = {
  paymentId: string;
  status: string;
  statusDetail: string;
  externalReference: string;
  totalCents: number;
  currency: string;
  paymentMethod: string;
  attemptId: string;
  approvedAtMs: number | null;
  expiresAtMs: number | null;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string;
};

/** @param {unknown} value Untrusted JSON.
 * @return {object} Object safe to inspect.
 */
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ?
    value as Record<string, unknown> : {};
}

/** @param {unknown} value Provider date.
 * @return {number|null} Parsed date, when valid.
 */
function dateMs(value: unknown): number | null {
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/** @param {unknown} data Provider response.
 * @return {MpPayment} Validated payment.
 */
function parsePayment(data: unknown): MpPayment {
  const payment = record(data);
  const id = String(payment.id ?? "");
  if (!/^\d+$/.test(id) || typeof payment.status !== "string" ||
      !payment.status || typeof payment.transaction_amount !== "number" ||
      !Number.isFinite(payment.transaction_amount) ||
      payment.transaction_amount <= 0) {
    throw new Error("MP_INVALID_RESPONSE");
  }
  const totalCents = Math.round(payment.transaction_amount * 100);
  if (!Number.isSafeInteger(totalCents)) throw new Error("MP_INVALID_AMOUNT");
  const qr = record(record(payment.point_of_interaction).transaction_data);
  return {
    paymentId: id,
    status: payment.status,
    statusDetail: String(payment.status_detail ?? ""),
    externalReference: String(payment.external_reference ?? ""),
    totalCents,
    currency: String(payment.currency_id ?? ""),
    paymentMethod: String(payment.payment_method_id ?? ""),
    attemptId: String(record(payment.metadata).seolleda_pix_attempt ?? ""),
    approvedAtMs: dateMs(payment.date_approved),
    expiresAtMs: dateMs(payment.date_of_expiration),
    qrCode: typeof qr.qr_code === "string" ? qr.qr_code : "",
    qrCodeBase64: typeof qr.qr_code_base64 === "string" ?
      qr.qr_code_base64 : "",
    ticketUrl: typeof qr.ticket_url === "string" ? qr.ticket_url : "",
  };
}

/** @param {string} paymentId Payment identifier.
 * @param {string} accessToken Server secret.
 * @return {Promise<MpPayment>} Current provider payment.
 */
export async function getMpPayment(
  paymentId: string, accessToken: string,
): Promise<MpPayment> {
  if (!/^\d+$/.test(paymentId)) {
    throw new Error("MP_INVALID_ID");
  }
  const response = await fetch(`${MP_PAYMENTS_URL}/${paymentId}`, {
    headers: {Authorization: `Bearer ${accessToken}`},
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    await reportHttpError(response);
    throw new Error(`MP_HTTP_${response.status}`);
  }
  const payment = parsePayment(await response.json());
  if (payment.paymentId !== paymentId) throw new Error("MP_ID_MISMATCH");
  return payment;
}

/** @param {object} params Immutable request persisted before calling MP.
 * @return {Promise<MpPayment>} Created or idempotently recovered payment.
 */
export async function createMpPixPayment(params: {
  saleId: string;
  totalCents: number;
  payerEmail: string;
  accessToken: string;
  idempotencyKey: string;
}): Promise<MpPayment> {
  const response = await fetch(MP_PAYMENTS_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": params.idempotencyKey,
    },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      transaction_amount: params.totalCents / 100,
      payment_method_id: "pix",
      external_reference: params.saleId,
      metadata: {seolleda_pix_attempt: params.idempotencyKey},
      payer: {email: params.payerEmail},
    }),
  });
  if (!response.ok) {
    await reportHttpError(response);
    throw new Error(`MP_HTTP_${response.status}`);
  }
  const payment = parsePayment(await response.json());
  if (payment.externalReference !== params.saleId ||
      payment.totalCents !== params.totalCents ||
      payment.currency !== "BRL" || payment.paymentMethod !== "pix") {
    throw new Error("MP_PAYMENT_MISMATCH");
  }
  return payment;
}
