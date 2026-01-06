/**
 * Editable Sketch Encoder Interface
 *
 * This interface defines the contract for future sketch encoder implementations
 * that could generate editable Xactimate sketches (SKX format) or other
 * proprietary sketch formats.
 *
 * CURRENT STATUS: Stub implementation only
 *
 * WHY THIS EXISTS:
 * ================
 * The Tier A ESX export (see esxExport.ts) generates import-ready files with
 * a PDF sketch underlay. This is sufficient for most use cases.
 *
 * However, some advanced integrations may require editable sketches:
 * - Verisk partner SDK integration
 * - Third-party sketch editing tools
 * - Alternative export formats
 *
 * This interface provides a clean abstraction point for such integrations.
 *
 * IMPLEMENTATION REQUIREMENTS:
 * ===========================
 * To implement an editable sketch encoder, you would need:
 * 1. Access to Verisk partner SDK (for native Xactimate sketches)
 * 2. Understanding of the proprietary SKX/ZIPXML format
 * 3. Ongoing maintenance for Xactimate version compatibility
 *
 * See: docs/sketch-esx-architecture.md for architecture details.
 */

import type { Point, Wall, Opening, NormalizedGeometry } from './index';

// ============================================
// TYPE DEFINITIONS
// ============================================

/**
 * Complete sketch geometry for encoding
 */
export interface SketchGeometryForEncode {
  zones: ZoneGeometry[];
  connections: ZoneConnection[];
  metadata: SketchMetadata;
}

export interface ZoneGeometry {
  id: string;
  name: string;
  levelName: string;
  originXFt: number;
  originYFt: number;
  polygonFt: Point[];
  ceilingHeightFt: number;
  walls: Wall[];
  openings: Opening[];
}

export interface ZoneConnection {
  fromZoneId: string;
  toZoneId: string;
  connectionType: 'door' | 'opening' | 'shared_wall';
  openingId?: string;
}

export interface SketchMetadata {
  propertyAddress: string;
  dateCreated: string;
  version: string;
}

/**
 * Output file from encoder
 */
export interface EncodedFile {
  filename: string;
  data: Buffer;
  mimeType: string;
}

/**
 * Result of encoding operation
 */
export interface EncodeResult {
  success: boolean;
  files: EncodedFile[];
  errors?: string[];
  warnings?: string[];
}

// ============================================
// ENCODER INTERFACE
// ============================================

/**
 * Interface for editable sketch encoders
 *
 * Implementations of this interface can generate various sketch formats:
 * - SKX (Xactimate native sketch)
 * - DWG/DXF (AutoCAD format)
 * - SVG (scalable vector graphics)
 * - Custom proprietary formats
 */
export interface EditableSketchEncoder {
  /**
   * Unique identifier for this encoder
   */
  readonly id: string;

  /**
   * Human-readable name
   */
  readonly name: string;

  /**
   * File extension produced (e.g., 'skx', 'dwg')
   */
  readonly fileExtension: string;

  /**
   * Check if this encoder is available/licensed
   */
  isAvailable(): Promise<boolean>;

  /**
   * Encode sketch geometry to the target format
   */
  encode(geometry: SketchGeometryForEncode): Promise<EncodeResult>;

  /**
   * Validate that geometry can be encoded
   */
  validate(geometry: SketchGeometryForEncode): Promise<{
    valid: boolean;
    errors?: string[];
    warnings?: string[];
  }>;
}

// ============================================
// STUB IMPLEMENTATION
// ============================================

/**
 * Stub encoder that returns an error indicating encoding is not available
 *
 * This is a placeholder for future implementations.
 */
export class StubSketchEncoder implements EditableSketchEncoder {
  readonly id = 'stub';
  readonly name = 'Stub Encoder (Not Available)';
  readonly fileExtension = 'stub';

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async encode(_geometry: SketchGeometryForEncode): Promise<EncodeResult> {
    return {
      success: false,
      files: [],
      errors: [
        'Editable sketch encoding is not available.',
        'Use the Tier A ESX export with PDF underlay instead.',
        'See docs/sketch-esx-architecture.md for details.',
      ],
    };
  }

  async validate(_geometry: SketchGeometryForEncode): Promise<{
    valid: boolean;
    errors?: string[];
  }> {
    return {
      valid: false,
      errors: ['Stub encoder cannot validate geometry'],
    };
  }
}

// ============================================
// ENCODER REGISTRY
// ============================================

/**
 * Registry of available sketch encoders
 *
 * New encoder implementations can be registered here.
 */
export class SketchEncoderRegistry {
  private encoders: Map<string, EditableSketchEncoder> = new Map();

  constructor() {
    // Register the stub encoder by default
    this.register(new StubSketchEncoder());
  }

  /**
   * Register an encoder
   */
  register(encoder: EditableSketchEncoder): void {
    this.encoders.set(encoder.id, encoder);
  }

  /**
   * Get encoder by ID
   */
  get(id: string): EditableSketchEncoder | undefined {
    return this.encoders.get(id);
  }

  /**
   * Get all registered encoders
   */
  getAll(): EditableSketchEncoder[] {
    return Array.from(this.encoders.values());
  }

  /**
   * Get all available encoders (that pass isAvailable check)
   */
  async getAvailable(): Promise<EditableSketchEncoder[]> {
    const available: EditableSketchEncoder[] = [];
    for (const encoder of this.encoders.values()) {
      if (await encoder.isAvailable()) {
        available.push(encoder);
      }
    }
    return available;
  }
}

// Default registry instance
export const sketchEncoderRegistry = new SketchEncoderRegistry();

// ============================================
// EXAMPLE: SVG ENCODER (FOR REFERENCE)
// ============================================

/**
 * Example SVG encoder implementation (for reference)
 *
 * This shows how a real encoder might be implemented.
 * SVG is a non-editable format but demonstrates the pattern.
 */
export class SvgSketchEncoder implements EditableSketchEncoder {
  readonly id = 'svg';
  readonly name = 'SVG Sketch Export';
  readonly fileExtension = 'svg';

  async isAvailable(): Promise<boolean> {
    // SVG encoding is always available
    return true;
  }

  async validate(geometry: SketchGeometryForEncode): Promise<{
    valid: boolean;
    errors?: string[];
    warnings?: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!geometry.zones || geometry.zones.length === 0) {
      errors.push('No zones to encode');
    }

    for (const zone of geometry.zones) {
      if (!zone.polygonFt || zone.polygonFt.length < 3) {
        errors.push(`Zone "${zone.name}" has invalid polygon`);
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  async encode(geometry: SketchGeometryForEncode): Promise<EncodeResult> {
    const validation = await this.validate(geometry);
    if (!validation.valid) {
      return {
        success: false,
        files: [],
        errors: validation.errors,
      };
    }

    // Calculate bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const zone of geometry.zones) {
      for (const point of zone.polygonFt) {
        const x = point.x + zone.originXFt;
        const y = point.y + zone.originYFt;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }

    const padding = 10;
    const width = maxX - minX + padding * 2;
    const height = maxY - minY + padding * 2;
    const scale = 10; // 10 pixels per foot

    // Build SVG
    let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${width * scale}"
     height="${height * scale}"
     viewBox="${(minX - padding) * scale} ${(minY - padding) * scale} ${width * scale} ${height * scale}">
  <style>
    .room { fill: #e8f4ff; stroke: #333; stroke-width: 2; }
    .room-label { font-family: sans-serif; font-size: 12px; text-anchor: middle; }
    .opening-door { stroke: #8B4513; stroke-width: 4; }
    .opening-window { stroke: #4169E1; stroke-width: 4; }
  </style>
  <g transform="scale(${scale} ${scale})">
`;

    for (const zone of geometry.zones) {
      const offsetX = zone.originXFt;
      const offsetY = zone.originYFt;

      // Draw polygon
      const points = zone.polygonFt
        .map(p => `${p.x + offsetX},${p.y + offsetY}`)
        .join(' ');
      svg += `    <polygon class="room" points="${points}" />\n`;

      // Draw label
      const centerX = zone.polygonFt.reduce((sum, p) => sum + p.x, 0) / zone.polygonFt.length + offsetX;
      const centerY = zone.polygonFt.reduce((sum, p) => sum + p.y, 0) / zone.polygonFt.length + offsetY;
      svg += `    <text class="room-label" x="${centerX}" y="${centerY}">${escapeXml(zone.name)}</text>\n`;
    }

    svg += `  </g>
</svg>`;

    return {
      success: true,
      files: [{
        filename: 'sketch.svg',
        data: Buffer.from(svg, 'utf8'),
        mimeType: 'image/svg+xml',
      }],
    };
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Register SVG encoder
sketchEncoderRegistry.register(new SvgSketchEncoder());
