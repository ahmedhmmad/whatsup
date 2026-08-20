import { randomBytes } from 'crypto';
import type { OrgType } from '@prisma/client';
import { getOrgTypeConfig } from '@sendwhats/shared';
import { prisma } from '../db';
import { hashPassword } from '../lib/password';

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return slug || 'org';
}

/** Evolution instance names must be unique across the whole Evolution server. */
export function buildInstanceName(orgName: string): string {
  return `${slugify(orgName)}-${randomBytes(3).toString('hex')}`;
}

export interface CreateOrganizationInput {
  name: string;
  type: OrgType;
  countryCode?: string;
  owner: { email: string; password: string; name?: string };
}

/**
 * Creates an organization together with everything it needs to be usable:
 * its owner user, its default message template for the vertical, and the
 * WhatsAppInstance record (provisioned against Evolution API in Phase 3).
 */
export async function createOrganization(input: CreateOrganizationInput) {
  const config = getOrgTypeConfig(input.type);
  const passwordHash = await hashPassword(input.owner.password);

  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: input.name,
        type: input.type,
        countryCode: input.countryCode ?? '20',
      },
    });

    const owner = await tx.user.create({
      data: {
        organizationId: org.id,
        email: input.owner.email.toLowerCase(),
        passwordHash,
        name: input.owner.name ?? input.owner.email.split('@')[0],
        role: 'owner',
      },
    });

    await tx.messageTemplate.create({
      data: {
        organizationId: org.id,
        name: 'Default',
        body: config.defaultTemplateBody,
        mergeTarget: config.defaultMergeTarget,
        isDefault: true,
      },
    });

    const instance = await tx.whatsAppInstance.create({
      data: {
        organizationId: org.id,
        evolutionInstanceName: buildInstanceName(input.name),
        status: 'not_provisioned',
      },
    });

    return { org, owner, instance };
  });
}
