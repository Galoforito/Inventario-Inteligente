import { describe, expect, it } from "vitest";
import { LOGO_SVG, NEGOCIO } from "../src/lib/negocio.js";
import { htmlOrden, totalOrden } from "../src/lib/orden-pdf.js";

const ORDEN = {
  folio: "OC-20261123-000042",
  estado: "enviada",
  created_at: "2026-11-20T18:00:00Z",
  sent_at: "2026-11-21T18:00:00Z",
  proveedores: { nombre: "Papelera del Centro", correo: "ventas@papelera.test", telefono: "55 1234 5678", lead_time_dias: 5 },
  orden_lineas: [
    { id: 1, product_code: "PROD-000003", product_name: "Bolígrafo azul", cantidad: 3, recibida: 0, costo_unitario: "0.10" },
    { id: 2, product_code: "PROD-000004", product_name: "Engrapadora", cantidad: 7, recibida: 2, costo_unitario: "12.35" },
  ],
};
const ahora = new Date("2026-11-23T12:00:00Z");

describe("orden en PDF", () => {
  const html = htmlOrden(ORDEN, NEGOCIO, LOGO_SVG, ahora);

  it("el total coincide con el de la pantalla, sin errores de redondeo", () => {
    expect(totalOrden(ORDEN)).toBe(86.75); // 3 × 0.10 + 7 × 12.35
    expect(html).toContain("$86.75");
    expect(html).toContain("$0.30");
    expect(html).toContain("$86.45");
  });

  it("incluye identidad del negocio, folio, fechas, estado y proveedor", () => {
    for (const texto of [NEGOCIO.razonSocial, NEGOCIO.rfc, NEGOCIO.direccion[0], ORDEN.folio, "Enviada",
      "Papelera del Centro", "ventas@papelera.test", "5 día(s) tras el envío"]) {
      expect(html).toContain(texto);
    }
    expect(html).toContain("<svg");
  });

  it("muestra cantidad y recibido de cada línea, partidas y unidades", () => {
    expect(html).toMatch(/PROD-000004<\/td><td>Engrapadora<\/td>\s*<td class="n">7<\/td><td class="n">2<\/td>/);
    expect(html).toMatch(/Partidas<\/span><span>2</);
    expect(html).toMatch(/Unidades<\/span><span>10</);
  });

  it("repite el encabezado de la tabla en cada página y numera las páginas", () => {
    expect(html).toContain("thead { display: table-header-group; }");
    expect(html).toContain('counter(page) " de " counter(pages)');
  });

  it("marca los borradores y los que aún no se envían", () => {
    const borrador = htmlOrden({ ...ORDEN, estado: "borrador", sent_at: null }, NEGOCIO, "", ahora);
    expect(borrador).toContain("BORRADOR");
    expect(borrador).toContain("Sin enviar");
    expect(html).not.toContain('class="marca-agua"');
  });

  it("escapa el texto de la base para no romper el documento", () => {
    const peligrosa = htmlOrden({ ...ORDEN, proveedores: { nombre: '<script>alert("x")</script>' } }, NEGOCIO, "", ahora);
    expect(peligrosa).not.toContain('<script>alert("x")');
    expect(peligrosa).toContain("&lt;script&gt;");
  });

  it("una orden sin líneas lo dice y suma cero", () => {
    const vacia = htmlOrden({ ...ORDEN, orden_lineas: [] }, NEGOCIO, "", ahora);
    expect(vacia).toContain("Esta orden no tiene líneas.");
    expect(vacia).toContain("$0.00");
  });
});
