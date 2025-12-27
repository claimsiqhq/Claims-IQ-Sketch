import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import session from 'express-session';
import MemoryStore from 'memorystore';
import type { Express, Request, Response, NextFunction } from 'express';
import { validateUser, findUserById, type AuthUser } from '../services/auth';
import { verifyToken } from '../services/supabaseAuth';
import { SupabaseSessionStore } from '../lib/supabaseSessionStore';

declare global {
  namespace Express {
    interface User extends AuthUser {}
  }
}

passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const user = await validateUser(username, password);
      if (!user) {
        return done(null, false, { message: 'Invalid username or password' });
      }
      return done(null, user);
    } catch (error) {
      return done(error);
    }
  })
);

passport.serializeUser((user: Express.User, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await findUserById(id);
    if (!user) {
      return done(null, false);
    }
    done(null, {
      id: user.id,
      username: user.username,
      email: (user as any).email || undefined,
      firstName: (user as any).first_name || undefined,
      lastName: (user as any).last_name || undefined,
      role: (user as any).role || 'user',
      currentOrganizationId: (user as any).current_organization_id || undefined,
    });
  } catch (error) {
    done(error);
  }
});

export function setupAuth(app: Express): void {
  const MemoryStoreSession = MemoryStore(session);

  const isProduction = process.env.NODE_ENV === 'production';
  const isReplit = !!process.env.REPL_ID || !!process.env.REPLIT_DEV_DOMAIN;

  const sessionSecret = process.env.SESSION_SECRET;
  if (isProduction && !sessionSecret) {
    throw new Error('SESSION_SECRET environment variable is required in production');
  }

  if (isReplit) {
    app.set('trust proxy', 1);
  }

  // Use Supabase session store for persistent sessions (works across restarts)
  // Only fall back to MemoryStore if Supabase isn't available
  const useSupabaseStore = isProduction || isReplit;
  const sessionStore = useSupabaseStore
    ? new SupabaseSessionStore()
    : new MemoryStoreSession({ checkPeriod: 86400000 });

  console.log(`[auth] Using ${useSupabaseStore ? 'Supabase' : 'Memory'} session store`);

  app.use(session({
    name: 'claimsiq.sid',
    store: sessionStore,
    secret: sessionSecret || 'dev-only-insecure-key-do-not-use-in-production',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      secure: isProduction || isReplit,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: (isProduction || isReplit) ? 'none' : 'lax',
    },
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  app.use(async (req: Request, res: Response, next: NextFunction) => {
    if (req.isAuthenticated()) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const user = await verifyToken(token);
        if (user) {
          (req as any).user = user;
          (req as any).isSupabaseAuth = true;
        }
      } catch (error) {
        console.error('Supabase token verification failed:', error);
      }
    }

    next();
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.isAuthenticated()) {
    return next();
  }

  if ((req as any).user && (req as any).isSupabaseAuth) {
    return next();
  }

  res.status(401).json({ error: 'Authentication required' });
}

export { passport };
