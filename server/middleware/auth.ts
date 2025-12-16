import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import type { Express, Request, Response, NextFunction } from 'express';
import { validateUser, findUserById, type AuthUser } from '../services/auth';
import { verifyToken } from '../services/supabaseAuth';

// Extend Express types for passport and Supabase auth
declare global {
  namespace Express {
    interface User extends AuthUser {}
  }
}

// Configure Passport Local Strategy (for legacy auth)
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

// Serialize user to session
passport.serializeUser((user: Express.User, done) => {
  done(null, user.id);
});

// Deserialize user from session
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

// Setup auth middleware on Express app
export function setupAuth(app: Express): void {
  const PgSession = connectPgSimple(session);

  // Determine if we're in production (HTTPS)
  const isProduction = process.env.NODE_ENV === 'production';

  // Require SESSION_SECRET in production for security
  const sessionSecret = process.env.SESSION_SECRET;
  if (isProduction && !sessionSecret) {
    throw new Error('SESSION_SECRET environment variable is required in production');
  }

  app.use(session({
    store: new PgSession({
      conString: process.env.DATABASE_URL,
      tableName: 'session',
      createTableIfMissing: true,
    }),
    secret: sessionSecret || 'dev-only-insecure-key-do-not-use-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProduction, // Only require HTTPS in production
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // Default 24 hours, can be extended for "remember me"
      sameSite: isProduction ? 'none' : 'lax', // Use 'lax' in development
    },
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  // Add Supabase Auth middleware - checks for Authorization header with Bearer token
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    // Skip if already authenticated via session
    if (req.isAuthenticated()) {
      return next();
    }

    // Check for Supabase JWT token in Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const user = await verifyToken(token);
        if (user) {
          // Set user on request object for Supabase auth
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

// Middleware to require authentication (supports both session and Supabase auth)
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Check session-based auth
  if (req.isAuthenticated()) {
    return next();
  }

  // Check Supabase auth (set by middleware above)
  if ((req as any).user && (req as any).isSupabaseAuth) {
    return next();
  }

  res.status(401).json({ error: 'Authentication required' });
}

// Export passport for route handlers
export { passport };
