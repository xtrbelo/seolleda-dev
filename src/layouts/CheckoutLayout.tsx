import { Link, Outlet } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";

function CheckoutLayout() {
  return (
    <div className="checkout-shell">
      <header className="checkout-header">
        <Link to="/checkout" className="brand">
          <BrandLogo />
        </Link>
        <Link to="/admin/login" className="header-link">
          Área administrativa
        </Link>
      </header>
      <main className="checkout-content">
        <Outlet />
      </main>
    </div>
  );
}

export default CheckoutLayout;
