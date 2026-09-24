---
id: prog.python.s06.e01
title: Webhook que traga errores
subject: programming
type: exercise
discipline: python
skill: "06"
chapter: excepciones capturadas de más y de menos en un handler de webhook
mode: debug
difficulty: 3
assistance: helper
status: draft
---

# P-PY-06-E01 Webhook que traga errores

## Enunciado
Un endpoint de FastAPI recibe los webhooks de pago de la pasarela y llama a
`handle_payment_webhook(raw_body, ledger)` con el cuerpo crudo de la petición. El contrato con la
pasarela es:

- `200` significa «pago registrado»: la pasarela no vuelve a enviar el evento.
- `400` significa «evento inválido, no lo reenvíes».
- `5xx` significa «fallo temporal»: la pasarela reintenta el mismo evento más tarde.

`ledger.record_payment(event_id, order_id, amount_cents)` es idempotente por `event_id` (un
reintento no duplica el pago) y lanza `LedgerUnavailable` (subclase de `ConnectionError`) cuando la
base de datos no responde.

Finanzas reporta tres pedidos que la pasarela muestra como entregados con `200` pero que no están
en el ledger; en los logs de esas horas solo aparece `webhook processed`. Además apareció en el
ledger un «pago» de `-4990` centavos.

El código de abajo tiene **tres bugs**. Encuéntralos y corrígelos sin rediseñar el handler. Para
cada uno indica la línea, por qué falla y la corrección, y aplica el protocolo de depuración:
hipótesis inicial, evidencia que usarías (un `print()` puntual o un `breakpoint()` y qué variable
mirarías) y «el síntoma fue X, la causa real es Y».

## Código
```python
import json
import logging

log = logging.getLogger("payments.webhook")


class InvalidEvent(Exception):
    pass


def parse_event(raw_body: bytes) -> dict:
    try:
        event = json.loads(raw_body)
        return {
            "event_id": event["id"],
            "order_id": event["data"]["order_id"],
            "amount_cents": event["data"]["amount_cents"],
        }
    except json.JSONDecodeError:
        raise InvalidEvent("body is not valid JSON")


def validate(payment: dict) -> None:
    if not isinstance(payment["amount_cents"], int):
        raise InvalidEvent("amount_cents must be an integer")


def handle_payment_webhook(raw_body: bytes, ledger) -> tuple[int, str]:
    try:
        payment = parse_event(raw_body)
        validate(payment)
        ledger.record_payment(payment["event_id"], payment["order_id"],
                              payment["amount_cents"])
    except InvalidEvent as exc:
        log.warning("rejected webhook: %s", exc)
        return 400, "invalid event"
    except Exception:
        log.info("webhook processed")
        return 200, "ok"
    return 200, "ok"
```

## Pistas
### Pista 1
Sigue a mano el camino de un payload válido en JSON pero sin `data.order_id`. ¿Qué excepción se
lanza, quién la captura y qué código HTTP recibe la pasarela?

### Pista 2
Compara las excepciones que puede lanzar cada línea de `parse_event` con las que de verdad captura.
Y en `validate`: ¿cualquier entero es un importe válido? ¿Qué devuelve `isinstance(True, int)`?

### Pista 3
Si `record_payment` lanza `LedgerUnavailable`, ¿qué debería recibir la pasarela para reintentar?
¿Qué deja en los logs el bloque que captura ese fallo?

## Solución
**Bug 1 — `except Exception` que responde éxito (líneas del último `except`).** Cualquier error
inesperado —el ledger caído, un `KeyError` de un payload incompleto— se registra como
`log.info("webhook processed")` y se responde `200, "ok"`. La pasarela da el evento por entregado y
no reintenta: el pago se pierde sin rastro. Síntoma: pedidos pagados que no están en el ledger y
logs que dicen «processed». Causa raíz: el handler convierte un fallo en éxito y oculta la traza.
Corrección: registrar la traza y responder `5xx` para que la pasarela reintente (el ledger es
idempotente, así que reintentar es seguro).

**Bug 2 — `parse_event` captura la excepción equivocada.** Solo captura `json.JSONDecodeError`,
pero un JSON válido con la forma equivocada lanza `KeyError` (falta una clave) o `TypeError`
(`data` no es un objeto), y un cuerpo que no es UTF-8 lanza `UnicodeDecodeError`. Esas excepciones
escapan como si fueran fallos del servidor en vez de convertirse en `InvalidEvent` (400). Con el
bug 1 presente, además, terminan en `200`: es exactamente el caso de los pedidos perdidos.

**Bug 3 — `validate` comprueba el tipo pero no el rango.** `-4990`, `0` e incluso `True`
(`bool` es subclase de `int`) pasan la validación y llegan al ledger. Un importe de pago tiene que
ser un entero estrictamente positivo que no sea `bool`.

```python
def parse_event(raw_body: bytes) -> dict:
    try:
        event = json.loads(raw_body)
        return {
            "event_id": event["id"],
            "order_id": event["data"]["order_id"],
            "amount_cents": event["data"]["amount_cents"],
        }
    except (ValueError, KeyError, TypeError) as exc:
        raise InvalidEvent(f"malformed event: {exc!r}") from exc


def validate(payment: dict) -> None:
    amount = payment["amount_cents"]
    if isinstance(amount, bool) or not isinstance(amount, int) or amount <= 0:
        raise InvalidEvent("amount_cents must be a positive integer")


def handle_payment_webhook(raw_body: bytes, ledger) -> tuple[int, str]:
    try:
        payment = parse_event(raw_body)
        validate(payment)
        ledger.record_payment(payment["event_id"], payment["order_id"],
                              payment["amount_cents"])
    except InvalidEvent as exc:
        log.warning("rejected webhook: %s", exc)
        return 400, "invalid event"
    except Exception:
        log.exception("webhook failed, provider will retry")
        return 500, "retry later"
    return 200, "ok"
```

`ValueError` cubre `json.JSONDecodeError` y `UnicodeDecodeError`, que son subclases suyas.

## Rúbrica
- [ ] (1) Señala el `except Exception` que devuelve `200` y explica que convierte fallos reales en éxito, por lo que la pasarela no reintenta.
- [ ] (1) Corrige ese bloque para que un fallo inesperado deje la traza (`log.exception` o re-lanzar) y responda `5xx`.
- [ ] (1) Detecta que `parse_event` solo captura `JSONDecodeError` y convierte también `KeyError`/`TypeError` (y errores de decodificación) en `InvalidEvent`.
- [ ] (1) Añade a `validate` la comprobación de rango (`amount_cents > 0`) y excluye `bool`.
- [ ] (1) Aplica el protocolo en al menos un bug: hipótesis, evidencia concreta y «el síntoma fue X, la causa real es Y».

## Errores típicos
- **implementation:** cambiar `log.info` por `log.error` pero seguir respondiendo `200`: el síntoma (logs engañosos) se corrige y la causa (la pasarela no reintenta) sigue ahí.
- **conceptual:** responder `400` a un fallo del ledger: la pasarela descarta el evento y el pago se pierde igual.
- **logical:** sustituir `except json.JSONDecodeError` por `except Exception` dentro de `parse_event`, que convierte también bugs de programación en «evento inválido».
- **implementation:** validar `amount_cents > 0` pero olvidar que `True` es un `int` en Python.

## Señal de dominio
Con un `ledger` que funciona, el handler corregido devuelve:

| Cuerpo recibido | Resultado | Llamadas a `record_payment` |
|---|---|---|
| `{"id": "evt_1", "data": {"order_id": "ord_9", "amount_cents": 4990}}` | `(200, "ok")` | 1 |
| `{"id": "evt_2", "data": {"amount_cents": 4990}}` | `(400, "invalid event")` | 0 |
| `{"id": "evt_3", "data": {"order_id": "ord_9", "amount_cents": -4990}}` | `(400, "invalid event")` | 0 |
| `{"id": "evt_4", "data": {"order_id": "ord_9", "amount_cents": true}}` | `(400, "invalid event")` | 0 |
| `not json` | `(400, "invalid event")` | 0 |

Con un `ledger` cuyo `record_payment` lanza `LedgerUnavailable`, el cuerpo de `evt_1` devuelve
`(500, "retry later")` y deja en el log una línea de nivel `ERROR` con la traza completa.
