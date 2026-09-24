---
id: prog.sql.s07.e01
title: Upsert idempotente de webhooks
subject: programming
type: exercise
discipline: sql
skill: "07"
chapter: tabla de eventos procesados + ON CONFLICT condicionado
mode: implement
difficulty: 3
assistance: helper
status: draft
---

# P-SQL-07-E01 Upsert idempotente de webhooks

## Enunciado
Un workflow de n8n recibe los webhooks de la pasarela de pagos y ejecuta **una** consulta
parametrizada contra PostgreSQL por cada evento. La pasarela entrega cada evento *al menos una
vez*: el mismo evento puede llegar repetido, y los eventos de un mismo pedido pueden llegar
desordenados (un `paid` atrasado después de un `refunded`).

```sql
CREATE TABLE processed_events (
    event_id    TEXT PRIMARY KEY,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_payments (
    order_id      TEXT PRIMARY KEY,
    amount_cents  INTEGER NOT NULL CHECK (amount_cents > 0),
    status        TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'refunded')),
    last_event_at TIMESTAMPTZ NOT NULL
);
```

Parámetros de la consulta: `$1` event_id, `$2` order_id, `$3` amount_cents, `$4` status,
`$5` event_at (momento en que la pasarela generó el evento).

Escribe la consulta (un solo statement, o varios dentro de una transacción explícita) que:

1. Registre el evento en `processed_events`.
2. Aplique el efecto sobre `order_payments` **solo si el evento no se había procesado antes**:
   crea la fila del pedido o la actualiza.
3. Nunca deje que un evento más viejo (`event_at` anterior a `last_event_at`) pise un estado más
   nuevo.
4. Devuelva el `order_id` cuando el evento cambió el pedido y ninguna fila cuando no lo cambió.

## Pistas
### Pista 1
El efecto debe depender de si el `INSERT` en `processed_events` insertó algo. ¿Qué cláusula te
dice qué filas insertó realmente un `INSERT … ON CONFLICT DO NOTHING`?

### Pista 2
Un `WITH` puede contener un `INSERT … RETURNING`, y el statement principal puede leer de él como
de una tabla: si el CTE no devolvió filas, el `INSERT … SELECT` principal no inserta nada.

### Pista 3
`ON CONFLICT … DO UPDATE` admite un `WHERE` que decide si la fila existente se actualiza.
Compárala con `EXCLUDED`.

## Solución
```sql
WITH new_event AS (
    INSERT INTO processed_events (event_id)
    VALUES ($1)
    ON CONFLICT (event_id) DO NOTHING
    RETURNING event_id
)
INSERT INTO order_payments AS op (order_id, amount_cents, status, last_event_at)
SELECT $2::text, $3::integer, $4::text, $5::timestamptz
FROM new_event
ON CONFLICT (order_id) DO UPDATE
    SET amount_cents  = EXCLUDED.amount_cents,
        status        = EXCLUDED.status,
        last_event_at = EXCLUDED.last_event_at
    WHERE op.last_event_at < EXCLUDED.last_event_at
RETURNING op.order_id;
```

- `ON CONFLICT (event_id) DO NOTHING RETURNING event_id` devuelve una fila solo si el evento es
  nuevo; un duplicado no devuelve nada, así que el `INSERT … SELECT … FROM new_event` no toca el
  pedido.
- Todo es **un solo statement**, que PostgreSQL ejecuta de forma atómica: no puede quedar el
  evento marcado como procesado sin su efecto, ni al revés. Si dos entregas del mismo evento llegan
  a la vez, la segunda espera a la primera y luego no inserta nada.
- El `WHERE op.last_event_at < EXCLUDED.last_event_at` hace que un evento atrasado se registre
  como procesado pero no modifique el pedido (el `RETURNING` queda vacío).
- Los casts explícitos fijan el tipo de cada parámetro dentro del `SELECT`.

## Rúbrica
- [ ] (1) Registra el evento en `processed_events` con `ON CONFLICT (event_id) DO NOTHING`.
- [ ] (1) Hace que el efecto sobre `order_payments` dependa de que el evento sea nuevo (`RETURNING` del registro o comprobación equivalente en la misma transacción).
- [ ] (1) Crea o actualiza el pedido con `ON CONFLICT (order_id) DO UPDATE` usando `EXCLUDED`.
- [ ] (1) Condiciona el `DO UPDATE` con `last_event_at` para que un evento atrasado no pise un estado más nuevo.
- [ ] (1) Registro y efecto ocurren en un único statement o en una transacción explícita, y la consulta devuelve `order_id` solo cuando el pedido cambió.

## Errores típicos
- **logical:** registrar el evento y hacer el upsert en dos statements sin transacción: si el segundo falla, el evento queda marcado como procesado y el pago nunca se aplica.
- **implementation:** `DO UPDATE SET` sin `WHERE`: un `paid` atrasado sobrescribe un `refunded` más reciente.
- **conceptual:** creer que `ON CONFLICT (order_id)` por sí solo hace idempotente el pipeline: un evento repetido vuelve a aplicar su efecto y pierde la noción de «ya procesado».
- **implementation:** comprobar primero con `SELECT … WHERE event_id = $1` y luego insertar: dos entregas simultáneas pasan las dos la comprobación.

## Señal de dominio
Partiendo de las dos tablas vacías, ejecutando la consulta con estos parámetros en orden:

| # | Parámetros (`event_id`, `order_id`, `amount_cents`, `status`, `event_at`) | Devuelve |
|---|---|---|
| 1 | `evt_100`, `ord_42`, `4990`, `paid`, `2026-09-24 10:00+00` | `ord_42` |
| 2 | `evt_100`, `ord_42`, `4990`, `paid`, `2026-09-24 10:00+00` | 0 filas |
| 3 | `evt_101`, `ord_42`, `4990`, `refunded`, `2026-09-24 12:00+00` | `ord_42` |
| 4 | `evt_099`, `ord_42`, `4990`, `paid`, `2026-09-24 09:00+00` | 0 filas |

Estado final: `processed_events` tiene 3 filas (`evt_099`, `evt_100`, `evt_101`) y
`order_payments` tiene una sola fila (sesión en UTC):
`ord_42 | 4990 | refunded | 2026-09-24 12:00:00+00`.
