import { useEffect, useMemo, useRef, useState } from "react";
import Pagina from "../componentes/Pagina.jsx";
import SelectorBuscable from "../componentes/SelectorBuscable.jsx";
import { eliminarProveedor, guardarProveedor, listarAsignacionesProductos, listarProveedores, vincularProductoProveedor } from "../lib/api.js";
import { usePerfil } from "../lib/perfil.jsx";

export default function Proveedores() {
  const perfil = usePerfil();
  const puedeGestionar = perfil.role === "admin" || perfil.role === "compras";
  const [lista, setLista] = useState([]);
  const [productos, setProductos] = useState([]);
  const [relaciones, setRelaciones] = useState([]);
  const [aviso, setAviso] = useState(null);
  const [proveedorId, setProveedorId] = useState("");
  const [productoId, setProductoId] = useState("");
  const [costoUnitario, setCostoUnitario] = useState("0");
  const [minimoUnidades, setMinimoUnidades] = useState("1");
  const [proveedorEditando, setProveedorEditando] = useState(null);
  const [vista, setVista] = useState("activos");
  const [buscarAsignacion, setBuscarAsignacion] = useState("");
  const [filtrarAsignacion, setFiltrarAsignacion] = useState("");
  const [filtrarProveedorAsignacion, setFiltrarProveedorAsignacion] = useState("");
  const [ordenAsignacion, setOrdenAsignacion] = useState("producto_asc");
  const [ocupado, setOcupado] = useState(false);
  const [accionId, setAccionId] = useState(null);
  const asignarRef = useRef(null);
  const activos = lista.filter((p) => p.activo !== false);
  const archivados = lista.filter((p) => p.activo === false);
  const visibles = vista === "activos" ? activos : archivados;
  const asignaciones = new Map();
  for (const relacion of relaciones) {
    const actual = asignaciones.get(relacion.product_id);
    if (!actual || (actual.proveedores?.activo === false && relacion.proveedores?.activo !== false)) {
      asignaciones.set(relacion.product_id, relacion);
    }
  }
  const sinProveedor = productos.filter((p) => asignaciones.get(p.id)?.proveedores?.activo !== true);
  const proveedoresAsignados = useMemo(() => [...new Map(relaciones.map((r) => [String(r.proveedor_id), r.proveedores?.nombre ?? "Proveedor"])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "es")), [relaciones]);
  const asignacionesVisibles = useMemo(() => {
    const consulta = buscarAsignacion.trim().toLocaleLowerCase("es");
    return productos.map((producto) => {
      const relacion = asignaciones.get(producto.id);
      const activo = relacion?.proveedores?.activo === true;
      return { producto, relacion, activo };
    }).filter(({ producto, relacion, activo }) => {
      const texto = [producto.codigo, producto.nombre, relacion?.proveedores?.nombre].filter(Boolean).join(" ").toLocaleLowerCase("es");
      return (!consulta || texto.includes(consulta))
        && (!filtrarAsignacion || (filtrarAsignacion === "asignado" ? activo : !activo))
        && (!filtrarProveedorAsignacion || (filtrarProveedorAsignacion === "sin-proveedor" ? !activo : String(relacion?.proveedor_id) === filtrarProveedorAsignacion && activo));
    }).sort((a, b) => {
      if (ordenAsignacion.startsWith("producto")) {
        const cmp = a.producto.nombre.localeCompare(b.producto.nombre, "es", { sensitivity: "base" }) || a.producto.codigo.localeCompare(b.producto.codigo, "es");
        return ordenAsignacion === "producto_asc" ? cmp : -cmp;
      }
      if (ordenAsignacion.startsWith("proveedor")) {
        const nombreA = a.activo ? a.relacion.proveedores.nombre : "";
        const nombreB = b.activo ? b.relacion.proveedores.nombre : "";
        const cmp = nombreA.localeCompare(nombreB, "es", { sensitivity: "base" }) || a.producto.nombre.localeCompare(b.producto.nombre, "es");
        return ordenAsignacion === "proveedor_asc" ? cmp : -cmp;
      }
      const sinMinimoA = a.relacion?.minimo_unidades == null;
      const sinMinimoB = b.relacion?.minimo_unidades == null;
      if (sinMinimoA !== sinMinimoB) return sinMinimoA ? 1 : -1;
      const minimoA = Number(a.relacion?.minimo_unidades ?? Number.POSITIVE_INFINITY);
      const minimoB = Number(b.relacion?.minimo_unidades ?? Number.POSITIVE_INFINITY);
      const cmp = minimoA - minimoB || a.producto.nombre.localeCompare(b.producto.nombre, "es");
      return ordenAsignacion === "minimo_asc" ? cmp : -cmp;
    });
  }, [productos, relaciones, buscarAsignacion, filtrarAsignacion, filtrarProveedorAsignacion, ordenAsignacion]);

  async function cargar() {
    const [proveedores, catalogo] = await Promise.all([
      listarProveedores(),
      listarAsignacionesProductos(),
    ]);
    setLista(proveedores);
    setProductos(catalogo.productos);
    setRelaciones(catalogo.relaciones);
  }

  useEffect(() => {
    cargar().catch((e) => setAviso({ tipo: "error", texto: e.message }));
  }, []);

  async function guardar(evento) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const f = new FormData(evento.currentTarget);
    const editando = proveedorEditando;
    setOcupado(true);
    try {
      await guardarProveedor({
        nombre: f.get("nombre"),
        correo: f.get("correo"),
        telefono: f.get("telefono"),
        lead_time_dias: Number(f.get("lead_time_dias")),
      }, editando?.id ?? null);
      await cargar();
      formulario.reset();
      setProveedorEditando(null);
      setAviso({ tipo: "success", texto: editando ? "Proveedor actualizado." : "Proveedor registrado." });
    } catch (e) {
      setAviso({ tipo: "error", texto: e.message });
    } finally {
      setOcupado(false);
    }
  }

  async function vincular(evento) {
    evento.preventDefault();
    const f = new FormData(evento.currentTarget);
    setOcupado(true);
    try {
      await vincularProductoProveedor(Number(f.get("proveedor_id")), Number(f.get("product_id")), Number(f.get("costo_unitario")), Number(f.get("minimo_unidades")));
      await cargar();
      setAviso({ tipo: "success", texto: "Proveedor asignado al producto." });
    } catch (e) {
      setAviso({ tipo: "error", texto: e.message });
    } finally {
      setOcupado(false);
    }
  }

  function seleccionarProducto(p) {
    if (!p) {
      setProductoId("");
      setProveedorId("");
      setCostoUnitario("0");
      setMinimoUnidades("1");
      return;
    }
    const relacion = asignaciones.get(p.id);
    setProductoId(String(p.id));
    setProveedorId(relacion?.proveedores?.activo ? String(relacion.proveedor_id) : "");
    setCostoUnitario(String(relacion?.costo_unitario ?? 0));
    setMinimoUnidades(String(relacion?.minimo_unidades ?? 1));
    asignarRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }

  async function cambiarEstado(p, activo) {
    setAccionId(p.id);
    try {
      await guardarProveedor({ activo }, p.id);
      await cargar();
      if (!activo && String(proveedorId) === String(p.id)) setProveedorId("");
      setVista(activo ? "activos" : "archivados");
      setAviso({ tipo: "success", texto: activo ? `${p.nombre} está activo otra vez.` : `${p.nombre} quedó archivado.` });
    } catch (e) {
      setAviso({ tipo: "error", texto: e.message });
    } finally {
      setAccionId(null);
    }
  }

  async function eliminar(p) {
    if (perfil.role !== "admin") return;
    if (!window.confirm(`¿Eliminar a ${p.nombre}? Si tiene órdenes, se archivará para conservar el historial.`)) return;
    setAccionId(p.id);
    try {
      const resultado = await eliminarProveedor(p.id);
      await cargar();
      if (String(proveedorId) === String(p.id)) setProveedorId("");
      if (resultado.archivado) setVista("archivados");
      setAviso({
        tipo: "success",
        texto: resultado.archivado
          ? `${p.nombre} tenía órdenes asociadas y se archivó para conservar el historial.`
          : `${p.nombre} se eliminó.`,
      });
    } catch (e) {
      setAviso({ tipo: "error", texto: e.message });
    } finally {
      setAccionId(null);
    }
  }

  function editar(p) {
    setProveedorEditando(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return <Pagina aviso={aviso} resumen={null}>
    <div className="page-title"><div><h2>Proveedores</h2><p>Contactos, plazo de entrega y catálogo de productos surtidos.</p></div></div>
    <div className="two-columns">
      {puedeGestionar && <form key={proveedorEditando?.id ?? "nuevo"} className="card form-card" onSubmit={guardar}>
        <h3>{proveedorEditando ? `Editar proveedor: ${proveedorEditando.nombre}` : "Registrar proveedor"}</h3>
        <label>Nombre<input name="nombre" maxLength="160" defaultValue={proveedorEditando?.nombre ?? ""} required /></label>
        <label>Correo<input type="email" name="correo" defaultValue={proveedorEditando?.correo ?? ""} required /></label>
        <label>Teléfono<input name="telefono" defaultValue={proveedorEditando?.telefono ?? ""} /></label>
        <label>Plazo de entrega (días)<input type="number" min="0" max="365" name="lead_time_dias" defaultValue={proveedorEditando?.lead_time_dias ?? 7} required /></label>
        <div className="provider-form-actions">
          <button className="primary" disabled={ocupado}>{proveedorEditando ? "Guardar cambios" : "Registrar proveedor"}</button>
          {proveedorEditando && <button type="button" disabled={ocupado} onClick={() => setProveedorEditando(null)}>Cancelar edición</button>}
        </div>
      </form>}
      {puedeGestionar && <form ref={asignarRef} className="card form-card" onSubmit={vincular}>
        <h3>Asignar producto</h3>
        <p>{sinProveedor.length} de {productos.length} productos no tienen proveedor activo. Seleccionar un producto ya asignado cambia su proveedor.</p>
        <SelectorBuscable etiqueta="Proveedor" nombre="proveedor_id" requerido valor={proveedorId}
          placeholder="Escribe el nombre del proveedor…"
          onCambio={(valor) => {
            const actual = asignaciones.get(Number(productoId));
            if (actual && valor && valor !== String(actual.proveedor_id)) {
              setCostoUnitario("");
              setMinimoUnidades("1");
            }
            setProveedorId(valor);
          }}
          opciones={activos.map((p) => ({ valor: p.id, texto: p.nombre, detalle: p.correo }))} />
        <SelectorBuscable etiqueta="Producto" nombre="product_id" requerido valor={productoId}
          placeholder="Escribe código o nombre del producto…"
          onCambio={(valor) => seleccionarProducto(productos.find((p) => String(p.id) === valor))}
          opciones={productos.map((p) => {
            const actual = asignaciones.get(p.id);
            return { valor: p.id, texto: `${p.codigo} — ${p.nombre}`,
              detalle: actual?.proveedores?.activo ? `Proveedor: ${actual.proveedores.nombre}` : "Sin proveedor activo" };
          })} />
        <label>Costo unitario ($)<input name="costo_unitario" type="number" min="0" step="0.01" value={costoUnitario} onChange={(e) => setCostoUnitario(e.target.value)} required /></label>
        <label>Mínimo de unidades<input name="minimo_unidades" type="number" min="1" value={minimoUnidades} onChange={(e) => setMinimoUnidades(e.target.value)} required /></label>
        <button className="primary" disabled={ocupado || !proveedorId || !productoId}>Guardar asignación</button>
      </form>}
    </div>

    <section className="card provider-table-card">
      <div className="provider-table-head">
        <div><h3>Directorio de proveedores</h3><p>Administra los datos y el estado de cada proveedor.</p></div>
        <label>Mostrar
          <select aria-label="Mostrar proveedores" value={vista} onChange={(e) => setVista(e.target.value)}>
            <option value="activos">Activos ({activos.length})</option>
            <option value="archivados">Archivados ({archivados.length})</option>
          </select>
        </label>
      </div>
      {visibles.length === 0 ? <p className="provider-empty">No hay proveedores {vista === "activos" ? "activos" : "archivados"}.</p>
        : <div className="table-scroll"><table className="providers-table">
          <thead><tr><th>Proveedor</th><th>Correo</th><th>Teléfono</th><th>Entrega</th><th>Estado</th>{puedeGestionar && <th>Acciones</th>}</tr></thead>
          <tbody>{visibles.map((p) => <tr key={p.id}>
            <td data-etiqueta="Proveedor"><strong>{p.nombre}</strong></td>
            <td data-etiqueta="Correo">{p.correo}</td>
            <td data-etiqueta="Teléfono">{p.telefono || "—"}</td>
            <td data-etiqueta="Entrega">{p.lead_time_dias} días</td>
            <td data-etiqueta="Estado"><span className={`badge ${p.activo ? "ok" : "muted"}`}>{p.activo ? "Activo" : "Archivado · inactivo"}</span></td>
            {puedeGestionar && <td data-etiqueta="Acciones"><div className="provider-actions">
              <button type="button" disabled={accionId === p.id || ocupado} onClick={() => editar(p)}>Editar</button>
              <button type="button" disabled={accionId === p.id} onClick={() => cambiarEstado(p, !p.activo)}>{p.activo ? "Archivar" : "Reactivar"}</button>
              {perfil.role === "admin" && <button type="button" className="danger" disabled={accionId === p.id} onClick={() => eliminar(p)}>Eliminar</button>}
            </div></td>}
          </tr>)}</tbody>
        </table></div>}
    </section>
    <section className="card provider-table-card">
      <div className="provider-table-head">
        <div><h3>Proveedor asignado por producto</h3><p>La orden rápida requiere un proveedor activo asignado. “Mínimo de unidades” es la cantidad mínima sugerida para ordenar este producto con su proveedor.</p></div>
        <span>{productos.length - sinProveedor.length} asignados - {sinProveedor.length} pendientes</span>
      </div>
      {productos.length === 0 ? <p className="provider-empty">No hay productos registrados.</p>
        : <>
          <div className="provider-assignment-filters" aria-label="Filtros de proveedor asignado por producto">
            <label>Buscar producto o proveedor<input type="search" aria-label="Buscar producto o proveedor" value={buscarAsignacion} onChange={(e) => setBuscarAsignacion(e.target.value)} placeholder="Nombre o código SKU" /></label>
            <label>Asignación<select aria-label="Filtrar por asignación" value={filtrarAsignacion} onChange={(e) => setFiltrarAsignacion(e.target.value)}>
              <option value="">Todos</option><option value="asignado">Con proveedor activo</option><option value="pendiente">Sin proveedor activo</option>
            </select></label>
            <label>Proveedor<select aria-label="Filtrar por proveedor asignado" value={filtrarProveedorAsignacion} onChange={(e) => setFiltrarProveedorAsignacion(e.target.value)}>
              <option value="">Todos</option><option value="sin-proveedor">Sin proveedor activo</option>{proveedoresAsignados.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
            </select></label>
            <label>Ordenar por<select aria-label="Ordenar asignaciones" value={ordenAsignacion} onChange={(e) => setOrdenAsignacion(e.target.value)}>
              <option value="producto_asc">Producto: A–Z</option><option value="producto_desc">Producto: Z–A</option>
              <option value="proveedor_asc">Proveedor: A–Z</option><option value="proveedor_desc">Proveedor: Z–A</option>
              <option value="minimo_asc">Mínimo de unidades: menor a mayor</option><option value="minimo_desc">Mínimo de unidades: mayor a menor</option>
            </select></label>
          </div>
          {asignacionesVisibles.length === 0 ? <p className="provider-empty">Ningún producto coincide con los filtros.</p> : <div className="table-scroll"><table className="providers-table">
          <thead><tr><th>Producto</th><th>Proveedor actual</th><th>Mínimo de unidades</th><th>Estado</th>{puedeGestionar && <th>Acciones</th>}</tr></thead>
          <tbody>{asignacionesVisibles.map(({ producto: p, relacion, activo }) => {
            return <tr key={p.id}>
              <td data-etiqueta="Producto"><strong>{p.nombre}</strong><small className="sub">{p.codigo}</small></td>
              <td data-etiqueta="Proveedor actual">{activo ? relacion.proveedores.nombre : <span className="muted">Sin proveedor activo</span>}</td>
              <td data-etiqueta="Mínimo de unidades">{relacion?.minimo_unidades ?? "—"}</td>
              <td data-etiqueta="Estado"><span className={`badge ${activo ? "ok" : "warn"}`}>{activo ? "Asignado" : "Pendiente"}</span></td>
              {puedeGestionar && <td data-etiqueta="Acciones"><button type="button" onClick={() => seleccionarProducto(p)}>{activo ? "Cambiar" : "Asignar"}</button></td>}
            </tr>;
          })}</tbody>
        </table></div>}
        </>}
    </section>
  </Pagina>;
}
