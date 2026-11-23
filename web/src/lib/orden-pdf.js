// Orden de compra imprimible (Imprimir → Guardar como PDF). Función pura: recibe
// la orden tal como la devuelve listarOrdenes() y los datos del negocio, y
// devuelve el HTML completo. El total sale de las mismas líneas que la pantalla.
import { dinero } from "./dinero.js";

const ESTADOS = {
  borrador: "Borrador",
  enviada: "Enviada",
  confirmada: "Confirmada",
  "recibida parcial": "Recibida parcial",
  recibida: "Recibida",
  cancelada: "Cancelada",
};

/** Total de la orden en centavos exactos (cantidad × costo de cada línea). */
export const totalOrden = (orden) => (orden.orden_lineas ?? []).reduce(
  (centavos, linea) => centavos + Number(linea.cantidad ?? 0) * Math.round(Number(linea.costo_unitario ?? 0) * 100), 0,
) / 100;

const escapar = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function fechaLarga(valor) {
  if (!valor) return null;
  const fecha = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return null;
  return fecha.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
}

/** Entrega estimada: la registrada; si no, envío (o creación) + días de entrega del proveedor. */
function entregaEstimada(orden) {
  if (orden.expected_at) return fechaLarga(orden.expected_at);
  if (orden.proveedores?.lead_time_dias == null) return null;
  const dias = Number(orden.proveedores.lead_time_dias);
  const base = new Date(orden.sent_at ?? orden.created_at);
  if (Number.isNaN(base.getTime())) return null;
  return `${fechaLarga(new Date(base.getTime() + dias * 86400000))} (aprox.)`;
}

export function htmlOrden(orden, negocio, logoSvg = "", ahora = new Date()) {
  const lineas = orden.orden_lineas ?? [];
  const proveedor = orden.proveedores ?? {};
  const total = totalOrden(orden);
  const unidades = lineas.reduce((s, l) => s + Number(l.cantidad ?? 0), 0);
  const estado = ESTADOS[orden.estado] ?? orden.estado ?? "";
  const filas = lineas.map((l, i) => {
    const codigo = l.product_code ?? l.products?.codigo;
    const nombre = l.product_name ?? l.products?.nombre;
    const subtotal = (Number(l.cantidad) * Math.round(Number(l.costo_unitario) * 100)) / 100;
    return `<tr>
      <td class="c">${i + 1}</td><td class="mono">${escapar(codigo)}</td><td>${escapar(nombre)}</td>
      <td class="n">${Number(l.cantidad)}</td><td class="n">${Number(l.recibida ?? 0)}</td>
      <td class="n">${dinero(l.costo_unitario)}</td><td class="n">${dinero(subtotal)}</td></tr>`;
  }).join("");
  const dato = (etiqueta, valor) => (valor ? `<div><dt>${etiqueta}</dt><dd>${escapar(valor)}</dd></div>` : "");

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${escapar(orden.folio)} · Orden de compra</title>
<style>
  @page { size: letter; margin: 16mm 14mm 18mm;
    @bottom-left { content: "${escapar(orden.folio)} · ${escapar(negocio.nombreComercial)}"; font: 8pt Arial, sans-serif; color: #6b6b6b; }
    @bottom-right { content: "Página " counter(page) " de " counter(pages); font: 8pt Arial, sans-serif; color: #6b6b6b; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: #e9ebef; color: #1b1f27; font: 10pt/1.45 Arial, Helvetica, sans-serif; }
  .hoja { position: relative; overflow: hidden; width: 216mm; min-height: 279mm; margin: 12mm auto; padding: 16mm 14mm; background: #fff; box-shadow: 0 4px 24px #0002; }
  .barra { position: sticky; top: 0; display: flex; justify-content: center; gap: 12px; padding: 10px; background: #0f1b33; color: #fff; font-size: 10pt; }
  .barra button { font: inherit; font-weight: 700; padding: 6px 16px; border: 0; border-radius: 6px; background: #f5b82e; color: #0f1b33; cursor: pointer; }
  header { display: flex; justify-content: space-between; gap: 18px; padding-bottom: 12px; border-bottom: 3px solid #0f1b33; }
  .marca { display: flex; gap: 12px; align-items: flex-start; }
  .marca svg { width: 56px; height: 56px; flex: none; }
  .marca h1 { margin: 0 0 2px; font-size: 15pt; color: #0f1b33; }
  .marca p { margin: 0; font-size: 8.5pt; color: #4a4f5a; }
  .titulo { text-align: right; }
  .titulo h2 { margin: 0; font-size: 17pt; letter-spacing: .08em; color: #0f1b33; }
  .titulo .folio { margin: 4px 0 6px; font: 700 12pt "Courier New", monospace; }
  .titulo dl { margin: 0; display: grid; grid-template-columns: auto auto; gap: 1px 10px; font-size: 8.5pt; justify-content: end; }
  .titulo dt { color: #6b6b6b; } .titulo dd { margin: 0; font-weight: 700; }
  .estado { display: inline-block; padding: 2px 10px; border: 1.5px solid #0f1b33; border-radius: 99px; font-size: 8.5pt; font-weight: 700; }
  .bloques { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 14px 0; }
  .bloque { border: 1px solid #cfd3db; border-radius: 6px; padding: 9px 11px; break-inside: avoid; }
  .bloque h3 { margin: 0 0 5px; font-size: 8pt; letter-spacing: .1em; text-transform: uppercase; color: #6b6b6b; }
  .bloque dl { margin: 0; } .bloque div { display: flex; gap: 6px; } .bloque dt { color: #6b6b6b; min-width: 72px; } .bloque dd { margin: 0; }
  .bloque .grande { font-weight: 700; font-size: 11pt; margin-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  thead { display: table-header-group; }
  th { background: #0f1b33; color: #fff; font-size: 8pt; text-transform: uppercase; letter-spacing: .05em; padding: 6px 7px; text-align: left; }
  td { padding: 6px 7px; border-bottom: 1px solid #e1e4ea; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #f6f7f9; }
  tr { break-inside: avoid; }
  .n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; } th.n { text-align: right; }
  .c { text-align: center; color: #6b6b6b; } .mono { font-family: "Courier New", monospace; white-space: nowrap; }
  .pie-tabla { display: flex; justify-content: space-between; gap: 18px; margin-top: 12px; break-inside: avoid; }
  .notas { font-size: 8.5pt; color: #4a4f5a; max-width: 60%; } .notas p { margin: 0 0 4px; }
  .totales { min-width: 220px; } .totales div { display: flex; justify-content: space-between; padding: 3px 0; }
  .totales .total { border-top: 2px solid #0f1b33; margin-top: 4px; padding-top: 6px; font-size: 13pt; font-weight: 700; color: #0f1b33; }
  .firmas { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 34px; break-inside: avoid; }
  .firma { text-align: center; font-size: 8.5pt; } .firma .linea { border-top: 1px solid #1b1f27; margin: 40px 6px 4px; }
  .firma strong { display: block; } .firma span { color: #6b6b6b; }
  .generado { margin-top: 18px; font-size: 7.5pt; color: #8a8f99; text-align: center; }
  .marca-agua { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; font: 700 72pt Arial, sans-serif; color: #0f1b330d; transform: rotate(-24deg); }
  @media print {
    body { background: #fff; }
    .barra { display: none; }
    .hoja { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; }
    .marca-agua { position: fixed; }
  }
</style></head>
<body>
<div class="barra"><span>Vista previa de la orden ${escapar(orden.folio)}</span><button type="button" onclick="window.print()">Imprimir / Guardar como PDF</button></div>
<main class="hoja">
  ${orden.estado === "borrador" ? '<div class="marca-agua" aria-hidden="true">BORRADOR</div>' : ""}
  <header>
    <div class="marca">${logoSvg}
      <div><h1>${escapar(negocio.nombreComercial)}</h1>
        <p>${escapar(negocio.razonSocial)}</p>
        <p>RFC: <strong>${escapar(negocio.rfc)}</strong></p>
        ${(negocio.direccion ?? []).map((linea) => `<p>${escapar(linea)}</p>`).join("")}
        <p>Tel. ${escapar(negocio.telefono)} · ${escapar(negocio.correo)}</p></div>
    </div>
    <div class="titulo">
      <h2>ORDEN DE COMPRA</h2>
      <div class="folio">${escapar(orden.folio)}</div>
      <dl>
        <dt>Fecha de emisión</dt><dd>${escapar(fechaLarga(orden.created_at) ?? "—")}</dd>
        <dt>Fecha de envío</dt><dd>${escapar(fechaLarga(orden.sent_at) ?? "Sin enviar")}</dd>
        <dt>Estado</dt><dd><span class="estado">${escapar(estado)}</span></dd>
      </dl>
    </div>
  </header>

  <section class="bloques">
    <div class="bloque"><h3>Proveedor</h3><dl>
      <div class="grande">${escapar(proveedor.nombre ?? "Proveedor")}</div>
      ${dato("Correo", proveedor.correo)}${dato("Teléfono", proveedor.telefono)}
      ${dato("Entrega", proveedor.lead_time_dias != null ? `${proveedor.lead_time_dias} día(s) tras el envío` : null)}
    </dl></div>
    <div class="bloque"><h3>Entregar en</h3><dl>
      <div class="grande">${escapar(negocio.nombreComercial)}</div>
      ${(negocio.direccion ?? []).map((linea) => `<div><dd>${escapar(linea)}</dd></div>`).join("")}
      ${dato("Entrega estimada", entregaEstimada(orden))}
    </dl></div>
  </section>

  <table>
    <thead><tr><th class="c">#</th><th>SKU</th><th>Producto</th><th class="n">Cantidad</th><th class="n">Recibido</th><th class="n">Costo unitario</th><th class="n">Subtotal</th></tr></thead>
    <tbody>${filas || '<tr><td colspan="7">Esta orden no tiene líneas.</td></tr>'}</tbody>
  </table>

  <div class="pie-tabla">
    <div class="notas">
      <p><strong>Condiciones de pago:</strong> ${escapar(negocio.condicionesPago)}</p>
      <p><strong>Instrucciones de entrega:</strong> ${escapar(negocio.instruccionesEntrega)}</p>
      <p>${escapar(negocio.notaImportes)}</p>
    </div>
    <div class="totales">
      <div><span>Partidas</span><span>${lineas.length}</span></div>
      <div><span>Unidades</span><span>${unidades}</span></div>
      <div class="total"><span>Total</span><span>${dinero(total)}</span></div>
    </div>
  </div>

  <section class="firmas">
    <div class="firma"><div class="linea"></div><strong>${escapar(negocio.responsableCompras?.nombre)}</strong><span>${escapar(negocio.responsableCompras?.puesto)} · Elaboró</span></div>
    <div class="firma"><div class="linea"></div><strong>Nombre y firma</strong><span>Autorizó</span></div>
    <div class="firma"><div class="linea"></div><strong>Nombre, firma y fecha</strong><span>Recibió en almacén</span></div>
  </section>

  <p class="generado">Generado el ${escapar(fechaLarga(ahora))} desde Control inteligente de inventario.</p>
</main>
<script>window.addEventListener("load", () => window.print());</script>
</body></html>`;
}
