import type { NextFunction, Request, Response } from 'express';
import { jwtVerify, type JWTPayload } from 'jose';
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

// Verify token using the JWT secret (Legacy HS256)
function getSharedSecret(): Uint8Array {
  const secret = config.supabase.jwtSecret;
  if (!secret) {
    throw new Error('SUPABASE_JWT_SECRET not configured');
  }
  return new TextEncoder().encode(secret);
}

async function verifyToken(token: string): Promise<JWTPayload> {
  // Verify token using the anon key as shared secret (HS256)
  // Note: Supabase JWKS endpoint returns empty keys array, so JWKS verification is not possible
  // See: https://github.com/supabase/supabase/discussions/35870
  // The anon key is the JWT secret used by Supabase to sign all tokens
  try {
    const secret = getSharedSecret();
    const { payload } = await jwtVerify(token, secret, {
      issuer: `${config.supabase.url}/auth/v1`,
    });
    return payload;
  } catch (err) {
    throw new Error(`Token verification failed: ${(err as Error).message}`);
  }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.header('authorization') || req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return next();
    }
    const token = authHeader.substring('Bearer '.length).trim();
    const payload = await verifyToken(token);
    const userId = (payload.sub || payload.user_id || payload.uid) as string | undefined;
    req.user = userId ? { id: userId, email: (payload.email as string | undefined) } : undefined;
    req.token = token;
  } catch (error) {
    // ignore invalid token in optional auth
    console.warn('Optional auth error:', error instanceof Error ? error.message : error);
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
