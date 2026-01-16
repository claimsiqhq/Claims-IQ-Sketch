import { supabaseAdmin } from '../lib/supabaseAdmin';
import { InsertOrganization } from '../../shared/schema';

export interface OrganizationWithStats {
  id: string;
  name: string;
  slug: string;
  type: string;
  email?: string;
  phone?: string;
  address?: string;
  status: string;
  settings: Record<string, any>;
  createdAt: Date;
  memberCount?: number;
  claimCount?: number;
}

export async function createOrganization(
  data: InsertOrganization,
  creatorUserId?: string
): Promise<OrganizationWithStats> {
  const slug = data.slug || data.name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const { data: existingSlug } = await supabaseAdmin
    .from('organizations')
    .select('id')
    .eq('slug', slug)
    .single();

  if (existingSlug) {
    throw new Error('Organization slug already exists');
  }

  const { data: org, error } = await supabaseAdmin
    .from('organizations')
    .insert({
      name: data.name,
      slug,
      type: data.type || 'carrier',
      email: data.email || null,
      phone: data.phone || null,
      address: data.address || null,
      status: data.status || 'active',
      settings: data.settings || {}
    })
    .select('*')
    .single();

  if (error || !org) {
    throw new Error(`Failed to create organization: ${error?.message}`);
  }

  if (creatorUserId) {
    await supabaseAdmin
      .from('organization_memberships')
      .insert({
        user_id: creatorUserId,
        organization_id: org.id,
        role: 'owner',
        status: 'active'
      });

    await supabaseAdmin
      .from('users')
      .update({ current_organization_id: org.id })
      .eq('id', creatorUserId);
  }

  return org as OrganizationWithStats;
}

export async function getOrganization(id: string): Promise<OrganizationWithStats | null> {
  const { data: org, error } = await supabaseAdmin
    .from('organizations')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !org) return null;

  const { count: memberCount } = await supabaseAdmin
    .from('organization_memberships')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', id)
    .eq('status', 'active');

  const { count: claimCount } = await supabaseAdmin
    .from('claims')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', id);

  return {
    ...org,
    memberCount: memberCount || 0,
    claimCount: claimCount || 0
  } as OrganizationWithStats;
}

export async function getOrganizationBySlug(slug: string): Promise<OrganizationWithStats | null> {
  const { data: org, error } = await supabaseAdmin
    .from('organizations')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error || !org) return null;

  const { count: memberCount } = await supabaseAdmin
    .from('organization_memberships')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', org.id)
    .eq('status', 'active');

  const { count: claimCount } = await supabaseAdmin
    .from('claims')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', org.id);

  return {
    ...org,
    memberCount: memberCount || 0,
    claimCount: claimCount || 0
  } as OrganizationWithStats;
}

export async function listOrganizations(options?: {
  status?: string;
  type?: string;
  limit?: number;
  offset?: number;
}): Promise<{ organizations: OrganizationWithStats[]; total: number }> {
  let query = supabaseAdmin
    .from('organizations')
    .select('*', { count: 'exact' });

  if (options?.status) {
    query = query.eq('status', options.status);
  }
  if (options?.type) {
    query = query.eq('type', options.type);
  }

  const limit = options?.limit || 50;
  const offset = options?.offset || 0;

  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data: orgs, count, error } = await query;

  if (error || !orgs) {
    return { organizations: [], total: 0 };
  }

  const organizations = await Promise.all(orgs.map(async (org) => {
    const { count: memberCount } = await supabaseAdmin
      .from('organization_memberships')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', org.id)
      .eq('status', 'active');

    const { count: claimCount } = await supabaseAdmin
      .from('claims')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', org.id);

    return {
      ...org,
      memberCount: memberCount || 0,
      claimCount: claimCount || 0
    } as OrganizationWithStats;
  }));

  return { organizations, total: count || 0 };
}

export async function updateOrganization(
  id: string,
  updates: Partial<InsertOrganization>
): Promise<OrganizationWithStats | null> {
  const updateData: Record<string, any> = { updated_at: new Date().toISOString() };

  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.type !== undefined) updateData.type = updates.type;
  if (updates.email !== undefined) updateData.email = updates.email;
  if (updates.phone !== undefined) updateData.phone = updates.phone;
  if (updates.address !== undefined) updateData.address = updates.address;
  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.settings !== undefined) updateData.settings = updates.settings;

  if (Object.keys(updateData).length === 1) {
    return getOrganization(id);
  }

  const { error } = await supabaseAdmin
    .from('organizations')
    .update(updateData)
    .eq('id', id);

  if (error) return null;
  return getOrganization(id);
}

export async function getUserOrganizations(userId: string): Promise<OrganizationWithStats[]> {
  const { data: memberships, error } = await supabaseAdmin
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error || !memberships || memberships.length === 0) {
    return [];
  }

  const orgIds = memberships.map(m => m.organization_id);

  const { data: orgs } = await supabaseAdmin
    .from('organizations')
    .select('*')
    .in('id', orgIds)
    .order('name');

  if (!orgs) return [];

  const organizations = await Promise.all(orgs.map(async (org) => {
    const membership = memberships.find(m => m.organization_id === org.id);

    const { count: memberCount } = await supabaseAdmin
      .from('organization_memberships')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', org.id)
      .eq('status', 'active');

    const { count: claimCount } = await supabaseAdmin
      .from('claims')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', org.id);

    return {
      ...org,
      membership_role: membership?.role,
      memberCount: memberCount || 0,
      claimCount: claimCount || 0
    } as OrganizationWithStats;
  }));

  return organizations;
}

export async function addOrganizationMember(
  organizationId: string,
  userId: string,
  role: string = 'member'
): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('organization_memberships')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .single();

  if (existing) {
    await supabaseAdmin
      .from('organization_memberships')
      .update({ role, status: 'active', updated_at: new Date().toISOString() })
      .eq('organization_id', organizationId)
      .eq('user_id', userId);
  } else {
    await supabaseAdmin
      .from('organization_memberships')
      .insert({
        organization_id: organizationId,
        user_id: userId,
        role,
        status: 'active'
      });
  }
}

export async function removeOrganizationMember(
  organizationId: string,
  userId: string
): Promise<void> {
  await supabaseAdmin
    .from('organization_memberships')
    .update({ status: 'removed', updated_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('user_id', userId);

  await supabaseAdmin
    .from('users')
    .update({ current_organization_id: null })
    .eq('id', userId)
    .eq('current_organization_id', organizationId);
}

export async function getOrganizationMembers(organizationId: string): Promise<any[]> {
  const { data: memberships, error } = await supabaseAdmin
    .from('organization_memberships')
    .select('user_id, role, status, created_at')
    .eq('organization_id', organizationId)
    .eq('status', 'active');

  if (error || !memberships) return [];

  const userIds = memberships.map(m => m.user_id);

  const { data: users } = await supabaseAdmin
    .from('users')
    .select('id, username, email, first_name, last_name, role')
    .in('id', userIds);

  if (!users) return [];

  return users.map(user => {
    const membership = memberships.find(m => m.user_id === user.id);
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      system_role: user.role,
      org_role: membership?.role,
      status: membership?.status,
      joined_at: membership?.created_at
    };
  });
}

export async function switchOrganization(
  userId: string,
  organizationId: string
): Promise<boolean> {
  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('id')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .single();

  if (!membership) {
    return false;
  }

  await supabaseAdmin
    .from('users')
    .update({ current_organization_id: organizationId, updated_at: new Date().toISOString() })
    .eq('id', userId);

  return true;
}

export async function deleteOrganization(id: string): Promise<boolean> {
  // Check if organization has any claims
  const { count: claimCount } = await supabaseAdmin
    .from('claims')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', id);

  if (claimCount && claimCount > 0) {
    throw new Error(`Cannot delete organization: ${claimCount} claim(s) exist. Delete claims first or use soft delete.`);
  }

  // Delete organization memberships first (cascade will handle related records)
  await supabaseAdmin
    .from('organization_memberships')
    .delete()
    .eq('organization_id', id);

  // Delete organization
  const { error } = await supabaseAdmin
    .from('organizations')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to delete organization: ${error.message}`);
  }

  return true;
}
