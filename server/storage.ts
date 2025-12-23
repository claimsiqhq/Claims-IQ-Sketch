import { type User, type InsertUser, type ClaimPhoto, type InsertClaimPhoto } from "@shared/schema";
import { supabaseAdmin } from "./lib/supabaseAdmin";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  createClaimPhoto(photo: InsertClaimPhoto): Promise<ClaimPhoto>;
  getClaimPhoto(id: string): Promise<ClaimPhoto | undefined>;
  listClaimPhotos(claimId: string, filters?: { structureId?: string; roomId?: string; damageZoneId?: string; damageDetected?: boolean }): Promise<ClaimPhoto[]>;
  listAllClaimPhotos(organizationId: string): Promise<ClaimPhoto[]>;
  updateClaimPhoto(id: string, updates: { label?: string; hierarchyPath?: string; claimId?: string | null; structureId?: string | null; roomId?: string | null; damageZoneId?: string | null; latitude?: number | null; longitude?: number | null; geoAddress?: string | null; aiAnalysis?: unknown; qualityScore?: number | null; damageDetected?: boolean; description?: string | null; analysisStatus?: string; analysisError?: string | null; analyzedAt?: Date | null }): Promise<ClaimPhoto | undefined>;
  deleteClaimPhoto(id: string): Promise<boolean>;
}

export class SupabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !data) return undefined;
    return data as User;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('username', username)
      .single();
    
    if (error || !data) return undefined;
    return data as User;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const { data, error } = await supabaseAdmin
      .from('users')
      .insert({
        ...insertUser,
        id: randomUUID(),
        role: 'user',
        email: insertUser.email || null,
        first_name: insertUser.firstName || null,
        last_name: insertUser.lastName || null,
        current_organization_id: null,
        preferences: {},
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create user: ${error?.message}`);
    }
    return data as User;
  }

  async createClaimPhoto(photo: InsertClaimPhoto): Promise<ClaimPhoto> {
    const { data, error } = await supabaseAdmin
      .from('claim_photos')
      .insert({
        claim_id: photo.claimId,
        organization_id: photo.organizationId,
        structure_id: photo.structureId,
        room_id: photo.roomId,
        damage_zone_id: photo.damageZoneId,
        file_name: photo.fileName,
        storage_path: photo.storagePath,
        public_url: photo.publicUrl,
        file_size: photo.fileSize,
        mime_type: photo.mimeType,
        label: photo.label,
        hierarchy_path: photo.hierarchyPath,
        latitude: photo.latitude,
        longitude: photo.longitude,
        geo_address: photo.geoAddress,
        captured_at: photo.capturedAt,
        ai_analysis: photo.aiAnalysis,
        quality_score: photo.qualityScore,
        damage_detected: photo.damageDetected ?? false,
        description: photo.description,
        analysis_status: photo.analysisStatus || 'pending',
        analysis_error: photo.analysisError,
        analyzed_at: photo.analyzedAt,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create claim photo: ${error?.message}`);
    }
    return this.mapClaimPhoto(data);
  }

  async getClaimPhoto(id: string): Promise<ClaimPhoto | undefined> {
    const { data, error } = await supabaseAdmin
      .from('claim_photos')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return undefined;
    return this.mapClaimPhoto(data);
  }

  async listClaimPhotos(claimId: string, filters?: { structureId?: string; roomId?: string; damageZoneId?: string; damageDetected?: boolean }): Promise<ClaimPhoto[]> {
    let query = supabaseAdmin
      .from('claim_photos')
      .select('*')
      .eq('claim_id', claimId);

    if (filters?.structureId) {
      query = query.eq('structure_id', filters.structureId);
    }
    if (filters?.roomId) {
      query = query.eq('room_id', filters.roomId);
    }
    if (filters?.damageZoneId) {
      query = query.eq('damage_zone_id', filters.damageZoneId);
    }
    if (filters?.damageDetected !== undefined) {
      query = query.eq('damage_detected', filters.damageDetected);
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return data.map(this.mapClaimPhoto);
  }

  async listAllClaimPhotos(organizationId: string): Promise<ClaimPhoto[]> {
    const { data, error } = await supabaseAdmin
      .from('claim_photos')
      .select('*')
      .eq('organization_id', organizationId);

    if (error || !data) return [];
    return data.map(this.mapClaimPhoto);
  }

  async updateClaimPhoto(id: string, updates: Record<string, unknown>): Promise<ClaimPhoto | undefined> {
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    
    if (updates.label !== undefined) updateData.label = updates.label;
    if (updates.hierarchyPath !== undefined) updateData.hierarchy_path = updates.hierarchyPath;
    if (updates.claimId !== undefined) updateData.claim_id = updates.claimId;
    if (updates.structureId !== undefined) updateData.structure_id = updates.structureId;
    if (updates.roomId !== undefined) updateData.room_id = updates.roomId;
    if (updates.damageZoneId !== undefined) updateData.damage_zone_id = updates.damageZoneId;
    if (updates.latitude !== undefined) updateData.latitude = updates.latitude;
    if (updates.longitude !== undefined) updateData.longitude = updates.longitude;
    if (updates.geoAddress !== undefined) updateData.geo_address = updates.geoAddress;
    if (updates.aiAnalysis !== undefined) updateData.ai_analysis = updates.aiAnalysis;
    if (updates.qualityScore !== undefined) updateData.quality_score = updates.qualityScore;
    if (updates.damageDetected !== undefined) updateData.damage_detected = updates.damageDetected;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.analysisStatus !== undefined) updateData.analysis_status = updates.analysisStatus;
    if (updates.analysisError !== undefined) updateData.analysis_error = updates.analysisError;
    if (updates.analyzedAt !== undefined) updateData.analyzed_at = updates.analyzedAt;

    const { data, error } = await supabaseAdmin
      .from('claim_photos')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) return undefined;
    return this.mapClaimPhoto(data);
  }

  async deleteClaimPhoto(id: string): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from('claim_photos')
      .delete()
      .eq('id', id);

    return !error;
  }

  private mapClaimPhoto(data: any): ClaimPhoto {
    return {
      id: data.id,
      claimId: data.claim_id,
      organizationId: data.organization_id,
      structureId: data.structure_id,
      roomId: data.room_id,
      damageZoneId: data.damage_zone_id,
      fileName: data.file_name,
      storagePath: data.storage_path,
      publicUrl: data.public_url,
      fileSize: data.file_size,
      mimeType: data.mime_type,
      label: data.label,
      hierarchyPath: data.hierarchy_path,
      latitude: data.latitude,
      longitude: data.longitude,
      geoAddress: data.geo_address,
      capturedAt: data.captured_at,
      aiAnalysis: data.ai_analysis,
      qualityScore: data.quality_score,
      damageDetected: data.damage_detected,
      description: data.description,
      analysisStatus: data.analysis_status,
      analysisError: data.analysis_error,
      analyzedAt: data.analyzed_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      uploadedBy: data.uploaded_by,
    };
  }
}

export const storage = new SupabaseStorage();
