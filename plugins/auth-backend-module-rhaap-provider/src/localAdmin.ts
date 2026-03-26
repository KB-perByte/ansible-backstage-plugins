import { Router, json } from 'express';
import { createHash } from 'crypto';
import {
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';

/**
 * Rate limiter: tracks failed login attempts per IP.
 */
const failedAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000; // 1 minute
const LOCKOUT_MS = 30_000; // 30 seconds

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = failedAttempts.get(ip);

  if (!entry || now > entry.resetAt) {
    return true; // No recent failures
  }

  return entry.count < MAX_ATTEMPTS;
}

function recordFailure(ip: string): void {
  const now = Date.now();
  const entry = failedAttempts.get(ip);

  if (!entry || now > entry.resetAt) {
    failedAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count++;
    if (entry.count >= MAX_ATTEMPTS) {
      entry.resetAt = now + LOCKOUT_MS; // Extend lockout
    }
  }
}

function clearFailures(ip: string): void {
  failedAttempts.delete(ip);
}

/**
 * Simple password comparison. In production, PORTAL_ADMIN_PASSWORD_HASH is a
 * bcrypt hash. For local dev, ansible.portal.admin.password is plain text.
 *
 * We use a timing-safe comparison for the plain-text path to avoid timing attacks.
 */
async function validatePassword(
  password: string,
  config: RootConfigService,
): Promise<boolean> {
  // Production: bcrypt hash from env var
  const hashFromEnv = process.env.PORTAL_ADMIN_PASSWORD_HASH;
  if (hashFromEnv) {
    // Dynamic import bcrypt to avoid hard dependency
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const bcrypt = require('bcrypt') as { compare: (data: string, hash: string) => Promise<boolean> };
      return bcrypt.compare(password, hashFromEnv);
    } catch {
      // bcrypt not installed — fall through to plain text
    }
  }

  // Local dev: plain text from config
  const devPassword = config.getOptionalString(
    'ansible.portal.admin.password',
  );
  if (devPassword) {
    // Timing-safe comparison
    const a = createHash('sha256').update(password).digest('hex');
    const b = createHash('sha256').update(devPassword).digest('hex');
    return a === b;
  }

  return false;
}

export interface LocalAdminRouterOptions {
  config: RootConfigService;
  logger: LoggerService;
  issueToken: (userEntityRef: string) => Promise<{ token: string }>;
  checkLocalAdminEnabled: () => Promise<boolean>;
}

/**
 * Creates an Express router that handles local admin login.
 * Mounted at /api/auth/rhaap/local-login
 */
export function createLocalAdminRouter(
  options: LocalAdminRouterOptions,
): Router {
  const { config, logger, issueToken, checkLocalAdminEnabled } = options;
  const router = Router();
  router.use(json());

  router.post('/', async (req, res) => {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress ??
      'unknown';
    const { username, password } = req.body ?? {};

    // Audit log helper
    const audit = (event: string, details: Record<string, unknown>) => {
      logger.info(`[local-admin] ${event}`, {
        isAuditEvent: true,
        eventId: event,
        ip,
        ...details,
      });
    };

    try {
      // Rate limit check
      if (!checkRateLimit(ip)) {
        audit('login_rate_limited', { username });
        res.status(429).json({
          error: 'Too many failed attempts. Please wait before trying again.',
        });
        return;
      }

      // Check if local admin is enabled
      const enabled = await checkLocalAdminEnabled();
      if (!enabled) {
        audit('login_rejected_disabled', { username });
        res.status(403).json({
          error: 'Local admin access is disabled.',
        });
        return;
      }

      // Validate username
      if (username !== 'admin') {
        recordFailure(ip);
        audit('login_failure', { username, reason: 'invalid_username' });
        res.status(401).json({ error: 'Invalid credentials.' });
        return;
      }

      // Validate password
      if (!password) {
        recordFailure(ip);
        audit('login_failure', { username, reason: 'missing_password' });
        res.status(401).json({ error: 'Invalid credentials.' });
        return;
      }

      const valid = await validatePassword(password, config);
      if (!valid) {
        recordFailure(ip);
        audit('login_failure', { username, reason: 'invalid_password' });
        res.status(401).json({ error: 'Invalid credentials.' });
        return;
      }

      // Success — issue Backstage token
      clearFailures(ip);
      const { token } = await issueToken('user:default/admin');

      audit('login_success', { username });

      res.json({
        backstageIdentity: {
          token,
          identity: {
            type: 'user',
            userEntityRef: 'user:default/admin',
            ownershipEntityRefs: ['user:default/admin'],
          },
        },
      });
    } catch (err) {
      logger.error('[local-admin] Unexpected error during login', err as Error);
      res.status(500).json({ error: 'Internal server error.' });
    }
  });

  return router;
}
