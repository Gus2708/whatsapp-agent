import { Conversation } from './types';

export interface RecruiterArchitectureMetric {
  title: string;
  value: string;
  badge: string;
  description: string;
  technicalDetails: string[];
}

export const DEMO_ARCHITECTURE_PILLARS: RecruiterArchitectureMetric[] = [
  {
    title: 'Pipeline RAG de 5 Capas',
    value: 'Sub-14ms AST Match',
    badge: 'Zero Hallucination',
    description: 'Búsqueda determinista escalonada sobre catálogo de 7.650 SKUs ferreteros e industriales.',
    technicalDetails: [
      'Capa 01: Determinismo AST Regex (<2ms, 0 tokens, 100% exactitud)',
      'Capa 02: Normalización & Diccionario de Sinónimos de Taller',
      'Capa 03: Fuzzy String Matching con pg_trgm (GIN Index)',
      'Capa 04: Búsqueda Semántica Vectorial con pgvector (HNSW Cosine)',
      'Capa 05: Fallback con LLM & Structured JSON Validation',
    ],
  },
  {
    title: 'Orquestación n8n & Deduplicación',
    value: '33 Nodos / Zero-Desync',
    badge: 'High Concurrency',
    description: 'Control de flujo distribuido con cola de deduplicación en memoria para mitigar reintentos de WhatsApp.',
    technicalDetails: [
      'Filtro de deduplicación en ventana temporal de 60 segundos',
      'Enrutamiento condicional según intención y estado de la sesión',
      'Integración desacoplada con pasarela WAHA y Supabase Vector DB',
      'Manejo de timeouts y circuitos de recuperación automática',
    ],
  },
  {
    title: 'Resiliencia & Catch-Up Autónomo',
    value: 'Zero Data Loss',
    badge: 'Fault Tolerant',
    description: 'Mecanismo de auto-recuperación ante cortes eléctricos o caídas de red para procesar mensajes pendientes.',
    technicalDetails: [
      'Catch-up script en PowerShell que sincroniza estado con Supabase',
      'Túneles Cloudflare dinámicos con auto-reconectador en background',
      'Preservación de orden de mensajes mediante marcas de tiempo UTC',
      'Heartbeat cada 30s con alertas de telemetría en tiempo real',
    ],
  },
  {
    title: 'Pydantic Structured Outputs',
    value: '80.6% Resolución Autónoma',
    badge: 'Enterprise Grade',
    description: 'Validación estricta de esquemas para cotizaciones, métodos de pago y políticas de retiro en tienda.',
    technicalDetails: [
      'Esquemas Pydantic para precios exactos sin IVA adicional inventado',
      'Políticas de atención: Pago Móvil, Zelle, Transferencia Banesco/Mercantil',
      'Detección automática de intención de compra vs. soporte técnico',
      'Transferencia a agente humano ante consultas fuera de inventario',
    ],
  },
];

export const DEMO_CONVERSATIONS: Conversation[] = [
  {
    id: 'demo-conv-1',
    name: 'Constructora Horizonte C.A.',
    phone: '+58 414-982-1144',
    status: 'qualified',
    statusLabel: 'COTIZADO (AUTO)',
    score: 95,
    intent: 'Cotización Cemento Portland 50 sacos',
    budget: '$425.00 USD',
    schedule: 'Retiro Hoy 3:00 PM',
    silentMode: false,
    lastTime: '10:42 AM',
    messages: [
      {
        id: 'm1-1',
        sender: 'client',
        text: 'Buenos días, necesito cotización urgente de 50 sacos de Cemento Gris Portland Tipo I para retirar hoy.',
        time: '10:40 AM',
      },
      {
        id: 'm1-2',
        sender: 'agent',
        text: '¡Hola! Con gusto te cotizo. Disponemos de Cemento Gris Portland Tipo I (Saco 42.5kg) a $8.50 por unidad. Total por 50 sacos: $425.00 USD. Aceptamos Pago Móvil a tasa BCV del día, Zelle y transferencias Banesco/Mercantil.',
        time: '10:41 AM',
        latency: '11ms',
        cost: '$0.0000',
      },
      {
        id: 'm1-3',
        sender: 'client',
        text: 'Perfecto, envíame los datos de Pago Móvil para transferir lo de los 50 sacos de cemento.',
        time: '10:42 AM',
      },
    ],
  },
  {
    id: 'demo-conv-2',
    name: 'Ing. Carlos Mendoza (Taller)',
    phone: '+58 412-553-9012',
    status: 'in-progress',
    statusLabel: 'EN ATENCIÓN',
    score: 88,
    intent: 'Consulta Electrodos 6013 1/8"',
    budget: '$52.00 USD',
    schedule: 'En Espera',
    silentMode: false,
    lastTime: '10:35 AM',
    messages: [
      {
        id: 'm2-1',
        sender: 'client',
        text: '¿Tienen electrodos 6013 de 1/8 en caja de 20kg?',
        time: '10:35 AM',
      },
      {
        id: 'm2-2',
        sender: 'agent',
        text: 'Sí, disponemos de Electrodos E6013 1/8" (Caja 20kg marca Lincoln) a $52.00 USD la caja. También tenemos presentaciones de 5kg a $14.50 USD.',
        time: '10:35 AM',
        latency: '18ms',
        cost: '$0.0000',
      },
    ],
  },
  {
    id: 'demo-conv-3',
    name: 'Distribuidora Suministros Andinos',
    phone: '+58 424-771-3320',
    status: 'qualified',
    statusLabel: 'COMPROBANTE RECIBIDO',
    score: 98,
    intent: 'Validación Pago Zelle',
    budget: '$380.00 USD',
    schedule: 'Despacho Programado',
    silentMode: false,
    lastTime: '09:58 AM',
    messages: [
      {
        id: 'm3-1',
        sender: 'client',
        text: 'Comprobante de Zelle enviado por $380.00. Confirmar recepción.',
        time: '09:58 AM',
      },
      {
        id: 'm3-2',
        sender: 'agent',
        text: '¡Comprobante Zelle recibido con éxito! Nuestro equipo de administración está validando la acreditación. Te notificaremos cuando tu pedido esté listo para despacho o retiro en tienda.',
        time: '09:58 AM',
        latency: '14ms',
        cost: '$0.0000',
      },
    ],
  },
  {
    id: 'demo-conv-4',
    name: 'Dra. Valeria Rincón',
    phone: '+58 416-302-8819',
    status: 'closed',
    statusLabel: 'FINALIZADO',
    score: 75,
    intent: 'Horario y Sede Principal',
    budget: '$0.00 USD',
    schedule: 'Atendido',
    silentMode: false,
    lastTime: '09:15 AM',
    messages: [
      {
        id: 'm4-1',
        sender: 'client',
        text: '¿Cuál es el horario de atención para retirar en la sede principal?',
        time: '09:14 AM',
      },
      {
        id: 'm4-2',
        sender: 'agent',
        text: 'Nuestro horario de atención en sede principal es de Lunes a Viernes de 8:00 AM a 5:00 PM (horario corrido) y Sábados de 8:30 AM a 2:00 PM. ¡Te esperamos!',
        time: '09:15 AM',
        latency: '10ms',
        cost: '$0.0000',
      },
    ],
  },
  {
    id: 'demo-conv-5',
    name: 'Metalúrgica del Norte C.A.',
    phone: '+58 414-220-6540',
    status: 'qualified',
    statusLabel: 'COTIZADO (AUTO)',
    score: 92,
    intent: 'Cotización Tubos Estructurales 2x1',
    budget: '$170.40 USD',
    schedule: 'Retiro en Sede',
    silentMode: false,
    lastTime: '08:45 AM',
    messages: [
      {
        id: 'm5-1',
        sender: 'client',
        text: 'Necesito 12 tubos estructurales 2x1 calibre 16 de 6 metros.',
        time: '08:44 AM',
      },
      {
        id: 'm5-2',
        sender: 'agent',
        text: 'Disponemos de Tubo Estructural 2x1 Calibre 16 (Largo 6m) a $14.20 USD por unidad. Total por 12 unidades: $170.40 USD. ¿Deseas coordinar retiro en tienda o despacho en camión?',
        time: '08:45 AM',
        latency: '12ms',
        cost: '$0.0000',
      },
    ],
  },
];
