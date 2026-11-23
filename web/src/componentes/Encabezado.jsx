import { NavLink } from "react-router-dom";
import { cerrarSesion } from "../lib/api.js";
import { usePerfil } from "../lib/perfil.jsx";

const clase = ({ isActive }) => (isActive ? "active" : "");

// Encabezado compacto: título y sesión en una fila; pestañas debajo.
export default function Encabezado() {
  const perfil = usePerfil();
  return (
    <header className="site-header">
      <div className="wrap header-top">
        <div className="brand">
          <span className="eyebrow">PROYECTO 2</span>
          <h1>Control Inteligente de Inventario</h1>
          <p>Detecta stock bajo, avisa por correo y estima cuándo se agotará cada producto.</p>
        </div>
        <div className="header-user">
          {perfil.role && <span className="role-chip">Rol: <strong>{perfil.role}</strong></span>}
          <button type="button" className="logout" onClick={() => cerrarSesion()}>Cerrar sesión</button>
        </div>
      </div>
      <nav className="wrap main-nav" aria-label="Navegación principal">
        <NavLink className={clase} to="/" end>Inventario</NavLink>
        <NavLink className={clase} to="/dashboard">Dashboard</NavLink>
        <NavLink className={clase} to="/movimientos">Movimientos</NavLink>
        <NavLink className={clase} to="/alertas">Historial de alertas</NavLink>
        {(perfil.role === "admin" || perfil.role === "compras") && <NavLink className={clase} to="/proveedores">Proveedores</NavLink>}
        {perfil.role !== "consulta" && <NavLink className={clase} to="/ordenes">Órdenes</NavLink>}
        {perfil.role === "admin" && <NavLink className={clase} to="/usuarios">Usuarios</NavLink>}
      </nav>
    </header>
  );
}
