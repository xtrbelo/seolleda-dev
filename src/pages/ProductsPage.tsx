import { useEffect, useMemo, useState, type FormEvent } from "react";
import { listCategories } from "../services/categoryService";
import {
  createProduct,
  listProducts,
  updateProduct,
  updateProductStatus,
} from "../services/productService";
import type { Category } from "../types/category";
import type { Product, ProductInput } from "../types/product";

const emptyForm = {
  name: "",
  description: "",
  sku: "",
  barcode: "",
  categoryId: "",
  categoryName: "",
  costPrice: "",
  salePrice: "",
  active: true,
};

type ProductForm = typeof emptyForm;

async function fetchProductData() {
  const [products, categories] = await Promise.all([
    listProducts(),
    listCategories(),
  ]);
  return {products, categories: categories.filter((category) => category.active)};
}

function formatPrice(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(date: Product["updatedAt"]) {
  if (!date) return "Ainda não disponível";
  return date.toDate().toLocaleDateString("pt-BR");
}

function parsePrice(value: string) {
  const cleanValue = value.trim().replace(/R\$\s?/g, "");
  if (!cleanValue) return Number.NaN;
  const normalizedValue = cleanValue.includes(",")
    ? cleanValue.replace(/\./g, "").replace(",", ".")
    : cleanValue;
  return Number(normalizedValue);
}

function productToForm(product: Product): ProductForm {
  return {
    name: product.name,
    description: product.description,
    sku: product.sku,
    barcode: product.barcode,
    categoryId: product.categoryId,
    categoryName: product.categoryName,
    costPrice: product.costPrice.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
    }),
    salePrice: product.salePrice.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
    }),
    active: product.active,
  };
}

function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [formError, setFormError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  async function loadData() {
    try {
      const loaded = await fetchProductData();
      setProducts(loaded.products);
      setCategories(loaded.categories);
    } catch {
      setPageError(
        "Não foi possível carregar os produtos e categorias. Tente novamente.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void fetchProductData().then((loaded) => {
      if (!active) return;
      setProducts(loaded.products);
      setCategories(loaded.categories);
    }).catch(() => {
      if (active) setPageError("Não foi possível carregar os produtos e categorias. Tente novamente.");
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

  function openCreateModal() {
    setEditingProduct(null);
    setForm(emptyForm);
    setFormError("");
    setIsModalOpen(true);
  }

  function openEditModal(product: Product) {
    setEditingProduct(product);
    setForm(productToForm(product));
    setFormError("");
    setIsModalOpen(true);
  }

  function closeModal() {
    if (!isSaving) setIsModalOpen(false);
  }

  function updateForm(field: keyof ProductForm, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = form.name.trim().replace(/\s+/g, " ");
    const cleanSku = form.sku.trim().replace(/\s+/g, " ");
    const cleanBarcode = form.barcode.trim();
    const costPrice = parsePrice(form.costPrice);
    const salePrice = parsePrice(form.salePrice);

    if (cleanName.length < 2)
      return setFormError("Informe um nome com pelo menos 2 caracteres.");
    if (!cleanSku) return setFormError("Informe o SKU do produto.");
    if (!/^\d+$/.test(cleanBarcode))
      return setFormError("O código de barras deve conter apenas números.");
    if (!form.categoryId) return setFormError("Selecione uma categoria ativa.");
    if (!Number.isFinite(costPrice) || costPrice < 0)
      return setFormError("Informe um preço de custo válido.");
    if (!Number.isFinite(salePrice) || salePrice < 0)
      return setFormError("Informe um preço de venda válido.");

    const selectedCategory = categories.find(
      (category) => category.id === form.categoryId,
    );
    if (!selectedCategory)
      return setFormError("A categoria selecionada não está disponível.");

    const input: ProductInput = {
      name: cleanName,
      description: form.description.trim(),
      sku: cleanSku,
      barcode: cleanBarcode,
      categoryId: selectedCategory.id,
      categoryName: selectedCategory.name,
      costPrice,
      salePrice,
      active: form.active,
    };

    setIsSaving(true);
    setFormError("");
    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id, input);
      } else {
        await createProduct(input);
      }
      setIsModalOpen(false);
      setIsLoading(true);
      setPageError("");
      await loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setFormError(
        message === "PRODUCT_DUPLICATE_SKU"
          ? "Já existe um produto com esse SKU."
          : message === "PRODUCT_DUPLICATE_BARCODE"
            ? "Já existe um produto com esse código de barras."
            : "Não foi possível salvar o produto. Tente novamente.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusChange(product: Product) {
    try {
      await updateProductStatus(product.id, !product.active);
      setProducts((current) =>
        current.map((item) =>
          item.id === product.id ? { ...item, active: !item.active } : item,
        ),
      );
    } catch {
      setPageError("Não foi possível atualizar o status do produto.");
    }
  }

  return (
    <section className="products-page">
      <div className="page-heading products-heading">
        <div>
          <span className="eyebrow">Catálogo</span>
          <h1>Produtos</h1>
          <p>Gerencie os produtos disponíveis para venda.</p>
        </div>
        <button
          type="button"
          className="primary-action"
          onClick={openCreateModal}
        >
          + Novo produto
        </button>
      </div>

      <div className="products-toolbar">
        <label htmlFor="product-search">Buscar produtos</label>
        <input
          id="product-search"
          type="search"
          placeholder="Nome, SKU ou código de barras"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {pageError && (
        <p className="page-error" role="alert">
          {pageError}
        </p>
      )}
      <div className="product-table-wrap">
        {isLoading ? (
          <p className="table-message">Carregando produtos...</p>
        ) : filteredProducts.length === 0 ? (
          <p className="table-message">Nenhum produto encontrado.</p>
        ) : (
          <table className="product-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Código</th>
                <th>SKU</th>
                <th>Categoria</th>
                <th>Custo</th>
                <th>Preço</th>
                <th>Status</th>
                <th>Atualizado em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => (
                <tr key={product.id}>
                  <td>
                    <strong>{product.name}</strong>
                    <small>{product.description || "Sem descrição"}</small>
                  </td>
                  <td>{product.barcode}</td>
                  <td>{product.sku}</td>
                  <td>{product.categoryName}</td>
                  <td>{formatPrice(product.costPrice)}</td>
                  <td>{formatPrice(product.salePrice)}</td>
                  <td>
                    <span
                      className={
                        product.active ? "status-active" : "status-inactive"
                      }
                    >
                      {product.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td>{formatDate(product.updatedAt)}</td>
                  <td className="category-actions">
                    <button
                      type="button"
                      onClick={() => openEditModal(product)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleStatusChange(product)}
                    >
                      {product.active ? "Desativar" : "Ativar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isModalOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={closeModal}
        >
          <div
            className="category-modal product-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="eyebrow">Catálogo</span>
                <h2 id="product-modal-title">
                  {editingProduct ? "Editar produto" : "Novo produto"}
                </h2>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={closeModal}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <label htmlFor="product-name">Nome</label>
              <input
                id="product-name"
                value={form.name}
                onChange={(event) => updateForm("name", event.target.value)}
                required
                autoFocus
              />
              <label htmlFor="product-description">Descrição</label>
              <textarea
                id="product-description"
                rows={2}
                value={form.description}
                onChange={(event) =>
                  updateForm("description", event.target.value)
                }
              />
              <div className="product-form-grid">
                <div>
                  <label htmlFor="product-sku">SKU</label>
                  <input
                    id="product-sku"
                    value={form.sku}
                    onChange={(event) => updateForm("sku", event.target.value)}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="product-barcode">Código de barras</label>
                  <input
                    id="product-barcode"
                    inputMode="numeric"
                    value={form.barcode}
                    onChange={(event) =>
                      updateForm("barcode", event.target.value)
                    }
                    required
                  />
                </div>
              </div>
              <label htmlFor="product-category">Categoria</label>
              <select
                id="product-category"
                value={form.categoryId}
                onChange={(event) =>
                  updateForm("categoryId", event.target.value)
                }
                required
              >
                <option value="">Selecione uma categoria</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <div className="product-form-grid">
                <div>
                  <label htmlFor="product-cost">Preço de custo</label>
                  <input
                    id="product-cost"
                    inputMode="decimal"
                    placeholder="3,50"
                    value={form.costPrice}
                    onChange={(event) =>
                      updateForm("costPrice", event.target.value)
                    }
                    required
                  />
                </div>
                <div>
                  <label htmlFor="product-sale">Preço de venda</label>
                  <input
                    id="product-sale"
                    inputMode="decimal"
                    placeholder="6,00"
                    value={form.salePrice}
                    onChange={(event) =>
                      updateForm("salePrice", event.target.value)
                    }
                    required
                  />
                </div>
              </div>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) =>
                    updateForm("active", event.target.checked)
                  }
                />{" "}
                Produto ativo
              </label>
              {formError && (
                <p className="form-error" role="alert">
                  {formError}
                </p>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeModal}
                  disabled={isSaving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="primary-action"
                  disabled={isSaving}
                >
                  {isSaving ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

export default ProductsPage;
