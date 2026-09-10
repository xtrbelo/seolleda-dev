import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../contexts/useAuth";
import {
  listInventory,
  listStockMovements,
  recordStockMovement,
  updateMinimumQuantity,
} from "../services/inventoryService";
import { getOrCreateDefaultStore } from "../services/storeService";
import { listProducts } from "../services/productService";
import type { Inventory } from "../types/inventory";
import type { Product } from "../types/product";
import type { StockMovement, StockMovementType } from "../types/stockMovement";
import { useStockAlertPreferences, type StockAlertPreferences } from "../lib/stockAlertPreferences";

type MovementModal = "ENTRY" | "EXIT" | "ADJUSTMENT" | null;

const movementLabels: Record<StockMovementType, string> = {
  ENTRY: "Entrada",
  EXIT: "Saída",
  ADJUSTMENT: "Ajuste",
  SALE: "Venda",
  REFUND: "Devolução",
};

function formatDate(date: Product["updatedAt"]) {
  if (!date) return "Ainda não disponível";
  return date.toDate().toLocaleDateString("pt-BR");
}

function formatDateTime(date: StockMovement["createdAt"]) {
  if (!date) return "Ainda não disponível";
  return date.toDate().toLocaleString("pt-BR");
}

function statusFor(quantity: number, minimumQuantity: number, preferences: StockAlertPreferences) {
  const kind = quantity < 0 ? "negative" : quantity === 0 ? "empty" : quantity <= minimumQuantity ? "low" : null;
  if (kind && !preferences[kind]) return { label: "Alerta oculto", className: "" };
  if (quantity < 0) return { label: "Saldo negativo", className: "stock-empty" };
  if (quantity === 0) return { label: "Sem estoque", className: "stock-empty" };
  if (quantity <= minimumQuantity) {
    return { label: "Estoque baixo", className: "stock-low" };
  }
  return { label: "Normal", className: "stock-normal" };
}

async function fetchStockData() {
  const store = await getOrCreateDefaultStore();
  const [products, inventory] = await Promise.all([
    listProducts(),
    listInventory(store.id),
  ]);
  return {storeId: store.id, products, inventory};
}

function StockPage() {
  const stockAlerts = useStockAlertPreferences();
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [storeId, setStoreId] = useState("");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState<MovementModal>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [operationId, setOperationId] = useState("");
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [history, setHistory] = useState<StockMovement[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  async function loadData() {
    try {
      const loaded = await fetchStockData();
      setStoreId(loaded.storeId);
      setProducts(loaded.products);
      setInventory(loaded.inventory);
      setPageError("");
    } catch {
      setPageError("Não foi possível carregar o estoque. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void fetchStockData().then((loaded) => {
      if (!active) return;
      setStoreId(loaded.storeId);
      setProducts(loaded.products);
      setInventory(loaded.inventory);
      setPageError("");
    }).catch(() => {
      if (active) setPageError("Não foi possível carregar o estoque. Tente novamente.");
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, []);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    if (!normalizedSearch) return products;
    return products.filter((product) =>
      [product.name, product.sku, product.barcode].some((value) =>
        value.toLocaleLowerCase().includes(normalizedSearch),
      ),
    );
  }, [products, search]);

  function getInventory(productId: string) {
    return inventory.find((item) => item.productId === productId);
  }

  function openMovement(product: Product, type: MovementModal) {
    setSelectedProduct(product);
    setOperationId(crypto.randomUUID());
    setModal(type);
    setQuantity("");
    setReason("");
    setFormError("");
    setNotice("");
  }

  function closeMovement() {
    if (!isSaving) setModal(null);
  }

  async function handleMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProduct || !modal || !user) return;
    const parsedQuantity = Number(quantity);
    if (
      !Number.isInteger(parsedQuantity) ||
      parsedQuantity < 0 ||
      (modal !== "ADJUSTMENT" && parsedQuantity === 0)
    ) {
      setFormError("Informe uma quantidade válida.");
      return;
    }
    if (!reason.trim()) {
      setFormError("Informe o motivo da movimentação.");
      return;
    }

    setIsSaving(true);
    setFormError("");
    try {
      await recordStockMovement({
        storeId,
        operationId,
        product: selectedProduct,
        type: modal,
        quantity: parsedQuantity,
        reason,
        userId: user.uid,
        userEmail: user.email ?? "",
      });
      setModal(null);
      setNotice(
        modal === "ENTRY"
          ? "Entrada registrada com sucesso."
          : modal === "EXIT"
            ? "Saída registrada com sucesso."
            : "Estoque ajustado com sucesso.",
      );
      setIsLoading(true);
      await loadData();
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setFormError(
        code === "INSUFFICIENT_STOCK"
          ? "Estoque insuficiente para esta saída."
          : code === "NO_STOCK_CHANGE"
            ? "A contagem informada é igual ao estoque atual."
            : code === "INVALID_QUANTITY"
              ? "Informe uma quantidade válida."
              : "Não foi possível registrar a movimentação. Tente novamente.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleMinimumChange(product: Product, value: string) {
    const parsedValue = Number(value);
    if (!Number.isInteger(parsedValue) || parsedValue < 0 || !storeId) return;
    try {
      await updateMinimumQuantity(storeId, product.id, parsedValue);
      setInventory((current) => {
        const existing = current.find((item) => item.productId === product.id);
        if (existing) {
          return current.map((item) =>
            item.productId === product.id
              ? { ...item, minimumQuantity: parsedValue }
              : item,
          );
        }
        return [
          ...current,
          {
            id: `${storeId}_${product.id}`,
            storeId,
            productId: product.id,
            quantity: 0,
            minimumQuantity: parsedValue,
            createdAt: null,
            updatedAt: null,
          },
        ];
      });
    } catch {
      setPageError("Não foi possível atualizar o estoque mínimo.");
    }
  }

  async function openHistory(product: Product) {
    setSelectedProduct(product);
    setIsHistoryOpen(true);
    setIsHistoryLoading(true);
    try {
      setHistory(await listStockMovements(storeId, product.id));
    } catch {
      setHistory([]);
      setPageError("Não foi possível carregar o histórico.");
    } finally {
      setIsHistoryLoading(false);
    }
  }

  return (
    <section className="stock-page">
      <div className="page-heading stock-heading">
        <div>
          <span className="eyebrow">Operação</span>
          <h1>Estoque</h1>
          <p>Controle as quantidades e movimentações dos produtos.</p>
        </div>
      </div>
      <div className="stock-toolbar">
        <label htmlFor="stock-search">Buscar produtos</label>
        <input
          id="stock-search"
          type="search"
          placeholder="Nome, SKU ou código de barras"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {notice && (
        <p className="success-message" role="status">
          {notice}
        </p>
      )}
      {pageError && (
        <p className="page-error" role="alert">
          {pageError}
        </p>
      )}
      <div className="stock-table-wrap">
        {isLoading ? (
          <p className="table-message">Carregando estoque...</p>
        ) : filteredProducts.length === 0 ? (
          <p className="table-message">Nenhum produto encontrado.</p>
        ) : (
          <table className="stock-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>SKU</th>
                <th>Código de barras</th>
                <th>Estoque atual</th>
                <th>Estoque mínimo</th>
                <th>Situação</th>
                <th>Atualizado em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => {
                const item = getInventory(product.id);
                const currentQuantity = item?.quantity ?? 0;
                const minimumQuantity = item?.minimumQuantity ?? 0;
                const status = statusFor(currentQuantity, minimumQuantity, stockAlerts);
                return (
                  <tr key={product.id}>
                    <td>
                      <strong>{product.name}</strong>
                      {!product.active && (
                        <small className="inactive-label">
                          Produto inativo
                        </small>
                      )}
                    </td>
                    <td>{product.sku}</td>
                    <td>{product.barcode}</td>
                    <td>
                      <strong className="stock-quantity">
                        {currentQuantity}
                      </strong>
                    </td>
                    <td>
                      <input
                        className="minimum-input"
                        type="number"
                        min="0"
                        step="1"
                        defaultValue={minimumQuantity}
                        aria-label={`Estoque mínimo de ${product.name}`}
                        onBlur={(event) =>
                          void handleMinimumChange(product, event.target.value)
                        }
                      />
                    </td>
                    <td>
                      <span className={`stock-status ${status.className}`}>
                        {status.label}
                      </span>
                    </td>
                    <td>{formatDate(item?.updatedAt ?? product.updatedAt)}</td>
                    <td className="stock-actions">
                      <button
                        type="button"
                        onClick={() => openMovement(product, "ENTRY")}
                      >
                        Entrada
                      </button>
                      <button
                        type="button"
                        onClick={() => openMovement(product, "EXIT")}
                      >
                        Saída
                      </button>
                      <button
                        type="button"
                        onClick={() => openMovement(product, "ADJUSTMENT")}
                      >
                        Ajustar
                      </button>
                      <button
                        type="button"
                        onClick={() => void openHistory(product)}
                      >
                        Histórico
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modal && selectedProduct && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={closeMovement}
        >
          <div
            className="category-modal stock-modal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="eyebrow">Movimentação</span>
                <h2>
                  {modal === "ENTRY"
                    ? "Registrar entrada"
                    : modal === "EXIT"
                      ? "Registrar saída"
                      : "Ajustar estoque"}
                </h2>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={closeMovement}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <div className="stock-summary">
              <strong>{selectedProduct.name}</strong>
              <span>
                Estoque atual: {getInventory(selectedProduct.id)?.quantity ?? 0}
              </span>
            </div>
            <form onSubmit={handleMovement}>
              <label htmlFor="movement-quantity">
                {modal === "ADJUSTMENT"
                  ? "Quantidade encontrada na contagem"
                  : `Quantidade da ${modal === "ENTRY" ? "entrada" : "saída"}`}
              </label>
              <input
                id="movement-quantity"
                type="number"
                min="0"
                step="1"
                value={quantity}
                onChange={(event) => { setQuantity(event.target.value); setOperationId(crypto.randomUUID()); }}
                required
                autoFocus
              />
              {modal === "ADJUSTMENT" && quantity !== "" && (
                <p className="adjustment-preview">
                  Estoque atual:{" "}
                  {getInventory(selectedProduct.id)?.quantity ?? 0} | Novo
                  estoque: {quantity} | Diferença:{" "}
                  {Number(quantity) -
                    (getInventory(selectedProduct.id)?.quantity ?? 0) >=
                  0
                    ? "+"
                    : ""}
                  {Number(quantity) -
                    (getInventory(selectedProduct.id)?.quantity ?? 0)}
                </p>
              )}
              <label htmlFor="movement-reason">Motivo</label>
              <textarea
                id="movement-reason"
                rows={3}
                value={reason}
                onChange={(event) => { setReason(event.target.value); setOperationId(crypto.randomUUID()); }}
                required
              />
              {formError && (
                <p className="form-error" role="alert">
                  {formError}
                </p>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeMovement}
                  disabled={isSaving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="primary-action"
                  disabled={isSaving}
                >
                  {isSaving
                    ? "Registrando..."
                    : modal === "ENTRY"
                      ? "Registrar entrada"
                      : modal === "EXIT"
                        ? "Registrar saída"
                        : "Confirmar ajuste"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isHistoryOpen && selectedProduct && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setIsHistoryOpen(false)}
        >
          <div
            className="category-modal history-modal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="eyebrow">Histórico</span>
                <h2>{selectedProduct.name}</h2>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setIsHistoryOpen(false)}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            {isHistoryLoading ? (
              <p className="table-message">Carregando movimentações...</p>
            ) : history.length === 0 ? (
              <p className="table-message">Nenhuma movimentação registrada.</p>
            ) : (
              <div className="history-list">
                {history.map((movement) => (
                  <div className="history-item" key={movement.id}>
                    <div>
                      <strong>{movementLabels[movement.type]}</strong>
                      <span>
                        {formatDateTime(movement.createdAt)} por{" "}
                        {movement.userEmail || movement.userId}
                      </span>
                    </div>
                    <div>
                      <span>
                        {movement.previousQuantity} &rarr;{" "}
                        {movement.newQuantity}
                      </span>
                      <small>
                        Quantidade: {movement.quantity} | {movement.reason}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default StockPage;
