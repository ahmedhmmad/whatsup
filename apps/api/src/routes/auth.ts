import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { asyncHandler, unauthorized } from '../errors';
import { verifyPassword, hashPassword } from '../lib/password';
import { signToken } from '../lib/tokens';
import { audit } from '../lib/audit';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { orgContext } from '../middleware/auth';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post(
  '/login',
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { organization: true },
    });

    if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
      throw unauthorized('Invalid email or password');
    }
    if (user.organization && !user.organization.isActive) {
      throw unauthorized('This organization is suspended');
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
    });

    res.json({
      token: signToken({
        sub: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      }),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId,
      },
      organization: user.organization ? orgContext(user.organization) : null,
    });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.sub },
      include: { organization: true },
    });
    if (!user || !user.isActive) throw unauthorized();

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId,
      },
      organization: user.organization ? orgContext(user.organization) : null,
    });
  }),
);

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

authRouter.post(
  '/change-password',
  requireAuth,
  validateBody(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body as z.infer<typeof changePasswordSchema>;
    const user = await prisma.user.findUnique({ where: { id: req.auth!.sub } });
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw unauthorized('Current password is incorrect');
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    await audit({ organizationId: user.organizationId, userId: user.id, action: 'auth.password_changed' });
    res.json({ ok: true });
  }),
);
