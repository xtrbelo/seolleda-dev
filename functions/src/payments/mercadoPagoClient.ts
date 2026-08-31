/**
 * Cliente para a Orders API do Mercado Pago.
 *
 * Responsabilidades:
 *   - Montar e enviar a requisição de criação de Order PIX
 *   - Extrair apenas os campos necessários da resposta
 *   - Nunca logar nem retornar o Access Token
 *
 * Referência: https://www.mercadopago.com.br/developers/pt/reference/orders/online/create/post
 */

// ---------------------------------------------------------------------------
// ⚠️  MODO DE TESTE — AMBIENTE DE DESENVOLVIMENTO
//
// Quando true, inclui `payer.first_name = "APRO"` no body, o que faz o
// Mercado Pago simular aprovação automática em credenciais de teste.
//
// TODO: definir como `false` antes do deploy em produção.
//       Não remova este comentário — ele documenta o comportamento intencional.
// ---------------------------------------------------------------------------
const SEOLLEDA_MP_TEST_MODE = true;

const MP_ORDERS_URL = "https://api.mercadopago.com/v1/orders";

/**
 * Converte centavos (inteiro) para string decimal de 2 casas.
 * @param {number} cents Valor em centavos.
 * @return {string} Valor como string decimal ex: "11.00".
 */
function centsToDecimalString(cents: number): string {
  return (cents / 100).toFixed(2);
}

export type MpPixOrderParams = {
  saleId: string;
  totalCents: number;
  payerEmail: string;
  accessToken: string;
};

export type MpPixOrderResult = {
  orderId: string;
  orderStatus: string;
  orderStatusDetail: string;
  paymentId: string;
  paymentStatus: string;
  paymentStatusDetail: string;
  qrCode: string;
  /** Pode estar vazio em ambiente de teste do Mercado Pago. */
  qrCodeBase64: string;
  ticketUrl: string;
};

/**
 * Cria uma Order Pix no Mercado Pago via Orders API.
 *
 * A X-Idempotency-Key é derivada do saleId para garantir estabilidade:
 * a mesma venda sempre gerará a mesma chave, evitando cobranças duplicadas
 * em caso de retry sem idempotência local ter sido satisfeita.
 * @param {MpPixOrderParams} params Parâmetros da cobrança PIX.
 * @return {Promise<MpPixOrderResult>} Dados extraídos da Order criada.
 */
export async function createMpPixOrder(
  params: MpPixOrderParams,
): Promise<MpPixOrderResult> {
  const {saleId, totalCents, payerEmail, accessToken} = params;
  const amountString = centsToDecimalString(totalCents);

  // Chave de idempotência estável por saleId (não muda a cada chamada).
  const idempotencyKey = `pix-${saleId}`;

  const payer: Record<string, string> = {email: payerEmail};

  if (SEOLLEDA_MP_TEST_MODE) {
    // ⚠️  DEV ONLY: "APRO" instrui o MP a aprovar automaticamente em testes.
    // Remova ou condicione em produção.
    payer.first_name = "APRO";
  }

  const body = {
    type: "online",
    processing_mode: "automatic",
    external_reference: saleId,
    total_amount: amountString,
    payer,
    transactions: {
      payments: [
        {
          amount: amountString,
          payment_method: {
            id: "pix",
            type: "bank_transfer",
          },
        },
      ],
    },
    expiration_time: "PT30M",
  };

  const response = await fetch(MP_ORDERS_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    // Loga apenas informações não sensíveis para diagnóstico.
    let errorCode: string | undefined;
    try {
      const errorBody = (await response.json()) as Record<string, unknown>;
      errorCode =
        typeof errorBody?.error === "string" ? errorBody.error : undefined;
    } catch {
      // ignora erro ao parsear body de erro
    }
    console.error("Mercado Pago Orders API error", {
      saleId,
      httpStatus: response.status,
      errorCode,
    });
    throw new Error(`MP_API_ERROR:${response.status}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const order = (await response.json()) as any;

  // Extrai apenas os campos necessários — nunca retorna o objeto completo.
  const payment = order?.transactions?.payments?.[0];
  const paymentMethod = payment?.payment_method ?? {};

  return {
    orderId: String(order?.id ?? ""),
    orderStatus: String(order?.status ?? ""),
    orderStatusDetail: String(order?.status_detail ?? ""),
    paymentId: String(payment?.id ?? ""),
    paymentStatus: String(payment?.status ?? ""),
    paymentStatusDetail: String(payment?.status_detail ?? ""),
    qrCode: String(paymentMethod?.qr_code ?? ""),
    qrCodeBase64: String(paymentMethod?.qr_code_base64 ?? ""),
    ticketUrl: String(paymentMethod?.ticket_url ?? ""),
  };
}
