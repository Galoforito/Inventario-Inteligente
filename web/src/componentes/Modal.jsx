import { useEffect, useRef } from "react";

// Ventana emergente de la app (en lugar de window.confirm/prompt del navegador).
// Se cierra con Escape, con "Cancelar" o al pulsar fuera; mientras está abierta
// el foco queda dentro de la ventana.
export default function Modal({ titulo, onCerrar, children, acciones, ocupado = false }) {
  const caja = useRef(null);

  useEffect(() => {
    const anterior = document.activeElement;
    const enfocables = () => [...(caja.current?.querySelectorAll("button, textarea, input, select, a[href]") ?? [])].filter((e) => !e.disabled);
    (caja.current?.querySelector("[data-autofocus]") ?? enfocables()[0])?.focus();
    const alTeclear = (evento) => {
      if (evento.key === "Escape" && !ocupado) onCerrar();
      if (evento.key !== "Tab") return;
      const lista = enfocables();
      if (lista.length === 0) return;
      const [primero, ultimo] = [lista[0], lista.at(-1)];
      if (evento.shiftKey && document.activeElement === primero) { evento.preventDefault(); ultimo.focus(); }
      else if (!evento.shiftKey && document.activeElement === ultimo) { evento.preventDefault(); primero.focus(); }
    };
    document.addEventListener("keydown", alTeclear);
    return () => { document.removeEventListener("keydown", alTeclear); anterior?.focus?.(); };
  }, [onCerrar, ocupado]);

  return (
    <div className="modal-fondo" onMouseDown={(e) => { if (e.target === e.currentTarget && !ocupado) onCerrar(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-titulo" ref={caja}>
        <div className="modal-cabecera">
          <h3 id="modal-titulo">{titulo}</h3>
          <button type="button" className="modal-cerrar" aria-label="Cerrar" disabled={ocupado} onClick={onCerrar}>×</button>
        </div>
        <div className="modal-cuerpo">{children}</div>
        <div className="modal-acciones">{acciones}</div>
      </div>
    </div>
  );
}
