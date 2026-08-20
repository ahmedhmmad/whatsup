import jwt, { type SignOptions } from 'jsonwebtoken';
import type { UserRole } from '@sendwhats/shared';
import { env } from '../env';

export interface TokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  organizationId: string | null;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as SignOptions);
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
}
