import { Conversation, LogEntry } from './types';

export const INITIAL_CONVERSATIONS: Conversation[] = [
  {
    id: "c1",
    name: "Carlos Mendoza",
    phone: "+58 424-647-8892",
    status: "qualified",
    statusLabel: "Calificado (Alta Intención)",
    score: 94,
    intent: "Cotización Mayorista / Cemento & Bloques",
    budget: "$850.00 USD",
    schedule: "Martes 1 Sep · 2:00 PM",
    silentMode: false,
    lastTime: "13:02",
    messages: [
      {
        sender: "client",
        text: "Buenas tardes, necesito cotizar 40 sacos de cemento gris y 200 bloques para retirar hoy en Maracaibo.",
        time: "13:00",
        latency: null,
        cost: null
      },
      {
        sender: "agent",
        text: "¡Buenas tardes! Con gusto. Tenemos disponible Cemento Gris Tipo I en $8.50 el saco y Bloque de Concreto 15cm en $0.95. ¿Deseas agendar el retiro en sucursal o necesitas transporte?",
        time: "13:00",
        latency: "18ms (Capa 1 AST)",
        cost: "$0.0000"
      },
      {
        sender: "client",
        text: "Excelente precio. Para retirar en sucursal hoy a las 2:00 PM.",
        time: "13:02",
        latency: null,
        cost: null
      },
      {
        sender: "agent",
        text: "Perfecto Carlos. Te he reservado la orden #4921 con presupuesto de $850.00 USD para las 2:00 PM. Un asesor de mostrador tendrá los materiales listos.",
        time: "13:02",
        latency: "42ms (Structured Output)",
        cost: "$0.00012"
      }
    ]
  },
  {
    id: "c2",
    name: "Dra. Valeria Rincón",
    phone: "+58 414-612-4490",
    status: "in-progress",
    statusLabel: "En Curso (Consultando Medidas)",
    score: 68,
    intent: "Tornillería & Fijaciones Drywall",
    budget: "$120.00 USD",
    schedule: "Pendiente",
    silentMode: false,
    lastTime: "12:45",
    messages: [
      {
        sender: "client",
        text: "Hola, tienen tornillos drywall de 1/2 pulgada en caja de 100u?",
        time: "12:44",
        latency: null,
        cost: null
      },
      {
        sender: "agent",
        text: "Hola Valeria. Sí, disponemos de Tornillo Drywall 1/2 pulgada x 100u (Marca FerreMax) en $3.80 la caja. ¿Cuántas cajas necesitas?",
        time: "12:45",
        latency: "8ms (Capa 1 Parser)",
        cost: "$0.0000"
      }
    ]
  },
  {
    id: "c3",
    name: "Ing. Roberto Peña",
    phone: "+56 9 8812 4431",
    status: "escalated",
    statusLabel: "Escalado a Humano (Garantía)",
    score: 45,
    intent: "Reclamo Técnico de Bomba de Agua",
    budget: "N/A",
    schedule: "Asesor Humano Asignado",
    silentMode: true,
    lastTime: "11:20",
    messages: [
      {
        sender: "client",
        text: "Compré una bomba sumergible hace 2 días y necesito hacer válida la garantía técnica.",
        time: "11:19",
        latency: null,
        cost: null
      },
      {
        sender: "agent",
        text: "Entendido Roberto. He pausado la atención automática y transferido tu caso directamente al Gerente de Postventa para revisar tu factura.",
        time: "11:20",
        latency: "35ms [ESCALAR_HUMANO]",
        cost: "$0.0000"
      }
    ]
  },
  {
    id: "c4",
    name: "Constructora del Lago C.A.",
    phone: "+58 261-798-1122",
    status: "closed",
    statusLabel: "Venta Cerrada ($2,400)",
    score: 99,
    intent: "Lote Estructural de Cabillas",
    budget: "$2,400.00 USD",
    schedule: "Despachado",
    silentMode: false,
    lastTime: "Ayer",
    messages: [
      {
        sender: "client",
        text: "Confirmamos la transferencia por el lote de cabillas 1/2 pulgada.",
        time: "Ayer",
        latency: null,
        cost: null
      },
      {
        sender: "agent",
        text: "¡Pago recibido con éxito! La guía de despacho #8812 fue emitida hacia la obra.",
        time: "Ayer",
        latency: "22ms (CRM Dispatch)",
        cost: "$0.0000"
      }
    ]
  }
];

export const INITIAL_LOGS: LogEntry[] = [
  {
    id: "log-1",
    time: "01:04:12",
    tag: "success",
    tagLabel: "200 OK",
    msg: "Webhook ack <14ms · session: +584120938472"
  },
  {
    id: "log-2",
    time: "01:04:13",
    tag: "info",
    tagLabel: "LAYER 1",
    msg: 'AST Regex matched: "Tornillo drywall 1/2" (SKU-4921)'
  },
  {
    id: "log-3",
    time: "01:04:13",
    tag: "success",
    tagLabel: "DISPATCH",
    msg: "Structured JSON validated with Pydantic · Dispatched via WAHA"
  }
];

export const N8N_ZONES = [
  {
    zone: 1,
    title: "ZONA 01: INGESTA & DEDUPLICACIÓN",
    nodes: [
      { id: "node-waha-webhook", name: "Webhook Ingest (WAHA)" },
      { id: "node-200-ack", name: "Fast 200 OK Response" },
      { id: "node-dedup-filter", name: "Deduplication (message_id)" },
      { id: "node-rate-limit", name: "Token Bucket Rate Limiter" },
      { id: "node-silent-check", name: "Silent Mode (fromMe check)" }
    ]
  },
  {
    zone: 2,
    title: "ZONA 02: PRE-PROCESAMIENTO & AUDIO",
    nodes: [
      { id: "node-audio-switch", name: "Type Switch (Audio / Text)" },
      { id: "node-groq-whisper", name: "Groq Whisper Stream (<800ms)" },
      { id: "node-debounce-burst", name: "Debounce Buffer (3s window)" },
      { id: "node-sanitize-input", name: "Input Text Normalizer" },
      { id: "node-load-session", name: "Session State Loader (Postgres)" }
    ]
  },
  {
    zone: 3,
    title: "ZONA 03: ENRUTAMIENTO & RAG HÍBRIDO",
    nodes: [
      { id: "node-intent-router", name: "Intent Classification Router" },
      { id: "node-layer1-ast", name: "Capa 1: AST Parser Determinístico" },
      { id: "node-layer3-trgm", name: "Capa 3: pg_trgm Fuzzy GIN" },
      { id: "node-layer4-vector", name: "Capa 4: pgvector Embedding" },
      { id: "node-sonnet-heal", name: "Claude Sonnet 5 Self-Healing" }
    ]
  },
  {
    zone: 4,
    title: "ZONA 04: STRUCTURED DISPATCH & CRM",
    nodes: [
      { id: "node-pydantic-val", name: "Pydantic Schema Validator" },
      { id: "node-sanitize-output", name: "Output Markdown Sanitizer" },
      { id: "node-crm-dispatch", name: "Supabase CRM (atenciones_pendientes)" },
      { id: "node-waha-send", name: "Send Message (WAHA HTTP)" },
      { id: "node-error-trigger", name: "Error Trigger Global Fallback" }
    ]
  }
];
