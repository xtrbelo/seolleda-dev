type CartSummaryProps = {
  itemCount: number;
  total: number;
  formatCurrency: (value: number) => string;
  canCheckout: boolean;
  onClear: () => void;
  onCheckout: () => void;
};

function CartSummary({
  itemCount,
  total,
  formatCurrency,
  canCheckout,
  onClear,
  onCheckout,
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
        disabled={!canCheckout}
        onClick={onCheckout}
      >
        Finalizar compra
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
