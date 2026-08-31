# 🪚 Perucho — Agente de IA para WhatsApp · Ferretería El Serrucho

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-required-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![OpenAI](https://img.shields.io/badge/OpenAI-GPT%20%2B%20embeddings-412991?logo=openai&logoColor=white)](https://platform.openai.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Powered by n8n](https://img.shields.io/badge/Powered%20by-n8n-EA4B71?logo=n8n&logoColor=white)](https://n8n.io/)

Agente de IA en producción que automatiza la atención al cliente por WhatsApp de la **Ferretería El Serrucho** (Mene Mauroa, Estado Falcón): búsqueda de inventario y precios en tiempo real sobre un catálogo de 7.650 SKUs, cotizaciones exactas, transcripción de notas de voz, memoria de clientes y escalación a empleados cuando hace falta una persona. Integra modelos de **OpenAI** (razonamiento vía OpenRouter + embeddings `text-embedding-3-small`) en un pipeline de recuperación de 5 capas medido contra 320 consultas reales.

El asistente se llama **"Perucho"** 👨🏻‍🔧 y corre sobre infraestructura local (Docker) + una base de datos en la nube (Supabase), sin costos recurrentes de servidor.

### 🎥 Demo

https://github.com/user-attachments/assets/fe28172d-64c1-45f9-9b08-edaab0f9a69c

> Perucho respondiendo por WhatsApp en producción.

---

## 🏗️ Arquitectura

Arquitectura local dirigida por eventos. WhatsApp entra por **WAHA**, n8n orquesta el razonamiento con un LLM vía **OpenRouter**, consulta **Supabase** y recuerda clientes con **Engram**.

```mermaid
graph TD
    Client[📱 Cliente WhatsApp] <-->|Mensajes| WAHA[🐋 WAHA · puerto 3000<br/>engine NOWEB]
    WAHA -->|Webhook 'message'| N8N[🐋 n8n · puerto 5678]
    N8N -->|Razonamiento| Model[🧠 OpenRouter<br/>openai/gpt-5.6-luna · temp 0.3]
    N8N -->|Notas de voz → texto| Groq[🎙️ Groq Whisper]
    N8N -->|Inventario / precios / ventas| Supabase[(☁️ Supabase PostgreSQL)]
    N8N -->|Memoria de clientes| Engram[💻 Engram · host puerto 7437]
    N8N -->|Respuesta / Escalar| WAHA
    N8N -->|Cola de empleados| Apps[👷 Apps de empleados<br/>atenciones · solicitudes de ayuda]
```

### 🧰 Stack tecnológico

| Componente | Tecnología |
| :--- | :--- |
| WhatsApp HTTP API | [WAHA](https://waha.devlike.pro/) (Docker, engine NOWEB) |
| Orquestación de flujos | [n8n](https://n8n.io/) (Docker) |
| Inferencia LLM | [OpenRouter](https://openrouter.ai/) → `openai/gpt-5.6-luna` (temp 0.3) |
| Transcripción de voz | [Groq](https://groq.com/) Whisper |
| Base de datos | [Supabase](https://supabase.com/) (PostgreSQL + `pg_trgm` + `pgvector`) |
| Embeddings | OpenAI `text-embedding-3-small` (opcional — ver nota abajo) |
| Memoria a largo plazo | [Engram](https://github.com/EngineVault/engram) |
| Runtime | Node.js 18+ |

### Cómo encuentra un producto (cascada de 5 capas)

El cliente escribe como habla, no como está escrito el catálogo. La búsqueda baja por capas
y **solo pasa a la siguiente si la anterior no encontró nada**, así que el caso normal
(«cemento gris») se resuelve en la primera, en ~900 ms y sin gastar un centavo.

| # | Capa | Qué resuelve |
| :-- | :--- | :--- |
| 1 | **Léxico** (`ilike` + `SIN` + medidas) | El grueso. Sinónimos a mano (con límite de palabra), medidas NxM/fracciones/calibre, stopwords conversacionales. |
| 2 | **Diccionario de catálogo** (`catalogo_vocabulario`, 3.5k términos) | Coloquialismos generados leyendo el catálogo: *chapa*→cerradura, *foco*→bombillo, *cincho*→abrazadera. |
| 3 | **Relajación + fuzzy `pg_trgm`** | Erratas fuertes y consultas que fallan por una palabra. |
| 4 | **Búsqueda vectorial** (`pgvector`, umbral 0.45) | Variantes de nombre: *tapa para el baño* → TAPA DE INODORO. **+7 aciertos medidos** sobre 320. |
| 5 | **Rescate semántico** (Luna + las 710 categorías) | El cliente describe la FUNCIÓN: *«lo que se usa para pegar los bloques»* → cemento. Lo que acierta se guarda en el diccionario: la próxima vez es gratis. |
| ★ | **Ventas recientes** (`producto_popularidad`) | Señal transversal que reordena: lo que de verdad se vende sube, el stock fantasma cae. |

Las capas 4 y 5 devuelven una **hipótesis**, no un hallazgo: el bot está obligado a preguntar
«¿te refieres a…?» y a emitir `[PEDIR_AYUDA]` si el cliente lo refuta.

**Estado medido** (320 consultas coloquiales): **76,9 % de recall exacto, 6,3 % de fallos.**
Con la capa vectorial 246 aciertos frente a 239 sin ella, o sea **+7 atribuibles al vector**.

> **Sobre los embeddings — el texto de entrada se rediseñó hasta que el vector aportó señal real.**
> Embebiendo `descripción + categoría + coloquialismos` (en vez de la descripción cruda) el margen
> señal/ruido pasó de **0.012 a 0.123**, lo que se tradujo en los **+7 aciertos medidos** de la
> capa 4. La descripción cruda no llegó a ese punto: son cadenas de SKU cortas, no prosa, así que
> el vector terminaba midiendo el mismo solapamiento léxico que `pg_trgm` ya cubría (72,2 % con y
> sin embeddings, idéntico caso por caso) — un hallazgo de la fase de evaluación, no una limitación
> del enfoque. La capa sigue siendo opcional por diseño: **si `OPENAI_API_KEY` está vacía, la
> búsqueda funciona igual**, solo sin la capa 4.
>
> **OpenAI bloquea Venezuela.** Sin VPN devuelve `403 unsupported_country_region_territory`,
> y como la llamada va dentro de un `try/catch`, la capa 4 se apaga **en silencio**: el bot
> sigue respondiendo, solo que peor. La VPN no es opcional para nada que toque embeddings —
> ni generarlos ni usarlos en producción. `node rag.js estado` lo comprueba en cada corrida
> y lo dice con todas las letras.
>
> **Ojo con el stock fantasma:** de 5.046 productos con existencia, **2.559 (51 %) no venden
> hace un año**. Por eso el ranking por ventas usa nº de FACTURAS, no unidades: 80 facturas
> son 80 decisiones de compra, las unidades las distorsiona un mayorista.

Para el detalle completo —estadísticas, decisiones, lo que se probó y **no** funcionó, y
dónde investigar mejoras— ver **[RAG.md](RAG.md)**.

### 🗺️ Mapa Visual del Workflow en n8n (33 Nodos, 4 Zonas)

El flujo en n8n está organizado visualmente en **4 Zonas Lógicas** con Sticky Notes de colores, eliminando cruces de cables y separando responsabilidades:

```mermaid
flowchart TD
    classDef z1 fill:#f3e8ff,stroke:#9333ea,stroke-width:2px,color:#581c87;
    classDef z2 fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#78350f;
    classDef z3 fill:#e0f2fe,stroke:#0284c7,stroke-width:2px,color:#075985;
    classDef z4 fill:#dcfce7,stroke:#16a34a,stroke-width:2px,color:#14532d;
    classDef tool fill:#ffffff,stroke:#0284c7,stroke-dasharray: 4 4,color:#0369a1;
    classDef drop fill:#fee2e2,stroke:#dc2626,stroke-width:1px,color:#991b1b;

    subgraph ZONA1["🟣 ZONA 1: Ingesta & Seguridad"]
        W[Webhook Trigger]:::z1 --> S{¿Mensaje Saliente?}:::z1
        S -->|Sí · fromMe| DH[Detectar Handoff Empleado]:::z1 --> D1[Descartar]:::drop
        S -->|No · Cliente| CR{¿Es Cliente Real?}:::z1
        CR -->|No| D2[Descartar]:::drop
        CR -->|Sí| AD[Filtro Anti-Duplicado]:::z1
    end

    subgraph ZONA2["🟡 ZONA 2: Pre-Procesamiento & Sesión"]
        AD --> DB[Debounce Ráfaga]:::z2
        DB --> WH[Transcribir Nota de Voz · Whisper]:::z2
        WH --> TXT{¿Es Texto Válido?}:::z2
        TXT -->|No| RNT[Responder No-Texto]:::z2
        TXT -->|Sí| CS[Verificar Sesión de Chat]:::z2
        CS --> RL{¿Superó Rate Limit?}:::z2
        RL -->|Sí · >10 msg/min| RLD[Descartar]:::drop
        RL -->|No| MH{¿Atención Manual?}:::z2
        MH -->|Sí| MHA[Silencio · Modo Empleado]:::drop
        MH -->|No| CM[Cargar Memoria Cliente]:::z2
    end

    subgraph ZONA3["🔵 ZONA 3: Agente de IA & Herramientas"]
        CM --> AGENT["🤖 AI Agent (Perucho)"]:::z3
        
        MODEL["🧠 OpenRouter Model"]:::tool -.-> AGENT
        MEM["💾 Buffer Memory"]:::tool -.-> AGENT
        T1["🔍 buscar_productos"]:::tool -.-> AGENT
        T2["📋 hacer_presupuesto"]:::tool -.-> AGENT
        T3["💵 obtener_tasa_bcv"]:::tool -.-> AGENT
        T4["🧠 memoria_engram"]:::tool -.-> AGENT
        
        AGENT --> SAN["🛡️ Sanitize Output"]:::z3
    end

    subgraph ZONA4["🟢 ZONA 4: Enrutamiento & Despacho WAHA"]
        SAN --> ESC{¿Requiere Escalar?}:::z4
        ESC -->|Sí · ESCALAR_HUMANO| MAN[Activar Chat Manual]:::z4
        MAN --> AP[Registrar Atención Pendiente]:::z4
        MAN --> WA_ESC[Enviar Mensaje Escalamiento]:::z4
        
        ESC -->|No| AYU{¿Pedir Ayuda?}:::z4
        AYU -->|Sí · PEDIR_AYUDA| SA[Registrar Solicitud Ayuda]:::z4 --> WA_AYU[Enviar Mensaje Puente]:::z4
        AYU -->|No · Normal| WA_RESP[Enviar Respuesta Directa]:::z4
    end
```

| Zona | Color | Qué resuelve |
| :--- | :--- | :--- |
| **🟣 Zona 1** | Púrpura | **Ingesta & Seguridad**: Webhook, discriminación de mensajes propios (`fromMe`) para handoff, filtro de grupos/estados y anti-duplicados por ID. |
| **🟡 Zona 2** | Amarillo | **Pre-Procesamiento & Sesión**: Debounce de ráfagas rápidas, transcripción Whisper, rate limit (10 msg/min), control de sesión y reactivación tras 30 min. |
| **🔵 Zona 3** | Azul | **Agente de IA & Herramientas**: Orquestación de razonamiento con Luna/Sonnet, memoria conversacional, 5 herramientas de negocio y sanitización de salida. |
| **🟢 Zona 4** | Verde | **Enrutamiento & Despacho**: Clasificador trifurcado (`[ESCALAR_HUMANO]`, `[PEDIR_AYUDA]`, Respuesta directa) con entrega HTTP hacia WAHA. |

### Herramientas del agente (toolCode en n8n)

| Tool | Función |
| :--- | :--- |
| `buscar_productos` | Búsqueda de inventario con relevancia + medidas robustas (NxM, fracciones, calibre, largo) y reglas de negocio (cabilla, cemento). Devuelve precio en USD y en Bs. |
| `hacer_presupuesto` | Cotiza una lista de productos con cantidades; ofrece alternativas disponibles cuando el exacto está agotado. |
| `obtener_tasa_bcv` | Tasa de cambio actual (tabla `tazas`). |
| `buscar_memoria_engram` / `guardar_memoria_engram` | Memoria a largo plazo del cliente (Engram). |

---

## 🧩 Fuente única de la búsqueda (importante para desarrollar)

La lógica del matcher **vive una sola vez** en [`lib/serrucho-search.js`](lib/serrucho-search.js) (`norm`, `normMedida`, `medPresent`, `scoreMatch`, `expandir`, `singular`, `parseItems`, …). Esa misma fuente está **embebida** en los nodos de n8n. La cadena de verdad es:

```
lib/serrucho-search.js  (canónico)
        │  (mismas funciones, verbatim)
        ▼
scratch_live/live_buscar.js · live_presupuesto.js · live_systemMessage.txt   (dumps del workflow vivo)
        │  copia exacta                         │  build_workflow.js
        ▼                                       ▼
scripts/new_buscar.js · new_presupuesto.js   n8n_workflow.json   →   nodos del workflow en n8n
```

`npm test` ejecuta los **guards de sincronía** y los unit tests:

```bash
npm test    # node --test  +  check_sources_sync.js  +  check_workflow_sync.js
```

- `check_sources_sync.js` — falla si `lib` se desincroniza de los dumps o si `new_*.js ≠ dumps`.
- `check_workflow_sync.js` — falla si el código embebido en `n8n_workflow.json` se desvía de los dumps.

> ⚠️ **Regla de oro:** `buscar_productos` y `hacer_presupuesto` tienen cada uno su **propia copia** de las funciones del matcher. Si cambias la lógica, cámbiala en **ambos** dumps (y en `lib`), y corre `npm test`. El loop de despliegue al n8n vivo está en `scripts/patch_*.js` (fetch → modificar → PUT a la API local de n8n) seguido de re-dump con `scripts/_inspect_live.js`.

---

## 🚀 Requisitos

| Requisito | Mínimo | Recomendado |
| :--- | :--- | :--- |
| SO | Windows 10/11 | Windows 11 |
| CPU | 4 núcleos | 8 núcleos |
| RAM | 8 GB | 16 GB |
| Almacenamiento | 50 GB SSD | 100 GB SSD |

Requiere **Docker Desktop**, **Node.js 18+** e internet (OpenRouter, Groq, Supabase).

> **Nota:** Linux/macOS sirven para desarrollo, pero los scripts `.ps1`/`.vbs` de arranque son exclusivos de Windows.

---

## 🛠️ Instalación

```bash
git clone https://github.com/Gus2708/whatsapp-agent.git
cd whatsapp-agent
npm run setup        # o: node setup.js
```

El instalador (`setup.js`) verifica Node/Git/Docker (instala con `winget` en Windows si faltan), descarga el servidor de memorias **Engram** en `%USERPROFILE%\.engram\bin` y lo añade al `PATH`, y crea tu archivo `.env` a partir de [`.env.example`](.env.example).

### Variables de entorno (`.env`)

| Variable | Para qué |
| :--- | :--- |
| `WAHA_DASHBOARD_USERNAME` / `WAHA_DASHBOARD_PASSWORD` | Login del panel de WAHA. |
| `WAHA_API_KEY` | Clave que usan n8n ↔ WAHA para enviar mensajes. |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Base de datos en la nube (PostgreSQL + pgvector). |
| `OPENROUTER_API_KEY` | Inferencia del modelo principal (`openai/gpt-5.6-luna`) y del motor de automejora (`anthropic/claude-sonnet-5`). |
| `OPENAI_API_KEY` | Generación de embeddings vectoriales (`text-embedding-3-small`). |
| `GROQ_API_KEY` | Transcripción de notas de voz (Whisper). |
| `ENGRAM_HOST` | Servidor de memorias (por defecto `host.docker.internal:7437`). |
| `N8N_API_KEY` | Solo para los scripts de desarrollo/despliegue (`scripts/patch_*.js`). |
| `ADMIN_PHONE_NUMBERS` | Teléfonos de los administradores para recibir alertas y diagnósticos de automejora (separados por coma, ej. `584XXXXXXXXX@c.us,584YYYYYYYYY@c.us`). |

> ⚠️ **Nunca subas el archivo `.env` al repositorio.** Ya está en `.gitignore`. Utiliza [`.env.example`](.env.example) como plantilla.

---

## 🧠 Auto-Mejora y Self-Healing Continuo (Sonnet 5)

El sistema cuenta con un workflow autónomo e independiente en n8n (**`Auto-Mejora y Self-Healing de Búsqueda`**, [workflows/workflow_automejora.json](workflows/workflow_automejora.json)):

1. **Disparo Asíncrono**: Cuando una búsqueda de producto en WhatsApp resulta en 0 coincidencias o desvío a otra categoría (`_weak`), el agente despacha un webhook *fire-and-forget* sin demorar la respuesta al cliente.
2. **Diagnóstico con Sonnet 5**: [Claude Sonnet 5](https://openrouter.ai/anthropic/claude-sonnet-5) (vía OpenRouter) analiza la causa raíz del fallo en las 5 capas de búsqueda contra los candidatos reales con stock en Supabase.
3. **Sandbox y Auto-Aplicación**: Valida en memoria la equivalencia de vocabulario propuesta, la inserta de inmediato en `catalogo_vocabulario` (Supabase) con `origen: 'automejora_sonnet'` y genera la auditoría en `automejora_logs`.
4. **Notificación al Administrador**: Envía un reporte por WhatsApp a los números configurados en `ADMIN_PHONE_NUMBERS` con la causa diagnosticada, el SKU identificado y la acción tomada.

Para desplegar o actualizar el workflow de automejora en tu instancia de n8n:
```bash
node scripts/crear_workflow_automejora.js
```

### 📱 Comandos de Feedback y Control por WhatsApp para Administradores

Los administradores autorizados en `ADMIN_PHONE_NUMBERS` pueden interactuar directamente con el bot por WhatsApp para corregir búsquedas fallidas y consultar métricas:

| Comando WhatsApp | Descripción | Ejemplo |
| :--- | :--- | :--- |
| `/feedback <SKU> <consulta>` | Vincula una búsqueda coloquial directamente a un SKU con confianza máxima (10/10). | `/feedback 01726 disco diamantado para concreto 7` |
| `/feedback <SKU>` | Vincula el SKU especificado a la **última búsqueda fallida** de forma automática. | `/feedback 01726` |
| `/corregir <SKU>` | Alias de `/feedback`. | `/corregir 01726` |
| `/status` o `/estado` | Muestra el estado del sistema, tasa BCV actual y las últimas 3 fallas registradas. | `/status` |

> 🔒 **Seguridad**: Solo los números incluidos en la variable `ADMIN_PHONE_NUMBERS` pueden ejecutar comandos `/`; los clientes normales que envíen texto que empiece con `/` son procesados de forma habitual.

---

## ⚙️ Configuración

1. **Supabase** — en el SQL Editor ejecuta [`supabase_schema.sql`](supabase_schema.sql). Crea las **12 tablas** (productos, clientes, tazas, chat_sessions, ventas, ventas_detalle, ordenes_cambio[_items], atenciones_pendientes, solicitudes_ayuda[_items], push_subscriptions), índices GIN/trigram (`pg_trgm`) y funciones RPC de búsqueda/popularidad. RLS habilitado.
2. **WAHA** — abre `http://localhost:3000`, entra con las credenciales del `.env`, ve a **Sessions**, inicia la sesión `default` y escanea el QR con el WhatsApp de la tienda. (Engine **NOWEB**; la sesión se persiste en un volumen y se reanuda sola al reiniciar.)
3. **n8n** — abre `http://localhost:5678`, **Import from file** → [`n8n_workflow.json`](n8n_workflow.json). Configura credenciales de **OpenRouter** y activa el flujo (**Active**).

---

## 🏃 Arranque

```bash
npm start            # = start_agent.ps1  (Engram + siembra de memorias + contenedores + healthcheck)
```

En la PC de la tienda el arranque y la resiliencia están automatizados con scripts PowerShell (lanzados de forma invisible vía `.vbs`):

* **`boot_serrucho.ps1`** — al encender: levanta Docker Desktop, los contenedores n8n + WAHA y Engram.
* **`catchup_serrucho.ps1`** — tras un apagón: reinyecta a n8n los últimos mensajes de clientes (< 24 h) sin responder, con `catchup:true`.
* **`waha_watchdog.ps1`** — mantiene viva la sesión de WhatsApp (vía Task Scheduler).

---

## 👷 Apps de empleados (cola en Supabase)

Cuando el bot no basta, encola al cliente y un empleado lo atiende desde una app que lee Supabase por Realtime:

* **Atenciones pendientes** — el cliente pide hablar con una persona (`[ESCALAR_HUMANO]`) → tabla `atenciones_pendientes`. Ver [`GUIA-APP-ATENCIONES.md`](GUIA-APP-ATENCIONES.md).
* **Solicitudes de ayuda** — el bot no encuentra un producto o el cliente refuta el resultado (`[PEDIR_AYUDA]`) → tabla `solicitudes_ayuda`; el empleado elige los productos y el webhook `/reenviar-ayuda` se los reenvía al cliente. Ver [`GUIA-APP-SOLICITUDES-AYUDA.md`](GUIA-APP-SOLICITUDES-AYUDA.md).

---

## 🔒 Reglas de negocio de Perucho

* **Precios reales de la BD** — USD (*Precio Divisas*) y bolívares con el recargo de tienda aplicado y la tasa BCV; nunca revela el porcentaje de recargo ni inventa impuestos.
* **Datos de pago** — el bot **nunca** comparte números de pago/cuentas; para pagar deriva a un empleado o a la tienda física.
* **Retiro en tienda** (Mene Mauroa) + **transporte de materiales a $10** dentro del casco central; fuera del casco central el costo lo coordina un empleado.
* **Notas de voz** — se transcriben automáticamente (Groq Whisper); imágenes/stickers reciben respuesta amable pidiendo texto.
* **Rate limiting** — 10 mensajes / minuto por teléfono.
* **Handover manual** — si un empleado toma el chat (`chat_sessions.estado = 'manual'`), el bot deja de responder.
* **Memoria Engram** — reconoce clientes por teléfono y recuerda nombre/notas.
* **Anti-basura** — el nodo *Sanitize Agent Output* evita que una salida corrupta del LLM llegue al cliente.

---

## 📁 Estructura del proyecto

| Ruta | Contenido |
| :--- | :--- |
| `lib/serrucho-search.js` | **Fuente única** del matcher de búsqueda/cotización. |
| `scratch_live/` | Dumps canónicos del workflow vivo (`live_buscar.js`, `live_presupuesto.js`, `live_systemMessage.txt`). |
| `n8n_workflow.json` | Snapshot completo del flujo de n8n (importable / recuperación). |
| `scripts/` | Despliegue (`patch_*.js`), inspección (`_inspect_live.js`), build/guards (`build_workflow.js`, `check_*_sync.js`) y harnesses de prueba (`_test_*.js`). |
| `tests/` | Unit tests de `lib` (`node --test`). |
| `supabase_schema.sql` | DDL completo (índices, RPC, RLS). Ojo: las tablas de vocabulario, embeddings, descripciones y popularidad se crearon por migración y **no están aquí**. |
| [`RAG.md`](RAG.md) | Cómo funciona la búsqueda, estadísticas medidas y dónde investigar mejoras. |
| `plans/` | Notas de cambios técnicos. [`006`](plans/006-fusion-hibrida-rrf.md) documenta la fusión RRF pendiente y los intentos fallidos. |
| `scratch_live/_coloquial_set*.json` | Sets de prueba cacheados (320 y 80 casos) para que el antes/después sea comparable. |
| `docker-compose.yml` · `Dockerfile` | n8n (con docker-cli) + WAHA. |
| `setup.js` · `start_agent.ps1` · `seed_memory.js` | Instalación, arranque y siembra de memorias base. |
| `boot_serrucho.*` · `catchup_serrucho.*` · `waha_watchdog.*` | Arranque automático, recuperación de mensajes y watchdog de sesión. |
| `data/serrucho_context.json` | Contexto del comercio. |
| `plans/` | Notas de planificación de cambios técnicos. |
| `GUIA-APP-*.md` | Guías de las apps de empleados. |
| `.agents/` | Skills y reglas del agente de desarrollo. |

---

## 🧪 `rag` — CLI de la capa de búsqueda

Punto de entrada único para diagnosticar, medir y mantener la búsqueda. Diseñado como una **TUI interactiva (estilo Claude Code / Brainless)** con soporte TrueColor RGB, gráficos vectoriales en Braille, comandos slash e historial continuo de búsqueda sin salir de la terminal:

```bash
node rag.js                       # Inicia la TUI Interactiva (Dashboard + REPL en vivo)
node rag.js estado                # Diagnóstico general en dos columnas (one-shot)
node rag.js buscar "cemento gris" # Búsqueda directa desde terminal
node rag.js ayuda                 # Catálogo completo de comandos
```

```
╭─── RAG · Perucho ─────────────────────────────────────────────────────────────────────── Ferretería El Serrucho ╮
│  branch: main · Ferretería El Serrucho · ● online                                                               │
╰─────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
 ◆ CATÁLOGO Y VECTORES                                              │  ◆ EL COSENO EN VIVO
 ──────────────────────────────────────────────────────────────     │  cos(θ) sobre 1.536 dimensiones (esfera unidad)
  productos en catálogo                                    7.689    │    ⡄ A = tapa para el baño
  con vector                                               7.689    │    ⡇⢀⠤⡞⢆
  cobertura vectorial                                     100.0%    │    ⡇⠁⡰⠁⠈
  ██████████████████████████████████████████████████████████        │    ⡇⢠⠃         ⠠⠤⣤⣤⡤ 0.62 TAPA DE PO
  sin vector                                                 0 ⏺    │    ⣇⣎⣀θ=52°⡠⠤⠔⠒⠉⣉⣲⣿⣦⣤⣄ 0.45 umbral
  descripción movida                                         0 ⏺    │    ⣟⣤⣤⣿⣶⣽⣷⣒⣒⣛⣛⣛⣉⣉⣉⣙⣋⣉⣀⣀0.37 ruido
  último embedding                                           hoy    │  "tapa para el baño" → vecinos
                                                                    │   0.622 ███████····· TAPA DE POCETA COL
 ◆ DICCIONARIO COLOQUIAL                                            │   0.619 ███████····· TAPA DE INODORO CI
 ──────────────────────────────────────────────────────────────     │   0.610 ███████····· TAPA DE INODORO  C
  términos activos                                         3.705    │   0.450 ╌╌╌╌╌╌╌╌╌╌╌╌ umbral
  categorías cubiertas                                       718    │   0.372 ████········ ruido (suelo)
  última generación                                 2026-08-30 ⏺    │   ⏺ margen 0.250  separa de verdad
                                                                    │   └ rag.js coseno "..." para pantalla completa
 ◆ RANKING POR VENTAS                                               │
 ──────────────────────────────────────────────────────────────     │  ◆ ACTIVIDAD DEL CATÁLOGO
  con historial de venta                                   4.782    │  ────────────────────────────────────────────
  con existencia                                           5.153    │  productos según el mes de su última venta
  stock sin venta en 1 año                         2.650 (51%) ▲    │   ene 26 ███░░░░░░░░░░░░░░░░░░░    145
  recalculado                                              hoy ⏺    │   feb 26 ████░░░░░░░░░░░░░░░░░░    190
  ⎿ el ranking por ventas los hunde solos: score 0 o negativo       │   mar 26 ██████░░░░░░░░░░░░░░░░    251
                                                                    │   abr 26 ██████░░░░░░░░░░░░░░░░    264
 ◆ CONECTIVIDAD                                                     │   may 26 ████████░░░░░░░░░░░░░░    353
 ──────────────────────────────────────────────────────────────     │   jun 26 ███████░░░░░░░░░░░░░░░    318
  OpenRouter · Luna                                     623 ms ⏺    │   jul 26 ██████████░░░░░░░░░░░░    470
  OpenAI · embeddings                                  1062 ms ⏺    │   ago 26 ██████████████████████    992
                                                                    │   antes                         1.799
                                                                    │
                                                                    │  ◆ COMPOSICIÓN DEL STOCK
                                                                    │  ────────────────────────────────────────────
                                                                    │  los 5.153 productos con existencia
                                                                    │   vendido en 1 año ███████░░░░░░░  2.503  49%
                                                                    │   sin venta        ███████░░░░░░░  2.650  51%

 ▎ Todo al día  ·  6.3s
```

| Grupo | Comandos |
| :--- | :--- |
| **Interactivo** | `node rag.js` (TUI REPL interactiva con búsqueda directa, menú de atajos e historial) |
| **Diagnóstico** | `estado` · `buscar "<consulta>"` · `diag "<consulta>"` · `coseno` |
| **Métricas** | `suite [--rapida]` · `medir [--sin-vector]` · `regresion` · `vector` · `fallos` · `auditar` |
| **Mantenimiento** | `embeddings` · `vocabulario` · `descripciones` · `popularidad` · `desplegar` |

- **TUI Interactiva (REPL)**: Al ejecutar `node rag.js` en una terminal interactiva (TTY), se inicia una sesión continua donde puedes escribir consultas directas sin prefijo (ej: `cemento gris`), ver los resultados en árbol `⎿` al estilo Claude Code, autocompletar con `Tab` (`/estado`, `/coseno`, `/embeddings`, `/suite`, etc.) y usar atajos numéricos (`[1]..[7]`, `[0]` para salir).
- **`estado`** cruza catálogo, vectores, diccionario y ventas; detecta las tres formas de
  desalineación (sin vector, descripción movida, vocabulario más nuevo que los embeddings),
  da el comando exacto para cada una y **sale con código 1** si algo requiere acción. Se
  dibuja en **dos columnas** cuando la terminal tiene ≥114 caracteres —métricas a la
  izquierda, gráficas a la derecha con el diagrama vectorial de Braille integrado—; si no, se apilan. Y como tarda ~6-12s, un spinner animado dice
  en qué etapa va en vez de dejar la terminal muda.
- **`buscar`** ejecuta el cuerpo **real** del nodo contra Supabase y muestra qué devolvería
  el bot con badges de disponibilidad (`[DISPONIBLE]` / `[AGOTADO]`), marcas de hipótesis/parcial y la instrucción que recibe el modelo.
- **`diag`** explica por qué la capa vectorial actuó o no en una consulta concreta:
  si el gatillo disparó, latencia del embedding, similitudes crudas y qué decidió la adopción.
- **`coseno`** dibuja la capa vectorial **con datos en vivo**: los vecinos más cercanos de
  una consulta, su ángulo, el umbral y el **suelo de ruido** (la similitud que alcanza un
  texto sin sentido). La resta de ambos es el **margen señal/ruido**, y es la única cifra
  que dice si la capa sirve: con los embeddings v1 era **0.012** y aportaba cero; enriquecer
  el texto lo subió a ~0.12 y hoy ronda **0.25**. Una versión compacta va en `estado`, porque
  un margen derrumbado no da error — devuelve vecinos igual, solo que equivocados.
- **`suite`** corre todos los harness de una y resume: 443 casos con el recall completo,
  123 en `--rapida` (salta el recall de 320, que tarda ~15 min).

`node rag.js coseno ["<consulta>"]` dibuja además los vectores en pantalla completa, con el ángulo real de cada
uno respecto a la consulta:

```
 |A| = 1.000  → OpenAI normaliza, así que cos(θ) = A · B directamente

   ⡄      A = tapa para el baño
   ⡇       ⢀
   ⡇     ⠠⠒⡏⢣
   ⡇      ⡸
   ⡇     ⢰⠁
   ⡇    ⢀⠇
   ⡇    ⡜
   ⡇   ⢰⠁                                 ⣀⣀⣀⣀⡀0.631 TAPA DE POCETA C
   ⡇  ⢠⠃                              ⣀⣀⠤⠤⠒⠪⠛⠉
   ⡇  ⡎                        ⣀⣀⠤⠔⠒⠊⠉
   ⡇ ⡸       θ=51°      ⣀⡠⠤⠔⠒⠉⠉           ⣀⣀⣀⠤⠭⣭⠵⠖⠂0.450 umbral
   ⡇⢠⠋⠉⠉⠙⠒⠤⣄⡀   ⢀⣀⡠⠤⠔⠒⠉⠉    ⢀⣀⣀⣀⠤⠤⠤⠒⠒⠒⠊⣉⣉⣉⣀⣀⠤⠤⠤⢭⡭⠷⠖⠂0.372 ruido
   ⣇⠇    ⢀⣀⡠⠭⠒⠒⣉⣁⣀⡠⠤⣤⣔⣒⣒⣒⠭⠭⠭⠥⠔⠒⠒⠒⠒⠊⠉⠉⠉⠉
   ⣟⣤⣤⣶⣮⣽⣷⣖⣚⣛⣛⣛⣉⣉⣉⣉⣉⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⡀
```

El dibujo **no es decorativo, son los ángulos medidos**. OpenAI entrega vectores unitarios
(`|A| = 1.000`, comprobado en cada corrida), así que todos viven en la esfera unidad y
`θ = arccos(similitud)` es un ángulo de verdad. Lo que la proyección a dos dimensiones **no**
puede mostrar es el ángulo *entre dos productos*: eso se pierde al aplanar 1.536 dimensiones,
y el texto bajo el diagrama lo dice en vez de dejar que se asuma.

Dos detalles de implementación que se notan si faltan: el lienzo es **braille** (2×4
subpíxeles por carácter, o las diagonales salen a escalones), y la `x` se estira por 2 porque
una celda de carácter mide ~1×2 en pantalla — sin esa corrección un ángulo de 45° se dibuja
como 27° y el diagrama mentiría justo en lo único que enseña. Por debajo de 70 columnas los
rayos se solapan hasta ser ilegibles, así que no se dibuja y se avisa.

El CLI **orquesta** los scripts de `scripts/`, no duplica su lógica. Cada uno sigue siendo
ejecutable por separado.

> Los harness ejecutan el **cuerpo real** de las tools contra la base de producción (solo
> lectura), para cazar fallas del algoritmo con mensajes fieles a los chats reales.
>
> El recall cachea sus consultas en `scratch_live/_coloquial_set.json` **a propósito**:
> comparar dos corridas con preguntas distintas no mide nada. Regenerar con `--generar N`
> solo cuando quieras un set nuevo, y entonces re-medir la línea base.

### Ciclo de despliegue

```bash
node rag.js desplegar                      # dumps scratch_live/ -> nodos del n8n vivo
node scripts/export_workflow.js            # n8n vivo -> n8n_workflow.json (snapshot fiel)
node scripts/build_workflow.js             # normaliza el JSON desde los dumps
```

> `desplegar` corre **`npm test` antes del PUT** y aborta si falla: desplegar a n8n es
> publicar en producción, el bot atiende clientes reales en cuanto el PUT devuelve 200.
> `--sin-test` lo salta, pero hay que escribirlo a propósito.

### Mantenimiento nocturno — y lo que NO es automático

El workflow n8n **«Sync Vocabulario Catálogo»** (cron 3:00 AM):

```
Cada noche 3:00 → Sincronizar Vocabulario → Monitor Embeddings → Refrescar Popularidad
```

Vocabulario y ranking por ventas **sí se mantienen solos**, incrementales por hash. Va en un
workflow **aparte** del flujo de mensajes para no sumar latencia a ningún cliente.

> **Los embeddings NO se generan solos.** El tercer nodo es un **monitor**: detecta y avisa,
> no embebe. No puede hacerlo por dos límites reales — escribir vectores con el índice HNSW
> presente revienta el `statement_timeout` (error `57014`) y la anon key no puede quitar el
> índice, y además no puede recalcular el hash del texto enriquecido. Un job que no puede
> hacer su trabajo debe decirlo, no fingirlo: **antes reportaba `ok:true` escribiendo cero y
> estuvo 20 días así sin que nadie lo notara.**
>
> Cuando `node rag.js estado` avise, el ciclo manual es:
> ```
> drop index if exists idx_productos_embedding_hnsw;
> node rag.js embeddings
> create index idx_productos_embedding_hnsw on productos_embedding
>   using hnsw (embedding extensions.vector_cosine_ops);
> ```
> El script avisa si hay más de 500 filas pendientes. **Hazle caso.**

---

## 📄 Licencia

MIT.
