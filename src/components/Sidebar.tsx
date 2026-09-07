import { NavLink } from "react-router-dom";
import { adminNavigation } from "../lib/routes";
import BrandLogo from "./BrandLogo";

type SidebarProps = {
  onLogout: () => Promise<void>;
};

function Sidebar({ onLogout }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <BrandLogo />
      </div>

      <nav aria-label="Navegação administrativa">
        <p className="nav-label">Administração</p>
        {adminNavigation.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <NavLink to="/checkout" className="checkout-link">
        Ir para checkout
      </NavLink>
      <button type="button" className="logout-button" onClick={onLogout}>
        Sair
      </button>
    </aside>
  );
}

export default Sidebar;
