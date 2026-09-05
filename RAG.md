# Pipeline RAG — Cómo el Agente Encuentra un Producto

Documento de referencia para **investigar mejoras**. No describe lo que se quiso construir,
sino lo que hay, con los números que lo respaldan y los caminos que se probaron y no
funcionaron, para no volver a pagarlos.

> **Lo primero que hay que entender:** esto **no es un RAG de manual**. Un RAG clásico
> recupera pasajes de prosa para dárselos a un LLM. Aquí se recupera de un catálogo de
> **7.650 cadenas de SKU de ~36 caracteres** (`TAPA DE INODORO CIERRE SUAVE 17X14 BEIGE
> AQUAFINA`), que no es prosa. Casi todo lo que la literatura da por bueno para RAG rinde
> distinto sobre este material, y hay evidencia medida más abajo de exactamente cómo.

---

## 1. La cascada de 5 capas

El cliente escribe como habla, no como está escrito el catálogo. La búsqueda baja por capas
y **solo pasa a la siguiente si la anterior no resolvió**. El caso normal («cemento gris»)
muere en la capa 1: **~700 ms y coste cero**.

| # | Capa | Qué resuelve | Coste |
| :-- | :--- | :--- | :--- |
| 1 | **Léxico** — `ilike` + mapa `SIN` + normalización de medidas | El grueso. Sinónimos a mano, medidas NxM/fracciones/calibre, stopwords conversacionales | 0 |
| 2 | **Diccionario de catálogo** — `catalogo_vocabulario` | Coloquialismos: *chapa*→cerradura, *foco*→bombillo, *cincho*→abrazadera | 1 query |
| 3 | **Relajación drop-one + fuzzy `pg_trgm`** | Erratas fuertes y consultas que fallan por una sola palabra | 0 |
| 4 | **Vectorial** — `pgvector`, umbral 0.45 | Variantes de nombre: *tapa para el baño* → TAPA DE INODORO | ~1 llamada OpenAI |
| 5 | **Rescate semántico** — Luna + las 710 categorías | El cliente describe la FUNCIÓN: *«lo que se usa para pegar los bloques»* → cemento | ~1 llamada Luna |

Y una señal transversal que **reordena** el resultado de cualquier capa:

| | Señal | Efecto |
| :-- | :--- | :--- |
| ★ | **Ventas recientes** — `producto_popularidad` | Lo que de verdad se vende sube; el stock fantasma cae |

### Cuándo se dispara cada capa

- **4 y 5 se activan** si (a) lo léxico devolvió **cero**, o (b) al primer resultado **le falta
  alguna palabra de la consulta** — señal de que ganó por una palabra de paso.
  *Mirar solo el sustantivo principal NO basta*: en «tapa para el baño» vs «Tapa P/toma»
  también coincide. Ese detalle costó una iteración entera.
- Si están todas las palabras («cemento gris» → «Cemento Gris CSC»), **no se llama a OpenAI**.
- **Las capas 4 y 5 devuelven una HIPÓTESIS, no un hallazgo.** El resultado lleva
  `_rescate` y una `instruccion` que obliga al bot a preguntar *«¿te refieres a…?»* y a
  emitir `[PEDIR_AYUDA]` si el cliente la refuta. Una interpretación nunca se presenta como
  certeza.

---

## 2. Estructura

### Tablas (Supabase)

| Tabla | Filas | Qué guarda | Quién la mantiene |
| :--- | ---: | :--- | :--- |
| `productos` | 7.650 | Catálogo, sincronizado desde ERP / Base de Datos | backend de sincronización |
| `catalogo_vocabulario` | 3.495 | `termino → canonico` coloquial | `generar_vocabulario.js` |
| `catalogo_vocab_categorias` | ~710 | Hash md5 **por categoría** | idem |
| `productos_embedding` | 7.650 | `vector(1536)` + HNSW coseno | `generar_embeddings.js` |
| `producto_descripcion` | 3.728 | Descripción en lenguaje natural (Luna) | `generar_descripciones.js` |
| `producto_popularidad` | 4.680 | Facturas 90d/365d + score | `refrescar_popularidad_reciente()` |

**Todas van aparte de `productos` a propósito**: esa tabla la reescribe el backend en cada
sync desde HybridLite y se llevaría por delante vectores, descripciones y scores.

### Funciones SQL

- `buscar_semantico(embedding, umbral, limite)` — similitud de coseno cruzada con existencia y precio
- `popularidad_productos(codigos[])` — score de ventas recientes (lee la tabla precalculada)
- `refrescar_popularidad_reciente()` — recalcula todo; devuelve nº de productos

### Workflow nocturno (n8n, cron 3:00)

```
Cada noche 3:00 → Sincronizar Vocabulario → Monitor Embeddings → Refrescar Popularidad
```

Va en un **workflow aparte** del flujo de mensajes para no sumar latencia a ningún cliente.
Vocabulario y ranking por ventas **sí se mantienen solos**, incrementales por hash.

> **Los embeddings NO se generan solos.** El tercer nodo es un **monitor**: detecta y avisa.
> No puede embeber por dos límites reales — escribir vectores con el índice HNSW presente
> revienta el `statement_timeout` (`57014`) y la anon key no puede quitar el índice, y además
> no puede recalcular el hash del texto enriquecido. Antes fingía trabajar: reportaba
> `ok:true` escribiendo cero, y estuvo **20 días** así sin que nadie lo notara.
>
> Cuando `node rag.js estado` avise, el ciclo es manual:
> `drop index` → `node rag.js embeddings` → `create index`.

### Scripts

| Script | Para qué |
| :--- | :--- |
| `generar_vocabulario.js` | Diccionario coloquial desde el catálogo |
| `generar_embeddings.js` | Vectores (texto enriquecido) |
| `generar_descripciones.js` | Descripciones con Luna |
| `deploy_nodos.js` | dumps `scratch_live/` → nodos del n8n vivo |
| `_test_coloquial.js` | **Recall sobre 320 consultas cacheadas** (`--sin-vector` para aislar) |
| `_test_vector.js` | **Margen señal/ruido** del espacio vectorial |
| `_test_fallos_reales.js` | Las consultas que de verdad escalaron |
| `_test_busqueda_50.js` | Regresión, 86 casos |
| `_audit_sin.js` | Audita el mapa `SIN` contra el catálogo real |
| `../rag.js` | **CLI / TUI Interactiva**: orquesta todo con REPL en vivo, búsqueda inteligente, diagnóstico y diagramas vectoriales Braille. `node rag.js` |

---

## 3. Estadísticas

### Evolución medida (mismo set de 320 consultas coloquiales)

| Hito | Recall exacto | Fallos |
| :--- | ---: | ---: |
| Punto de partida | 72,2% | 9,1% |
| + auditoría de `SIN` y drop-one | 73,1% | 7,8% |
| + embeddings v2 (texto enriquecido) | 75,9% | 6,6% |
| + ranking por ventas | 76,9% | 6,6% |
| + descripciones (v3) | **76,9%** | **6,3%** |

### Aporte aislado de la capa vectorial (A/B sobre el mismo set)

| | Recall | Fallos |
| :--- | ---: | ---: |
| Con vector | 246 (76,9%) | 20 (6,3%) |
| Sin vector (control) | 239 (74,7%) | 24 (7,5%) |

**+7 aciertos atribuibles al vector.**

### Margen señal/ruido — la métrica que decide

Peor consulta legítima **menos** mejor texto basura. Si no supera ~0.05, **no existe umbral
posible** y la capa es inservible por diseño, por muy bien que parezca acertar.

| | Basura | Legítima | **Margen** |
| :--- | ---: | ---: | ---: |
| v1 (SKU crudo) | 0.467 | 0.479 | **0.012** ❌ |
| v2 / v3 (enriquecido) | 0.368 | 0.491 | **0.123** ✅ |

### Catálogo y ventas

- **5.046** productos con existencia — de ellos **2.559 (51%) no venden hace un año**
- **1.802** vendidos en 90 días · **3.728** en 365 días
- **46** solicitudes de ayuda históricas, **solo 2 en los últimos 10 días**
- **61%** de esas solicitudes las **descartó el empleado**: no eran búsquedas fallidas sino
  saludos, peticiones de foto y seguimientos sin producto

### Costes reales

| Concepto | Coste | Frecuencia |
| :--- | ---: | :--- |
| Diccionario (3.448 términos) | $0.19 | una vez |
| Embeddings v2 (7.650) | $0.0043 | una vez |
| Embeddings v3 (3.728) | $0.0076 | una vez |
| Descripciones (3.728) | $0.11 | una vez |
| Búsqueda normal | **$0** | por consulta |
| Con capa vectorial | ~$0.0000002 | solo si dispara |

---

## 4. Por qué — decisiones y evidencia

### Por qué la popularidad NO va en el vector

El embedding codifica **significado**; la popularidad es una señal **ortogonal**. Mezclarlas
corrompe el espacio semántico y obligaría a **re-embeber el catálogo entero cada vez que
cambia una venta**. Como señal de ranking separada se recalcula de noche en segundos y su
peso se ajusta sin tocar un solo vector.

### Por qué el texto embebido va enriquecido

Se embebe:

```
DESCRIPCIÓN | descripción en lenguaje natural | categoria: X | como lo pide el cliente: sinónimos
```

Embeber el SKU crudo **no funcionó** (v1: aporte cero, margen 0.012). Con categoría y
coloquialismos el margen saltó a 0.123 y el vector empezó a aportar (+7).

### Por qué el diccionario NO se fusiona en `SIN`

`expandir()` aplica `SIN` con **reemplazo de subcadena, sin límite de palabra**. Con 93
claves curadas a mano era inofensivo; con miles generadas es destructivo: el término
legítimo `"te" → "tee pvc"` convertía **«plateado» en «platee pvcado»**. El diccionario de
la BD se aplica antes, con **límites de palabra**. *Si alguien «simplifica» esto fusionándolo
en `SIN`, rompe la búsqueda en silencio.*

### Por qué el nº de facturas y no las unidades

Las unidades las distorsiona un solo comprador mayorista. **80 facturas son 80 decisiones de
compra distintas.** Score: `ln(facturas 90d) + 0.5·ln(facturas 365d) − castigo por antigüedad`.

El stock fantasma se castiga **solo**, sin regla aparte: sin ventas → no está en la tabla →
score 0; con última venta vieja → score **negativo**.

---

## 5. Lo que se probó y NO funcionó

Documentado para no volver a pagarlo.

| Intento | Resultado | Por qué |
| :--- | :--- | :--- |
| **Embeddings del SKU crudo (v1)** | **Aporte cero** (72,2% con y sin, idéntico caso por caso) | Cadenas de 36 chars no son prosa; el vector medía solapamiento léxico, que `pg_trgm` ya hacía. Margen 0.012 |
| **Descripciones de Luna (v3)** | **Aporte cero** (246 → 246; $0.11) | v2 ya cubría *qué es* y *cómo lo pide la gente*; añadir *para qué sirve* resultó redundante. **El margen lo predijo: 0.123 → 0.123** |
| **Umbral de similitud como filtro de ruido en v1** | Imposible | Basura 0.467 vs legítima 0.479: no hay umbral que los separe |
| **Confianza del LLM para filtrar rescates** | No sirve | El mal tiro puntuaba 4 y el acierto 3. La red real es obligar a preguntar |
| **Gatillo por sustantivo principal** | Insuficiente | En «tapa para el baño» vs «Tapa P/toma» el sustantivo también coincide |

**Conclusión transversal:** enriquecer más el texto embebido parece agotado. Dos intentos
seguidos (descripciones) no movieron el margen. Antes de invertir ahí otra vez, exigir que
el margen se ensanche.

---

## 6. Cómo medir

```bash
node scripts/_test_coloquial.js                 # recall sobre 320 (set cacheado)
node scripts/_test_coloquial.js --sin-vector    # el mismo set sin vector -> aísla el aporte
node scripts/_test_vector.js                    # margen señal/ruido
node scripts/_test_busqueda_50.js               # regresión, exigir 0 falsos negativos
node scripts/_test_fallos_reales.js --prod      # consultas que de verdad escalaron
```

### Reglas para no engañarse

1. **El set está cacheado a propósito** (`scratch_live/_coloquial_set.json`). Comparar dos
   corridas con preguntas distintas no mide nada. Regenerar solo con `--generar N`, y
   entonces re-medir la línea base.
2. **Siempre A/B sobre el mismo set.** Que un número suba tras un cambio no prueba que sea
   *por* el cambio.
3. **HNSW es aproximado**: dos corridas del mismo probe pueden dar 3/7 y 5/7. No leer
   diferencias de 1-2 casos como señal.
4. **El margen manda sobre el acierto.** v1 parecía «casi bien» (2/7) siendo inservible.
5. **Verificar las expectativas del probe a mano** antes de fijarlas. Escribirlas mal hizo
   que 6/7 pareciera 1/7 — y eso lleva a revertir algo que funciona.
6. **El set de 320 muestrea AL AZAR**, inventario muerto incluido, así que **subestima el
   ranking por ventas**. Un cambio puede bajar ese número y aun así ser correcto para el
   negocio.

---

## 7. Dónde investigar mejoras

**En orden de retorno esperado:**

1. **Fusión híbrida RRF** — la mayor pendiente. Hoy el vector **reemplaza** lo léxico
   (`res = _vec`) en vez de combinarse: es todo-o-nada, y un producto que sale 3º en léxico y
   2º en vector no sube por consenso. Plan completo en
   [`plans/006-fusion-hibrida-rrf.md`](plans/006-fusion-hibrida-rrf.md).
2. **Auditar el resto de `SIN`** — `_audit_sin.js` marcó **21 entradas «a revisar»** que
   nadie ha mirado. Las 5 «dañinas» ya se corrigieron y cada una valía aciertos reales.
3. **Presupuesto sobre listas largas** — es menos preciso que la búsqueda suelta, y ahí están
   los pedidos grandes. `SIN` exige subcadena **contigua**, así que `tubo electrico →
   tubo electricidad` no aplica a «tubo **pvc** electrico».
4. **Muestreo del harness ponderado por ventas** — cambio de metodología, no de código.
5. **Modelo de embeddings** — nunca se probó `text-embedding-3-large` ni otras dimensiones.
   Barato de probar, y el margen dirá enseguida si aporta.

**Probablemente NO valga la pena** (evidencia en §5): enriquecer más el texto embebido.

---

## 8. Trampas operativas

- **Carga masiva de vectores:** el índice HNSW reconstruye el grafo en **cada insert** y
  revienta el `statement_timeout` de Supabase (error `57014`) a mitad, ya pagados los
  embeddings. Orden correcto: `drop index` → cargar (lotes de escritura ~40) → `create index`.
  El script avisa si hay >500 pendientes; **no puede automatizarlo** porque la anon key no
  hace DDL. *Esta trampa mordió dos veces.*
- **Parchear estos archivos desde el shell:** un heredoc se comió las barras invertidas y
  dejó `/\d/` como `/d/` y `\b` como carácter backspace en los tres archivos. Usar
  herramientas de edición, no `cat <<EOF`.
- **Cadena de despliegue:** `lib/catalog-search.js` → `scratch_live/*` → `scripts/new_*.js`
  → `n8n_workflow.json` → n8n. Desplegar con `deploy_nodos.js` y cerrar siempre con
  `npm test` (los guards detectan drift entre las copias).
