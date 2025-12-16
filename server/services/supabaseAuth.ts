import { getSupabase, getSupabaseAdmin, isSupabaseConfigured } from '../lib/supabase';
import { pool } from '../db';

export interface AuthUser {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role: string;
  currentOrganizationId?: string;
}

/**
 * Sign up a new user with Supabase Auth
 */
export async function signUp(
  email: string,
  password: string,
  metadata?: {
    username?: string;
    firstName?: string;
    lastName?: string;
  }
): Promise<{ user: AuthUser | null; error: string | null }> {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username: metadata?.username || email.split('@')[0],
        first_name: metadata?.firstName,
        last_name: metadata?.lastName,
      },
    },
  });

  if (error) {
    return { user: null, error: error.message };
  }

  if (!data.user) {
    return { user: null, error: 'Failed to create user' };
  }

  // Create corresponding record in our users table
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO users (id, username, email, first_name, last_name, role, password)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name
       RETURNING id, username, email, first_name as "firstName", last_name as "lastName", role, current_organization_id as "currentOrganizationId"`,
      [
        data.user.id,
        metadata?.username || email.split('@')[0],
        email,
        metadata?.firstName || null,
        metadata?.lastName || null,
        'user',
        'supabase-auth' // Placeholder - password managed by Supabase
      ]
    );

    return { user: result.rows[0], error: null };
  } catch (dbError) {
    console.error('Error creating user record:', dbError);
    return { user: null, error: 'Failed to create user record' };
  } finally {
    client.release();
  }
}

/**
 * Sign in a user with Supabase Auth
 */
export async function signIn(
  email: string,
  password: string
): Promise<{ user: AuthUser | null; session: any | null; error: string | null }> {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { user: null, session: null, error: error.message };
  }

  if (!data.user || !data.session) {
    return { user: null, session: null, error: 'Authentication failed' };
  }

  // Get user record from our database
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, username, email, first_name as "firstName", last_name as "lastName",
              role, current_organization_id as "currentOrganizationId"
       FROM users WHERE id = $1`,
      [data.user.id]
    );

    if (result.rows.length === 0) {
      // User exists in Supabase but not in our database - create record
      const insertResult = await client.query(
        `INSERT INTO users (id, username, email, first_name, last_name, role, password)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, username, email, first_name as "firstName", last_name as "lastName",
                   role, current_organization_id as "currentOrganizationId"`,
        [
          data.user.id,
          data.user.user_metadata?.username || email.split('@')[0],
          email,
          data.user.user_metadata?.first_name || null,
          data.user.user_metadata?.last_name || null,
          'user',
          'supabase-auth'
        ]
      );
      return { user: insertResult.rows[0], session: data.session, error: null };
    }

    return { user: result.rows[0], session: data.session, error: null };
  } finally {
    client.release();
  }
}

/**
 * Sign out a user
 */
export async function signOut(): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  const { error } = await supabase.auth.signOut();
  return { error: error?.message || null };
}

/**
 * Get current user from Supabase session
 */
export async function getCurrentUser(accessToken: string): Promise<AuthUser | null> {
  const supabase = getSupabase();
  const { data: { user }, error } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return null;
  }

  // Get user record from our database
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, username, email, first_name as "firstName", last_name as "lastName",
              role, current_organization_id as "currentOrganizationId"
       FROM users WHERE id = $1`,
      [user.id]
    );

    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Verify a Supabase JWT token and return the user
 */
export async function verifyToken(accessToken: string): Promise<AuthUser | null> {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);

    if (error || !user) {
      return null;
    }

    // Get user record from our database
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT id, username, email, first_name as "firstName", last_name as "lastName",
                role, current_organization_id as "currentOrganizationId"
         FROM users WHERE id = $1`,
        [user.id]
      );

      return result.rows[0] || null;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Token verification error:', err);
    return null;
  }
}

/**
 * Update user profile
 */
export async function updateUserProfile(
  userId: string,
  updates: {
    firstName?: string;
    lastName?: string;
    email?: string;
  }
): Promise<AuthUser | null> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE users
       SET first_name = COALESCE($2, first_name),
           last_name = COALESCE($3, last_name),
           email = COALESCE($4, email),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, username, email, first_name as "firstName", last_name as "lastName",
                 role, current_organization_id as "currentOrganizationId"`,
      [userId, updates.firstName || null, updates.lastName || null, updates.email || null]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Request password reset
 */
export async function requestPasswordReset(email: string): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.APP_URL || 'http://localhost:5000'}/reset-password`,
  });

  return { error: error?.message || null };
}

/**
 * Update user password (requires current session)
 */
export async function updatePassword(newPassword: string): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  return { error: error?.message || null };
}

/**
 * Get user by ID from our database
 */
export async function findUserById(id: string): Promise<AuthUser | null> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, username, email, first_name as "firstName", last_name as "lastName",
              role, current_organization_id as "currentOrganizationId"
       FROM users WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Seed admin user in Supabase Auth
 * Note: This should be done via Supabase dashboard or migration scripts in production
 */
export async function seedAdminUser(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@claimsiq.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  const client = await pool.connect();
  try {
    // Check if admin exists in our database
    const existingAdmin = await client.query(
      `SELECT id FROM users WHERE username = 'admin' OR email = $1`,
      [adminEmail]
    );

    if (existingAdmin.rows.length > 0) {
      console.log('Admin user already exists');

      // Ensure admin has super_admin role
      await client.query(
        `UPDATE users SET role = 'super_admin' WHERE (username = 'admin' OR email = $1) AND (role IS NULL OR role = 'user')`,
        [adminEmail]
      );
      return;
    }

    // Try to create admin in Supabase Auth
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        username: 'admin',
        first_name: 'Admin',
        last_name: 'User',
      },
    });

    if (error) {
      // User might already exist in Supabase - try to get them
      console.log('Admin may already exist in Supabase:', error.message);
      return;
    }

    if (data.user) {
      // Create record in our users table
      await client.query(
        `INSERT INTO users (id, username, email, first_name, last_name, role, password)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [data.user.id, 'admin', adminEmail, 'Admin', 'User', 'super_admin', 'supabase-auth']
      );

      // Ensure default organization exists
      const orgResult = await client.query(
        `SELECT id FROM organizations WHERE slug = 'default'`
      );

      let orgId: string;
      if (orgResult.rows.length === 0) {
        const createOrgResult = await client.query(
          `INSERT INTO organizations (name, slug, type, status)
           VALUES ('Default Organization', 'default', 'carrier', 'active')
           RETURNING id`
        );
        orgId = createOrgResult.rows[0].id;
      } else {
        orgId = orgResult.rows[0].id;
      }

      // Add admin to organization
      await client.query(
        `INSERT INTO organization_memberships (user_id, organization_id, role, status)
         VALUES ($1, $2, 'owner', 'active')
         ON CONFLICT (user_id, organization_id) DO NOTHING`,
        [data.user.id, orgId]
      );

      // Set admin's current organization
      await client.query(
        `UPDATE users SET current_organization_id = $1 WHERE id = $2`,
        [orgId, data.user.id]
      );

      console.log('Admin user created successfully');
    }
  } finally {
    client.release();
  }
}
