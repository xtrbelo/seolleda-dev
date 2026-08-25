import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createCategory,
  listCategories,
  updateCategory,
  updateCategoryStatus,
} from "../services/categoryService";
import type { Category, CategoryInput } from "../types/category";

const emptyForm: CategoryInput = { name: "", description: "", active: true };

function formatDate(date: Category["updatedAt"]) {
  if (!date) return "Ainda não disponível";
  return date.toDate().toLocaleDateString("pt-BR");
}

function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [formError, setFormError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [form, setForm] = useState<CategoryInput>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  async function loadCategories() {
    try {
      setCategories(await listCategories());
    } catch {
      setPageError("Não foi possível carregar as categorias. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadCategories();
  }, []);

  const filteredCategories = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    if (!normalizedSearch) return categories;
    return categories.filter((category) =>
      category.name.toLocaleLowerCase().includes(normalizedSearch),
    );
  }, [categories, search]);

  function openCreateModal() {
    setEditingCategory(null);
    setForm(emptyForm);
    setFormError("");
    setIsModalOpen(true);
  }

  function openEditModal(category: Category) {
    setEditingCategory(category);
    setForm({
      name: category.name,
      description: category.description,
      active: category.active,
    });
    setFormError("");
    setIsModalOpen(true);
  }

  function closeModal() {
    if (!isSaving) setIsModalOpen(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = form.name.trim().replace(/\s+/g, " ");
    if (cleanName.length < 2) {
      setFormError("Informe um nome com pelo menos 2 caracteres.");
      return;
    }

    setIsSaving(true);
    setFormError("");
    try {
      const input = { ...form, name: cleanName };
      if (editingCategory) {
        await updateCategory(editingCategory.id, input);
      } else {
        await createCategory(input);
      }
      setIsModalOpen(false);
      setIsLoading(true);
      setPageError("");
      await loadCategories();
    } catch (error) {
      setFormError(
        error instanceof Error && error.message === "CATEGORY_DUPLICATE"
          ? "Já existe uma categoria com esse nome."
          : "Não foi possível salvar a categoria. Tente novamente.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusChange(category: Category) {
    try {
      await updateCategoryStatus(category.id, !category.active);
      setCategories((current) =>
        current.map((item) =>
          item.id === category.id ? { ...item, active: !item.active } : item,
        ),
      );
    } catch {
      setPageError("Não foi possível atualizar o status da categoria.");
    }
  }

  return (
    <section className="categories-page">
      <div className="page-heading categories-heading">
        <div>
          <span className="eyebrow">Catálogo</span>
          <h1>Categorias</h1>
          <p>Organize os produtos da sua loja.</p>
        </div>
        <button
          type="button"
          className="primary-action"
          onClick={openCreateModal}
        >
          + Nova categoria
        </button>
      </div>

      <div className="categories-toolbar">
        <label htmlFor="category-search">Buscar categorias</label>
        <input
          id="category-search"
          type="search"
          placeholder="Buscar pelo nome"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {pageError && (
        <p className="page-error" role="alert">
          {pageError}
        </p>
      )}
      <div className="category-table-wrap">
        {isLoading ? (
          <p className="table-message">Carregando categorias...</p>
        ) : filteredCategories.length === 0 ? (
          <p className="table-message">Nenhuma categoria encontrada.</p>
        ) : (
          <table className="category-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Descrição</th>
                <th>Status</th>
                <th>Atualizado em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredCategories.map((category) => (
                <tr key={category.id}>
                  <td>
                    <strong>{category.name}</strong>
                  </td>
                  <td>{category.description || "-"}</td>
                  <td>
                    <span
                      className={
                        category.active ? "status-active" : "status-inactive"
                      }
                    >
                      {category.active ? "Ativa" : "Inativa"}
                    </span>
                  </td>
                  <td>{formatDate(category.updatedAt)}</td>
                  <td className="category-actions">
                    <button
                      type="button"
                      onClick={() => openEditModal(category)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleStatusChange(category)}
                    >
                      {category.active ? "Desativar" : "Ativar"}
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
            className="category-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="category-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="eyebrow">Catálogo</span>
                <h2 id="category-modal-title">
                  {editingCategory ? "Editar categoria" : "Nova categoria"}
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
              <label htmlFor="category-name">Nome</label>
              <input
                id="category-name"
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                required
                autoFocus
              />
              <label htmlFor="category-description">Descrição</label>
              <textarea
                id="category-description"
                rows={3}
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
              />
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) =>
                    setForm({ ...form, active: event.target.checked })
                  }
                />{" "}
                Categoria ativa
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

export default CategoriesPage;
