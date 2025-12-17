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
  listAllClaimPhotos(organizationId: string): Promise<ClaimPhoto[]>;
  updateClaimPhoto(id: string, updates: { label?: string; hierarchyPath?: string; claimId?: string | null; structureId?: string | null; roomId?: string | null; damageZoneId?: string | null; latitude?: number | null; longitude?: number | null; geoAddress?: string | null; aiAnalysis?: unknown; qualityScore?: number | null; damageDetected?: boolean; description?: string | null; analysisStatus?: string; analysisError?: string | null; analyzedAt?: Date | null }): Promise<ClaimPhoto | undefined>;
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

  async listAllClaimPhotos(organizationId: string): Promise<ClaimPhoto[]> {
    return db.select().from(claimPhotos).where(eq(claimPhotos.organizationId, organizationId));
  }

  async updateClaimPhoto(id: string, updates: { label?: string; hierarchyPath?: string; claimId?: string | null; structureId?: string | null; roomId?: string | null; damageZoneId?: string | null; latitude?: number | null; longitude?: number | null; geoAddress?: string | null; aiAnalysis?: unknown; qualityScore?: number | null; damageDetected?: boolean; description?: string | null; analysisStatus?: string; analysisError?: string | null; analyzedAt?: Date | null }): Promise<ClaimPhoto | undefined> {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.label !== undefined) updateData.label = updates.label;
    if (updates.hierarchyPath !== undefined) updateData.hierarchyPath = updates.hierarchyPath;
    if (updates.claimId !== undefined) updateData.claimId = updates.claimId; // Allow reassigning to different claim or unassigning
    if (updates.structureId !== undefined) updateData.structureId = updates.structureId;
    if (updates.roomId !== undefined) updateData.roomId = updates.roomId;
    if (updates.damageZoneId !== undefined) updateData.damageZoneId = updates.damageZoneId;
    if (updates.latitude !== undefined) updateData.latitude = updates.latitude;
    if (updates.longitude !== undefined) updateData.longitude = updates.longitude;
    if (updates.geoAddress !== undefined) updateData.geoAddress = updates.geoAddress;
    // Analysis-related fields
    if (updates.aiAnalysis !== undefined) updateData.aiAnalysis = updates.aiAnalysis;
    if (updates.qualityScore !== undefined) updateData.qualityScore = updates.qualityScore;
    if (updates.damageDetected !== undefined) updateData.damageDetected = updates.damageDetected;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.analysisStatus !== undefined) updateData.analysisStatus = updates.analysisStatus;
    if (updates.analysisError !== undefined) updateData.analysisError = updates.analysisError;
    if (updates.analyzedAt !== undefined) updateData.analyzedAt = updates.analyzedAt;

    const [updated] = await db.update(claimPhotos).set(updateData).where(eq(claimPhotos.id, id)).returning();
    return updated;
  }
}

export const storage = new MemStorage();
