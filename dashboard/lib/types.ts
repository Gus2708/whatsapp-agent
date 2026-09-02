export type TabType = 'flight' | 'crm' | 'rag' | 'n8n' | 'devops';

export type LeadStatus = 'qualified' | 'in-progress' | 'escalated' | 'closed';

/** Which CRM pane is in focus on viewports too narrow to show list and chat together. */
export type CrmPane = 'list' | 'chat';

export interface ChatMessage {
  id?: string;
  sender: 'client' | 'agent' | 'system';
  text: string;
  time: string;
  latency?: string | null;
  cost?: string | null;
}

export interface Conversation {
  id: string;
  name: string;
  phone: string;
  status: LeadStatus;
  statusLabel: string;
  score: number;
  intent: string;
  budget: string;
  schedule: string;
  silentMode: boolean;
  lastTime: string;
  messages: ChatMessage[];
}

export interface LogEntry {
  id: string;
  time: string;
  tag: 'info' | 'success' | 'warn' | 'error';
  tagLabel: string;
  msg: string;
}

export type OrbState = 'idle' | 'searching_rag' | 'thinking_llm' | 'dispatched' | 'error';

export interface RagResult {
  hitLayer: 1 | 2 | 3 | 4 | 5;
  layerName: string;
  sku: string;
  productName: string;
  price: string;
  stock: string;
  latencyMs: number;
  costEstimate: string;
  confidence: number;
  method: string;
  query: string;
}

export interface N8nNodeStatus {
  id: string;
  name: string;
  zone: 1 | 2 | 3 | 4;
  zoneTitle: string;
  status: 'idle' | 'firing' | 'success' | 'warning';
  lastFired?: string;
}

export interface DevOpsScriptStatus {
  id: 'catchup' | 'sanitize' | 'autoheal' | 'watchdog';
  name: string;
  type: string;
  description: string;
  running: boolean;
  output: string[];
  lastExitCode?: number;
}
