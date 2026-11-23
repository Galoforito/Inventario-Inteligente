import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { crearPlantillaMovimientos, leerExcelMovimientos } from "../src/lib/excel.js";
import { ENCABEZADOS_MOVIMIENTOS, leerFecha, limpiarMovimiento, validarMovimientos } from "../src/lib/importar-movimientos.js";

const HOY = "2026-10-05";
const fila = (cambios = {}) => ({ codigo: "PROD-000001", fecha: "2026-10-01", tipo: "salida", motivo: "venta", cantidad: 3, ...cambios });

describe("leerFecha", () => {
  it("acepta fecha de Excel, AAAA-MM-DD y DD/MM/AAAA", () => {
    expect(leerFecha(new Date(Date.UTC(2026, 9, 1)))).toBe("2026-10-01");
    expect(leerFecha("2026-10-01")).toBe("2026-10-01");
    expect(leerFecha("1/10/2026")).toBe("2026-10-01");
  });
  it("rechaza fechas imposibles y formatos ambiguos", () => {
    expect(() => leerFecha("2026-02-30")).toThrow("no es una fecha válida");
    expect(() => leerFecha("10-01-2026")).toThrow("fecha:");
    expect(() => leerFecha(45000)).toThrow("fecha:");
  });
});

describe("limpiarMovimiento", () => {
  it("normaliza tipo y motivo, incluidas las etiquetas con acentos", () => {
    expect(limpiarMovimiento(fila({ tipo: "Entrada", motivo: "Compra o recepción", cantidad: "20" }), HOY))
      .toEqual({ codigo: "PROD-000001", fecha: "2026-10-01", tipo: "entrada", motivo: "compra", cantidad: 20 });
    expect(limpiarMovimiento(fila({ motivo: "Ajuste negativo" }), HOY).motivo).toBe("ajuste");
  });
  it("rechaza un motivo que no corresponde al tipo", () => {
    expect(() => limpiarMovimiento(fila({ tipo: "entrada", motivo: "venta" }), HOY)).toThrow("motivo: para una entrada");
    expect(() => limpiarMovimiento(fila({ tipo: "salida", motivo: "devolución" }), HOY)).toThrow("motivo: para una salida");
  });
  it("rechaza fecha futura, cantidad cero o decimal y tipo desconocido", () => {
    expect(() => limpiarMovimiento(fila({ fecha: "2026-10-06" }), HOY)).toThrow("fecha futura");
    expect(limpiarMovimiento(fila({ fecha: HOY }), HOY).fecha).toBe(HOY);
    expect(() => limpiarMovimiento(fila({ cantidad: 0 }), HOY)).toThrow("mayor que cero");
    expect(() => limpiarMovimiento(fila({ cantidad: 1.5 }), HOY)).toThrow("cantidad:");
    expect(() => limpiarMovimiento(fila({ tipo: "traspaso" }), HOY)).toThrow("tipo:");
  });
});

describe("validarMovimientos", () => {
  const encabezado = ENCABEZADOS_MOVIMIENTOS;

  it("devuelve las filas con su número de fila de Excel y salta las vacías", () => {
    const r = validarMovimientos([encabezado, ["A", "2026-10-01", "salida", "venta", 2], [], ["A", "2026-10-02", "salida", "venta", 2]], HOY);
    expect(r.map((m) => m.fila)).toEqual([2, 4]);
  });

  it("conserva las filas idénticas: la base decide cuáles ya se importaron", () => {
    const r = validarMovimientos([encabezado, ["A", "2026-10-01", "salida", "venta", 2], ["A", "2026-10-01", "salida", "venta", 2]], HOY);
    expect(r).toHaveLength(2);
  });

  it("junta todos los errores con su fila y no devuelve nada", () => {
    expect(() => validarMovimientos([encabezado, ["", "2026-10-01", "salida", "venta", 2], ["A", "2026-13-01", "salida", "venta", 2]], HOY))
      .toThrow(/Fila 2: codigo: .*\nFila 3: fecha:/);
  });

  it("exige el encabezado exacto, sin importar mayúsculas", () => {
    expect(validarMovimientos([["Codigo", "FECHA", "tipo", "motivo", "cantidad"], ["A", "2026-10-01", "salida", "venta", 1]], HOY)).toHaveLength(1);
    expect(() => validarMovimientos([["codigo", "tipo", "fecha", "motivo", "cantidad"]], HOY)).toThrow("La primera fila debe contener");
    expect(() => validarMovimientos([encabezado], HOY)).toThrow("no contiene movimientos");
  });
});

describe("Excel de movimientos", () => {
  it("la plantilla se puede importar tal como se descarga", async () => {
    const items = await leerExcelMovimientos(await crearPlantillaMovimientos("PROD-000007", HOY), HOY);
    expect(items).toEqual([
      { fila: 2, codigo: "PROD-000007", fecha: HOY, tipo: "entrada", motivo: "compra", cantidad: 20 },
      { fila: 3, codigo: "PROD-000007", fecha: HOY, tipo: "salida", motivo: "venta", cantidad: 3 },
    ]);
  });

  it("lee fechas guardadas como fecha de Excel", async () => {
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet("M");
    hoja.addRow(ENCABEZADOS_MOVIMIENTOS);
    hoja.addRow(["B", new Date(Date.UTC(2026, 8, 30)), "entrada", "devolucion", 4]);
    const [m] = await leerExcelMovimientos(await libro.xlsx.writeBuffer(), HOY);
    expect(m).toMatchObject({ fecha: "2026-09-30", motivo: "devolucion" });
  });
});
