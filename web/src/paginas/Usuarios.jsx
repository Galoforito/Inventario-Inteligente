import { useEffect, useState } from "react";
import Pagina from "../componentes/Pagina.jsx";
import { actualizarPerfil, crearUsuario, listarPerfiles } from "../lib/api.js";

const ROLES = ["admin", "almacen", "compras", "consulta"];
export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [aviso, setAviso] = useState(null);
  async function cargar() { try { setUsuarios(await listarPerfiles()); } catch (e) { setAviso({ tipo: "error", texto: e.message }); } }
  useEffect(() => { cargar(); }, []);
  async function guardar(id, form) {
    try { await actualizarPerfil(id, form.role, form.active); await cargar(); setAviso({ tipo: "success", texto: "Permisos actualizados." }); }
    catch (e) { setAviso({ tipo: "error", texto: e.message }); }
  }
  async function crear(evento) {
    evento.preventDefault(); const f = new FormData(evento.currentTarget);
    try { const usuario = await crearUsuario(f.get("email"), f.get("password"), f.get("role")); await cargar(); evento.currentTarget.reset(); setAviso({ tipo: "success", texto: `Usuario creado (${usuario.user_id}). Comparte la contraseña inicial que ingresaste por un canal seguro.` }); }
    catch (e) { setAviso({ tipo: "error", texto: e.message }); }
  }
  return <Pagina aviso={aviso} resumen={null}><div className="page-title"><div><h2>Usuarios y roles</h2><p>El backend crea la cuenta y aplica el rol solicitado; la contraseña no se guarda en el perfil.</p></div></div>
    <form className="card form-card" onSubmit={crear}><h3>Crear usuario</h3><label>Correo<input type="email" name="email" required /></label><label>Contraseña inicial (12 caracteres mínimo)<input type="password" name="password" minLength="12" autoComplete="new-password" required /></label><label>Rol<select name="role">{ROLES.map((r) => <option key={r}>{r}</option>)}</select></label><button className="primary">Crear cuenta</button></form>
    <section className="card table-card users-card">
      <div className="table-head">
        <div>
          <h3>Cuentas</h3>
          <p className="muted table-note">{usuarios.length} usuario(s). Cambia el rol o el estado y pulsa Guardar en esa fila.</p>
        </div>
      </div>
      <div className="table-scroll tabla-tarjetas users-table">
        <table>
          <thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Acción</th></tr></thead>
          <tbody>{usuarios.map((u) => <Fila key={u.user_id} usuario={u} guardar={guardar} />)}</tbody>
        </table>
      </div>
    </section>
  </Pagina>;
}

// Qué permite cada rol (resumen de las políticas de la base).
const DESCRIPCION_ROL = {
  admin: "Acceso completo, incluidos usuarios",
  almacen: "Inventario, movimientos y recepción",
  compras: "Proveedores y órdenes de compra",
  consulta: "Solo lectura",
};

function Fila({ usuario, guardar }) {
  const [role, setRole] = useState(usuario.role); const [active, setActive] = useState(usuario.active);
  const cambiado = role !== usuario.role || active !== usuario.active;
  return <tr className={cambiado ? "row-changed" : ""}>
    <td data-etiqueta="Usuario">
      <strong className="user-email">{usuario.email}</strong>
      <small className="sub mono" title={usuario.user_id}>ID {String(usuario.user_id).slice(0, 8)}…</small>
    </td>
    <td data-etiqueta="Rol">
      <select aria-label={`Rol de ${usuario.email}`} value={role} onChange={(e) => setRole(e.target.value)}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
      <small className="sub">{DESCRIPCION_ROL[role]}</small>
    </td>
    <td data-etiqueta="Estado">
      <label className="check status-toggle">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        <span className={`badge ${active ? "ok" : "muted"}`}>{active ? "Activo" : "Inactivo"}</span>
      </label>
    </td>
    <td data-etiqueta="Acción">
      <button type="button" className={cambiado ? "primary small" : "small"} disabled={!cambiado}
        onClick={() => guardar(usuario.user_id, { role, active })}>{cambiado ? "Guardar" : "Sin cambios"}</button>
    </td>
  </tr>;
}
