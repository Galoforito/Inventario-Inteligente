import { describe, expect, it } from "vitest";
import { cantidadPropuesta, errorCantidad, minimoCompra, minimoParaStock } from "../src/lib/compras.js";

const p = (stock, minimo, sugerido = 0, proveedor = null) => ({ stock_actual: stock, stock_minimo: minimo, sugerido, proveedor_minimo_unidades: proveedor });

describe("cantidad al comprar", () => {
  it("el mínimo es lo que falta para llegar al stock mínimo, al menos 1", () => {
    expect(minimoParaStock(p(18, 30))).toBe(12);
    expect(minimoParaStock(p(0, 4))).toBe(4);
    expect(minimoParaStock(p(40, 30))).toBe(1); // en atención por cobertura, ya sobre el mínimo
  });

  it("respeta el mínimo de venta del proveedor si es mayor", () => {
    expect(minimoCompra(p(18, 30, 0, 20))).toBe(20);
    expect(minimoCompra(p(18, 30, 0, 5))).toBe(12);
  });

  it("propone la sugerida, nunca menos que el mínimo", () => {
    expect(cantidadPropuesta(p(18, 30, 25))).toBe(25);
    expect(cantidadPropuesta(p(18, 30, 3))).toBe(12);
  });

  it("explica por qué una cantidad no es válida", () => {
    expect(errorCantidad(p(18, 30), "11")).toMatch(/Mínimo 12: lo que falta para llegar al stock mínimo/);
    expect(errorCantidad(p(18, 30, 0, 20), "15")).toMatch(/Mínimo 20: es lo menos que vende el proveedor/);
    expect(errorCantidad(p(18, 30), "1.5")).toMatch(/entero/);
    expect(errorCantidad(p(18, 30), "")).toMatch(/entero/);
    expect(errorCantidad(p(18, 30), "12")).toBeNull();
  });
});
