import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import type { User } from '../../shared/schema';

const SALT_ROUNDS = 10;

export interface AuthUser {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role: string;
  currentOrganizationId?: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function findUserByUsername(username: string): Promise<User | null> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('username', username)
    .single();

  if (error || !data) {
    return null;
  }
  return data as User;
}

export async function findUserById(id: string): Promise<User | null> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return null;
  }
  return data as User;
}

export async function updateUserProfile(
  userId: string,
  updates: { firstName?: string; lastName?: string; email?: string }
): Promise<AuthUser | null> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.firstName !== undefined) {
    updateData.first_name = updates.firstName || null;
  }
  if (updates.lastName !== undefined) {
    updateData.last_name = updates.lastName || null;
  }
  if (updates.email !== undefined) {
    updateData.email = updates.email || null;
  }

  if (Object.keys(updateData).length === 1) {
    const user = await findUserById(userId);
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      email: (user as any).email || undefined,
      firstName: (user as any).first_name || undefined,
      lastName: (user as any).last_name || undefined,
      role: (user as any).role || 'user',
      currentOrganizationId: (user as any).current_organization_id || undefined,
    };
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .update(updateData)
    .eq('id', userId)
    .select('id, username, email, first_name, last_name, role, current_organization_id')
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    username: data.username,
    email: data.email || undefined,
    firstName: data.first_name || undefined,
    lastName: data.last_name || undefined,
    role: data.role || 'user',
    currentOrganizationId: data.current_organization_id || undefined,
  };
}

export async function changeUserPassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const { data: userData, error: userError } = await supabaseAdmin
    .from('users')
    .select('password')
    .eq('id', userId)
    .single();

  if (userError || !userData) {
    return { success: false, error: 'User not found' };
  }

  const isValid = await verifyPassword(currentPassword, userData.password);
  if (!isValid) {
    return { success: false, error: 'Current password is incorrect' };
  }

  const hashedPassword = await hashPassword(newPassword);
  const { error: updateError } = await supabaseAdmin
    .from('users')
    .update({ password: hashedPassword, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (updateError) {
    return { success: false, error: 'Failed to update password' };
  }

  return { success: true };
}

export async function createUser(
  username: string,
  password: string,
  options?: {
    email?: string;
    firstName?: string;
    lastName?: string;
    role?: string;
  }
): Promise<AuthUser> {
  const hashedPassword = await hashPassword(password);

  const { data, error } = await supabaseAdmin
    .from('users')
    .insert({
      username,
      password: hashedPassword,
      email: options?.email || null,
      first_name: options?.firstName || null,
      last_name: options?.lastName || null,
      role: options?.role || 'user',
    })
    .select('id, username, email, first_name, last_name, role, current_organization_id')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create user: ${error?.message}`);
  }

  return {
    id: data.id,
    username: data.username,
    email: data.email || undefined,
    firstName: data.first_name || undefined,
    lastName: data.last_name || undefined,
    role: data.role || 'user',
    currentOrganizationId: data.current_organization_id || undefined,
  };
}

export async function validateUser(username: string, password: string): Promise<AuthUser | null> {
  const user = await findUserByUsername(username);
  if (!user) {
    return null;
  }

  const isValid = await verifyPassword(password, (user as any).password);
  if (!isValid) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    email: (user as any).email || undefined,
    firstName: (user as any).first_name || undefined,
    lastName: (user as any).last_name || undefined,
    role: (user as any).role || 'user',
    currentOrganizationId: (user as any).current_organization_id || undefined,
  };
}

export async function seedAdminUser(): Promise<void> {
  try {
    let adminUser = await findUserByUsername('admin');

    if (adminUser) {
      await supabaseAdmin
        .from('users')
        .update({ role: 'super_admin' })
        .eq('username', 'admin')
        .or('role.is.null,role.eq.user');
      console.log('[auth] Admin user already exists');
    } else {
      const hashedPassword = await hashPassword('admin123');
      const { data, error } = await supabaseAdmin
        .from('users')
        .insert({
          username: 'admin',
          password: hashedPassword,
          role: 'super_admin',
        })
        .select('id, username, role')
        .single();

      if (error) {
        console.log('[auth] Admin user may already exist:', error.message);
        return;
      }
      adminUser = data as any;
      console.log('[auth] Admin user created successfully');
    }

    const { data: orgData } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .eq('slug', 'default')
      .single();

    let orgId: string;
    if (!orgData) {
      const { data: newOrg, error: orgError } = await supabaseAdmin
        .from('organizations')
        .insert({
          name: 'Default Organization',
          slug: 'default',
          type: 'carrier',
          status: 'active',
        })
        .select('id')
        .single();

      if (orgError || !newOrg) {
        console.log('[auth] Could not create default organization');
        return;
      }
      orgId = newOrg.id;
      console.log('[auth] Default organization created');
    } else {
      orgId = orgData.id;
    }

    const adminId = adminUser!.id;
    const { data: membershipData } = await supabaseAdmin
      .from('organization_memberships')
      .select('id')
      .eq('user_id', adminId)
      .eq('organization_id', orgId)
      .single();

    if (!membershipData) {
      await supabaseAdmin
        .from('organization_memberships')
        .insert({
          user_id: adminId,
          organization_id: orgId,
          role: 'owner',
          status: 'active',
        });
      console.log('[auth] Admin added to default organization');
    }

    await supabaseAdmin
      .from('users')
      .update({ current_organization_id: orgId })
      .eq('id', adminId)
      .is('current_organization_id', null);
  } catch (error) {
    console.error('[auth] Error seeding admin user:', error);
  }
}
