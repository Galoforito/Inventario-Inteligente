# Evidencia de alertas

## Alertas reales de stock

Verificación de solo lectura en Supabase producción `Inventario`, el 2026-11-23. Hay **9** alertas `stock_bajo` con estado `enviado`, cada una con un `message_id` SMTP distinto; se muestran tres ejemplos. Los destinatarios e IDs están redactados.

| # | Detección (hora CDMX) | Envío (hora CDMX) | ID SMTP redactado | Destinatario redactado | Estado | Intentos | Segundos detección→envío |
|---:|---|---|---|---|---|---:|---:|
| 1 | 2026-11-18 19:52:00.621 | 2026-11-18 19:52:02.118 | `<1f32738…` | `g***@iest.edu.mx` | `enviado` | 1 | 1.50 |
| 2 | 2026-11-20 09:26:00.335 | 2026-11-20 09:26:02.234 | `<20caeda…` | `g***@iest.edu.mx` | `enviado` | 1 | 1.90 |
| 3 | 2026-11-20 11:25:00.452 | 2026-11-20 11:25:02.486 | `<7ce5e84…` | `g***@iest.edu.mx` | `enviado` | 1 | 2.03 |

Los secretos `ALERT_TO`, `APP_URL` y `SMTP_*` están configurados en Supabase; este documento no incluye valores secretos. `APP_URL` tuvo una actualización el 2026-11-23. La Edge Function `revisar-inventario` está activa en versión 15.

## Alcance de la evidencia

El estado `enviado` y el `message_id` acreditan que el servidor SMTP aceptó cada correo. No acreditan lectura ni entrega al buzón. La aplicación no tiene webhook del proveedor de correo; por eso no se informa una tasa de entrega confirmada. Los mensajes `simulado` no cuentan como correos reales.

La aplicación conserva destinatario, ID, estado, fecha del intento y contador de reintentos. El tiempo detección→aceptación se calcula como `sent_at - created_at`. La verificación de correo de orden de compra y de entrega incompleta al proveedor corresponde a flujos separados.
