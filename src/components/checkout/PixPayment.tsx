import { useRef, useState } from "react";
import { createPixPayment } from "../../services/paymentService";
import type { CreatePixPaymentResponse } from "../../services/paymentService";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type PixStep = "form" | "loading" | "qrcode" | "error";

type PixPaymentProps = {
  saleId: string;
  totalCents: number;
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
 *   1. Formulário de e-mail → chama createPixPayment
 *   2. Exibe QR Code, Pix Copia e Cola e link de instruções
 *
 * Responsabilidades deste componente:
 *   - Enviar apenas { saleId, payerEmail } ao backend
 *   - Nunca enviar valor, preço ou dados de produto
 *   - Desabilitar o botão durante o carregamento (anti-clique-duplo)
 */
function PixPayment({ saleId, totalCents }: PixPaymentProps) {
  const [step, setStep] = useState<PixStep>("form");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [pixData, setPixData] = useState<CreatePixPaymentResponse | null>(null);
  const [copyLabel, setCopyLabel] = useState("Copiar código Pix");
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [countdown, setCountdown] = useState("");

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
    // Validação mínima no frontend para feedback imediato
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError("Informe um e-mail válido.");
      return;
    }
    setEmailError("");
    setStep("loading");

    try {
      const data = await createPixPayment(saleId, trimmed);
      setPixData(data);
      setStep("qrcode");

      // Calcula vencimento — expiresAt pode chegar como Timestamp do Firebase
      // ou como objeto com seconds/nanoseconds.
      const expiresAtRaw = data.expiresAt as unknown;
      let expiresAtMs: number;
      if (
        typeof expiresAtRaw === "object" &&
        expiresAtRaw !== null &&
        "seconds" in (expiresAtRaw as object)
      ) {
        expiresAtMs =
          (expiresAtRaw as { seconds: number }).seconds * 1000;
      } else {
        expiresAtMs = Date.now() + 30 * 60 * 1000;
      }
      startCountdown(expiresAtMs);
    } catch {
      setStep("error");
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

  if (step === "form" || step === "loading") {
    const isLoading = step === "loading";
    return (
      <div className="pix-form">
        <p className="pix-form-hint">
          Informe o e-mail para receber a confirmação do pagamento.
        </p>
        <label htmlFor="pix-email" className="pix-label">
          E-mail
        </label>
        <input
          id="pix-email"
          type="email"
          className={`pix-email-input${emailError ? " pix-input-error" : ""}`}
          placeholder="seu@email.com.br"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (emailError) setEmailError("");
          }}
          disabled={isLoading}
          autoComplete="email"
        />
        {emailError && (
          <p className="pix-error-msg" role="alert">
            {emailError}
          </p>
        )}
        <button
          id="btn-gerar-pix"
          type="button"
          className="pix-generate-button"
          onClick={() => void handleGeneratePix()}
          disabled={isLoading}
        >
          {isLoading ? "Gerando Pix…" : "Gerar Pix"}
        </button>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="pix-form">
        <p className="pix-error-msg" role="alert">
          Não foi possível gerar o Pix. Tente novamente.
        </p>
        <button
          type="button"
          className="pix-generate-button"
          onClick={() => setStep("form")}
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  // step === "qrcode"
  return (
    <div className="pix-qrcode-container">
      <p className="pix-method-label">Pague com Pix</p>
      <p className="pix-total">
        Total: <strong>{formatCurrency(totalCents / 100)}</strong>
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
            (disponível após confirmação no ambiente de produção)
          </small>
        </div>
      )}

      {countdown && (
        <p className="pix-countdown">
          Válido por <strong>{countdown}</strong>
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
