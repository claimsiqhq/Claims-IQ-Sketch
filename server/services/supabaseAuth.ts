import { getSupabase, getSupabaseAdmin, isSupabaseConfigured } from '../lib/supabase';
import { supabaseAdmin } from '../lib/supabaseAdmin';

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

  // Create corresponding record in our users table using Supabase
  const { data: userData, error: upsertError } = await supabaseAdmin
    .from('users')
    .upsert({
      id: data.user.id,
      username: metadata?.username || email.split('@')[0],
      email: email,
      first_name: metadata?.firstName || null,
      last_name: metadata?.lastName || null,
      role: 'user',
      password: 'supabase-auth' // Placeholder - password managed by Supabase
    }, { onConflict: 'id' })
    .select('id, username, email, first_name, last_name, role, current_organization_id')
    .single();

  if (upsertError || !userData) {
    console.error('Error creating user record:', upsertError);
    return { user: null, error: 'Failed to create user record' };
  }

  return {
    user: {
      id: userData.id,
      username: userData.username,
      email: userData.email,
      firstName: userData.first_name,
      lastName: userData.last_name,
      role: userData.role,
      currentOrganizationId: userData.current_organization_id
    },
    error: null
  };
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

  // Get user record from our database using Supabase
  const { data: userData, error: userError } = await supabaseAdmin
    .from('users')
    .select('id, username, email, first_name, last_name, role, current_organization_id')
    .eq('id', data.user.id)
    .single();

  if (userError || !userData) {
    // User exists in Supabase Auth but not in our database - create record
    const { data: newUserData, error: insertError } = await supabaseAdmin
      .from('users')
      .insert({
        id: data.user.id,
        username: data.user.user_metadata?.username || email.split('@')[0],
        email: email,
        first_name: data.user.user_metadata?.first_name || null,
        last_name: data.user.user_metadata?.last_name || null,
        role: 'user',
        password: 'supabase-auth'
      })
      .select('id, username, email, first_name, last_name, role, current_organization_id')
      .single();

    if (insertError || !newUserData) {
      return { user: null, session: null, error: 'Failed to create user record' };
    }

    return {
      user: {
        id: newUserData.id,
        username: newUserData.username,
        email: newUserData.email,
        firstName: newUserData.first_name,
        lastName: newUserData.last_name,
        role: newUserData.role,
        currentOrganizationId: newUserData.current_organization_id
      },
      session: data.session,
      error: null
    };
  }

  return {
    user: {
      id: userData.id,
      username: userData.username,
      email: userData.email,
      firstName: userData.first_name,
      lastName: userData.last_name,
      role: userData.role,
      currentOrganizationId: userData.current_organization_id
    },
    session: data.session,
    error: null
  };
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

  // Get user record from our database using Supabase
  const { data: userData } = await supabaseAdmin
    .from('users')
    .select('id, username, email, first_name, last_name, role, current_organization_id')
    .eq('id', user.id)
    .single();

  if (!userData) return null;

  return {
    id: userData.id,
    username: userData.username,
    email: userData.email,
    firstName: userData.first_name,
    lastName: userData.last_name,
    role: userData.role,
    currentOrganizationId: userData.current_organization_id
  };
}

/**
 * Verify a Supabase JWT token and return the user
 */
export async function verifyToken(accessToken: string): Promise<AuthUser | null> {
  try {
    const supabaseAdminClient = getSupabaseAdmin();
    const { data: { user }, error } = await supabaseAdminClient.auth.getUser(accessToken);

    if (error || !user) {
      return null;
    }

    // Get user record from our database using Supabase
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('id, username, email, first_name, last_name, role, current_organization_id')
      .eq('id', user.id)
      .single();

    if (!userData) return null;

    return {
      id: userData.id,
      username: userData.username,
      email: userData.email,
      firstName: userData.first_name,
      lastName: userData.last_name,
      role: userData.role,
      currentOrganizationId: userData.current_organization_id
    };
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
  const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
  if (updates.firstName !== undefined) updateData.first_name = updates.firstName;
  if (updates.lastName !== undefined) updateData.last_name = updates.lastName;
  if (updates.email !== undefined) updateData.email = updates.email;

  const { data: userData, error } = await supabaseAdmin
    .from('users')
    .update(updateData)
    .eq('id', userId)
    .select('id, username, email, first_name, last_name, role, current_organization_id')
    .single();

  if (error || !userData) return null;

  return {
    id: userData.id,
    username: userData.username,
    email: userData.email,
    firstName: userData.first_name,
    lastName: userData.last_name,
    role: userData.role,
    currentOrganizationId: userData.current_organization_id
  };
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
  const { data: userData } = await supabaseAdmin
    .from('users')
    .select('id, username, email, first_name, last_name, role, current_organization_id')
    .eq('id', id)
    .single();

  if (!userData) return null;

  return {
    id: userData.id,
    username: userData.username,
    email: userData.email,
    firstName: userData.first_name,
    lastName: userData.last_name,
    role: userData.role,
    currentOrganizationId: userData.current_organization_id
  };
}

/**
 * Seed admin user in Supabase Auth
 * Note: This should be done via Supabase dashboard or migration scripts in production
 */
export async function seedAdminUser(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@claimsiq.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  // Check if admin exists in our database
  const { data: existingAdmin } = await supabaseAdmin
    .from('users')
    .select('id')
    .or(`username.eq.admin,email.eq.${adminEmail}`)
    .limit(1);

  if (existingAdmin && existingAdmin.length > 0) {
    // Admin user already exists - no need to log on every startup

    // Ensure admin has super_admin role - only update role, don't touch other fields
    await supabaseAdmin
      .from('users')
      .update({ role: 'super_admin' })
      .or(`username.eq.admin,email.eq.${adminEmail}`)
      .or('role.is.null,role.eq.user');
    return;
  }

  // Try to create admin in Supabase Auth
  const supabaseAdminClient = getSupabaseAdmin();
  const { data, error } = await supabaseAdminClient.auth.admin.createUser({
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
    // Use ignoreDuplicates to prevent overwriting existing user data (like first_name/last_name)
    await supabaseAdmin
      .from('users')
      .upsert({
        id: data.user.id,
        username: 'admin',
        email: adminEmail,
        first_name: 'Admin',
        last_name: 'User',
        role: 'super_admin',
        password: 'supabase-auth'
      }, { onConflict: 'id', ignoreDuplicates: true });

    // Ensure default organization exists
    const { data: existingOrg } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .eq('slug', 'default')
      .single();

    let orgId: string;
    if (!existingOrg) {
      const { data: newOrg } = await supabaseAdmin
        .from('organizations')
        .insert({
          name: 'Default Organization',
          slug: 'default',
          type: 'carrier',
          status: 'active'
        })
        .select('id')
        .single();
      orgId = newOrg?.id;
    } else {
      orgId = existingOrg.id;
    }

    if (orgId) {
      // Add admin to organization
      await supabaseAdmin
        .from('organization_memberships')
        .upsert({
          user_id: data.user.id,
          organization_id: orgId,
          role: 'owner',
          status: 'active'
        }, { onConflict: 'user_id,organization_id', ignoreDuplicates: true });

      // Set admin's current organization
      await supabaseAdmin
        .from('users')
        .update({ current_organization_id: orgId })
        .eq('id', data.user.id);
    }

    console.log('Admin user created successfully');
  }
}
