/**
 * T032 — requireAuth and requireOperator.
 *
 * FR-008: capability is refused server-side regardless of how the request is
 * constructed. Frontend route guards are usability, never security
 * (Constitution, Security Requirements).
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { PrismaClient } from '../../prisma/generated/client/index.js';
import { verifyAccessToken } from '../services/auth/session.service.js';

export interface AuthedRequest extends Request {
  auth?: { userId: string; isOperator: boolean };
}

/** Only the one column the operator check reads. */
export type OperatorReader = Pick<PrismaClient, 'user'>;

function bearer(req: Request): string | null {
  const header = req.header('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  // The scheme must be exactly Bearer. Accepting anything else invites
  // confusion between token types.
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

const UNAUTHORIZED = { error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } };

export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = bearer(req);
  if (!token) {
    res.status(401).json(UNAUTHORIZED);
    return;
  }
  try {
    const claims = await verifyAccessToken(token);
    req.auth = { userId: claims.sub, isOperator: claims.isOperator };
    next();
  } catch {
    res.status(401).json(UNAUTHORIZED);
  }
}

const FORBIDDEN = { error: { code: 'FORBIDDEN', message: 'Operator access required.' } };

/**
 * Operator capability is read from the database, never from the access token.
 *
 * The `isOperator` claim is baked into a 15-minute token, so trusting it means a
 * revoked operator keeps operator powers until that token expires — revocation
 * with no effect, which FR-008 does not allow. Operator routes are the rarest
 * route class in the product; one indexed primary-key lookup is the correct
 * price for making demotion take effect on the next request.
 *
 * Mount after `requireAuth`, which stays claim-based: identity is what the token
 * is for, capability is not.
 *
 * A factory rather than a bare handler because it needs the request-independent
 * database client. `requireAuth`'s shape is unchanged.
 */
export function requireOperator(db: OperatorReader): RequestHandler {
  // Guards the one misuse TypeScript cannot see: passing this factory straight
  // to `app.use`, where the first argument would be a Request.
  if (typeof (db as unknown as Request).header === 'function') {
    throw new TypeError('requireOperator(db) must be called with a database client, then mounted');
  }

  return async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.auth) {
      res.status(401).json(UNAUTHORIZED);
      return;
    }

    const user = await db.user.findUnique({
      where: { id: req.auth.userId },
      select: { isOperator: true },
    });
    // The identity in the token no longer exists: not a capability failure.
    if (!user) {
      res.status(401).json(UNAUTHORIZED);
      return;
    }
    if (!user.isOperator) {
      res.status(403).json(FORBIDDEN);
      return;
    }

    // Reconcile the claim with the database, so anything downstream reading
    // req.auth sees the answer this middleware acted on. Promotion takes effect
    // as immediately as demotion does.
    req.auth.isOperator = true;
    next();
  };
}
