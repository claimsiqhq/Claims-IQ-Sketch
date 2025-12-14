import bcrypt from 'bcryptjs';
import { pool } from '../db';
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
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

export async function findUserById(id: string): Promise<User | null> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
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
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO users (username, password, email, first_name, last_name, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, username, email, first_name as "firstName", last_name as "lastName", role, current_organization_id as "currentOrganizationId"`,
      [
        username,
        hashedPassword,
        options?.email || null,
        options?.firstName || null,
        options?.lastName || null,
        options?.role || 'user'
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

export async function validateUser(username: string, password: string): Promise<AuthUser | null> {
  const user = await findUserByUsername(username);
  if (!user) {
    return null;
  }

  const isValid = await verifyPassword(password, user.password);
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
  const client = await pool.connect();
  try {
    let adminUser = await findUserByUsername('admin');

    if (adminUser) {
      // Ensure admin has super_admin role
      await client.query(
        "UPDATE users SET role = 'super_admin' WHERE username = 'admin' AND (role IS NULL OR role = 'user')"
      );
      console.log('Admin user already exists');
    } else {
      // Create admin user
      const hashedPassword = await hashPassword('admin123');
      const userResult = await client.query(
        `INSERT INTO users (username, password, role)
         VALUES ($1, $2, $3)
         RETURNING id, username, role`,
        ['admin', hashedPassword, 'super_admin']
      );
      adminUser = userResult.rows[0];
      console.log('Admin user created successfully');
    }

    // Ensure default organization exists and admin is a member
    const orgResult = await client.query(
      `SELECT id FROM organizations WHERE slug = 'default'`
    );

    let orgId: string;
    if (orgResult.rows.length === 0) {
      // Create default organization
      const createOrgResult = await client.query(
        `INSERT INTO organizations (name, slug, type, status)
         VALUES ('Default Organization', 'default', 'carrier', 'active')
         RETURNING id`
      );
      orgId = createOrgResult.rows[0].id;
      console.log('Default organization created');
    } else {
      orgId = orgResult.rows[0].id;
    }

    // Check if admin is already a member
    const membershipResult = await client.query(
      `SELECT id FROM organization_memberships
       WHERE user_id = $1 AND organization_id = $2`,
      [adminUser.id, orgId]
    );

    if (membershipResult.rows.length === 0) {
      // Add admin as owner of default organization
      await client.query(
        `INSERT INTO organization_memberships (user_id, organization_id, role, status)
         VALUES ($1, $2, 'owner', 'active')`,
        [adminUser.id, orgId]
      );
      console.log('Admin added to default organization');
    }

    // Set admin's current organization if not set
    await client.query(
      `UPDATE users SET current_organization_id = $1
       WHERE id = $2 AND current_organization_id IS NULL`,
      [orgId, adminUser.id]
    );
  } finally {
    client.release();
  }
}
