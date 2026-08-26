import { useMemo, useState } from "react";
import BarcodeScanner from "../components/checkout/BarcodeScanner";
import CartItem from "../components/checkout/CartItem";
import CartSummary from "../components/checkout/CartSummary";
import { getInventoryForProduct } from "../services/inventoryService";
import { getOrCreateDefaultStore } from "../services/storeService";
import { getProductByBarcode } from "../services/productService";
import type { CartItem as CartItemType } from "../types/cart";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

function CheckoutPage() {
  const [cart, setCart] = useState<CartItemType[]>([]);
  const [feedback, setFeedback] = useState("");
  const [isError, setIsError] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isClearConfirmationOpen, setIsClearConfirmationOpen] = useState(false);
  const [isPaymentStepOpen, setIsPaymentStepOpen] = useState(false);

  // Na próxima etapa, o backend deve recalcular preço, disponibilidade e total usando productId e quantity.
  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [cart],
  );
  const itemCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart],
  );

  function showFeedback(message: string, error = false) {
    setFeedback(message);
    setIsError(error);
    window.setTimeout(() => setFeedback(""), 3000);
  }

  async function addProductByBarcode(barcode: string) {
    if (isLookingUp) return;
    setIsLookingUp(true);
    setFeedback("Buscando produto...");
    setIsError(false);
    try {
      const product = await getProductByBarcode(barcode);
      if (!product) return showFeedback("Produto não encontrado.", true);
      if (!product.active)
        return showFeedback(
          "Este produto não está disponível para venda.",
          true,
        );
      const store = await getOrCreateDefaultStore();
      const inventory = await getInventoryForProduct(store.id, product.id);
      const availableStock = inventory?.quantity ?? 0;
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

  return (
    <section className="self-checkout-page">
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
          onCheckout={() => setIsPaymentStepOpen(true)}
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
            <span className="eyebrow">Próxima etapa</span>
            <h2 id="payment-title">Escolha a forma de pagamento</h2>
            <p>Pagamento será implementado na próxima etapa.</p>
            <div className="payment-options">
              <button
                type="button"
                onClick={() =>
                  showFeedback("Pagamento será implementado na próxima etapa.")
                }
              >
                <strong>PIX</strong>
                <span>Disponível em breve</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  showFeedback("Pagamento será implementado na próxima etapa.")
                }
              >
                <strong>CARTÃO</strong>
                <span>Disponível em breve</span>
              </button>
            </div>
            <button
              type="button"
              className="back-to-cart"
              onClick={() => setIsPaymentStepOpen(false)}
            >
              Voltar para o carrinho
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default CheckoutPage;
