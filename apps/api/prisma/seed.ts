import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { normalizePhone } from '@sendwhats/shared';
import { hashPassword } from '../src/lib/password';
import { createOrganization } from '../src/services/organizations';

const prisma = new PrismaClient();

const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL ?? 'admin@sendwhats.local').toLowerCase();
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD ?? 'ChangeMe123!';
const WITH_DEMO = process.env.SEED_DEMO !== 'false';

/** Stand-in for the hardcoded student list in the old n8n flow. */
const DEMO_STUDENTS = [
  { fullName: 'أحمد محمود', guardian_phone: '01001234567', gender: 'male' },
  { fullName: 'سارة خالد', guardian_phone: '01001234568', gender: 'female' },
  { fullName: 'يوسف عادل', guardian_phone: '01001234569', gender: 'male' },
  { fullName: 'مريم حسن', guardian_phone: '01001234570', gender: 'female' },
  { fullName: 'عمر إبراهيم', guardian_phone: '01001234571', gender: 'male' },
  { fullName: 'نور طارق', guardian_phone: '01001234572', gender: 'female' },
];

async function seedSuperAdmin() {
  const existing = await prisma.user.findUnique({ where: { email: SUPER_ADMIN_EMAIL } });
  if (existing) {
    console.log(`• super admin already exists: ${SUPER_ADMIN_EMAIL}`);
    return;
  }
  await prisma.user.create({
    data: {
      email: SUPER_ADMIN_EMAIL,
      passwordHash: await hashPassword(SUPER_ADMIN_PASSWORD),
      name: 'Super Admin',
      role: 'super_admin',
    },
  });
  console.log(`✓ super admin created: ${SUPER_ADMIN_EMAIL} / ${SUPER_ADMIN_PASSWORD}`);
}

async function seedDemoSchool() {
  if (await prisma.organization.findFirst({ where: { name: 'Demo School' } })) {
    console.log('• demo school already exists');
    return;
  }

  const { org } = await createOrganization({
    name: 'Demo School',
    type: 'school',
    countryCode: '20',
    owner: { email: 'owner@demo-school.local', password: 'DemoSchool123!', name: 'School Owner' },
  });

  const group = await prisma.group.create({
    data: { organizationId: org.id, name: 'Grade 10 - A', description: 'Demo class' },
  });

  await prisma.contact.createMany({
    data: DEMO_STUDENTS.map((s) => ({
      organizationId: org.id,
      groupId: group.id,
      fullName: s.fullName,
      customFields: {
        guardian_phone: normalizePhone(s.guardian_phone, org.countryCode)!.digits,
        gender: s.gender,
      },
    })),
  });

  console.log('✓ demo school created: owner@demo-school.local / DemoSchool123! (Grade 10 - A, 6 students)');
}

async function seedDemoGeneric() {
  if (await prisma.organization.findFirst({ where: { name: 'Demo Company' } })) {
    console.log('• demo company already exists');
    return;
  }

  const { org } = await createOrganization({
    name: 'Demo Company',
    type: 'generic',
    countryCode: '20',
    owner: { email: 'owner@demo-company.local', password: 'DemoCompany123!', name: 'Company Owner' },
  });

  const group = await prisma.group.create({
    data: { organizationId: org.id, name: 'All Contacts' },
  });

  await prisma.contact.createMany({
    data: [
      { fullName: 'Mona Adel', phone: '01111234567' },
      { fullName: 'Karim Fathy', phone: '01111234568' },
    ].map((c) => ({
      organizationId: org.id,
      groupId: group.id,
      fullName: c.fullName,
      phone: normalizePhone(c.phone, org.countryCode)!.digits,
    })),
  });

  console.log('✓ demo company created: owner@demo-company.local / DemoCompany123!');
}

async function main() {
  await seedSuperAdmin();
  if (WITH_DEMO) {
    await seedDemoSchool();
    await seedDemoGeneric();
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
