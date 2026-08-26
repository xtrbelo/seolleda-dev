type CartSummaryProps = {
  itemCount: number;
  total: number;
  formatCurrency: (value: number) => string;
  canCheckout: boolean;
  onClear: () => void;
  onCheckout: () => void;
  isProcessing: boolean;
};

function CartSummary({
  itemCount,
  total,
  formatCurrency,
  canCheckout,
  onClear,
  onCheckout,
  isProcessing,
}: CartSummaryProps) {
  return (
    <aside className="cart-summary">
      <div className="summary-line">
        <span>Itens</span>
        <strong>{itemCount}</strong>
      </div>
      <div className="summary-total">
        <span>Total</span>
        <strong>{formatCurrency(total)}</strong>
      </div>
      <button
        type="button"
        className="checkout-button"
        disabled={!canCheckout || isProcessing}
        onClick={onCheckout}
      >
        {isProcessing ? "Preparando compra..." : "Finalizar compra"}
      </button>
      {canCheckout && (
        <button type="button" className="clear-cart-button" onClick={onClear}>
          Limpar carrinho
        </button>
      )}
    </aside>
  );
}

export default CartSummary;
