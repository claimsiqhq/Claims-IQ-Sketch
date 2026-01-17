/**
 * Authentication Routes
 * 
 * Handles both Passport.js session-based auth and Supabase JWT auth.
 * See ARCHITECTURE.md for authentication strategy details.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { passport, requireAuth } from '../middleware/auth';
import { authRateLimiter, passwordResetRateLimiter } from '../middleware/rateLimit';
import { updateUserProfile, changeUserPassword } from '../services/auth';
import {
  signUp as supabaseSignUp,
  signIn as supabaseSignIn,
  signOut as supabaseSignOut,
  verifyToken,
  requestPasswordReset,
  updatePassword,
  findUserById as supabaseFindUser
} from '../services/supabaseAuth';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { createLogger } from '../lib/logger';

const router = Router();
const log = createLogger({ module: 'auth-routes' });

// =================================================
// Passport.js Session-Based Auth Routes
// =================================================

/**
 * POST /api/auth/login
 * Authenticate user with username/password using Passport local strategy
 * Rate limited: 5 attempts per 15 minutes
 */
router.post('/login', authRateLimiter, (req: Request, res: Response, next: NextFunction) => {
  const rememberMe = req.body.rememberMe === true;

  passport.authenticate('local', (err: Error | null, user: Express.User | false, info: { message: string }) => {
    if (err) {
      log.error({ err }, 'Login error');
      return res.status(500).json({ message: 'Login failed due to server error' });
    }
    if (!user) {
      return res.status(401).json({ message: info?.message || 'Invalid credentials' });
    }
    req.login(user, (loginErr) => {
      if (loginErr) {
        log.error({ err: loginErr }, 'Session login error');
        return res.status(500).json({ message: 'Login failed due to session error' });
      }
      // Store rememberMe preference in session
      (req.session as any).rememberMe = rememberMe;

      // Set session duration based on remember me
      if (rememberMe) {
        req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
      } else {
        req.session.cookie.maxAge = 24 * 60 * 60 * 1000; // 24 hours
      }

      req.session.save((saveErr) => {
        if (saveErr) {
          log.error({ err: saveErr }, 'Session save error');
          return res.status(500).json({ message: 'Session save error' });
        }
        log.info({ userId: (user as any).id }, 'User logged in');
        return res.json({
          user: {
            id: (user as any).id,
            username: (user as any).username,
            email: (user as any).email,
            firstName: (user as any).firstName,
            lastName: (user as any).lastName,
            role: (user as any).role,
            currentOrganizationId: (user as any).currentOrganizationId,
          }
        });
      });
    });
  })(req, res, next);
});

/**
 * POST /api/auth/logout
 * End user session
 */
router.post('/logout', (req: Request, res: Response) => {
  const userId = (req.user as any)?.id;
  req.logout((err) => {
    if (err) {
      log.error({ err }, 'Logout error');
      return res.status(500).json({ message: 'Logout failed' });
    }
    req.session.destroy((destroyErr) => {
      if (destroyErr) {
        log.warn({ err: destroyErr }, 'Session destroy error');
      }
      res.clearCookie('claimsiq.sid');
      log.info({ userId }, 'User logged out');
      res.json({ message: 'Logged out successfully' });
    });
  });
});

/**
 * GET /api/auth/me
 * Get current authenticated user's profile
 */
router.get('/me', async (req: Request, res: Response) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    const userId = (req.user as any).id;
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, username, email, first_name, last_name, role, current_organization_id, preferences, created_at')
      .eq('id', userId)
      .single();

    if (error || !user) {
      log.warn({ userId, error }, 'User not found in database');
      return res.status(404).json({ message: 'User not found' });
    }

    // Get organization info
    let organization = null;
    if (user.current_organization_id) {
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('id, name, slug')
        .eq('id', user.current_organization_id)
        .single();
      organization = org;
    }

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        currentOrganizationId: user.current_organization_id,
        preferences: user.preferences,
        createdAt: user.created_at,
      },
      organization,
    });
  } catch (error) {
    log.error({ err: error }, 'Error fetching user profile');
    res.status(500).json({ message: 'Failed to fetch user profile' });
  }
});

/**
 * GET /api/auth/check
 * Check if user is authenticated (for client-side auth state)
 */
router.get('/check', (req: Request, res: Response) => {
  if (req.isAuthenticated() && req.user) {
    const user = req.user as any;
    return res.json({
      authenticated: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        currentOrganizationId: user.currentOrganizationId,
      }
    });
  }
  return res.json({ authenticated: false, user: null });
});

// =================================================
// Supabase JWT Auth Routes
// =================================================

/**
 * POST /api/auth/supabase/login
 * Authenticate with Supabase using email/password
 * Rate limited: 5 attempts per 15 minutes
 */
router.post('/supabase/login', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    const result = await supabaseSignIn(email, password);
    if (!result.success) {
      return res.status(401).json({ message: result.error || 'Invalid credentials' });
    }

    log.info({ email }, 'Supabase user logged in');
    res.json({
      user: result.user,
      session: result.session,
    });
  } catch (error) {
    log.error({ err: error }, 'Supabase login error');
    res.status(500).json({ message: 'Login failed' });
  }
});

/**
 * POST /api/auth/supabase/register
 * Register new user with Supabase
 * Rate limited: 5 attempts per 15 minutes
 */
router.post('/supabase/register', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    const result = await supabaseSignUp(email, password, { firstName, lastName });
    if (!result.success) {
      return res.status(400).json({ message: result.error || 'Registration failed' });
    }

    log.info({ email }, 'New user registered via Supabase');
    res.status(201).json({
      message: 'Registration successful. Please check your email to verify your account.',
      user: result.user,
    });
  } catch (error) {
    log.error({ err: error }, 'Supabase registration error');
    res.status(500).json({ message: 'Registration failed' });
  }
});

/**
 * POST /api/auth/supabase/logout
 * Logout from Supabase session
 */
router.post('/supabase/logout', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');
    
    if (token) {
      await supabaseSignOut(token);
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    log.error({ err: error }, 'Supabase logout error');
    res.status(500).json({ message: 'Logout failed' });
  }
});

/**
 * POST /api/auth/supabase/forgot-password
 * Request password reset email
 * Rate limited: 3 attempts per hour
 */
router.post('/supabase/forgot-password', passwordResetRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email required' });
    }

    const result = await requestPasswordReset(email);
    // Always return success to prevent email enumeration
    res.json({ message: 'If an account exists with this email, a password reset link has been sent.' });
  } catch (error) {
    log.error({ err: error }, 'Password reset request error');
    res.status(500).json({ message: 'Failed to process request' });
  }
});

/**
 * GET /api/auth/supabase/me
 * Get current user from Supabase JWT token
 */
router.get('/supabase/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const verification = await verifyToken(token);
    if (!verification.valid || !verification.userId) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    const user = await supabaseFindUser(verification.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    log.error({ err: error }, 'Supabase me endpoint error');
    res.status(500).json({ message: 'Failed to fetch user' });
  }
});

// =================================================
// User Profile Routes
// =================================================

/**
 * PUT /api/users/profile
 * Update current user's profile
 */
router.put('/users/profile', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const updates = req.body;

    const updatedUser = await updateUserProfile(userId, updates);
    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    log.info({ userId }, 'User profile updated');
    res.json({ user: updatedUser });
  } catch (error) {
    log.error({ err: error }, 'Profile update error');
    res.status(500).json({ message: 'Failed to update profile' });
  }
});

/**
 * PUT /api/users/password
 * Change current user's password
 */
router.put('/users/password', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const result = await changeUserPassword(userId, currentPassword, newPassword);
    if (!result.success) {
      return res.status(400).json({ message: result.error || 'Password change failed' });
    }

    log.info({ userId }, 'User password changed');
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    log.error({ err: error }, 'Password change error');
    res.status(500).json({ message: 'Failed to change password' });
  }
});

/**
 * GET /api/users/preferences
 * Get current user's preferences
 */
router.get('/users/preferences', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('preferences')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ preferences: user.preferences || {} });
  } catch (error) {
    log.error({ err: error }, 'Get preferences error');
    res.status(500).json({ message: 'Failed to fetch preferences' });
  }
});

/**
 * PUT /api/users/preferences
 * Update current user's preferences
 */
router.put('/users/preferences', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const preferences = req.body;

    const { data, error } = await supabaseAdmin
      .from('users')
      .update({ 
        preferences,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select('preferences')
      .single();

    if (error) {
      log.error({ err: error }, 'Update preferences error');
      return res.status(500).json({ message: 'Failed to update preferences' });
    }

    log.info({ userId }, 'User preferences updated');
    res.json({ preferences: data?.preferences || {} });
  } catch (error) {
    log.error({ err: error }, 'Update preferences error');
    res.status(500).json({ message: 'Failed to update preferences' });
  }
});

export default router;
