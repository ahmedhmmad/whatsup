'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { TranslationKey } from '@sendwhats/shared';
import { useT } from '@/lib/i18n';
import { useLabels, useSession } from '@/lib/session';

type InstanceStatus =
  | 'not_provisioned'
  | 'provisioned'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

interface InstanceState {
  id?: string;
  status: InstanceStatus;
  phoneNumber: string | null;
  lastConnectedAt: string | null;
  lastError?: string | null;
  evolutionInstanceName?: string;
  maxPerMinute?: number | null;
  maxPerDay?: number | null;
}

interface ConnectPayload {
  status: InstanceStatus;
  qrDataUrl: string | null;
  pairingCode: string | null;
  phoneNumber: string | null;
}

const STATUS_TONE: Record<InstanceStatus, string> = {
  not_provisioned: 'bg-slate-100 text-slate-600',
  provisioned: 'bg-slate-100 text-slate-600',
  connecting: 'bg-amber-50 text-amber-700',
  connected: 'bg-brand-50 text-brand-700',
  disconnected: 'bg-red-50 text-red-600',
  error: 'bg-red-50 text-red-600',
};

const formatPhone = (digits: string | null) => (digits ? `+${digits}` : null);

export default function WhatsAppPage() {
  const { organization, user } = useSession();
  // Unlinking or replacing the number, provisioning, and changing send caps are
  // owner-only on the API too — this just keeps staff from being offered them.
  const isOwner = user?.role === 'owner' || user?.role === 'super_admin';
  const labels = useLabels();
  const t = useT();

  const [instance, setInstance] = useState<InstanceState | null>(null);
  const [qr, setQr] = useState<ConnectPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const state = await api<InstanceState>('/api/v1/instance');
    setInstance(state);
    return state;
  }, []);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load, organization?.id]);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  /** While a QR is on screen, poll the real Evolution state until the scan lands. */
  useEffect(() => {
    if (!qr?.qrDataUrl) return;

    pollTimer.current = setInterval(async () => {
      try {
        const state = await api<InstanceState>('/api/v1/instance/status');
        setInstance(state);
        if (state.status === 'connected') {
          setQr(null);
          stopPolling();
        }
      } catch {
        // A failed poll is not fatal — the next tick tries again.
      }
    }, 3000);

    return stopPolling;
  }, [qr?.qrDataUrl, stopPolling]);

  useEffect(() => stopPolling, [stopPolling]);

  async function run(action: string, fn: () => Promise<void>) {
    setBusy(action);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  }

  const connect = () =>
    run('connect', async () => {
      const payload = await api<ConnectPayload>('/api/v1/instance/connect', { method: 'POST' });
      setQr(payload);
      await load();
    });

  const provision = () =>
    run('provision', async () => {
      await api('/api/v1/instance/provision', { method: 'POST' });
      await load();
    });

  const logout = () =>
    run('logout', async () => {
      if (!confirm(t('confirm.logout'))) return;
      await api('/api/v1/instance/logout', { method: 'POST' });
      setQr(null);
      await load();
    });

  const replaceNumber = () =>
    run('replace', async () => {
      if (!confirm(t('confirm.replaceNumber'))) return;
      const payload = await api<ConnectPayload>('/api/v1/instance/replace-number', { method: 'POST' });
      setQr(payload);
      await load();
    });

  const refresh = () =>
    run('refresh', async () => {
      const state = await api<InstanceState>('/api/v1/instance/status');
      setInstance(state);
    });

  if (!instance) {
    return <p className="text-sm text-slate-500">{error ?? 'Loading…'}</p>;
  }

  const status = instance.status;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{t('whatsapp.title')}</h1>
        <p className="text-sm text-slate-500">
          {t('help.whatsapp', { label: labels.organization })}
        </p>
      </div>

      <div className="card space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className={`badge ${STATUS_TONE[status]}`}>{t(`whatsapp.status.${status}` as TranslationKey)}</span>
              {instance.phoneNumber && (
                <span className="text-sm font-medium">{formatPhone(instance.phoneNumber)}</span>
              )}
            </div>
            {instance.lastConnectedAt && (
              <p className="mt-1 text-xs text-slate-400">
                Last connected {new Date(instance.lastConnectedAt).toLocaleString()}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={refresh} disabled={busy !== null}>
              {busy === 'refresh' ? t('whatsapp.checking') : t('whatsapp.refresh')}
            </button>

            {status === 'not_provisioned' && isOwner && (
              <button className="btn-primary" onClick={provision} disabled={busy !== null}>
                {busy === 'provision' ? t('import.working') : t('whatsapp.provision')}
              </button>
            )}

            {(status === 'provisioned' || status === 'disconnected' || status === 'error') && (
              <button className="btn-primary" onClick={connect} disabled={busy !== null}>
                {busy === 'connect' ? t('whatsapp.requestingQr') : t('whatsapp.connect')}
              </button>
            )}

            {status === 'connecting' && !qr && (
              <button className="btn-primary" onClick={connect} disabled={busy !== null}>
                {busy === 'connect' ? t('whatsapp.requestingQr') : t('whatsapp.showQr')}
              </button>
            )}

            {status === 'connected' && isOwner && (
              <>
                <button className="btn-secondary" onClick={replaceNumber} disabled={busy !== null}>
                  {busy === 'replace' ? t('import.working') : t('whatsapp.replaceNumber')}
                </button>
                <button className="btn-danger" onClick={logout} disabled={busy !== null}>
                  {busy === 'logout' ? t('import.working') : t('whatsapp.logout')}
                </button>
              </>
            )}
          </div>
        </div>

        {instance.lastError && status !== 'connected' && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{instance.lastError}</p>
        )}
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        {status === 'not_provisioned' && (
          <p className="text-sm text-slate-500">
            No instance exists on the messaging server for this {labels.organization.toLowerCase()} yet.
            Provisioning creates one; if it fails, the server is unreachable or its API key is wrong.
          </p>
        )}
      </div>

      {qr?.qrDataUrl && (
        <div className="card space-y-4 p-6 text-center">
          <h2 className="font-medium">{t('whatsapp.scanTitle')}</h2>
          <ol className="mx-auto max-w-md space-y-1 text-start text-sm text-slate-600">
            <li>1. {t('whatsapp.scanStep1')}</li>
            <li>2. {t('whatsapp.scanStep2')}</li>
            <li>3. {t('whatsapp.scanStep3')}</li>
          </ol>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr.qrDataUrl}
            alt="WhatsApp pairing QR code"
            className="mx-auto h-64 w-64 rounded-md border border-slate-200 bg-white p-2"
          />
          {qr.pairingCode && (
            <p className="text-sm text-slate-600">
              Or enter the pairing code <span className="font-mono font-medium">{qr.pairingCode}</span>
            </p>
          )}
          <p className="text-xs text-slate-400">
            Waiting for the scan… this page updates itself. Codes expire after about a minute — press
            “Connect WhatsApp” again for a fresh one.
          </p>
        </div>
      )}

      <SendLimits instance={instance} onSaved={setInstance} canEdit={isOwner} />
    </div>
  );
}

/** Per-instance send caps the queue enforces. Owner-only: these protect the number. */
function SendLimits({
  instance,
  onSaved,
  canEdit,
}: {
  instance: InstanceState;
  onSaved: (state: InstanceState) => void;
  canEdit: boolean;
}) {
  const t = useT();
  const [perMinute, setPerMinute] = useState(String(instance.maxPerMinute ?? ''));
  const [perDay, setPerDay] = useState(String(instance.maxPerDay ?? ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (instance.status === 'not_provisioned') return null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const state = await api<InstanceState>('/api/v1/instance/limits', {
        method: 'PATCH',
        body: {
          maxPerMinute: perMinute === '' ? null : Number(perMinute),
          maxPerDay: perDay === '' ? null : Number(perDay),
        },
      });
      onSaved(state);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save limits');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="card space-y-4 p-4">
      <div>
        <h2 className="font-medium">{t('whatsapp.limits')}</h2>
        <p className="text-sm text-slate-500">
          {t('help.limits')}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40">
          <label className="label">{t('whatsapp.perMinute')}</label>
          <input
            className="input"
            type="number"
            min={1}
            max={60}
            value={perMinute}
            onChange={(e) => setPerMinute(e.target.value)}
            placeholder="default"
            disabled={!canEdit}
          />
        </div>
        <div className="w-40">
          <label className="label">{t('whatsapp.perDay')}</label>
          <input
            className="input"
            type="number"
            min={1}
            max={10000}
            value={perDay}
            onChange={(e) => setPerDay(e.target.value)}
            placeholder="default"
            disabled={!canEdit}
          />
        </div>
        {canEdit ? (
          <button className="btn-secondary" disabled={busy}>
            {busy ? t('common.saving') : t('whatsapp.saveLimits')}
          </button>
        ) : (
          <p className="pb-2 text-xs text-slate-400">{t('whatsapp.ownerOnly')}</p>
        )}
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
    </form>
  );
}
