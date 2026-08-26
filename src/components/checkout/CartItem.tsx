import type { CartItem as CartItemType } from "../../types/cart";

type CartItemProps = {
  item: CartItemType;
  formatCurrency: (value: number) => string;
  onDecrease: () => void;
  onIncrease: () => void;
  onRemove: () => void;
};

function CartItem({
  item,
  formatCurrency,
  onDecrease,
  onIncrease,
  onRemove,
}: CartItemProps) {
  return (
    <article className="cart-item">
      <div className="cart-item-info">
        <strong>{item.name}</strong>
        <span>SKU: {item.sku}</span>
      </div>
      <div className="cart-item-quantity">
        <span>Quantidade</span>
        <div className="quantity-controls">
          <button
            type="button"
            onClick={onDecrease}
            aria-label={`Diminuir quantidade de ${item.name}`}
          >
            -
          </button>
          <strong>{item.quantity}</strong>
          <button
            type="button"
            onClick={onIncrease}
            aria-label={`Aumentar quantidade de ${item.name}`}
          >
            +
          </button>
        </div>
      </div>
      <div className="cart-item-price">
        <span>{formatCurrency(item.unitPrice)} cada</span>
        <strong>{formatCurrency(item.unitPrice * item.quantity)}</strong>
      </div>
      <button type="button" className="remove-item" onClick={onRemove}>
        Remover
      </button>
    </article>
  );
}

export default CartItem;
