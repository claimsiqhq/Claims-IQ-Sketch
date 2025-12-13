import bcrypt from 'bcryptjs';
import { pool } from '../db';
import type { User } from '../../shared/schema';

const SALT_ROUNDS = 10;

export interface AuthUser {
  id: string;
  username: string;
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

export async function createUser(username: string, password: string): Promise<AuthUser> {
  const hashedPassword = await hashPassword(password);
  const client = await pool.connect();
  try {
    const result = await client.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
      [username, hashedPassword]
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
  };
}

export async function seedAdminUser(): Promise<void> {
  const existingUser = await findUserByUsername('admin');
  if (existingUser) {
    console.log('Admin user already exists');
    return;
  }

  await createUser('admin', 'admin123');
  console.log('Admin user created successfully');
}
