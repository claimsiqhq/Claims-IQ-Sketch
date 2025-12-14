import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import type { Express, Request, Response, NextFunction } from 'express';
import { validateUser, findUserById, seedAdminUser, type AuthUser } from '../services/auth';

// Extend Express types for passport
declare global {
  namespace Express {
    interface User extends AuthUser {}
  }
}

// Configure Passport Local Strategy
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

  app.use(session({
    store: new PgSession({
      conString: process.env.DATABASE_URL,
      tableName: 'session',
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || 'claims-iq-secret-key-change-in-production',
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

  // Seed admin user on startup
  seedAdminUser().catch(console.error);
}

// Middleware to require authentication
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Authentication required' });
}

// Export passport for route handlers
export { passport };
