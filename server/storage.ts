import { type User, type InsertUser, type ClaimPhoto, type InsertClaimPhoto } from "@shared/schema";
import { randomUUID } from "crypto";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Claim Photos
  createClaimPhoto(photo: InsertClaimPhoto): Promise<ClaimPhoto>;
  getClaimPhoto(id: string): Promise<ClaimPhoto | undefined>;
  listClaimPhotos(claimId: string, filters?: { structureId?: string; roomId?: string; damageZoneId?: string; damageDetected?: boolean }): Promise<ClaimPhoto[]>;
  deleteClaimPhoto(id: string): Promise<boolean>;
}

import { db } from "./db";
import { claimPhotos } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export class MemStorage implements IStorage {
  private users: Map<string, User>;

  constructor() {
    this.users = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = {
      ...insertUser,
      id,
      role: 'user',
      email: insertUser.email || null,
      firstName: insertUser.firstName || null,
      lastName: insertUser.lastName || null,
      currentOrganizationId: null,
      preferences: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  async createClaimPhoto(photo: InsertClaimPhoto): Promise<ClaimPhoto> {
    const [created] = await db.insert(claimPhotos).values(photo).returning();
    return created;
  }

  async getClaimPhoto(id: string): Promise<ClaimPhoto | undefined> {
    const [photo] = await db.select().from(claimPhotos).where(eq(claimPhotos.id, id));
    return photo;
  }

  async listClaimPhotos(claimId: string, filters?: { structureId?: string; roomId?: string; damageZoneId?: string; damageDetected?: boolean }): Promise<ClaimPhoto[]> {
    const conditions = [eq(claimPhotos.claimId, claimId)];
    
    if (filters?.structureId) {
      conditions.push(eq(claimPhotos.structureId, filters.structureId));
    }
    if (filters?.roomId) {
      conditions.push(eq(claimPhotos.roomId, filters.roomId));
    }
    if (filters?.damageZoneId) {
      conditions.push(eq(claimPhotos.damageZoneId, filters.damageZoneId));
    }
    if (filters?.damageDetected !== undefined) {
      conditions.push(eq(claimPhotos.damageDetected, filters.damageDetected));
    }

    return db.select().from(claimPhotos).where(and(...conditions));
  }

  async deleteClaimPhoto(id: string): Promise<boolean> {
    const result = await db.delete(claimPhotos).where(eq(claimPhotos.id, id)).returning();
    return result.length > 0;
  }
}

export const storage = new MemStorage();
