import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Pagina from "../componentes/Pagina.jsx";
import { actualizarCantidadLinea, cerrarOrdenIncompleta, confirmarOrdenCompra, enviarOrdenProveedor, listarOrdenes, recibirLineaOrden, reportarEntregaIncompleta } from "../lib/api.js";
import { errorCantidad, minimoParaStock } from "../lib/compras.js";
import { fechaLocal } from "../lib/fechas.js";
import { dinero } from "../lib/dinero.js";
import { usePerfil } from "../lib/perfil.jsx";
import { LOGO_SVG, NEGOCIO } from "../lib/negocio.js";
import { htmlOrden, totalOrden } from "../lib/orden-pdf.js";
import Modal from "../componentes/Modal.jsx";

// Ventana para cambiar la cantidad de una línea mientras la orden es borrador.
function CambiarCantidad({ linea, ocupado, onGuardar, onCerrar }) {
  const producto = { stock_actual: linea.products?.stock_actual ?? 0, stock_minimo: linea.products?.stock_minimo ?? 0 };
  const [texto, setTexto] = useState(String(linea.cantidad));
  const error = errorCantidad(producto, texto);
  const codigo = linea.product_code ?? linea.products?.codigo;
  return (
    <Modal titulo="Cambiar cantidad" onCerrar={onCerrar} ocupado={ocupado}
      acciones={<>
        <button type="button" disabled={ocupado} onClick={onCerrar}>Cancelar</button>
        <button type="button" className="primary" disabled={ocupado || Boolean(error)} onClick={() => onGuardar(linea, Number(texto))}>
          {ocupado ? "Guardando…" : "Guardar cantidad"}
        </button>
      </>}>
      <p><span className="mono">{codigo}</span> · {linea.product_name ?? linea.products?.nombre}</p>
      {linea.products && <p className="muted">Stock {producto.stock_actual} / mínimo {producto.stock_minimo}. No se puede pedir menos de <strong>{minimoParaStock(producto)}</strong>.</p>}
      <label>Unidades a comprar
        <input type="number" min={minimoParaStock(producto)} step="1" inputMode="numeric" data-autofocus value={texto}
          aria-invalid={Boolean(error)} disabled={ocupado} onChange={(e) => setTexto(e.target.value)} />
      </label>
      {error && <small className="campo-error" role="alert">{error}</small>}
    </Modal>
  );
}

const CIERRES = {
  faltante_cancelado: {
    titulo: "El proveedor canceló el faltante",
    explicacion: "El proveedor no enviará las unidades que faltan. La orden se cierra con lo recibido y el stock no cambia.",
    boton: "Cerrar orden con lo recibido",
  },
  devuelta: {
    titulo: "Devolver lo recibido al proveedor",
    explicacion: "Se devuelven al proveedor las unidades recibidas: se restan del stock (salida con motivo «otro») y la orden queda cancelada.",
    boton: "Registrar devolución y cancelar",
  },
};

// Ventana para cerrar una orden incompleta ya reclamada: faltante cancelado o devolución.
function CierreIncompleta({ orden, tipo, ocupado, onConfirmar, onCerrar }) {
  const [nota, setNota] = useState("");
  const info = CIERRES[tipo];
  const lineas = orden.orden_lineas ?? [];
  const devueltas = lineas.reduce((s, l) => s + Number(l.recibida ?? 0), 0);
  return (
    <Modal titulo={info.titulo} onCerrar={onCerrar} ocupado={ocupado}
      acciones={<>
        <button type="button" disabled={ocupado} onClick={onCerrar}>Cancelar</button>
        <button type="button" className={tipo === "devuelta" ? "danger" : "primary"} data-autofocus disabled={ocupado} onClick={() => onConfirmar(orden, tipo, nota)}>
          {ocupado ? "Guardando…" : info.boton}
        </button>
      </>}>
      <p>Orden <strong>{orden.folio}</strong> · {orden.proveedores?.nombre}. {info.explicacion}</p>
      <div className="table-scroll">
        <table className="modal-tabla">
          <thead><tr><th>Producto</th><th className="num">Pedidas</th><th className="num">Recibidas</th><th className="num">{tipo === "devuelta" ? "Se devuelven" : "No llegarán"}</th></tr></thead>
          <tbody>{lineas.map((l) => (
            <tr key={l.id}>
              <td><span className="mono">{l.product_code ?? l.products?.codigo}</span><small className="sub">{l.product_name ?? l.products?.nombre}</small></td>
              <td className="num">{l.cantidad}</td><td className="num">{l.recibida}</td>
              <td className="num"><strong>{tipo === "devuelta" ? l.recibida : l.cantidad - l.recibida}</strong></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {tipo === "devuelta" && <p className="modal-nota">Se restarán {devueltas} unidad(es) del inventario.</p>}
      <label>Nota <small className="muted">(opcional, máximo 500 caracteres)</small>
        <textarea rows={2} maxLength={500} value={nota} disabled={ocupado} onChange={(e) => setNota(e.target.value)}
          placeholder={tipo === "devuelta" ? "Por ejemplo: mercancía dañada, se devolvió el 25/11." : "Por ejemplo: el proveedor ya no tiene existencias."} />
      </label>
      <p className="modal-nota">Esta acción cierra la orden y no se puede deshacer.</p>
    </Modal>
  );
}

// Ventana para confirmar el aviso de entrega incompleta, con lo que falta y una nota opcional.
function ReporteFaltante({ orden, ocupado, onEnviar, onCerrar }) {
  const [nota, setNota] = useState("");
  const faltantes = (orden.orden_lineas ?? []).filter((l) => l.recibida < l.cantidad);
  const valor = faltantes.reduce((s, l) => s + (l.cantidad - l.recibida) * Math.round(Number(l.costo_unitario) * 100), 0) / 100;
  return (
    <Modal titulo="Reportar entrega incompleta" onCerrar={onCerrar} ocupado={ocupado}
      acciones={<>
        <button type="button" disabled={ocupado} onClick={onCerrar}>Cancelar</button>
        <button type="button" className="danger" data-autofocus disabled={ocupado} onClick={() => onEnviar(orden, nota)}>
          {ocupado ? "Enviando…" : "Enviar aviso al proveedor"}
        </button>
      </>}>
      <p>Se enviará un correo a <strong>{orden.proveedores?.correo ?? "el proveedor"}</strong> ({orden.proveedores?.nombre}) avisando que la orden <strong>{orden.folio}</strong> llegó incompleta, y pidiéndole un curso de acción.</p>
      <div className="table-scroll">
        <table className="modal-tabla">
          <thead><tr><th>Producto</th><th className="num">Pedidas</th><th className="num">Recibidas</th><th className="num">Faltan</th></tr></thead>
          <tbody>{faltantes.map((l) => (
            <tr key={l.id}>
              <td><span className="mono">{l.product_code ?? l.products?.codigo}</span><small className="sub">{l.product_name ?? l.products?.nombre}</small></td>
              <td className="num">{l.cantidad}</td><td className="num">{l.recibida}</td><td className="num"><strong>{l.cantidad - l.recibida}</strong></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="muted">Valor pendiente: <strong>{dinero(valor)}</strong></p>
      <label>Nota para el proveedor <small className="muted">(opcional, máximo 500 caracteres)</small>
        <textarea rows={3} maxLength={500} value={nota} disabled={ocupado} onChange={(e) => setNota(e.target.value)}
          placeholder="Por ejemplo: necesitamos las unidades faltantes antes del viernes." />
      </label>
      <p className="modal-nota">Solo se puede enviar una vez por orden.</p>
    </Modal>
  );
}

function fechaOrden(orden) {
  const fecha = new Date(orden.created_at);
  if (Number.isNaN(fecha.getTime())) return "";
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
}

export default function Ordenes() {
  const perfil = usePerfil();
  const ubicacion = useLocation();
  const navegar = useNavigate();
  const [ordenes, setOrdenes] = useState([]);
  const [aviso, setAviso] = useState(ubicacion.state?.aviso ?? null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [estado, setEstado] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [producto, setProducto] = useState("");
  const [montoMinimo, setMontoMinimo] = useState("");
  const [montoMaximo, setMontoMaximo] = useState("");
  const [ordenar, setOrdenar] = useState("fecha_desc");
  const [reportando, setReportando] = useState(null); // orden cuyo faltante se va a reportar
  const [enviandoReporte, setEnviandoReporte] = useState(false);
  const cerrarReporte = useCallback(() => setReportando(null), []);
  const [editandoLinea, setEditandoLinea] = useState(null); // línea de borrador cuya cantidad se cambia
  const [cierre, setCierre] = useState(null);                // { orden, tipo } de la orden incompleta a cerrar
  const [guardando, setGuardando] = useState(false);
  const cerrarEdicion = useCallback(() => setEditandoLinea(null), []);
  const cerrarCierre = useCallback(() => setCierre(null), []);
  const puedeComprar = perfil.role === "admin" || perfil.role === "compras";
  const cargar = useCallback(() => listarOrdenes().then(setOrdenes).catch((e) => setAviso({ tipo: "error", texto: e.message })), []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    if (ubicacion.state?.aviso) navegar(".", { replace: true, state: null });
  }, [ubicacion.state, navegar]);

  const proveedores = useMemo(() => [...new Map(ordenes.map((o) => [String(o.proveedor_id), o.proveedores?.nombre ?? "Proveedor"])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "es")), [ordenes]);
  const productos = useMemo(() => {
    const lista = new Map();
    for (const orden of ordenes) for (const linea of orden.orden_lineas ?? []) {
      const codigo = linea.product_code ?? linea.products?.codigo ?? "";
      const nombre = linea.product_name ?? linea.products?.nombre ?? "Producto";
      if (codigo) lista.set(codigo, `${codigo} · ${nombre}`);
    }
    return [...lista.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [ordenes]);
  const ordenesVisibles = useMemo(() => ordenes.filter((o) => {
    const fecha = fechaOrden(o);
    const total = totalOrden(o);
    const lineas = o.orden_lineas ?? [];
    return (!desde || fecha >= desde)
      && (!hasta || fecha <= hasta)
      && (!estado || o.estado === estado)
      && (!proveedor || String(o.proveedor_id) === proveedor)
      && (!producto || lineas.some((l) => (l.product_code ?? l.products?.codigo) === producto))
      && (montoMinimo === "" || total >= Number(montoMinimo))
      && (montoMaximo === "" || total <= Number(montoMaximo));
  }).sort((a, b) => {
    if (ordenar.startsWith("fecha")) {
      const diferencia = Date.parse(a.created_at) - Date.parse(b.created_at);
      return ordenar === "fecha_asc" ? diferencia : -diferencia;
    }
    const diferencia = totalOrden(a) - totalOrden(b);
    return ordenar === "monto_asc" ? diferencia : -diferencia;
  }), [ordenes, desde, hasta, estado, proveedor, producto, montoMinimo, montoMaximo, ordenar]);

  async function recibir(linea) {
    const cantidad = Number(window.prompt(`Unidades pendientes: ${linea.cantidad - linea.recibida}`, String(linea.cantidad - linea.recibida)));
    if (!Number.isInteger(cantidad) || cantidad <= 0) return;
    try { await recibirLineaOrden(linea.id, cantidad); await cargar(); setAviso({ tipo: "success", texto: "Recepción registrada y stock actualizado." }); }
    catch (e) { setAviso({ tipo: "error", texto: e.message }); }
  }
  async function enviar(id) {
    try { const r = await enviarOrdenProveedor(id); await cargar(); setAviso({ tipo: r.status === "error" ? "error" : "info", texto: r.status === "simulado" ? "Envío simulado: no se contactó al proveedor. DEMO_MODE está activo." : `Orden ${r.status}; destinatario ${r.recipient ?? "registrado"}; ID ${r.message_id ?? "sin ID"}.` }); }
    catch (e) { setAviso({ tipo: "error", texto: e.message }); }
  }
  async function confirmar(orden) {
    if (!window.confirm(`Confirma solo si ${orden.proveedores?.nombre ?? "el proveedor"} aceptó surtir la orden ${orden.folio}.`)) return;
    try {
      await confirmarOrdenCompra(orden.id);
      await cargar();
      setAviso({ tipo: "success", texto: `La orden ${orden.folio} quedó confirmada. Almacén ya puede registrar la recepción.` });
    } catch (e) {
      setAviso({ tipo: "error", texto: e.message });
    }
  }
  // Avisa al proveedor qué faltó y le pide un curso de acción. Se hace a mano al terminar de recibir.
  async function reportarFaltante(orden, nota) {
    setEnviandoReporte(true);
    try {
      const r = await reportarEntregaIncompleta(orden.id, nota);
      await cargar();
      // Solo es "enviado" si el servidor lo confirma; cualquier otra respuesta se trata como problema.
      const texto = r?.status === "simulado" ? "Aviso de entrega incompleta simulado: DEMO_MODE está activo y no se contactó al proveedor."
        : r?.status === "enviado" ? `${r.reutilizada ? "Este aviso ya se había enviado" : "Aviso de entrega incompleta enviado"} a ${r.recipient ?? "el proveedor"}${r.message_id ? `; ID ${r.message_id}` : ""}.`
          : r?.status === "error" ? `No se pudo enviar el aviso: ${r.error ?? "error de correo"}. Puedes reintentarlo desde Historial de alertas.`
            : "No se confirmó el envío del aviso. La Edge Function revisar-inventario parece desactualizada: vuelve a desplegarla e inténtalo de nuevo.";
      setAviso({ tipo: r?.status === "enviado" ? "success" : r?.status === "simulado" ? "info" : "error", texto });
      setReportando(null);
    } catch (e) {
      setAviso({ tipo: "error", texto: e.message });
      setReportando(null);
    } finally {
      setEnviandoReporte(false);
    }
  }
  async function guardarCantidad(linea, cantidad) {
    setGuardando(true);
    try {
      await actualizarCantidadLinea(linea.id, cantidad);
      await cargar();
      setAviso({ tipo: "success", texto: `Cantidad de ${linea.product_code ?? linea.products?.codigo} actualizada a ${cantidad} unidad(es).` });
      setEditandoLinea(null);
    } catch (e) {
      setAviso({ tipo: "error", texto: e.message });
    } finally {
      setGuardando(false);
    }
  }
  async function cerrarIncompleta(orden, tipo, nota) {
    setGuardando(true);
    try {
      const r = await cerrarOrdenIncompleta(orden.id, tipo, nota);
      await cargar();
      setAviso({ tipo: "success", texto: tipo === "devuelta"
        ? `Orden ${orden.folio} cancelada: se devolvieron ${r?.unidades_devueltas ?? 0} unidad(es) y se restaron del stock.`
        : `Orden ${orden.folio} cerrada con lo recibido: el proveedor canceló el faltante.` });
      setCierre(null);
    } catch (e) {
      setAviso({ tipo: "error", texto: e.message });
    } finally {
      setGuardando(false);
    }
  }
  // Abre la orden con formato profesional en otra pestaña; desde ahí se guarda como PDF.
  function imprimir(orden) {
    const ventana = window.open("", "_blank");
    if (!ventana) { setAviso({ tipo: "error", texto: "Permite ventanas emergentes para imprimir la orden como PDF." }); return; }
    ventana.document.write(htmlOrden(orden, NEGOCIO, LOGO_SVG));
    ventana.document.close();
  }
  return <Pagina aviso={aviso} resumen={null}><div className="page-title"><div><h2>Órdenes de compra</h2><p>Selecciona varios productos en Dashboard para crear borradores agrupados por proveedor; cada producto solo puede estar en un borrador abierto.</p></div></div>
    {ordenes.length === 0 && <section className="card"><p>No hay órdenes. En Historial de alertas puedes generar un borrador desde una alerta.</p></section>}
    {ordenes.length > 0 && <section className="card order-filters" aria-label="Filtros de órdenes de compra">
      <label>Desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
      <label>Hasta<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
      <label>Estado<select value={estado} onChange={(e) => setEstado(e.target.value)}><option value="">Todos</option>{[...new Set(ordenes.map((o) => o.estado))].sort().map((e) => <option key={e} value={e}>{e}</option>)}</select></label>
      <label>Proveedor<select value={proveedor} onChange={(e) => setProveedor(e.target.value)}><option value="">Todos</option>{proveedores.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}</select></label>
      <label>Producto<select value={producto} onChange={(e) => setProducto(e.target.value)}><option value="">Todos</option>{productos.map(([codigo, nombre]) => <option key={codigo} value={codigo}>{nombre}</option>)}</select></label>
      <label>Monto mínimo<input type="number" min="0" step="0.01" value={montoMinimo} onChange={(e) => setMontoMinimo(e.target.value)} placeholder="$0.00" /></label>
      <label>Monto máximo<input type="number" min="0" step="0.01" value={montoMaximo} onChange={(e) => setMontoMaximo(e.target.value)} placeholder="Sin límite" /></label>
      <label>Ordenar por<select value={ordenar} onChange={(e) => setOrdenar(e.target.value)}>
        <option value="fecha_desc">Fecha: más reciente primero</option>
        <option value="fecha_asc">Fecha: más antigua primero</option>
        <option value="monto_asc">Monto: menor a mayor</option>
        <option value="monto_desc">Monto: mayor a menor</option>
      </select></label>
    </section>}
    {ordenes.length > 0 && ordenesVisibles.length === 0 && <section className="card"><p>No hay órdenes que coincidan con esos filtros.</p></section>}
    <div className="alert-list">{ordenesVisibles.map((o) => <article className="card" key={o.id}>
      <div className="alert-top"><h3>{o.folio} · {o.proveedores?.nombre}</h3><span className="badge">{o.estado}</span></div>
      <p>Creada: {fechaLocal(o.created_at)}</p>
      <p className="order-total"><strong>Monto final: {dinero(totalOrden(o))}</strong></p>
      <div className="title-actions">
        <button type="button" onClick={() => imprimir(o)}>Exportar a PDF</button>
        {(perfil.role === "admin" || perfil.role === "compras") && o.estado === "borrador" && <button type="button" onClick={() => enviar(o.id)}>Enviar al proveedor</button>}
        {(perfil.role === "admin" || perfil.role === "compras") && o.estado === "enviada" && <button type="button" onClick={() => confirmar(o)}>Confirmar pedido del proveedor</button>}
        {(perfil.role === "admin" || perfil.role === "compras") && o.estado === "recibida parcial" && !o.incompleta_alert_id && <button type="button" className="danger" onClick={() => setReportando(o)}>Reportar entrega incompleta</button>}
        {o.incompleta_alert_id && <span className="badge warn">Faltante reportado al proveedor</span>}
        {puedeComprar && o.estado === "recibida parcial" && o.incompleta_alert_id && <>
          <button type="button" onClick={() => setCierre({ orden: o, tipo: "faltante_cancelado" })}>Proveedor canceló el faltante</button>
          <button type="button" className="danger" onClick={() => setCierre({ orden: o, tipo: "devuelta" })}>Devolver lo recibido</button>
        </>}
      </div>
      {puedeComprar && o.estado === "recibida parcial" && o.incompleta_alert_id && <p className="muted">Faltante reclamado. Si el proveedor envía lo que falta, Almacén registra la recepción en cada línea; si no, cierra la orden con una de las opciones.</p>}
      {o.cierre_tipo && <p className="order-closure"><span className={`badge ${o.cierre_tipo === "devuelta" ? "low" : "warn"}`}>
        {o.cierre_tipo === "devuelta" ? "Devuelta al proveedor" : "Faltante cancelado por el proveedor"}</span>
        {o.cerrada_at && <span className="muted"> · {fechaLocal(o.cerrada_at)}</span>}{o.cierre_nota && <span> · {o.cierre_nota}</span>}</p>}
      {o.estado === "enviada" && <p className="muted">La recepción se habilita cuando Compras confirma que el proveedor aceptó la orden.</p>}
      <ul>{o.orden_lineas?.map((l) => <li key={l.id}>{l.product_code ?? l.products?.codigo} · {l.product_name ?? l.products?.nombre}: {l.recibida}/{l.cantidad} unidades
        {puedeComprar && o.estado === "borrador" && <button type="button" onClick={() => setEditandoLinea(l)}>Cambiar cantidad</button>}
        {(perfil.role === "admin" || perfil.role === "almacen") && ["confirmada", "recibida parcial"].includes(o.estado) && l.recibida < l.cantidad && <button type="button" onClick={() => recibir(l)}>Registrar recepción</button>}</li>)}</ul>
    </article>)}</div>
    {reportando && <ReporteFaltante orden={reportando} ocupado={enviandoReporte} onEnviar={reportarFaltante} onCerrar={cerrarReporte} />}
    {editandoLinea && <CambiarCantidad linea={editandoLinea} ocupado={guardando} onGuardar={guardarCantidad} onCerrar={cerrarEdicion} />}
    {cierre && <CierreIncompleta orden={cierre.orden} tipo={cierre.tipo} ocupado={guardando} onConfirmar={cerrarIncompleta} onCerrar={cerrarCierre} />}
  </Pagina>;
}
