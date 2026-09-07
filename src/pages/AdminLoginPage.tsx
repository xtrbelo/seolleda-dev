import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

function AdminLoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      await login(email, password);
      navigate("/admin", { replace: true });
    } catch {
      setErrorMessage(
        "Não foi possível entrar. Confira seu e-mail e senha e tente novamente.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="login-page">
      <div className="login-card">
        <img className="login-official-logo" src="/seolleda-logo.jpg" alt="Seolleda — Comida Asiática" width="3508" height="2481" />
        <h1>Área administrativa</h1>
        <p>Entre para acessar o painel de gestão do Seolleda.</p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="admin-email">E-mail</label>
          <input
            id="admin-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <label htmlFor="admin-password">Senha</label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {errorMessage && (
            <p className="form-error" role="alert">
              {errorMessage}
            </p>
          )}
          <button
            type="submit"
            className="primary-button"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Entrando..." : "Entrar"}
          </button>
        </form>
        <Link to="/checkout" className="back-link">
          Voltar para checkout
        </Link>
      </div>
    </section>
  );
}

export default AdminLoginPage;
