import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { asyncHandler } from '../errors';
import { requireAuth, requireOrg } from '../middleware/auth';
import { getQuery, validateQuery } from '../middleware/validate';
import { translateServerMessage } from '@sendwhats/shared';
import { localeOf } from '../middleware/locale';
import { getAnalytics, resolveRange } from '../services/analytics';

export const opsRouter = Router();

opsRouter.use(requireAuth, requireOrg);

const auditQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(200).default(50),
  action: z.string().optional(),
  entityType: z.string().optional(),
  orgId: z.string().optional(),
});

/**
 * Who did what, scoped to this organization — including who sent which campaign to
 * how many people, which is the record a school needs when a parent asks.
 */
opsRouter.get(
  '/audit',
  validateQuery(auditQuerySchema),
  asyncHandler(async (req, res) => {
    const q = getQuery<z.infer<typeof auditQuerySchema>>(req);
    const where = {
      organizationId: req.org!.id,
      ...(q.action ? { action: { contains: q.action } } : {}),
      ...(q.entityType ? { entityType: q.entityType } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { user: { select: { id: true, email: true, name: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  }),
);

const ALERT_WINDOW_HOURS = 48;

/**
 * Things an admin should act on, gathered in one place: a number that is not
 * connected, campaigns stopped mid-flight, and recent disconnects. The console
 * shows these as a banner so a stalled send is noticed without opening a campaign.
 */
opsRouter.get(
  '/alerts',
  asyncHandler(async (req, res) => {
    const since = new Date(Date.now() - ALERT_WINDOW_HOURS * 60 * 60 * 1000);

    const [instance, stalled, disconnects, contactsWithoutConsent] = await Promise.all([
      prisma.whatsAppInstance.findUnique({
        where: { organizationId: req.org!.id },
        select: { status: true, phoneNumber: true, lastError: true, lastConnectedAt: true },
      }),
      prisma.campaign.findMany({
        where: { organizationId: req.org!.id, status: { in: ['paused', 'failed'] } },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: { id: true, name: true, status: true, lastError: true, updatedAt: true },
      }),
      prisma.auditLog.count({
        where: {
          organizationId: req.org!.id,
          action: { in: ['instance.disconnected', 'campaign.paused_disconnected'] },
          createdAt: { gte: since },
        },
      }),
      prisma.contact.count({
        where: { organizationId: req.org!.id, status: 'active', consentConfirmed: false },
      }),
    ]);

    const locale = localeOf(req);
    const ar = locale === 'ar';
    const state = (value: string) => translateServerMessage(locale, value.replace(/_/g, ' '));
    const alerts: { level: 'error' | 'warning' | 'info'; message: string; href?: string }[] = [];

    if (!instance || instance.status === 'not_provisioned') {
      alerts.push({
        level: 'error',
        message: ar
          ? 'لم يتم إعداد رقم واتساب بعد — لا يمكن إرسال الحملات.'
          : 'No WhatsApp number is set up yet — campaigns cannot send.',
        href: '/whatsapp',
      });
    } else if (instance.status !== 'connected') {
      alerts.push({
        level: 'error',
        message: ar
          ? `رقم واتساب في حالة ${state(instance.status)}${
              instance.lastError ? ` — ${translateServerMessage(locale, instance.lastError)}` : ''
            }.`
          : `The WhatsApp number is ${instance.status.replace(/_/g, ' ')}${
              instance.lastError ? ` — ${instance.lastError}` : ''
            }.`,
        href: '/whatsapp',
      });
    }

    for (const campaign of stalled) {
      alerts.push({
        level: campaign.status === 'failed' ? 'error' : 'warning',
        message: ar
          ? `الحملة «${campaign.name ?? 'بدون عنوان'}» في حالة ${state(campaign.status)}${
              campaign.lastError ? ` — ${translateServerMessage(locale, campaign.lastError)}` : ''
            }.`
          : `“${campaign.name ?? 'Untitled campaign'}” is ${campaign.status}${
              campaign.lastError ? ` — ${campaign.lastError}` : ''
            }.`,
        href: `/campaigns/${campaign.id}`,
      });
    }

    if (disconnects >= 3) {
      alerts.push({
        level: 'warning',
        message: ar
          ? `انقطع هذا الرقم ${disconnects} مرات خلال آخر ${ALERT_WINDOW_HOURS} ساعة — قد يكون مقيداً أو محظوراً.`
          : `This number dropped ${disconnects} times in the last ${ALERT_WINDOW_HOURS} hours — it may be rate limited or blocked.`,
        href: '/whatsapp',
      });
    }

    if (contactsWithoutConsent > 0) {
      alerts.push({
        level: 'info',
        message: ar
          ? `${contactsWithoutConsent} جهة اتصال نشطة بدون موافقة مؤكدة، وسيتم استبعادها من كل إرسال.`
          : `${contactsWithoutConsent} active contact(s) have no confirmed consent and are excluded from every send.`,
        href: '/contacts',
      });
    }

    res.json({ alerts, instance });
  }),
);

const analyticsQuerySchema = z.object({
  days: z.coerce.number().min(1).max(365).default(30),
  /** Reader's offset from UTC, so send hours are reported in their own clock. */
  utcOffsetMinutes: z.coerce.number().min(-840).max(840).default(0),
  orgId: z.string().optional(),
});

/** Campaign performance: what was sent, what arrived, what failed, and when. */
opsRouter.get(
  '/analytics',
  validateQuery(analyticsQuerySchema),
  asyncHandler(async (req, res) => {
    const q = getQuery<z.infer<typeof analyticsQuerySchema>>(req);
    res.json(await getAnalytics(req.org!.id, resolveRange(q.days), q.utcOffsetMinutes));
  }),
);
