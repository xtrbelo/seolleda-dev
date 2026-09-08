import { useEffect, useRef, useState } from "react";
import { createCardPayment } from "../../services/paymentService";
import { getSalePaymentStatus } from "../../services/saleService";

type CardPaymentProps = {
  saleId: string;
  statusToken: string;
  totalCents: number;
  customerEmail?: string;
  onPaymentApproved: () => void;
};

type CardBrickController = { unmount?: () => void };
type CardBricks = {
  create: (name: string, container: string, settings: Record<string, unknown>) =>
    Promise<CardBrickController>;
};
type MercadoPagoInstance = { bricks: () => CardBricks };
type MercadoPagoConstructor = new (key: string, options?: {locale: string}) => MercadoPagoInstance;

declare global {
  interface Window {
    MercadoPago?: MercadoPagoConstructor;
  }
}

const SDK_URL = "https://sdk.mercadopago.com/js/v2";

function loadSdk(): Promise<MercadoPagoConstructor> {
  if (window.MercadoPago) return Promise.resolve(window.MercadoPago);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_URL}"]`);
    const script = existing ?? document.createElement("script");
    const finish = () => window.MercadoPago ? resolve(window.MercadoPago) :
      reject(new Error("SDK do Mercado Pago indisponível."));
    script.addEventListener("load", finish, {once: true});
    script.addEventListener("error", () => reject(new Error("Não foi possível carregar o pagamento.")), {once: true});
    if (!existing) {
      script.src = SDK_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

function CardPayment({
  saleId,
  statusToken,
  totalCents,
  customerEmail = "",
  onPaymentApproved,
}: CardPaymentProps) {
  const [message, setMessage] = useState("Carregando pagamento seguro...");
  const [submitted, setSubmitted] = useState(false);
  const controllerRef = useRef<CardBrickController | null>(null);
  const approvedHandledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const publicKey = String(import.meta.env.VITE_MERCADO_PAGO_PUBLIC_KEY ?? "").trim();
    if (!publicKey) {
      // The key is injected at build time and may be unavailable in local previews.
      // eslint-disable-next-line react/set-state-in-effect
      setMessage("Cartão indisponível: chave pública do Mercado Pago não configurada.");
      return () => { cancelled = true; };
    }
    void (async () => {
      try {
        const MercadoPago = await loadSdk();
        if (cancelled) return;
        const mp = new MercadoPago(publicKey, {locale: "pt-BR"});
        controllerRef.current = await mp.bricks().create("cardPayment", "card-payment-brick", {
          initialization: {amount: totalCents / 100},
          customization: {paymentMethods: {minInstallments: 1, maxInstallments: 12}},
          callbacks: {
            onReady: () => setMessage("Informe os dados do cartão para continuar."),
            onError: () => setMessage("Não foi possível carregar o formulário. Tente novamente."),
            onSubmit: async (formData: unknown) => {
              const data = formData as Record<string, unknown>;
              const payer = data.payer as Record<string, unknown> | undefined;
              const token = typeof data.token === "string" ? data.token : "";
              const paymentMethodId = typeof data.payment_method_id === "string" ?
                data.payment_method_id : "";
              const installments = Number(data.installments);
              const issuerId = data.issuer_id === undefined || data.issuer_id === null ?
                undefined : Number(data.issuer_id);
              const payerEmail = typeof payer?.email === "string" ? payer.email : customerEmail;
              setSubmitted(true);
              setMessage("Processando pagamento...");
              try {
                const result = await createCardPayment({
                  saleId, token, paymentMethodId, installments, issuerId, payerEmail,
                });
                if (["rejected", "cancelled", "refunded"].includes(result.status)) {
                  throw new Error("O cartão foi recusado. Inicie uma nova compra para tentar novamente.");
                }
              } catch (error) {
                setSubmitted(false);
                setMessage(error instanceof Error ? error.message : "Não foi possível processar o cartão.");
                throw error;
              }
              setMessage("Pagamento enviado. Aguardando confirmação...");
            },
          },
        });
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Pagamento indisponível.");
      }
    })();
    return () => {
      cancelled = true;
      controllerRef.current?.unmount?.();
      controllerRef.current = null;
    };
  }, [customerEmail, saleId, totalCents]);

  useEffect(() => {
    if (!submitted) return;
    let stopped = false;
    let checking = false;
    const checkStatus = async () => {
      if (stopped || checking) return;
      checking = true;
      try {
        const state = await getSalePaymentStatus(saleId, statusToken);
        if (state === "APPROVED") {
          setMessage("Pagamento aprovado. Obrigado!");
          if (!approvedHandledRef.current) {
            approvedHandledRef.current = true;
            window.setTimeout(onPaymentApproved, 3500);
          }
          return;
        }
        if (state === "REVIEW_REQUIRED") {
          setMessage("Pagamento recebido e enviado para revisão da loja.");
          return;
        }
        if (state === "EXPIRED") {
          setMessage("O prazo da venda terminou. Inicie uma nova compra.");
          return;
        }
      } catch {
        // A confirmação pode atrasar; manter a mensagem e tentar novamente.
      } finally {
        checking = false;
      }
      if (!stopped) window.setTimeout(checkStatus, 2000);
    };
    void checkStatus();
    return () => { stopped = true; };
  }, [onPaymentApproved, saleId, statusToken, submitted]);

  return (
    <div className="card-payment-flow">
      <p role="status">{message}</p>
      <div id="card-payment-brick" aria-label="Pagamento com cartão" />
    </div>
  );
}

export default CardPayment;
