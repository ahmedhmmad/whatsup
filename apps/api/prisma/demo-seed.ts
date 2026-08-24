import 'dotenv/config';
import { PrismaClient, type MessageJobStatus } from '@prisma/client';
import { normalizePhone } from '@sendwhats/shared';
import { hashPassword } from '../src/lib/password';

/**
 * Demo data for showing the platform to someone.
 *
 * Builds a school that looks like it has been running for a month: five classes,
 * ~120 students, a few realistic wrinkles (siblings sharing a guardian number,
 * unconfirmed consent, inactive records), and a campaign history spread across
 * days and hours so the analytics screens have something real to draw.
 *
 * Message history is written directly rather than sent, so running this costs no
 * WhatsApp messages and touches no Evolution instance.
 *
 *   npm run seed:demo            # create (or rebuild) the demo school
 *   npm run seed:demo -- --reset # remove it again
 */

const prisma = new PrismaClient();

const ORG_NAME = 'Al-Noor International School';
const OWNER_EMAIL = 'demo@school.local';
const OWNER_PASSWORD = 'DemoPass123!';
const STAFF_EMAIL = 'secretary@school.local';
const STAFF_PASSWORD = 'StaffPass123!';

const CLASSES = ['Grade 9 - A', 'Grade 9 - B', 'Grade 10 - A', 'Grade 10 - B', 'Grade 11 - A'];

const BOYS = [
  'أحمد محمود', 'عمر خالد', 'يوسف عادل', 'زياد نبيل', 'كريم حسني', 'مازن سامي',
  'طارق فؤاد', 'حسن إبراهيم', 'مروان أشرف', 'سيف الدين رامي', 'عبدالله ماهر', 'بلال صبري',
];
const GIRLS = [
  'فاطمة علي', 'نور سامي', 'ياسمين عادل', 'مريم حسن', 'سارة خالد', 'هنا طارق',
  'ملك أحمد', 'جنى وليد', 'ليلى مصطفى', 'رنا عماد', 'سلمى فتحي', 'دينا هشام',
];

const FAILURE_REASONS = [
  'Evolution API POST /message/sendText failed: number not registered on WhatsApp',
  'Evolution API POST /message/sendText failed: number not registered on WhatsApp',
  'Could not reach Evolution API: fetch failed',
];

const CAMPAIGNS = [
  { name: 'Parent-teacher meeting', text: 'اجتماع أولياء الأمور يوم الأحد الساعة 10 صباحاً.', daysAgo: 28, classes: [0, 1, 2, 3, 4], hour: 9 },
  { name: 'Mid-term exam schedule', text: 'جدول امتحانات منتصف الفصل متاح الآن على البوابة.', daysAgo: 21, classes: [2, 3, 4], hour: 11 },
  { name: 'Fee reminder — term 2', text: 'تذكير بسداد مصروفات الفصل الثاني قبل نهاية الشهر.', daysAgo: 14, classes: [0, 1, 2, 3, 4], hour: 13 },
  { name: 'Girls sports day', text: 'يوم رياضي للطالبات الخميس القادم، يرجى إحضار الزي الرياضي.', daysAgo: 9, classes: [0, 1, 2], hour: 10, gender: 'female' },
  { name: 'Bus route change', text: 'تغيير في خط الحافلة رقم 3 اعتباراً من الأحد.', daysAgo: 4, classes: [1, 3], hour: 15 },
  { name: 'Ramadan timetable', text: 'مواعيد الدراسة خلال شهر رمضان المبارك مرفقة.', daysAgo: 1, classes: [0, 1, 2, 3, 4], hour: 8 },
];

/** Deterministic pseudo-random so repeated runs produce the same-looking school. */
let seedState = 42;
const rand = () => {
  seedState = (seedState * 1103515245 + 12345) % 2147483648;
  return seedState / 2147483648;
};
const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)];

async function removeDemo() {
  const existing = await prisma.organization.findFirst({ where: { name: ORG_NAME } });
  if (!existing) return false;
  // Campaigns, jobs, contacts, groups and users all cascade from the organization.
  await prisma.organization.delete({ where: { id: existing.id } });
  return true;
}

async function main() {
  if (process.argv.includes('--reset')) {
    console.log((await removeDemo()) ? '✓ demo school removed' : '• no demo school to remove');
    return;
  }

  if (await removeDemo()) console.log('• replaced the previous demo school');

  const org = await prisma.organization.create({
    data: { name: ORG_NAME, type: 'school', countryCode: '20' },
  });

  await prisma.user.createMany({
    data: [
      {
        organizationId: org.id,
        email: OWNER_EMAIL,
        passwordHash: await hashPassword(OWNER_PASSWORD),
        name: 'Mona Abdelrahman',
        role: 'owner',
        lastLoginAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
      {
        organizationId: org.id,
        email: STAFF_EMAIL,
        passwordHash: await hashPassword(STAFF_PASSWORD),
        name: 'Hala Mostafa',
        role: 'staff',
        lastLoginAt: new Date(Date.now() - 26 * 60 * 60 * 1000),
      },
    ],
  });
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: OWNER_EMAIL } });

  await prisma.messageTemplate.createMany({
    data: [
      {
        organizationId: org.id,
        name: 'Guardian notice',
        body: 'السيد/ة ولي أمر الطالب {{name}}\n\n{{message}}',
        mergeTarget: 'guardian_phone',
        isDefault: true,
      },
      {
        organizationId: org.id,
        name: 'With class name',
        body: 'السيد/ة ولي أمر الطالب {{name}} - {{group}}\n\n{{message}}\n\nإدارة المدرسة',
        mergeTarget: 'guardian_phone',
      },
    ],
  });

  const groups = [];
  for (const name of CLASSES) {
    groups.push(await prisma.group.create({ data: { organizationId: org.id, name } }));
  }

  // --- students ---------------------------------------------------------------
  let phoneCounter = 0;
  const nextPhone = () => {
    phoneCounter++;
    return normalizePhone(`010${String(20000000 + phoneCounter * 137).slice(0, 8)}`, '20')!.digits;
  };

  const contacts: { id: string; groupId: string; gender: string; guardian: string }[] = [];

  for (const [index, group] of groups.entries()) {
    const size = 22 + Math.floor(rand() * 6);
    let siblingPhone: string | null = null;

    for (let i = 0; i < size; i++) {
      const isGirl = rand() > 0.48;
      const gender = isGirl ? 'female' : 'male';
      const base = isGirl ? pick(GIRLS) : pick(BOYS);
      const fullName = `${base} ${['الشريف', 'عبدالله', 'حمدي', 'رشدي', 'زكي', 'عثمان'][i % 6]}`;

      // Two siblings per class share one guardian number, which is what makes the
      // "same number as another recipient" warning show up in a real demo.
      let guardian: string;
      if (i === 3) {
        siblingPhone = nextPhone();
        guardian = siblingPhone;
      } else if (i === 4 && siblingPhone) {
        guardian = siblingPhone;
      } else {
        guardian = nextPhone();
      }

      const contact = await prisma.contact.create({
        data: {
          organizationId: org.id,
          groupId: group.id,
          fullName,
          status: rand() > 0.96 ? 'inactive' : 'active',
          // A handful of records are missing consent, so the exclusion notice is real.
          consentConfirmed: rand() > 0.04,
          customFields: { gender, guardian_phone: guardian },
          externalId: `STU-${index + 9}${String(i).padStart(3, '0')}`,
        },
        select: { id: true, groupId: true },
      });
      contacts.push({ id: contact.id, groupId: contact.groupId!, gender, guardian });
    }
  }

  // --- campaign history -------------------------------------------------------
  for (const spec of CAMPAIGNS) {
    const groupIds = spec.classes.map((i) => groups[i].id);
    const audience = contacts.filter(
      (c) => groupIds.includes(c.groupId) && (!spec.gender || c.gender === spec.gender),
    );

    const startedAt = new Date();
    startedAt.setDate(startedAt.getDate() - spec.daysAgo);
    startedAt.setHours(spec.hour, 5, 0, 0);

    const campaign = await prisma.campaign.create({
      data: {
        organizationId: org.id,
        name: spec.name,
        messageText: spec.text,
        targetFilter: {
          mode: 'groups',
          groupIds,
          ...(spec.gender ? { customFieldFilters: { gender: [spec.gender] } } : {}),
        },
        status: 'completed',
        createdById: owner.id,
        totalRecipients: audience.length,
        createdAt: startedAt,
        startedAt,
      },
    });

    let sent = 0;
    let delivered = 0;
    let failed = 0;

    const jobs = audience.map((contact, index) => {
      // Messages trickle out at the configured pace, so they land across the hour.
      const sentAt = new Date(startedAt.getTime() + index * 11_000);
      const roll = rand();
      let status: MessageJobStatus;
      if (roll > 0.97) status = 'failed';
      else if (roll > 0.55) status = 'read';
      else if (roll > 0.12) status = 'delivered';
      else status = 'sent';

      if (status === 'failed') failed++;
      else {
        sent++;
        if (status !== 'sent') delivered++;
      }

      return {
        campaignId: campaign.id,
        contactId: contact.id,
        phone: contact.guardian,
        renderedText: `السيد/ة ولي أمر الطالب\n\n${spec.text}`,
        status,
        attempts: 1,
        providerMessageId: status === 'failed' ? null : `3EB0${campaign.id.slice(-6)}${index}`,
        sentAt: status === 'failed' ? null : sentAt,
        deliveredAt: status === 'delivered' || status === 'read' ? new Date(sentAt.getTime() + 40_000) : null,
        error: status === 'failed' ? pick(FAILURE_REASONS) : null,
        createdAt: startedAt,
        queuedAt: startedAt,
      };
    });

    await prisma.messageJob.createMany({ data: jobs });
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        sentCount: sent,
        deliveredCount: delivered,
        failedCount: failed,
        completedAt: new Date(startedAt.getTime() + jobs.length * 11_000),
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: org.id,
        userId: owner.id,
        action: 'campaign.dispatched',
        entityType: 'campaign',
        entityId: campaign.id,
        metadata: { queued: audience.length },
        createdAt: startedAt,
      },
    });
  }

  // A draft waiting to be sent, so the demo has something live to click.
  const draftAudience = contacts.filter((c) => c.groupId === groups[2].id && c.gender === 'female');
  const draft = await prisma.campaign.create({
    data: {
      organizationId: org.id,
      name: 'Girls trip permission (draft)',
      messageText: 'رحلة الطالبات يوم الثلاثاء، يرجى التوقيع على إذن الخروج.',
      targetFilter: { mode: 'groups', groupIds: [groups[2].id], customFieldFilters: { gender: ['female'] } },
      status: 'draft',
      createdById: owner.id,
      totalRecipients: draftAudience.length,
    },
  });
  await prisma.messageJob.createMany({
    data: draftAudience.map((contact) => ({
      campaignId: draft.id,
      contactId: contact.id,
      phone: contact.guardian,
      renderedText: 'السيد/ة ولي أمر الطالب\n\nرحلة الطالبات يوم الثلاثاء، يرجى التوقيع على إذن الخروج.',
    })),
  });

  const totals = await prisma.messageJob.count({ where: { campaign: { organizationId: org.id } } });
  console.log(`✓ ${ORG_NAME}`);
  console.log(`  ${CLASSES.length} classes, ${contacts.length} students, ${CAMPAIGNS.length} past campaigns, ${totals} messages`);
  console.log(`  owner: ${OWNER_EMAIL} / ${OWNER_PASSWORD}`);
  console.log(`  staff: ${STAFF_EMAIL} / ${STAFF_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
