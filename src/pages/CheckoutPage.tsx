import { useEffect, useMemo, useRef, useState } from "react";
import BrandLogo from "../components/BrandLogo";
import BarcodeScanner from "../components/checkout/BarcodeScanner";
import CartItem from "../components/checkout/CartItem";
import CartSummary from "../components/checkout/CartSummary";
import PixPayment from "../components/checkout/PixPayment";
import CardPayment from "../components/checkout/CardPayment";
import { createSale, getCheckoutProduct } from "../services/saleService";
import type { CartItem as CartItemType } from "../types/cart";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

// Utilitário CPF
function isValidCPF(cpf: string): boolean {
  if (typeof cpf !== "string") return false;
  const strCPF = cpf.replace(/[^\d]/g, "");
  if (strCPF.length !== 11) return false;
  if (/^(\d)\1+$/.test(strCPF)) return false;

  let sum = 0;
  let remainder;

  for (let i = 1; i <= 9; i++) {
    sum += parseInt(strCPF.substring(i - 1, i)) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(strCPF.substring(9, 10))) return false;

  sum = 0;
  for (let i = 1; i <= 10; i++) {
    sum += parseInt(strCPF.substring(i - 1, i)) * (12 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(strCPF.substring(10, 11))) return false;

  return true;
}

function formatCPF(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
    .slice(0, 14);
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type CheckoutStep = "welcome" | "cpf" | "email" | "checkout";

function CheckoutPage() {
  // Navigation State
  const [step, setStep] = useState<CheckoutStep>("welcome");

  // Customer Data State
  const [customerDocument, setCustomerDocument] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [cpfError, setCpfError] = useState("");
  const [emailError, setEmailError] = useState("");
  const cpfInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  // Cart State
  const [cart, setCart] = useState<CartItemType[]>([]);
  const [feedback, setFeedback] = useState("");
  const [isError, setIsError] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isClearConfirmationOpen, setIsClearConfirmationOpen] = useState(false);

  // Payment State
  const [isPaymentStepOpen, setIsPaymentStepOpen] = useState(false);
  const [isCreatingSale, setIsCreatingSale] = useState(false);
  const [saleId, setSaleId] = useState("");
  const [saleStatusToken, setSaleStatusToken] = useState("");
  const [backendTotalCents, setBackendTotalCents] = useState<number | null>(null);
  const [showPixFlow, setShowPixFlow] = useState(false);
  const [showCardFlow, setShowCardFlow] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [step]);

  // O backend recalcula preço, disponibilidade e total usando productId e quantity.
  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [cart],
  );
  const itemCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart],
  );

  function resetSession() {
    setCart([]);
    setCpfError("");
    setEmailError("");
    setCustomerDocument("");
    setCustomerEmail("");
    setSaleId("");
    setSaleStatusToken("");
    setBackendTotalCents(null);
    setStep("welcome");
    setIsPaymentStepOpen(false);
    setShowPixFlow(false);
    setShowCardFlow(false);
    setIsClearConfirmationOpen(false);
  }

  function showFeedback(message: string, error = false) {
    setFeedback(message);
    setIsError(error);
    window.setTimeout(() => setFeedback(""), 3000);
  }

  // --- Handlers for Steps ---

  function handleWelcomeStart() {
    setStep("cpf");
  }

  function handleCpfContinue() {
    if (!customerDocument.trim()) {
      setCpfError("Digite seu CPF para continuar ou escolha Não.");
      cpfInputRef.current?.focus();
      return;
    }
    if (!isValidCPF(customerDocument)) {
      setCpfError("Informe um CPF válido com 11 dígitos.");
      cpfInputRef.current?.focus();
      return;
    }
    setCpfError("");
    setStep("email");
  }

  function handleCpfSkip() {
    setCustomerDocument("");
    setCpfError("");
    setStep("email");
  }

  function handleEmailContinue() {
    const email = customerEmail.trim();
    if (!email) {
      setEmailError("Digite seu e-mail para continuar ou escolha Não.");
      emailInputRef.current?.focus();
      return;
    }
    if (!EMAIL_REGEX.test(email) || emailInputRef.current?.validity.typeMismatch) {
      setEmailError("Informe um e-mail válido, como nome@exemplo.com.");
      emailInputRef.current?.focus();
      return;
    }
    setCustomerEmail(email);
    setEmailError("");
    setStep("checkout");
  }

  function handleEmailSkip() {
    setCustomerEmail("");
    setEmailError("");
    setStep("checkout");
  }

  // --- Handlers for Cart ---

  async function addProductByBarcode(barcode: string) {
    if (isLookingUp) return;
    setIsLookingUp(true);
    setFeedback("Buscando produto...");
    setIsError(false);
    try {
      const product = await getCheckoutProduct(barcode);
      const availableStock = product.availableStock;
      if (availableStock <= 0)
        return showFeedback("Produto sem estoque.", true);
      const existingItem = cart.find((item) => item.productId === product.id);
      if (existingItem && existingItem.quantity >= availableStock)
        return showFeedback(
          "Quantidade máxima disponível em estoque atingida.",
          true,
        );
      setCart((currentCart) => {
        const currentItem = currentCart.find(
          (item) => item.productId === product.id,
        );
        if (currentItem)
          return currentCart.map((item) =>
            item.productId === product.id
              ? { ...item, quantity: item.quantity + 1, availableStock }
              : item,
          );
        return [
          ...currentCart,
          {
            productId: product.id,
            name: product.name,
            sku: product.sku,
            barcode: product.barcode,
            unitPrice: product.salePrice,
            quantity: 1,
            availableStock,
          },
        ];
      });
      showFeedback("Produto adicionado.");
    } catch {
      showFeedback(
        "Não foi possível consultar o produto. Tente novamente.",
        true,
      );
    } finally {
      setIsLookingUp(false);
    }
  }

  function changeQuantity(productId: string, difference: number) {
    setCart((currentCart) =>
      currentCart.flatMap((item) => {
        if (item.productId !== productId) return [item];
        const nextQuantity = item.quantity + difference;
        if (nextQuantity <= 0) return [];
        if (nextQuantity > item.availableStock) {
          showFeedback(
            "Quantidade máxima disponível em estoque atingida.",
            true,
          );
          return [item];
        }
        return [{ ...item, quantity: nextQuantity }];
      }),
    );
  }

  function clearCart() {
    setCart([]);
    setIsClearConfirmationOpen(false);
    showFeedback("Carrinho limpo.");
  }

  async function handleCheckout() {
    if (!cart.length || isCreatingSale) return;
    setIsCreatingSale(true);
    setFeedback("Preparando compra...");
    setIsError(false);
    try {
      const sale = await createSale(cart, customerDocument, customerEmail);
      setSaleId(sale.saleId);
      setSaleStatusToken(sale.statusToken);
      setBackendTotalCents(sale.totalCents);
      setShowPixFlow(false);
      setShowCardFlow(false);
      setIsPaymentStepOpen(true);
      setFeedback("");
    } catch {
      showFeedback("Não foi possível iniciar a compra. Tente novamente.", true);
    } finally {
      setIsCreatingSale(false);
    }
  }

  // --- Render Functions ---

  if (step === "welcome") {
    return (
      <section className="self-checkout-page checkout-welcome">
        <div className="checkout-welcome-card">
          <h1 className="welcome-logo"><BrandLogo /></h1>
          <h2>Bem-vindo</h2>
          <p>
            Faça suas compras de forma rápida e segura.
          </p>
          <button
            type="button"
            onClick={handleWelcomeStart}
            className="checkout-welcome-button"
          >
            INICIAR COMPRA
          </button>
        </div>
      </section>
    );
  }

  if (step === "cpf") {
    return (
      <section className="self-checkout-page customer-step" aria-labelledby="cpf-title">
        <div className="customer-step-card">
          <span className="eyebrow">1. Identificação</span>
          <h1 id="cpf-title">Deseja informar seu CPF?</h1>
          <p id="cpf-hint" className="customer-step-description">
            O CPF será usado para identificação da compra e fins fiscais quando aplicável.
            {" "}Para escolher Sim, preencha o campo abaixo. Se preferir, escolha Não para continuar sem CPF.
          </p>
          <form className="customer-step-form" noValidate onSubmit={(event) => {
            event.preventDefault();
            handleCpfContinue();
          }}>
            <div className="customer-step-field">
              <label htmlFor="customer-cpf">CPF</label>
              <input
                key="cpf"
                ref={cpfInputRef}
                id="customer-cpf"
                name="cpf"
                type="text"
                inputMode="numeric"
                maxLength={14}
                placeholder="000.000.000-00"
                aria-invalid={Boolean(cpfError)}
                aria-describedby={cpfError ? "cpf-hint cpf-error" : "cpf-hint"}
                value={customerDocument}
                onChange={(event) => {
                  setCustomerDocument(formatCPF(event.target.value));
                  setCpfError("");
                }}
              />
              {cpfError && <p id="cpf-error" className="form-error" role="alert">{cpfError}</p>}
            </div>
            <div className="customer-step-actions">
              <button type="submit" className="primary-action">Sim, informar CPF</button>
              <button type="button" className="secondary-button" onClick={handleCpfSkip}>Não, continuar</button>
              <button type="button" className="back-to-cart" onClick={() => setStep("welcome")}>Voltar</button>
            </div>
          </form>
        </div>
      </section>
    );
  }

  if (step === "email") {
    return (
      <section className="self-checkout-page customer-step" aria-labelledby="email-title">
        <div className="customer-step-card">
          <span className="eyebrow">2. Comprovante</span>
          <h1 id="email-title">Deseja receber o comprovante por e-mail?</h1>
          <p id="email-hint" className="customer-step-description">
            Seu e-mail será usado somente para envio do comprovante desta compra.
            {" "}Para escolher Sim, preencha o campo abaixo. Se preferir, escolha Não para continuar sem e-mail.
          </p>
          <form className="customer-step-form" noValidate onSubmit={(event) => {
            event.preventDefault();
            handleEmailContinue();
          }}>
            <div className="customer-step-field">
              <label htmlFor="customer-email">E-mail</label>
              <input
                key="email"
                ref={emailInputRef}
                id="customer-email"
                name="email"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="nome@exemplo.com"
                aria-invalid={Boolean(emailError)}
                aria-describedby={emailError ? "email-hint email-error" : "email-hint"}
                value={customerEmail}
                onChange={(event) => {
                  setCustomerEmail(event.target.value);
                  setEmailError("");
                }}
              />
              {emailError && <p id="email-error" className="form-error" role="alert">{emailError}</p>}
            </div>
            <div className="customer-step-actions">
              <button type="submit" className="primary-action">Sim, informar e-mail</button>
              <button type="button" className="secondary-button" onClick={handleEmailSkip}>Não, continuar</button>
              <button type="button" className="back-to-cart" onClick={() => setStep("cpf")}>Voltar</button>
            </div>
          </form>
        </div>
      </section>
    );
  }

  // step === "checkout"
  return (
    <section className="self-checkout-page">
      <div className="checkout-step-bar">
        <span>3. Produtos</span>
        <button
          className="checkout-cancel-button"
          onClick={() => {
            if (window.confirm("Deseja realmente cancelar a compra atual?")) {
              resetSession();
            }
          }}
        >
          Cancelar compra
        </button>
      </div>

      <div className="checkout-intro">
        <span className="eyebrow">Compra rápida</span>
        <h1>Passe seus produtos no leitor</h1>
        <p>Confira seu carrinho e prepare sua compra.</p>
      </div>
      <BarcodeScanner
        onScan={(barcode) => void addProductByBarcode(barcode)}
        isBusy={isLookingUp}
      />
      {feedback && (
        <p
          className={`checkout-feedback ${isError ? "is-error" : ""}`}
          role={isError ? "alert" : "status"}
        >
          {feedback}
        </p>
      )}
      <div className="checkout-layout">
        <div className="cart-section">
          <div className="cart-section-heading">
            <div>
              <span className="eyebrow">Seu carrinho</span>
              <h2>
                {itemCount} {itemCount === 1 ? "item" : "itens"}
              </h2>
            </div>
          </div>
          {cart.length === 0 ? (
            <div className="empty-cart">
              <span className="empty-cart-mark">+</span>
              <h2>Seu carrinho está vazio.</h2>
              <p>Passe o primeiro produto no leitor.</p>
            </div>
          ) : (
            <div className="cart-items">
              {cart.map((item) => (
                <CartItem
                  key={item.productId}
                  item={item}
                  formatCurrency={formatCurrency}
                  onDecrease={() => changeQuantity(item.productId, -1)}
                  onIncrease={() => changeQuantity(item.productId, 1)}
                  onRemove={() =>
                    setCart((current) =>
                      current.filter(
                        (currentItem) =>
                          currentItem.productId !== item.productId,
                      ),
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>
        <CartSummary
          itemCount={itemCount}
          total={total}
          formatCurrency={formatCurrency}
          canCheckout={cart.length > 0}
          onClear={() => setIsClearConfirmationOpen(true)}
          onCheckout={() => void handleCheckout()}
          isProcessing={isCreatingSale}
        />
      </div>
      {isClearConfirmationOpen && (
        <div className="checkout-dialog-backdrop" role="presentation">
          <div
            className="checkout-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-cart-title"
          >
            <h2 id="clear-cart-title">Limpar carrinho?</h2>
            <p>Todos os produtos serão removidos da compra atual.</p>
            <div className="dialog-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setIsClearConfirmationOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={clearCart}
              >
                Limpar carrinho
              </button>
            </div>
          </div>
        </div>
      )}
      {isPaymentStepOpen && (
        <div className="checkout-dialog-backdrop" role="presentation">
          <div
            className="checkout-dialog payment-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-title"
          >
            {!showPixFlow && !showCardFlow ? (
              <>
                <span className="eyebrow">Próxima etapa</span>
                <h2 id="payment-title">Escolha a forma de pagamento</h2>
                <p>
                  Total confirmado:{" "}
                  {formatCurrency((backendTotalCents ?? 0) / 100)}
                </p>
                <p className="sale-reference">Venda preparada: {saleId}</p>
                <div className="payment-options">
                  <button
                    id="btn-pix"
                    type="button"
                    onClick={() => setShowPixFlow(true)}
                  >
                    <strong>PIX</strong>
                    <span>Rápido e sem taxas</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCardFlow(true)}
                  >
                    <strong>CARTÃO</strong>
                    <span>Crédito à vista · 1x</span>
                  </button>
                </div>
                <button
                  type="button"
                  className="back-to-cart"
                  onClick={() => setIsPaymentStepOpen(false)}
                >
                  Voltar para o carrinho
                </button>
              </>
            ) : showPixFlow ? (
              <>
                <span className="eyebrow">Pagamento</span>
                <h2 id="payment-title">Pix</h2>
                <PixPayment
                  saleId={saleId}
                  statusToken={saleStatusToken}
                  totalCents={backendTotalCents ?? 0}
                  customerEmail={customerEmail}
                  onPaymentApproved={resetSession}
                />
                <button
                  type="button"
                  className="back-to-cart"
                  onClick={() => setShowPixFlow(false)}
                >
                  ← Outras formas de pagamento
                </button>
              </>
            ) : (
              <>
                <span className="eyebrow">Pagamento</span>
                <h2 id="payment-title">Cartão de crédito à vista</h2>
                <CardPayment
                  saleId={saleId}
                  statusToken={saleStatusToken}
                  totalCents={backendTotalCents ?? 0}
                  customerEmail={customerEmail}
                  onPaymentApproved={resetSession}
                />
                <button
                  type="button"
                  className="back-to-cart"
                  onClick={() => setShowCardFlow(false)}
                >
                  ← Outras formas de pagamento
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default CheckoutPage;
