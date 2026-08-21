'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

interface Alert {
  level: 'error' | 'warning' | 'info';
  message: string;
  href?: string;
}

const TONE: Record<Alert['level'], string> = {
  error: 'border-red-200 bg-red-50 text-red-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  info: 'border-slate-200 bg-slate-50 text-slate-600',
};

/**
 * Shown on every console screen: a disconnected number or a campaign stopped
 * mid-send is the kind of thing that otherwise goes unnoticed until someone asks
 * why the parents never got the message.
 */
export function AlertsBanner() {
  const { organization } = useSession();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    if (!organization) return;

    const load = () =>
      api<{ alerts: Alert[] }>('/api/v1/ops/alerts')
        .then((res) => setAlerts(res.alerts))
        .catch(() => setAlerts([]));

    void load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [organization?.id]);

  const visible = alerts.filter((alert) => !dismissed.includes(alert.message));
  if (!visible.length) return null;

  return (
    <div className="space-y-2">
      {visible.map((alert) => (
        <div
          key={alert.message}
          className={`flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm ${TONE[alert.level]}`}
        >
          <p>
            {alert.message}
            {alert.href && (
              <Link href={alert.href} className="ml-2 underline">
                Open
              </Link>
            )}
          </p>
          {alert.level === 'info' && (
            <button
              type="button"
              aria-label="Dismiss"
              className="opacity-60 hover:opacity-100"
              onClick={() => setDismissed((current) => [...current, alert.message])}
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
