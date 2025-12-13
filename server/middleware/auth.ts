import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import session from 'express-session';
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
    done(null, { id: user.id, username: user.username });
  } catch (error) {
    done(error);
  }
});

// Setup auth middleware on Express app
export function setupAuth(app: Express): void {
  // Session configuration
  const sessionConfig = {
    secret: process.env.SESSION_SECRET || 'claims-iq-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'none' as const,
    },
    proxy: true,
  };

  // Use memory store for simplicity (in production, use connect-pg-simple)
  app.use(session(sessionConfig));
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
