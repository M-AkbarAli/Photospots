import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { config } from '../../config/index.js';

// Augment Express Request type with user
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface UserInfo {
      id: string;
      email?: string;
      role?: string;
      [key: string]: unknown;
    }

    interface Request {
      user?: UserInfo;
      token?: string;
    }
  }
}

const JWKS_URL = `${config.supabase.url}/auth/v1/keys`;
const jwks = createRemoteJWKSet(new URL(JWKS_URL));

async function verifyToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, jwks, {
    // Supabase uses issuer like https://<project>.supabase.co/auth/v1
    // We don't hard-enforce issuer/audience to keep things simple in dev.
  });
  return payload;
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.header('authorization') || req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }
  const token = authHeader.substring('Bearer '.length).trim();
  try {
    const payload = await verifyToken(token);
    const userId = (payload.sub || payload.user_id || payload.uid) as string | undefined;
    req.user = userId ? { id: userId, email: (payload.email as string | undefined) } : undefined;
    req.token = token;
  } catch {
    // ignore invalid token in optional auth
  }
  next();
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.header('authorization') || req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: missing bearer token' });
  }
  const token = authHeader.substring('Bearer '.length).trim();
  try {
    const payload = await verifyToken(token);
    const userId = (payload.sub || payload.user_id || payload.uid) as string | undefined;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: invalid token (no subject)' });
    }
    req.user = { id: userId, email: (payload.email as string | undefined) };
    req.token = token;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: invalid token', details: (err as Error).message });
  }
}

export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (req.user.role !== role) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  };
}
