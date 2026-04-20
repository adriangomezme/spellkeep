# Bloque C — Offline mode end-to-end test plan

Plan de pruebas manuales para validar que todo el stack local-first construido
durante N+1 / N+2 / N+3 funciona con la radio apagada. No se necesita código
nuevo; cualquier caso que falle abre un ticket de bug.

**Convenciones:**
- **🟢 Airplane Mode ON** = celular + WiFi + Bluetooth off.
- **🔵 Online** = red normal.
- Entre casos NO se resetea nada; el estado persiste. Si un caso corrompe
  datos, anotar y continuar.
- Los resultados van en la columna **Observado**.

---

## Fase 0 — Preparación 🔵

Requiere red para dejar el baseline sincronizado antes de irse a avión.

| ID  | Acción                                                                                           | Esperado                                                                                        | Observado |
|-----|--------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------|-----------|
| P1  | Profile → ver sección "Catalog".                                                                | `snapshot_version` > 0, `last_sync_at` reciente.                                               |           |
| P2  | Profile → tap "Pending Uploads".                                                                 | Muestra "Queue empty" (row gris + ✓). Si no, esperar o tap → Clear queue.                      |           |
| P3  | Asegurar ≥2 binders con 10+ cartas c/u, ≥1 folder con 1 binder dentro.                          | Datos base para los tests.                                                                      |           |
| P4  | Reiniciar la app una vez con red antes de pasar a avión.                                        | Al abrir, Profile "Queue empty" vuelve a mostrarse con 0.                                      |           |

---

## Fase 1 — Reads offline 🟢

Entrar a airplane mode ANTES de empezar la Fase 1.

| ID  | Acción                                                                                   | Esperado                                                                                      | Observado |
|-----|------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------|-----------|
| C1  | Search tab → escribir "sol ring".                                                       | Resultados aparecen en <500 ms, desde catálogo local.                                         |           |
| C2  | Search → filtrar por set (ej. "CMR") + nombre.                                          | Filtrado funciona sin delay.                                                                  |           |
| C3  | Tap en una carta → Card detail.                                                         | Imagen + oracle_text + legalities + flavor + rulings pintan. (Rulings puede quedar vacío; es fetch online.) |   |
| C4  | Home tab → Binders list.                                                                | Counts ("N Cards · M unique") y $ total pintan inmediato sin "0 Cards" blink.                 |           |
| C5  | Tap un binder → detail.                                                                 | Header con counts + lista de cartas; no "Loading..." persistente.                             |           |
| C6  | Cambiar view mode (grid / list / compact) desde el header.                              | Preferencia persiste (AsyncStorage).                                                          |           |
| C7  | Tab "Owned" → aplicar filtros (language, set, color).                                   | Resultados filtran sin round-trip.                                                            |           |
| C8  | Entrar a un folder.                                                                     | Binders dentro del folder se pintan inmediato, sin blink "0/0".                               |           |
| C9  | Profile → "Pending Uploads".                                                            | "Queue empty". Stats (catalog, image cache) visibles.                                         |           |

---

## Fase 2 — Writes offline simples 🟢

Todos los cambios deben aparecer instantáneamente en la UI y la cola debe crecer en Profile.

| ID   | Acción                                                                        | Esperado                                                                                      | Observado |
|------|-------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------|-----------|
| C10  | Card detail → Quick Add (⚡).                                                  | Botón hace pulse (1→1.08→1), icono morph a ✓, "+1" flota con color del destino. Sin toast.   |           |
| C11  | Card detail → stepper +/- en una finish.                                      | qty se actualiza optimistic, no "bounces" al valor viejo.                                    |           |
| C12  | Edit binder → cambiar nombre.                                                 | Nuevo nombre visible al cerrar modal, sin delay.                                              |           |
| C13  | Edit binder → cambiar color.                                                  | Color indicator cambia inmediato en hub y folder.                                             |           |
| C14  | Long-press binder → Move to folder → seleccionar folder.                      | Binder aparece dentro del folder, desaparece del hub root.                                   |           |
| C15  | Desde dentro del folder, long-press binder → "Remove from folder".            | Binder regresa al hub root.                                                                   |           |
| C16  | Home → Create folder (nombre + color).                                        | Folder aparece en hub.                                                                        |           |
| C17  | Create binder / list (dentro o fuera de folder).                              | Aparece listado con "0 Cards · 0 unique".                                                    |           |
| C18  | Profile → "Pending Uploads".                                                  | Count > 0 y creciendo conforme se hacen writes.                                               |           |

---

## Fase 3 — Writes offline destructivos 🟢

| ID   | Acción                                                                        | Esperado                                                                                      | Observado |
|------|-------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------|-----------|
| C20  | Long-press binder vacío → Delete → confirmar.                                 | Binder desaparece del hub inmediato.                                                          |           |
| C21  | Long-press binder con cartas → Delete.                                        | Binder desaparece inmediato; cola crece (children + parent DELETE).                          |           |
| C22  | Long-press binder con cartas → Empty → confirmar.                             | Binder sigue pero counts bajan a 0; Binder detail muestra "No cards".                        |           |
| C23  | Folder detail → ellipsis → Delete folder.                                     | Folder + binders internos desaparecen del hub inmediato.                                      |           |

---

## Fase 4 — Writes offline bulk 🟢

Los casos grandes son los que antes rompían. Con el batching connector esto debería seguir fluido después de salir de avión.

| ID   | Acción                                                                        | Esperado                                                                                              | Observado |
|------|-------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------|-----------|
| C30  | Long-press binder (≤20 cards) → Duplicate.                                    | Overlay "Copying N cards…" breve; aparece "Binder Copy" en hub con mismo count.                      |           |
| C31  | Duplicate de un binder GRANDE (5k+ cards).                                    | Overlay durante ~2-5 s; copia aparece con count correcto. No cuelga UI.                              |           |
| C32  | Long-press binder → Merge → seleccionar destino.                              | El DestinationPicker pinta desde local sin red. Source desaparece; dest crece.                       |           |
| C33  | Merge con overlap (2 binders que comparten cartas).                           | Counts de dest se suman correctamente (no duplican ni pierden).                                      |           |
| C34  | Import CSV pequeño (20 líneas plain-text) a un binder.                        | Result modal: "imported: X, updated: Y, failed: 0". Binder muestra los rows.                         |           |
| C35  | Import Hevault grande (500-2000 líneas) a un binder existente.                | failed = 0 (si todos los scryfall_ids están en local catalog). Counts del binder actualizan.         |           |
| C36  | Profile → "Pending Uploads".                                                  | Count muy alto (decenas de miles). Todo en SQLite local hasta que vuelva la red.                     |           |

---

## Fase 5 — Online resume 🔵

Apaga airplane mode y deja la app en Profile.

| ID   | Acción                                                                        | Esperado                                                                                              | Observado |
|------|-------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------|-----------|
| C40  | Esperar 1-3 min con app abierta y red encendida.                              | Profile count baja en bloques grandes (cada crud_transaction = batch de 500 ops). Llega a 0.         |           |
| C41  | Pasar a otra app 30 s, volver.                                                | Count puede no haber avanzado (iOS suspende). Al volver, reanuda.                                    |           |
| C42  | Abrir Supabase Studio → `collection_cards` en cualquier binder duplicado.     | Todas las rows server-side. `user_id` presente.                                                      |           |
| C43  | En el otro device (web/mobile), login con la misma cuenta.                    | Los cambios hechos en avión aparecen tras el stream inicial.                                         |           |
| C44  | Monitor Metro logs.                                                           | Solo `[ps-upload] drained N ops in Xms` en bloques. Ningún `error` ni `fatal` fuera de expected.     |           |

---

## Fase 6 — Edge cases 🟢/🔵

| ID   | Acción                                                                        | Esperado                                                                                              | Observado |
|------|-------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------|-----------|
| C50  | Cold start en avión: kill app (swipe up) + 🟢 + abrir app.                    | App arranca sin spinner infinito; todos los Reads de Fase 1 funcionan.                              |           |
| C51  | Import offline con un CSV que incluya un spoiler NO en catalog.db.            | La carta nueva va a `failed[]`; el resto se importa OK.                                             |           |
| C52  | Profile → "Update now" (pricing refresh) en 🟢.                               | Falla gracefully; muestra error. No rompe la app.                                                    |           |
| C53  | Reiniciar la app 🟢 mientras hay 10k+ ops en cola.                            | Al reabrir, Profile muestra el mismo count (no se pierde nada). En 🔵 drena después.                |           |
| C54  | Avión + hacer 5 adds rápidos de la misma carta (Quick Add × 5).              | Card ends up con qty=5. No rows duplicadas. Stepper muestra 5.                                      |           |
| C55  | Avión + duplicate → delete del binder duplicado antes de que salga a red.     | Binder desaparece; cola se limpia (ps_crud purge evita zombies 42501).                              |           |

---

## Criterios de aceptación

- **Fase 1** (Reads): 9/9 sin warning.
- **Fase 2-4** (Writes): 20/20 sin warning; Profile count crece monotonic.
- **Fase 5** (Online): cola drena completa; counts server-side = counts local.
- **Fase 6** (Edge): 6/6 sin corrupción. Caso de fallo silencioso (C51) debe reportar `failed[]` al usuario.

Cualquier ❌ abre un ticket con:
- ID del caso.
- Qué se observó.
- Logs de Metro (si hay).
- Estado de Profile → "Pending Uploads".
