import { useEffect, useRef, useState } from "react";
import { createPixPayment } from "../../services/paymentService";
import type { CreatePixPaymentResponse } from "../../services/paymentService";
import { getSalePaymentStatus } from "../../services/saleService";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type PixStep = "loading" | "qrcode" | "approved" | "review" | "error";

type PixPaymentProps = {
  saleId: string;
  statusToken: string;
  totalCents: number;
  customerEmail?: string;
  onPaymentApproved: () => void;
};

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

function formatCountdown(expiresAtMs: number): string {
  const remaining = Math.max(0, expiresAtMs - Date.now());
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

/**
 * PixPayment
 *
 * Encapsula o fluxo completo de pagamento Pix:
 *   1. Reutiliza o e-mail informado no início → chama createPixPayment
 *   2. Exibe QR Code, Pix Copia e Cola e link de instruções
 *
 * Responsabilidades deste componente:
 *   - Enviar apenas { saleId, payerEmail } ao backend
 *   - Nunca enviar valor, preço ou dados de produto
 *   - Desabilitar o botão durante o carregamento (anti-clique-duplo)
 */
function PixPayment({
  saleId,
  statusToken,
  totalCents,
  customerEmail = "",
  onPaymentApproved,
}: PixPaymentProps) {
  const [step, setStep] = useState<PixStep>("loading");
  const [pixData, setPixData] = useState<CreatePixPaymentResponse | null>(null);
  const [copyLabel, setCopyLabel] = useState("Copiar código Pix");
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [countdown, setCountdown] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const mountedRef = useRef(false);
  const generatingRef = useRef(false);
  const startedRef = useRef(false);
  const approvalHandledRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  useEffect(() => {
    if (step !== "qrcode" || !pixData || !statusToken) return;

    let stopped = false;
    let checking = false;
    let nextCheck: ReturnType<typeof setTimeout> | null = null;

    const checkStatus = async () => {
      if (stopped || checking) return;
      checking = true;
      try {
        const state = await getSalePaymentStatus(saleId, statusToken);
        if (stopped) return;
        if (state === "APPROVED") {
          setStep("approved");
          if (countdownRef.current) clearInterval(countdownRef.current);
          if (!approvalHandledRef.current) {
            approvalHandledRef.current = true;
            window.setTimeout(onPaymentApproved, 3500);
          }
          return;
        }
        if (state === "REVIEW_REQUIRED") {
          setStep("review");
          if (countdownRef.current) clearInterval(countdownRef.current);
          return;
        }
        if (state === "EXPIRED") {
          setCountdown("00:00");
          return;
        }
      } catch {
        // Falhas transitórias não escondem um QR Code ainda válido.
      } finally {
        checking = false;
      }
      if (!stopped) nextCheck = setTimeout(checkStatus, 2000);
    };

    void checkStatus();
    return () => {
      stopped = true;
      if (nextCheck) clearTimeout(nextCheck);
    };
  }, [onPaymentApproved, pixData, saleId, statusToken, step]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void handleGeneratePix();
  // A venda e o e-mail são imutáveis durante esta etapa do checkout.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startCountdown(expiresAtMs: number) {
    setCountdown(formatCountdown(expiresAtMs));
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      const label = formatCountdown(expiresAtMs);
      setCountdown(label);
      if (label === "00:00" && countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    }, 1000);
  }

  async function handleGeneratePix() {
    if (generatingRef.current) return;
    const trimmed = customerEmail.trim().toLowerCase();
    generatingRef.current = true;
    setStep("loading");

    try {
      const data = await createPixPayment(saleId, trimmed || undefined);
      if (!mountedRef.current) return;
      if (!Number.isFinite(data.expiresAtMs)) {
        throw new Error("Prazo do Pix indisponível. Tente novamente.");
      }
      setPixData(data);
      setStep("qrcode");

      startCountdown(data.expiresAtMs);
    } catch (error) {
      if (!mountedRef.current) return;
      setErrorMessage(error instanceof Error ? error.message :
        "Não foi possível gerar o Pix. Tente novamente.");
      setStep("error");
    } finally {
      generatingRef.current = false;
    }
  }

  async function handleCopyCode() {
    if (!pixData?.qrCode) return;
    try {
      await navigator.clipboard.writeText(pixData.qrCode);
      setCopyLabel("Copiado!");
      setTimeout(() => setCopyLabel("Copiar código Pix"), 3000);
    } catch {
      setCopyLabel("Erro ao copiar");
      setTimeout(() => setCopyLabel("Copiar código Pix"), 3000);
    }
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  if (step === "loading") {
    return (
      <div className="pix-form" role="status" aria-live="polite">
        <p className="pix-form-hint">Gerando Pix…</p>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="pix-form">
        <p className="pix-error-msg" role="alert">
          {errorMessage}
        </p>
        <button
          type="button"
          className="pix-generate-button"
          onClick={() => {
            generatingRef.current = false;
            void handleGeneratePix();
          }}
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (step === "approved") {
    return (
      <div className="pix-success" role="status" aria-live="assertive">
        <span className="pix-success-icon" aria-hidden="true">✓</span>
        <h3>Pagamento aprovado!</h3>
        <p>Retire seus produtos. Preparando a próxima compra…</p>
      </div>
    );
  }

  if (step === "review") {
    return (
      <div className="pix-form" role="alert">
        <p>Pagamento recebido, mas a venda precisa de conferência.</p>
        <p>Procure o responsável pela loja antes de retirar os produtos.</p>
      </div>
    );
  }

  if (countdown === "00:00") {
    return (
      <div className="pix-form" role="status">
        <p>O prazo desta compra terminou. Não pague este Pix.</p>
        <p>Se já pagou, procure o responsável pela loja para conferir a compra.</p>
      </div>
    );
  }

  // step === "qrcode"
  return (
    <div className="pix-qrcode-container">
      <p className="pix-method-label">Pague com Pix</p>
      <p className="pix-awaiting-status" role="status">
        Aguardando confirmação do pagamento…
      </p>
      <p className="pix-total">
        Total: <strong>{formatCurrency((pixData?.totalCents ?? totalCents) / 100)}</strong>
      </p>

      {/* QR Code — base64 preferencial; fallback para texto se vazio */}
      {pixData?.qrCodeBase64 ? (
        <img
          src={`data:image/png;base64,${pixData.qrCodeBase64}`}
          alt="QR Code Pix"
          className="pix-qr-image"
          width={220}
          height={220}
        />
      ) : (
        <div className="pix-qr-placeholder">
          <span>QR Code</span>
          <small>
            Use o código Pix Copia e Cola abaixo.
          </small>
        </div>
      )}

      {countdown && (
        <p className="pix-countdown">
          Prazo desta compra: <strong>{countdown}</strong>
        </p>
      )}

      {/* Pix Copia e Cola */}
      {pixData?.qrCode && (
        <div className="pix-copy-code">
          <p className="pix-copy-label">Pix Copia e Cola</p>
          <textarea
            id="pix-code-text"
            className="pix-code-textarea"
            readOnly
            value={pixData.qrCode}
            rows={3}
          />
          <button
            id="btn-copiar-pix"
            type="button"
            className="pix-copy-button"
            onClick={() => void handleCopyCode()}
          >
            {copyLabel}
          </button>
        </div>
      )}

      {/* Link de instruções */}
      {pixData?.ticketUrl && (
        <a
          href={pixData.ticketUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="pix-ticket-link"
        >
          Abrir instruções de pagamento
        </a>
      )}
    </div>
  );
}

export default PixPayment;
