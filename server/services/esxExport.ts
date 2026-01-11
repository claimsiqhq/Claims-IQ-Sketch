/**
 * ESX Export Service
 *
 * Generates standards-compliant ESX files (ZIP archives) for Xactimate import.
 *
 * ESX EXPORT PHILOSOPHY (Tier A):
 * ================================
 * This module generates import-ready ESX files that Xactimate can read.
 * We do NOT generate editable Xactimate sketches (SKX format) because:
 *
 * 1. Editable sketches require proprietary Verisk partner SDK access
 * 2. SKX binary/XML encoding is not publicly documented
 * 3. Ongoing compatibility maintenance with Xactimate versions is complex
 *
 * The Tier A approach provides:
 * - Full claim metadata import (XACTDOC.XML)
 * - Line items with room/level grouping (GENERIC_ROUGHDRAFT.XML)
 * - Sketch geometry as structured XML (SKETCH.XML)
 * - Sketch renders as PDF underlay (SKETCH_UNDERLAY.PDF)
 *
 * See: docs/EXPORT_ESX.md for complete documentation.
 */

import { buildZipArchive } from '../utils/zipBuilder';
import { getEstimate, type SavedEstimate, type CalculatedLineItem } from './estimateCalculator';
import {
  getEstimateSketch,
  type ZoneSketch,
  type ZoneConnectionData,
  type ZoneOpeningData,
  validateEstimateSketchForExport
} from './sketchService';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import {
  PDF_PAGE_WIDTH,
  PDF_PAGE_HEIGHT,
  PDF_MARGIN,
  PDF_HEADER_HEIGHT,
  PDF_GRID_SPACING_FT,
  PDF_SCALE_LEGEND_LENGTH,
  PDF_COLORS,
} from '../../shared/geometry/constants';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface EsxConfig {
  includeSketchPdf?: boolean;
  includeSketchXml?: boolean;
  includePhotos?: boolean;
  maxPhotos?: number;
  strictValidation?: boolean;
}

export interface EsxValidationError {
  code: string;
  message: string;
  severity: 'error' | 'warning';
  field?: string;
  zoneId?: string;
  zoneName?: string;
}

export interface EsxValidationResult {
  isValid: boolean;
  errors: EsxValidationError[];
  warnings: EsxValidationError[];
  canExport: boolean;
}

export interface EsxExportResult {
  archive: Buffer;
  validation: EsxValidationResult;
  files: string[];
  metadata: {
    estimateId: string;
    claimNumber: string;
    exportDate: string;
    totalRcv: number;
    totalAcv: number;
    zoneCount: number;
    lineItemCount: number;
    photoCount: number;
  };
}

interface ClaimMetadata {
  claimNumber: string;
  dateOfLoss: string;
  propertyAddress: string;
  insuredName: string;
  insuredPhone?: string;
  insuredEmail?: string;
  adjusterName?: string;
  adjusterPhone?: string;
  adjusterEmail?: string;
  policyNumber?: string;
  carrierName?: string;
}

interface LineItemForExport {
  cat: string;
  sel: string;
  act: string;
  desc: string;
  qty: number;
  unit: string;
  unitPrice: number;
  totalRcv: number;
  roomName: string;
  levelName: string;
  notes?: string;
}

// ============================================
// VALIDATION CLASS
// ============================================

/**
 * EsxExportValidator - Validates estimate data before ESX export
 *
 * Implements fail-loud validation: returns comprehensive error list
 * rather than silently proceeding with invalid data.
 */
export class EsxExportValidator {
  private errors: EsxValidationError[] = [];
  private warnings: EsxValidationError[] = [];

  constructor(private strictMode: boolean = true) {}

  /**
   * Validate entire estimate for ESX export
   */
  async validate(
    estimate: SavedEstimate,
    sketch: { zones: ZoneSketch[]; connections: ZoneConnectionData[] } | null
  ): Promise<EsxValidationResult> {
    this.errors = [];
    this.warnings = [];

    // Validate estimate basics
    this.validateEstimate(estimate);

    // Validate line items
    this.validateLineItems(estimate.lineItems || []);

    // Validate sketch if present
    if (sketch && sketch.zones.length > 0) {
      this.validateSketch(sketch);
    }

    const hasErrors = this.errors.length > 0;
    const hasOnlyWarnings = !hasErrors && this.warnings.length > 0;

    return {
      isValid: !hasErrors,
      errors: this.errors,
      warnings: this.warnings,
      canExport: !hasErrors || !this.strictMode,
    };
  }

  private validateEstimate(estimate: SavedEstimate): void {
    // Check estimate has required fields
    if (!estimate.id) {
      this.addError('MISSING_ESTIMATE_ID', 'Estimate ID is required', 'id');
    }

    // Validate totals are reasonable
    if (estimate.totals?.totalRcv === undefined || estimate.totals?.totalRcv === null) {
      this.addError('MISSING_RCV_TOTAL', 'RCV total is required', 'totals.totalRcv');
    } else if (estimate.totals.totalRcv < 0) {
      this.addError('NEGATIVE_RCV', 'RCV total cannot be negative', 'totals.totalRcv');
    }

    if (estimate.totals?.totalAcv === undefined || estimate.totals?.totalAcv === null) {
      this.addWarning('MISSING_ACV_TOTAL', 'ACV total is not set', 'totals.totalAcv');
    }

    // Validate line items exist
    if (!estimate.lineItems || estimate.lineItems.length === 0) {
      this.addWarning('NO_LINE_ITEMS', 'Estimate has no line items', 'lineItems');
    }
  }

  private validateLineItems(lineItems: CalculatedLineItem[]): void {
    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      const field = `lineItems[${i}]`;

      // Check required fields
      if (!item.description) {
        this.addWarning('MISSING_DESCRIPTION', `Line item ${i + 1} has no description`, field);
      }

      if (item.quantity <= 0) {
        this.addError('INVALID_QUANTITY', `Line item ${i + 1} has invalid quantity: ${item.quantity}`, field);
      }

      if (item.unitPrice < 0) {
        this.addError('NEGATIVE_PRICE', `Line item ${i + 1} has negative unit price`, field);
      }

      // Validate Xactimate code format if present
      if (item.xactimateCode) {
        if (!/^[A-Z0-9]+/.test(item.xactimateCode)) {
          this.addWarning('INVALID_XACT_CODE', `Line item ${i + 1} has non-standard Xactimate code: ${item.xactimateCode}`, field);
        }
      }
    }
  }

  private validateSketch(sketch: { zones: ZoneSketch[]; connections: ZoneConnectionData[] }): void {
    const zoneIds = new Set<string>();

    for (const zone of sketch.zones) {
      zoneIds.add(zone.id);

      // Validate zone has name
      if (!zone.name) {
        this.addError('MISSING_ZONE_NAME', 'Zone has no name', 'name', zone.id);
      }

      // Validate polygon
      if (!zone.polygonFt || zone.polygonFt.length < 3) {
        this.addError('INVALID_POLYGON', `Zone "${zone.name}" has invalid polygon (${zone.polygonFt?.length || 0} points)`, 'polygonFt', zone.id, zone.name);
      } else {
        // Validate polygon area is reasonable
        const area = this.calculatePolygonArea(zone.polygonFt);
        if (area < 1) {
          this.addError('TINY_ZONE', `Zone "${zone.name}" has very small area (${area.toFixed(2)} sq ft)`, 'polygonFt', zone.id, zone.name);
        }
        if (area > 100000) {
          this.addWarning('HUGE_ZONE', `Zone "${zone.name}" has unusually large area (${area.toFixed(0)} sq ft)`, 'polygonFt', zone.id, zone.name);
        }
      }

      // Validate dimensions
      if (zone.lengthFt <= 0 || zone.widthFt <= 0) {
        this.addWarning('ZERO_DIMENSIONS', `Zone "${zone.name}" has zero dimensions`, 'dimensions', zone.id, zone.name);
      }

      // Validate ceiling height
      if (zone.ceilingHeightFt < 4 || zone.ceilingHeightFt > 50) {
        this.addWarning('UNUSUAL_CEILING', `Zone "${zone.name}" has unusual ceiling height: ${zone.ceilingHeightFt}ft`, 'ceilingHeightFt', zone.id, zone.name);
      }

      // Validate openings
      this.validateOpenings(zone);
    }

    // Validate connections reference valid zones
    for (const conn of sketch.connections || []) {
      if (!zoneIds.has(conn.toZoneId)) {
        this.addWarning('INVALID_CONNECTION', `Connection references non-existent zone: ${conn.toZoneId}`, 'connections');
      }
    }
  }

  private validateOpenings(zone: ZoneSketch): void {
    for (let i = 0; i < zone.openings.length; i++) {
      const opening = zone.openings[i];
      const wallCount = zone.polygonFt.length;

      if (opening.wallIndex < 0 || opening.wallIndex >= wallCount) {
        this.addError(
          'INVALID_OPENING_WALL',
          `Opening ${i + 1} in "${zone.name}" references invalid wall index ${opening.wallIndex}`,
          `openings[${i}]`,
          zone.id,
          zone.name
        );
      }

      if (opening.widthFt <= 0) {
        this.addError('INVALID_OPENING_WIDTH', `Opening ${i + 1} in "${zone.name}" has invalid width`, `openings[${i}]`, zone.id, zone.name);
      }

      if (opening.heightFt <= 0) {
        this.addError('INVALID_OPENING_HEIGHT', `Opening ${i + 1} in "${zone.name}" has invalid height`, `openings[${i}]`, zone.id, zone.name);
      }
    }
  }

  private calculatePolygonArea(polygon: Array<{ x: number; y: number }>): number {
    let area = 0;
    for (let i = 0; i < polygon.length; i++) {
      const j = (i + 1) % polygon.length;
      area += polygon[i].x * polygon[j].y;
      area -= polygon[j].x * polygon[i].y;
    }
    return Math.abs(area / 2);
  }

  private addError(code: string, message: string, field?: string, zoneId?: string, zoneName?: string): void {
    this.errors.push({ code, message, severity: 'error', field, zoneId, zoneName });
  }

  private addWarning(code: string, message: string, field?: string, zoneId?: string, zoneName?: string): void {
    this.warnings.push({ code, message, severity: 'warning', field, zoneId, zoneName });
  }
}

// ============================================
// MAIN EXPORT FUNCTION
// ============================================

/**
 * Generate a complete ESX ZIP archive for an estimate
 *
 * @throws Error if validation fails in strict mode
 */
export async function generateEsxZipArchive(
  estimateId: string,
  config: EsxConfig = {}
): Promise<Buffer> {
  const result = await generateValidatedEsxArchive(estimateId, config);

  if (!result.validation.canExport) {
    const errorMessages = result.validation.errors
      .map(e => `[${e.code}] ${e.message}`)
      .join('\n');
    throw new Error(`ESX Export validation failed:\n${errorMessages}`);
  }

  return result.archive;
}

/**
 * Generate ESX archive with full validation results
 *
 * This is the primary export function that returns both the archive
 * and detailed validation information.
 */
export async function generateValidatedEsxArchive(
  estimateId: string,
  config: EsxConfig = {}
): Promise<EsxExportResult> {
  const effectiveConfig: EsxConfig = {
    includeSketchPdf: true,
    includeSketchXml: true,
    includePhotos: false,
    maxPhotos: 50,
    strictValidation: true,
    ...config,
  };

  // Load estimate data
  const estimate = await getEstimate(estimateId);
  if (!estimate) {
    throw new Error(`Estimate ${estimateId} not found`);
  }

  // Load claim data for metadata
  const claimMetadata = await getClaimMetadata(estimate.claimId);

  // Load sketch geometry
  let sketch: { zones: ZoneSketch[]; connections: ZoneConnectionData[] } | null = null;
  try {
    const sketchData = await getEstimateSketch(estimateId);
    if (sketchData && sketchData.zones.length > 0) {
      sketch = {
        zones: sketchData.zones,
        connections: sketchData.connections || [],
      };
    }
  } catch (error) {
    // Sketch may not exist, that's OK
    console.warn(`[ESX Export] Could not load sketch for estimate ${estimateId}:`, error);
  }

  // Validate before export
  const validator = new EsxExportValidator(effectiveConfig.strictValidation);
  const validation = await validator.validate(estimate, sketch);

  // If strict validation fails and we can't export, return early with empty archive
  if (!validation.canExport) {
    return {
      archive: Buffer.alloc(0),
      validation,
      files: [],
      metadata: {
        estimateId,
        claimNumber: claimMetadata.claimNumber,
        exportDate: new Date().toISOString(),
        totalRcv: estimate.totals?.totalRcv || 0,
        totalAcv: estimate.totals?.totalAcv || 0,
        zoneCount: sketch?.zones.length || 0,
        lineItemCount: estimate.lineItems?.length || 0,
        photoCount: 0,
      },
    };
  }

  // Group line items by room and level
  const lineItems = groupLineItemsForExport(estimate);

  // Build the ESX files
  const entries: Array<{ name: string; data: Buffer; date: Date }> = [];
  const files: string[] = [];
  const now = new Date();

  // 1. XACTDOC.XML - Claim metadata
  const xactdocXml = generateXactdocXml(claimMetadata, estimate);
  entries.push({
    name: 'XACTDOC.XML',
    data: Buffer.from(xactdocXml, 'utf8'),
    date: now,
  });
  files.push('XACTDOC.XML');

  // 2. GENERIC_ROUGHDRAFT.XML - Estimate data
  const roughdraftXml = generateRoughdraftXml(
    estimate,
    lineItems,
    sketch?.zones || [],
    sketch?.connections || []
  );
  entries.push({
    name: 'GENERIC_ROUGHDRAFT.XML',
    data: Buffer.from(roughdraftXml, 'utf8'),
    date: now,
  });
  files.push('GENERIC_ROUGHDRAFT.XML');

  // 3. SKETCH.XML - Geometry data (if sketch exists)
  if (effectiveConfig.includeSketchXml !== false && sketch && sketch.zones.length > 0) {
    const sketchXml = generateSketchXml(sketch.zones, sketch.connections);
    entries.push({
      name: 'SKETCH.XML',
      data: Buffer.from(sketchXml, 'utf8'),
      date: now,
    });
    files.push('SKETCH.XML');
  }

  // 4. SKETCH_UNDERLAY.PDF - Visual floorplan (if sketch exists)
  if (effectiveConfig.includeSketchPdf !== false && sketch && sketch.zones.length > 0) {
    const sketchPdf = await generateSketchPdf(
      sketch.zones,
      sketch.connections,
      claimMetadata.propertyAddress
    );
    entries.push({
      name: 'SKETCH_UNDERLAY.PDF',
      data: sketchPdf,
      date: now,
    });
    files.push('SKETCH_UNDERLAY.PDF');
  }

  // 5. Photos (optional)
  let photoCount = 0;
  if (effectiveConfig.includePhotos) {
    const photos = await getEstimatePhotos(estimateId);
    const maxPhotos = effectiveConfig.maxPhotos || 50;
    for (let i = 0; i < Math.min(photos.length, maxPhotos); i++) {
      if (photos[i].data) {
        entries.push({
          name: `${i + 1}.JPG`,
          data: photos[i].data,
          date: now,
        });
        files.push(`${i + 1}.JPG`);
        photoCount++;
      }
    }
  }

  // Build the ZIP archive
  const archive = buildZipArchive(entries);

  return {
    archive,
    validation,
    files,
    metadata: {
      estimateId,
      claimNumber: claimMetadata.claimNumber,
      exportDate: now.toISOString(),
      totalRcv: estimate.totals?.totalRcv || 0,
      totalAcv: estimate.totals?.totalAcv || 0,
      zoneCount: sketch?.zones.length || 0,
      lineItemCount: estimate.lineItems?.length || 0,
      photoCount,
    },
  };
}

// ============================================
// XACTDOC.XML GENERATION
// ============================================

/**
 * Generate XACTDOC.XML with claim metadata
 */
function generateXactdocXml(metadata: ClaimMetadata, estimate: SavedEstimate): string {
  const escXml = (str: string | undefined | null): string => {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toISOString().split('T')[0];
    } catch {
      return dateStr;
    }
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<XACTDOC Version="1.0">
  <Header>
    <ExportDate>${new Date().toISOString().split('T')[0]}</ExportDate>
    <ExportTime>${new Date().toTimeString().split(' ')[0]}</ExportTime>
    <Generator>Claims iQ Sketch</Generator>
    <GeneratorVersion>1.0.0</GeneratorVersion>
  </Header>
  <Claim>
    <ClaimNumber>${escXml(metadata.claimNumber)}</ClaimNumber>
    <DateOfLoss>${formatDate(metadata.dateOfLoss)}</DateOfLoss>
    <TypeOfLoss>Property Damage</TypeOfLoss>
  </Claim>
  <Property>
    <Address>
      <FullAddress>${escXml(metadata.propertyAddress)}</FullAddress>
    </Address>
  </Property>
  <Insured>
    <Name>${escXml(metadata.insuredName)}</Name>
    <Phone>${escXml(metadata.insuredPhone)}</Phone>
    <Email>${escXml(metadata.insuredEmail)}</Email>
  </Insured>
  <Policy>
    <PolicyNumber>${escXml(metadata.policyNumber)}</PolicyNumber>
    <Carrier>${escXml(metadata.carrierName)}</Carrier>
  </Policy>
  <Assignment>
    <Adjuster>
      <Name>${escXml(metadata.adjusterName)}</Name>
      <Phone>${escXml(metadata.adjusterPhone)}</Phone>
      <Email>${escXml(metadata.adjusterEmail)}</Email>
    </Adjuster>
  </Assignment>
  <Summary>
    <TotalRCV>${(estimate.totals?.totalRcv || 0).toFixed(2)}</TotalRCV>
    <TotalACV>${(estimate.totals?.totalAcv || 0).toFixed(2)}</TotalACV>
    <TotalDepreciation>${(estimate.totals?.totalDepreciation || 0).toFixed(2)}</TotalDepreciation>
    <Deductible>${(estimate.settlement?.totalDeductible || 0).toFixed(2)}</Deductible>
    <NetClaim>${(estimate.totals?.netClaimTotal || 0).toFixed(2)}</NetClaim>
  </Summary>
</XACTDOC>`;
}

// ============================================
// GENERIC_ROUGHDRAFT.XML GENERATION
// ============================================

/**
 * Generate GENERIC_ROUGHDRAFT.XML with estimate hierarchy
 */
function generateRoughdraftXml(
  estimate: SavedEstimate,
  lineItems: LineItemForExport[],
  zones: ZoneSketch[],
  connections: ZoneConnectionData[]
): string {
  const escXml = (str: string | undefined | null): string => {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  // Group line items by level, then by room
  const itemsByLevel = new Map<string, Map<string, LineItemForExport[]>>();
  for (const item of lineItems) {
    const level = item.levelName || 'Main Level';
    const room = item.roomName || 'General';

    if (!itemsByLevel.has(level)) {
      itemsByLevel.set(level, new Map());
    }
    const levelMap = itemsByLevel.get(level)!;

    if (!levelMap.has(room)) {
      levelMap.set(room, []);
    }
    levelMap.get(room)!.push(item);
  }

  // Build room XML sections
  let levelsXml = '';
  for (const [levelName, rooms] of itemsByLevel) {
    let roomsXml = '';
    for (const [roomName, items] of rooms) {
      // Find zone geometry for this room
      const zone = zones.find(z =>
        z.name.toLowerCase() === roomName.toLowerCase() ||
        z.zoneCode === roomName
      );

      let roomDimensionsXml = '';
      let roomConnectionsXml = '';
      if (zone) {
        roomDimensionsXml = `
          <Dimensions>
            <Length>${zone.lengthFt.toFixed(2)}</Length>
            <Width>${zone.widthFt.toFixed(2)}</Width>
            <CeilingHeight>${zone.ceilingHeightFt.toFixed(2)}</CeilingHeight>
            <SquareFeet>${(zone.lengthFt * zone.widthFt).toFixed(2)}</SquareFeet>
          </Dimensions>`;

        // Find connections for this zone
        const zoneConnections = connections.filter(c => {
          // Check if connection involves this zone
          const fromZone = zones.find(z => z.connections?.some(zc => zc.id === c.id));
          const toZone = zones.find(z => z.id === c.toZoneId);
          return (fromZone?.id === zone.id || toZone?.id === zone.id) && fromZone?.id !== toZone?.id;
        });

        if (zoneConnections.length > 0) {
          let connectionsXml = '';
          for (const conn of zoneConnections) {
            const connectedZone = zones.find(z => z.id === conn.toZoneId);
            if (connectedZone) {
              connectionsXml += `
            <Connection>
              <ToRoom>${escXml(connectedZone.name)}</ToRoom>
              <Type>${escXml(conn.connectionType)}</Type>
            </Connection>`;
            }
          }
          roomConnectionsXml = `
          <Connections>${connectionsXml}
          </Connections>`;
        }
      }

      // Build line items XML
      let itemsXml = '';
      for (const item of items) {
        itemsXml += `
          <LineItem>
            <Category>${escXml(item.cat)}</Category>
            <Selector>${escXml(item.sel)}</Selector>
            <Action>${escXml(item.act)}</Action>
            <Description>${escXml(item.desc)}</Description>
            <Quantity>${item.qty.toFixed(2)}</Quantity>
            <Unit>${escXml(item.unit)}</Unit>
            <UnitPrice>${item.unitPrice.toFixed(2)}</UnitPrice>
            <TotalRCV>${item.totalRcv.toFixed(2)}</TotalRCV>
            ${item.notes ? `<Notes>${escXml(item.notes)}</Notes>` : ''}
          </LineItem>`;
      }

      roomsXml += `
        <Room>
          <Name>${escXml(roomName)}</Name>${roomDimensionsXml}${roomConnectionsXml}
          <LineItems>${itemsXml}
          </LineItems>
        </Room>`;
    }

    levelsXml += `
      <Level>
        <Name>${escXml(levelName)}</Name>
        <Rooms>${roomsXml}
        </Rooms>
      </Level>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<GENERIC_ROUGHDRAFT Version="1.0">
  <Header>
    <ExportDate>${new Date().toISOString().split('T')[0]}</ExportDate>
    <Generator>Claims iQ Sketch</Generator>
  </Header>
  <Estimate>
    <ID>${estimate.id}</ID>
    <Totals>
      <MaterialTotal>${(estimate.totals?.subtotalMaterials || 0).toFixed(2)}</MaterialTotal>
      <LaborTotal>${(estimate.totals?.subtotalLabor || 0).toFixed(2)}</LaborTotal>
      <EquipmentTotal>${(estimate.totals?.subtotalEquipment || 0).toFixed(2)}</EquipmentTotal>
      <Subtotal>${(estimate.subtotal || 0).toFixed(2)}</Subtotal>
      <Overhead>${(estimate.overheadAmount || 0).toFixed(2)}</Overhead>
      <Profit>${(estimate.profitAmount || 0).toFixed(2)}</Profit>
      <Tax>${(estimate.taxAmount || 0).toFixed(2)}</Tax>
      <RCVTotal>${(estimate.totals?.totalRcv || 0).toFixed(2)}</RCVTotal>
      <Depreciation>${(estimate.totals?.totalDepreciation || 0).toFixed(2)}</Depreciation>
      <ACVTotal>${(estimate.totals?.totalAcv || 0).toFixed(2)}</ACVTotal>
    </Totals>
    <Structure>
      <Name>Main Structure</Name>
      <Levels>${levelsXml}
      </Levels>
    </Structure>
  </Estimate>
</GENERIC_ROUGHDRAFT>`;
}

// ============================================
// SKETCH.XML GENERATION
// ============================================

/**
 * Generate SKETCH.XML with full geometry data
 *
 * This is a structured XML representation of the sketch geometry
 * that provides complete data for systems that can import it.
 */
function generateSketchXml(zones: ZoneSketch[], connections: ZoneConnectionData[]): string {
  const escXml = (str: string | undefined | null): string => {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  let zonesXml = '';
  for (const zone of zones) {
    // Generate polygon points XML
    let polygonXml = '';
    for (let i = 0; i < zone.polygonFt.length; i++) {
      const point = zone.polygonFt[i];
      polygonXml += `
        <Point Index="${i}">
          <X>${point.x.toFixed(4)}</X>
          <Y>${point.y.toFixed(4)}</Y>
        </Point>`;
    }

    // Generate openings XML
    let openingsXml = '';
    for (const opening of zone.openings) {
      openingsXml += `
        <Opening>
          <ID>${escXml(opening.id)}</ID>
          <Type>${escXml(opening.openingType)}</Type>
          <WallIndex>${opening.wallIndex}</WallIndex>
          <OffsetFt>${opening.offsetFromVertexFt.toFixed(4)}</OffsetFt>
          <WidthFt>${opening.widthFt.toFixed(4)}</WidthFt>
          <HeightFt>${opening.heightFt.toFixed(4)}</HeightFt>
          ${opening.sillHeightFt !== undefined ? `<SillHeightFt>${opening.sillHeightFt.toFixed(4)}</SillHeightFt>` : ''}
          ${opening.connectsToZoneId ? `<ConnectsToZoneID>${escXml(opening.connectsToZoneId)}</ConnectsToZoneID>` : ''}
        </Opening>`;
    }

    // Calculate area and perimeter
    const area = calculatePolygonArea(zone.polygonFt);
    const perimeter = calculatePolygonPerimeter(zone.polygonFt);

    zonesXml += `
    <Zone>
      <ID>${escXml(zone.id)}</ID>
      <Name>${escXml(zone.name)}</Name>
      <ZoneCode>${escXml(zone.zoneCode || '')}</ZoneCode>
      <ZoneType>${escXml(zone.zoneType)}</ZoneType>
      <LevelName>${escXml(zone.levelName)}</LevelName>
      <ShapeType>${escXml(zone.shapeType)}</ShapeType>
      <Origin>
        <XFt>${zone.originXFt.toFixed(4)}</XFt>
        <YFt>${zone.originYFt.toFixed(4)}</YFt>
      </Origin>
      <Dimensions>
        <LengthFt>${zone.lengthFt.toFixed(4)}</LengthFt>
        <WidthFt>${zone.widthFt.toFixed(4)}</WidthFt>
        <CeilingHeightFt>${zone.ceilingHeightFt.toFixed(4)}</CeilingHeightFt>
        <AreaSqFt>${area.toFixed(2)}</AreaSqFt>
        <PerimeterFt>${perimeter.toFixed(2)}</PerimeterFt>
        <WallAreaSqFt>${(perimeter * zone.ceilingHeightFt).toFixed(2)}</WallAreaSqFt>
      </Dimensions>
      <Polygon PointCount="${zone.polygonFt.length}" WindingOrder="CCW">${polygonXml}
      </Polygon>
      <Openings Count="${zone.openings.length}">${openingsXml}
      </Openings>
    </Zone>`;
  }

  // Generate connections XML
  let connectionsXml = '';
  for (const conn of connections) {
    connectionsXml += `
    <Connection>
      <ID>${escXml(conn.id)}</ID>
      <ToZoneID>${escXml(conn.toZoneId)}</ToZoneID>
      <Type>${escXml(conn.connectionType)}</Type>
      ${conn.openingId ? `<OpeningID>${escXml(conn.openingId)}</OpeningID>` : ''}
    </Connection>`;
  }

  // Calculate bounds
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const zone of zones) {
    const offsetX = zone.originXFt || 0;
    const offsetY = zone.originYFt || 0;
    for (const point of zone.polygonFt) {
      minX = Math.min(minX, point.x + offsetX);
      maxX = Math.max(maxX, point.x + offsetX);
      minY = Math.min(minY, point.y + offsetY);
      maxY = Math.max(maxY, point.y + offsetY);
    }
  }

  if (!isFinite(minX)) {
    minX = 0; maxX = 0; minY = 0; maxY = 0;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<SKETCH Version="1.0">
  <Header>
    <ExportDate>${new Date().toISOString()}</ExportDate>
    <Generator>Claims iQ Sketch</Generator>
    <GeneratorVersion>1.0.0</GeneratorVersion>
    <Units>feet</Units>
    <CoordinateSystem>Cartesian</CoordinateSystem>
  </Header>
  <Bounds>
    <MinX>${minX.toFixed(4)}</MinX>
    <MaxX>${maxX.toFixed(4)}</MaxX>
    <MinY>${minY.toFixed(4)}</MinY>
    <MaxY>${maxY.toFixed(4)}</MaxY>
    <TotalWidthFt>${(maxX - minX).toFixed(4)}</TotalWidthFt>
    <TotalLengthFt>${(maxY - minY).toFixed(4)}</TotalLengthFt>
  </Bounds>
  <Zones Count="${zones.length}">${zonesXml}
  </Zones>
  <Connections Count="${connections.length}">${connectionsXml}
  </Connections>
</SKETCH>`;
}

/**
 * Calculate polygon area using shoelace formula
 */
function calculatePolygonArea(polygon: Array<{ x: number; y: number }>): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i].x * polygon[j].y;
    area -= polygon[j].x * polygon[i].y;
  }
  return Math.abs(area / 2);
}

/**
 * Calculate polygon perimeter
 */
function calculatePolygonPerimeter(polygon: Array<{ x: number; y: number }>): number {
  let perimeter = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    const dx = polygon[j].x - polygon[i].x;
    const dy = polygon[j].y - polygon[i].y;
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }
  return perimeter;
}

// ============================================
// SKETCH PDF GENERATION
// ============================================

/**
 * Generate sketch PDF underlay
 *
 * Creates a simple PDF with room polygons rendered as a floor plan.
 * Uses a minimal PDF structure without external dependencies.
 *
 * @param zones - Zone geometry data
 * @param connections - Zone connection data (room-to-room relationships)
 * @param propertyAddress - Property address for header
 */
async function generateSketchPdf(
  zones: ZoneSketch[],
  connections: ZoneConnectionData[],
  propertyAddress: string
): Promise<Buffer> {
  // Calculate bounds for all zones
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  for (const zone of zones) {
    const offsetX = zone.originXFt || 0;
    const offsetY = zone.originYFt || 0;

    for (const point of zone.polygonFt) {
      const x = point.x + offsetX;
      const y = point.y + offsetY;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  // Handle empty or invalid bounds
  if (!isFinite(minX)) {
    minX = 0;
    maxX = 100;
    minY = 0;
    maxY = 100;
  }

  const boundsWidth = maxX - minX || 100;
  const boundsHeight = maxY - minY || 100;

  // PDF page dimensions (Letter size in points)
  const pageWidth = PDF_PAGE_WIDTH;
  const pageHeight = PDF_PAGE_HEIGHT;
  const margin = PDF_MARGIN;
  const drawWidth = pageWidth - 2 * margin;
  const drawHeight = pageHeight - 2 * margin - PDF_HEADER_HEIGHT;

  // Calculate scale to fit
  const scaleX = drawWidth / boundsWidth;
  const scaleY = drawHeight / boundsHeight;
  const scale = Math.min(scaleX, scaleY);

  // Transform function: feet to PDF points
  const toPageX = (x: number) => margin + (x - minX) * scale;
  const toPageY = (y: number) => pageHeight - margin - 60 - (y - minY) * scale;

  // Build PDF content stream
  let content = '';

  // Header text
  content += `BT /F1 14 Tf 50 750 Td (Claims iQ Sketch - Floor Plan) Tj ET\n`;
  content += `BT /F1 10 Tf 50 735 Td (${escPdfString(propertyAddress)}) Tj ET\n`;
  content += `BT /F1 8 Tf 50 720 Td (Scale: 1 inch = ${(72 / scale).toFixed(1)} feet) Tj ET\n`;

  // Draw grid
  content += `${PDF_COLORS.GRID} RG\n`;
  content += '0.5 w\n'; // Thin line
  const gridSpacing = PDF_GRID_SPACING_FT;
  for (let x = Math.ceil(minX / gridSpacing) * gridSpacing; x <= maxX; x += gridSpacing) {
    content += `${toPageX(x).toFixed(2)} ${toPageY(minY).toFixed(2)} m `;
    content += `${toPageX(x).toFixed(2)} ${toPageY(maxY).toFixed(2)} l S\n`;
  }
  for (let y = Math.ceil(minY / gridSpacing) * gridSpacing; y <= maxY; y += gridSpacing) {
    content += `${toPageX(minX).toFixed(2)} ${toPageY(y).toFixed(2)} m `;
    content += `${toPageX(maxX).toFixed(2)} ${toPageY(y).toFixed(2)} l S\n`;
  }

  // Draw each zone
  for (const zone of zones) {
    const offsetX = zone.originXFt || 0;
    const offsetY = zone.originYFt || 0;

    if (zone.polygonFt.length < 3) continue;

    // Fill polygon with light color
    content += `${PDF_COLORS.ROOM_FILL} rg\n`;
    let first = true;
    for (const point of zone.polygonFt) {
      const x = toPageX(point.x + offsetX);
      const y = toPageY(point.y + offsetY);
      if (first) {
        content += `${x.toFixed(2)} ${y.toFixed(2)} m `;
        first = false;
      } else {
        content += `${x.toFixed(2)} ${y.toFixed(2)} l `;
      }
    }
    content += 'h f\n'; // Close path and fill

    // Stroke polygon outline
    content += `${PDF_COLORS.WALL} RG\n`;
    content += '1 w\n'; // Normal line width
    first = true;
    for (const point of zone.polygonFt) {
      const x = toPageX(point.x + offsetX);
      const y = toPageY(point.y + offsetY);
      if (first) {
        content += `${x.toFixed(2)} ${y.toFixed(2)} m `;
        first = false;
      } else {
        content += `${x.toFixed(2)} ${y.toFixed(2)} l `;
      }
    }
    content += 'h S\n'; // Close path and stroke

    // Draw room name
    const centerX = zone.polygonFt.reduce((sum, p) => sum + p.x, 0) / zone.polygonFt.length + offsetX;
    const centerY = zone.polygonFt.reduce((sum, p) => sum + p.y, 0) / zone.polygonFt.length + offsetY;
    const textX = toPageX(centerX) - (zone.name.length * 3);
    const textY = toPageY(centerY);
    content += `BT /F1 9 Tf ${textX.toFixed(2)} ${textY.toFixed(2)} Td (${escPdfString(zone.name)}) Tj ET\n`;

    // Draw dimensions below room name
    const dimText = `${zone.widthFt.toFixed(1)}' x ${zone.lengthFt.toFixed(1)}'`;
    const dimX = toPageX(centerX) - (dimText.length * 2.5);
    content += `BT /F1 7 Tf ${dimX.toFixed(2)} ${(textY - 12).toFixed(2)} Td (${dimText}) Tj ET\n`;

    // Draw openings (doors/windows)
    for (const opening of zone.openings) {
      // Calculate opening position on wall
      if (opening.wallIndex >= 0 && opening.wallIndex < zone.polygonFt.length) {
        const p1 = zone.polygonFt[opening.wallIndex];
        const p2 = zone.polygonFt[(opening.wallIndex + 1) % zone.polygonFt.length];

        // Calculate wall direction
        const wallDx = p2.x - p1.x;
        const wallDy = p2.y - p1.y;
        const wallLen = Math.sqrt(wallDx * wallDx + wallDy * wallDy);
        if (wallLen > 0) {
          const unitX = wallDx / wallLen;
          const unitY = wallDy / wallLen;

          // Opening center position
          const openingCenterOffset = opening.offsetFromVertexFt + opening.widthFt / 2;
          const ox = p1.x + unitX * openingCenterOffset + offsetX;
          const oy = p1.y + unitY * openingCenterOffset + offsetY;

          // Draw opening indicator
          const halfWidth = opening.widthFt * scale / 2;
          const px = toPageX(ox);
          const py = toPageY(oy);

          if (opening.openingType === 'door') {
            content += `${PDF_COLORS.DOOR} RG\n`;
          } else if (opening.openingType === 'window') {
            content += `${PDF_COLORS.WINDOW} RG\n`;
          } else {
            content += `${PDF_COLORS.OPENING_OTHER} RG\n`;
          }
          content += '3 w\n';
          content += `${(px - halfWidth * unitY).toFixed(2)} ${(py + halfWidth * unitX).toFixed(2)} m `;
          content += `${(px + halfWidth * unitY).toFixed(2)} ${(py - halfWidth * unitX).toFixed(2)} l S\n`;
        }
      }
    }
  }

  // Draw zone connections (room-to-room relationships)
  if (connections && connections.length > 0) {
    // Create zone lookup map
    const zoneMap = new Map<string, ZoneSketch>();
    for (const zone of zones) {
      zoneMap.set(zone.id, zone);
    }

    // Draw each connection
    for (const conn of connections) {
      // Find from zone by checking which zone has this connection
      let fromZone: ZoneSketch | undefined;
      for (const zone of zones) {
        if (zone.connections && zone.connections.some(c => c.id === conn.id)) {
          fromZone = zone;
          break;
        }
      }

      const toZone = zoneMap.get(conn.toZoneId);

      if (!fromZone || !toZone) continue;

      // Find connection point - use opening if available, otherwise use zone centers
      let fromPoint: { x: number; y: number };
      let toPoint: { x: number; y: number };

      if (conn.openingId) {
        // Find opening in from zone
        const opening = fromZone.openings.find(o => o.id === conn.openingId);
        if (opening && opening.wallIndex >= 0 && opening.wallIndex < fromZone.polygonFt.length) {
          const p1 = fromZone.polygonFt[opening.wallIndex];
          const p2 = fromZone.polygonFt[(opening.wallIndex + 1) % fromZone.polygonFt.length];
          const wallDx = p2.x - p1.x;
          const wallDy = p2.y - p1.y;
          const wallLen = Math.sqrt(wallDx * wallDx + wallDy * wallDy);
          if (wallLen > 0) {
            const unitX = wallDx / wallLen;
            const unitY = wallDy / wallLen;
            const openingCenterOffset = opening.offsetFromVertexFt + opening.widthFt / 2;
            fromPoint = {
              x: p1.x + unitX * openingCenterOffset + fromZone.originXFt,
              y: p1.y + unitY * openingCenterOffset + fromZone.originYFt,
            };
          } else {
            // Fallback to center
            fromPoint = {
              x: fromZone.polygonFt.reduce((sum, p) => sum + p.x, 0) / fromZone.polygonFt.length + fromZone.originXFt,
              y: fromZone.polygonFt.reduce((sum, p) => sum + p.y, 0) / fromZone.polygonFt.length + fromZone.originYFt,
            };
          }
        } else {
          // Fallback to center
          fromPoint = {
            x: fromZone.polygonFt.reduce((sum, p) => sum + p.x, 0) / fromZone.polygonFt.length + fromZone.originXFt,
            y: fromZone.polygonFt.reduce((sum, p) => sum + p.y, 0) / fromZone.polygonFt.length + fromZone.originYFt,
          };
        }
      } else {
        // Use zone centers
        fromPoint = {
          x: fromZone.polygonFt.reduce((sum, p) => sum + p.x, 0) / fromZone.polygonFt.length + fromZone.originXFt,
          y: fromZone.polygonFt.reduce((sum, p) => sum + p.y, 0) / fromZone.polygonFt.length + fromZone.originYFt,
        };
      }

      toPoint = {
        x: toZone.polygonFt.reduce((sum, p) => sum + p.x, 0) / toZone.polygonFt.length + toZone.originXFt,
        y: toZone.polygonFt.reduce((sum, p) => sum + p.y, 0) / toZone.polygonFt.length + toZone.originYFt,
      };

      // Draw connection line (dashed)
      content += `${PDF_COLORS.CONNECTION_LINE} RG\n`;
      content += '1 w\n';
      content += '[4 2] 0 d\n'; // Dashed line pattern
      content += `${toPageX(fromPoint.x).toFixed(2)} ${toPageY(fromPoint.y).toFixed(2)} m `;
      content += `${toPageX(toPoint.x).toFixed(2)} ${toPageY(toPoint.y).toFixed(2)} l S\n`;
      content += '[] 0 d\n'; // Reset dash pattern

      // Draw connection indicators (small circles)
      const iconSize = 4;
      content += `${PDF_COLORS.CONNECTION_LINE} rg\n`; // Fill color
      content += `${toPageX(fromPoint.x).toFixed(2)} ${toPageY(fromPoint.y).toFixed(2)} ${iconSize} 0 360 arc f\n`;
      content += `${toPageX(toPoint.x).toFixed(2)} ${toPageY(toPoint.y).toFixed(2)} ${iconSize} 0 360 arc f\n`;
    }
  }

  // Scale legend
  content += `${PDF_COLORS.WALL} RG\n`;
  content += '1 w\n';
  const legendY = 30;
  const legendX = margin;
  const legendLen = PDF_SCALE_LEGEND_LENGTH;
  content += `${legendX} ${legendY} m ${legendX + legendLen} ${legendY} l S\n`;
  content += `${legendX} ${legendY - 3} m ${legendX} ${legendY + 3} l S\n`;
  content += `${legendX + legendLen} ${legendY - 3} m ${legendX + legendLen} ${legendY + 3} l S\n`;
  const scaleText = `${(legendLen / scale).toFixed(1)} ft`;
  content += `BT /F1 8 Tf ${legendX + 25} ${legendY + 8} Td (${scaleText}) Tj ET\n`;

  // North arrow
  const northX = pageWidth - margin - 30;
  const northY = pageHeight - margin - 40;
  content += `${PDF_COLORS.WALL} RG\n`;
  content += '2 w\n';
  content += `${northX} ${northY - 20} m ${northX} ${northY + 20} l S\n`; // Vertical line
  content += `${northX} ${northY + 20} m ${northX - 5} ${northY + 10} l S\n`; // Left arrow
  content += `${northX} ${northY + 20} m ${northX + 5} ${northY + 10} l S\n`; // Right arrow
  content += `BT /F1 10 Tf ${northX - 3} ${northY + 25} Td (N) Tj ET\n`;

  // Build minimal PDF
  return buildSimplePdf(content);
}

/**
 * Escape string for PDF text
 */
function escPdfString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Build a minimal PDF document
 */
function buildSimplePdf(contentStream: string): Buffer {
  const objects: string[] = [];

  // Object 1: Catalog
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // Object 2: Pages
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  // Object 3: Page
  objects.push('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n');

  // Object 4: Content stream
  const contentStreamBytes = Buffer.from(contentStream, 'utf8');
  objects.push(`4 0 obj\n<< /Length ${contentStreamBytes.length} >>\nstream\n${contentStream}endstream\nendobj\n`);

  // Object 5: Font
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

  // Build PDF
  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';

  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }

  // Cross-reference table
  const xrefOffset = pdf.length;
  pdf += 'xref\n';
  pdf += `0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets) {
    pdf += offset.toString().padStart(10, '0') + ' 00000 n \n';
  }

  // Trailer
  pdf += 'trailer\n';
  pdf += `<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += 'startxref\n';
  pdf += xrefOffset + '\n';
  pdf += '%%EOF\n';

  return Buffer.from(pdf, 'binary');
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get claim metadata for ESX export
 */
async function getClaimMetadata(claimId: string | null): Promise<ClaimMetadata> {
  if (!claimId) {
    return {
      claimNumber: 'UNKNOWN',
      dateOfLoss: '',
      propertyAddress: '',
      insuredName: '',
    };
  }

  const { data: claim, error } = await supabaseAdmin
    .from('claims')
    .select('*')
    .eq('id', claimId)
    .maybeSingle();

  if (error || !claim) {
    return {
      claimNumber: 'UNKNOWN',
      dateOfLoss: '',
      propertyAddress: '',
      insuredName: '',
    };
  }

  // Build full address
  const addressParts = [
    claim.property_address,
    claim.property_city,
    claim.property_state,
    claim.property_zip,
  ].filter(Boolean);

  return {
    claimNumber: claim.claim_number || 'UNKNOWN',
    dateOfLoss: claim.date_of_loss || '',
    propertyAddress: addressParts.join(', '),
    insuredName: claim.insured_name || '',
    insuredPhone: claim.insured_phone || undefined,
    insuredEmail: claim.insured_email || undefined,
    adjusterName: claim.adjuster_name || undefined,
    adjusterPhone: claim.adjuster_phone || undefined,
    adjusterEmail: claim.adjuster_email || undefined,
    policyNumber: claim.policy_number || undefined,
    carrierName: claim.carrier_name || undefined,
  };
}

/**
 * Group line items for export with room and level info
 */
function groupLineItemsForExport(estimate: SavedEstimate): LineItemForExport[] {
  const items: LineItemForExport[] = [];

  for (const item of estimate.lineItems || []) {
    // Parse category/selector/action from xactCode if available
    let cat = '';
    let sel = '';
    let act = '';

    if (item.xactimateCode) {
      // Xact codes are typically in format: CAT>SEL>ACT or CAT-SEL-ACT
      const parts = item.xactimateCode.split(/[>\-]/);
      cat = parts[0] || '';
      sel = parts[1] || '';
      act = parts[2] || '';
    }

    items.push({
      cat,
      sel,
      act,
      desc: item.description || '',
      qty: item.quantity || 0,
      unit: item.unit || 'EA',
      unitPrice: item.unitPrice || 0,
      totalRcv: item.rcv || item.subtotal || 0,
      roomName: item.roomName || 'General',
      levelName: (item as any).levelName || 'Main Level',
      notes: item.notes || undefined,
    });
  }

  return items;
}

/**
 * Get photos for an estimate
 * Loads photos from claim_photos table and downloads from storage
 */
async function getEstimatePhotos(estimateId: string): Promise<Array<{ name: string; data: Buffer }>> {
  try {
    // Get estimate to find claim ID
    const estimate = await getEstimate(estimateId);
    if (!estimate || !estimate.claimId) {
      return [];
    }

    // Fetch photos for this claim
    const { data: photos, error } = await supabaseAdmin
      .from('claim_photos')
      .select('id, file_name, storage_path, public_url')
      .eq('claim_id', estimate.claimId)
      .eq('analysis_status', 'completed') // Only include analyzed photos
      .order('captured_at', { ascending: true })
      .limit(50); // Limit to 50 photos per export

    if (error || !photos || photos.length === 0) {
      return [];
    }

    // Download photos from storage
    const photoData: Array<{ name: string; data: Buffer }> = [];

    for (const photo of photos) {
      try {
        // Try to download from storage path first, fall back to public URL
        if (photo.storage_path) {
          const { data: fileData, error: downloadError } = await supabaseAdmin.storage
            .from('claim-photos')
            .download(photo.storage_path);

          if (!downloadError && fileData) {
            const buffer = Buffer.from(await fileData.arrayBuffer());
            photoData.push({
              name: photo.file_name || `${photo.id}.jpg`,
              data: buffer,
            });
            continue;
          }
        }

        // Fallback: try public URL
        if (photo.public_url) {
          const response = await fetch(photo.public_url);
          if (response.ok) {
            const buffer = Buffer.from(await response.arrayBuffer());
            photoData.push({
              name: photo.file_name || `${photo.id}.jpg`,
              data: buffer,
            });
          }
        }
      } catch (err) {
        console.warn(`[ESX Export] Failed to load photo ${photo.id}:`, err);
        // Continue with next photo
      }
    }

    return photoData;
  } catch (error) {
    console.error(`[ESX Export] Error loading photos for estimate ${estimateId}:`, error);
    return [];
  }
}

// ============================================
// STANDALONE VALIDATION EXPORT
// ============================================

/**
 * Validate an estimate for ESX export without generating the archive
 *
 * Use this to check export readiness before triggering the full export.
 */
export async function validateEsxExport(
  estimateId: string,
  strictMode: boolean = true
): Promise<EsxValidationResult> {
  const estimate = await getEstimate(estimateId);
  if (!estimate) {
    return {
      isValid: false,
      errors: [{ code: 'ESTIMATE_NOT_FOUND', message: `Estimate ${estimateId} not found`, severity: 'error' }],
      warnings: [],
      canExport: false,
    };
  }

  let sketch: { zones: ZoneSketch[]; connections: ZoneConnectionData[] } | null = null;
  try {
    const sketchData = await getEstimateSketch(estimateId);
    if (sketchData && sketchData.zones.length > 0) {
      sketch = {
        zones: sketchData.zones,
        connections: sketchData.connections || [],
      };
    }
  } catch {
    // Sketch may not exist, that's OK
  }

  const validator = new EsxExportValidator(strictMode);
  return validator.validate(estimate, sketch);
}
