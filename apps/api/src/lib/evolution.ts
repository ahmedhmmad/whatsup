import { env } from '../env';
import { logger } from '../logger';

/**
 * Thin typed client for the self-hosted Evolution API.
 *
 * Two callers use it: super-admin provisioning (global API key) and org-scoped
 * connect/send actions (the instance's own key when Evolution issued one).
 * Responses are read defensively — Evolution's shapes differ between versions and
 * deployments, so every getter tolerates a missing field rather than throwing far
 * from the request that caused it.
 */

export class EvolutionError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
    /** True when the failure was transport-level (server down, DNS, timeout). */
    public isTransport = false,
  ) {
    super(message);
    this.name = 'EvolutionError';
  }

  /** Evolution/WhatsApp says slow down — the queue should back off rather than retry hard. */
  get isRateLimited() {
    return this.status === 429;
  }

  get isNotFound() {
    return this.status === 404;
  }
}

export type EvolutionState = 'open' | 'connecting' | 'close' | 'unknown';

export interface CreateInstanceResult {
  instanceName: string;
  instanceId?: string;
  /** Instance-scoped API key Evolution issued, if any. */
  apiKey?: string;
  qrCode?: string;
  qrBase64?: string;
  raw: unknown;
}

export interface ConnectResult {
  /** Raw QR payload — rendered to an image by the instance service. */
  code?: string;
  /** Data URI when Evolution returned the image itself. */
  base64?: string;
  pairingCode?: string;
  raw: unknown;
}

export interface InstanceDetails {
  state: EvolutionState;
  /** Digits of the linked number, when Evolution reports an owner. */
  phoneNumber: string | null;
  profileName: string | null;
  raw: unknown;
}

export const DEFAULT_WEBHOOK_EVENTS = [
  'QRCODE_UPDATED',
  'CONNECTION_UPDATE',
  'MESSAGES_UPDATE',
  'SEND_MESSAGE',
] as const;

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

/** "201001234567@s.whatsapp.net" / "+20 100 123 4567" -> "201001234567" */
export function jidToDigits(jid: unknown): string | null {
  const value = str(jid);
  if (!value) return null;
  const digits = value.split('@')[0].split(':')[0].replace(/\D/g, '');
  return digits || null;
}

function normalizeState(value: unknown): EvolutionState {
  const state = String(value ?? '').toLowerCase();
  if (state === 'open' || state === 'connected') return 'open';
  if (state === 'connecting') return 'connecting';
  if (state === 'close' || state === 'closed' || state === 'disconnected') return 'close';
  return 'unknown';
}

export class EvolutionClient {
  constructor(
    private baseUrl: string = env.EVOLUTION_API_URL,
    private globalApiKey: string = env.EVOLUTION_API_KEY,
    private timeoutMs = 15_000,
  ) {}

  get isConfigured() {
    return Boolean(this.baseUrl && this.globalApiKey);
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    options: { body?: unknown; apiKey?: string; timeoutMs?: number } = {},
  ): Promise<T> {
    const url = `${this.baseUrl.replace(/\/+$/, '')}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? this.timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          apikey: options.apiKey || this.globalApiKey,
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });

      const text = await res.text();
      let payload: unknown = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = text;
      }

      if (!res.ok) {
        const record = asRecord(payload);
        const detail =
          str(record.message) ??
          str(asRecord(record.response).message) ??
          (typeof payload === 'string' ? payload : undefined) ??
          res.statusText;
        throw new EvolutionError(res.status, `Evolution API ${method} ${path} failed: ${detail}`, payload);
      }

      return payload as T;
    } catch (err) {
      if (err instanceof EvolutionError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ err, method, path }, 'Evolution API request failed');
      throw new EvolutionError(0, `Could not reach Evolution API: ${message}`, undefined, true);
    } finally {
      clearTimeout(timer);
    }
  }

  async createInstance(
    instanceName: string,
    options: { webhookUrl?: string; token?: string } = {},
  ): Promise<CreateInstanceResult> {
    const body: Record<string, unknown> = {
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
      groupsIgnore: true,
      alwaysOnline: false,
      readMessages: false,
      syncFullHistory: false,
    };
    if (options.token) body.token = options.token;
    if (options.webhookUrl) {
      body.webhook = {
        url: options.webhookUrl,
        byEvents: false,
        base64: false,
        events: [...DEFAULT_WEBHOOK_EVENTS],
      };
    }

    const payload = await this.request('POST', '/instance/create', { body });
    const record = asRecord(payload);
    const instance = asRecord(record.instance);
    const qrcode = asRecord(record.qrcode);

    return {
      instanceName: str(instance.instanceName) ?? instanceName,
      instanceId: str(instance.instanceId),
      apiKey: str(asRecord(record.hash).apikey) ?? str(record.hash) ?? options.token,
      qrCode: str(qrcode.code),
      qrBase64: str(qrcode.base64),
      raw: payload,
    };
  }

  /** Starts a pairing attempt and returns the QR payload to show the admin. */
  async connect(instanceName: string, apiKey?: string): Promise<ConnectResult> {
    const payload = await this.request('GET', `/instance/connect/${encodeURIComponent(instanceName)}`, {
      apiKey,
    });
    const record = asRecord(payload);
    return {
      code: str(record.code),
      base64: str(record.base64),
      pairingCode: str(record.pairingCode),
      raw: payload,
    };
  }

  async connectionState(instanceName: string, apiKey?: string): Promise<EvolutionState> {
    const payload = await this.request(
      'GET',
      `/instance/connectionState/${encodeURIComponent(instanceName)}`,
      { apiKey },
    );
    const record = asRecord(payload);
    return normalizeState(asRecord(record.instance).state ?? record.state);
  }

  /**
   * Connection state plus the linked number. Evolution exposes the owner only via
   * fetchInstances, and its shape varies between versions, so this reads both the
   * v1 (nested under `instance`) and v2 (flat) layouts.
   */
  async fetchInstance(instanceName: string, apiKey?: string): Promise<InstanceDetails> {
    const payload = await this.request(
      'GET',
      `/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`,
      { apiKey },
    );

    const list = Array.isArray(payload) ? payload : [payload];
    const flattened = list.map((entry) => {
      const record = asRecord(entry);
      return Object.keys(asRecord(record.instance)).length ? asRecord(record.instance) : record;
    });
    const match =
      flattened.find(
        (record) => str(record.instanceName) === instanceName || str(record.name) === instanceName,
      ) ?? asRecord(flattened[0]);

    return {
      state: normalizeState(match.connectionStatus ?? match.state ?? match.status),
      phoneNumber: jidToDigits(match.ownerJid ?? match.owner ?? match.number),
      profileName: str(match.profileName) ?? null,
      raw: payload,
    };
  }

  async logout(instanceName: string, apiKey?: string): Promise<void> {
    await this.request('DELETE', `/instance/logout/${encodeURIComponent(instanceName)}`, { apiKey });
  }

  async deleteInstance(instanceName: string, apiKey?: string): Promise<void> {
    await this.request('DELETE', `/instance/delete/${encodeURIComponent(instanceName)}`, { apiKey });
  }

  async restart(instanceName: string, apiKey?: string): Promise<void> {
    await this.request('POST', `/instance/restart/${encodeURIComponent(instanceName)}`, { apiKey });
  }

  async setWebhook(instanceName: string, url: string, apiKey?: string): Promise<void> {
    const settings = {
      enabled: true,
      url,
      webhookByEvents: false,
      webhookBase64: false,
      events: [...DEFAULT_WEBHOOK_EVENTS],
    };
    // v2 nests the settings under `webhook`; older builds read them at the top level.
    await this.request('POST', `/webhook/set/${encodeURIComponent(instanceName)}`, {
      apiKey,
      body: { webhook: settings, ...settings },
    });
  }

  /** Used by the Phase 5 queue worker; every Evolution call lives in this one client. */
  async sendText(
    instanceName: string,
    params: { number: string; text: string; delayMs?: number },
    apiKey?: string,
  ): Promise<unknown> {
    return this.request('POST', `/message/sendText/${encodeURIComponent(instanceName)}`, {
      apiKey,
      body: {
        number: params.number,
        text: params.text,
        delay: params.delayMs ?? 0,
      },
    });
  }
}

export const evolution = new EvolutionClient();
