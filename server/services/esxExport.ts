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
 * - Sketch renders as PDF underlay (visible but not editable)
 *
 * See: docs/sketch-esx-architecture.md for architecture details.
 */

import { buildZipArchive } from '../utils/zipBuilder';
import { getEstimate, type SavedEstimate, type CalculatedLineItem } from './estimateCalculator';
import { getEstimateSketch, type ZoneSketch } from './sketchService';
import { supabaseAdmin } from '../lib/supabaseAdmin';

// ============================================
// TYPE DEFINITIONS
// ============================================

interface EsxConfig {
  includeSketchPdf?: boolean;
  includePhotos?: boolean;
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
// MAIN EXPORT FUNCTION
// ============================================

/**
 * Generate a complete ESX ZIP archive for an estimate
 */
export async function generateEsxZipArchive(
  estimateId: string,
  config: EsxConfig = {}
): Promise<Buffer> {
  // Load estimate data
  const estimate = await getEstimate(estimateId);
  if (!estimate) {
    throw new Error(`Estimate ${estimateId} not found`);
  }

  // Load claim data for metadata
  const claimMetadata = await getClaimMetadata(estimate.claimId);

  // Load sketch geometry
  let sketch: Awaited<ReturnType<typeof getEstimateSketch>> | null = null;
  try {
    sketch = await getEstimateSketch(estimateId);
  } catch {
    // Sketch may not exist, that's OK
  }

  // Group line items by room and level
  const lineItems = groupLineItemsForExport(estimate);

  // Build the ESX files
  const entries: Array<{ name: string; data: Buffer; date: Date }> = [];
  const now = new Date();

  // 1. XACTDOC.XML - Claim metadata
  const xactdocXml = generateXactdocXml(claimMetadata, estimate);
  entries.push({
    name: 'XACTDOC.XML',
    data: Buffer.from(xactdocXml, 'utf8'),
    date: now,
  });

  // 2. GENERIC_ROUGHDRAFT.XML - Estimate data
  const roughdraftXml = generateRoughdraftXml(estimate, lineItems, sketch?.zones || []);
  entries.push({
    name: 'GENERIC_ROUGHDRAFT.XML',
    data: Buffer.from(roughdraftXml, 'utf8'),
    date: now,
  });

  // 3. SKETCH_UNDERLAY.PDF - Visual floorplan (if sketch exists)
  if (config.includeSketchPdf !== false && sketch && sketch.zones.length > 0) {
    const sketchPdf = await generateSketchPdf(sketch.zones, claimMetadata.propertyAddress);
    entries.push({
      name: 'SKETCH_UNDERLAY.PDF',
      data: sketchPdf,
      date: now,
    });
  }

  // 4. Photos (optional)
  if (config.includePhotos) {
    const photos = await getEstimatePhotos(estimateId);
    for (let i = 0; i < photos.length; i++) {
      if (photos[i].data) {
        entries.push({
          name: `${i + 1}.JPG`,
          data: photos[i].data,
          date: now,
        });
      }
    }
  }

  // Build the ZIP archive
  return buildZipArchive(entries);
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
    <TotalRCV>${(estimate.rcvTotal || 0).toFixed(2)}</TotalRCV>
    <TotalACV>${(estimate.acvTotal || 0).toFixed(2)}</TotalACV>
    <TotalDepreciation>${((estimate.rcvTotal || 0) - (estimate.acvTotal || 0)).toFixed(2)}</TotalDepreciation>
    <Deductible>${(estimate.deductible || 0).toFixed(2)}</Deductible>
    <NetClaim>${((estimate.acvTotal || 0) - (estimate.deductible || 0)).toFixed(2)}</NetClaim>
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
  zones: ZoneSketch[]
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
      if (zone) {
        roomDimensionsXml = `
          <Dimensions>
            <Length>${zone.lengthFt.toFixed(2)}</Length>
            <Width>${zone.widthFt.toFixed(2)}</Width>
            <CeilingHeight>${zone.ceilingHeightFt.toFixed(2)}</CeilingHeight>
            <SquareFeet>${(zone.lengthFt * zone.widthFt).toFixed(2)}</SquareFeet>
          </Dimensions>`;
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
          <Name>${escXml(roomName)}</Name>${roomDimensionsXml}
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
      <MaterialTotal>${(estimate.materialCost || 0).toFixed(2)}</MaterialTotal>
      <LaborTotal>${(estimate.laborCost || 0).toFixed(2)}</LaborTotal>
      <EquipmentTotal>${(estimate.equipmentCost || 0).toFixed(2)}</EquipmentTotal>
      <Subtotal>${(estimate.subtotal || 0).toFixed(2)}</Subtotal>
      <Overhead>${(estimate.overhead || 0).toFixed(2)}</Overhead>
      <Profit>${(estimate.profit || 0).toFixed(2)}</Profit>
      <Tax>${(estimate.tax || 0).toFixed(2)}</Tax>
      <RCVTotal>${(estimate.rcvTotal || 0).toFixed(2)}</RCVTotal>
      <Depreciation>${((estimate.rcvTotal || 0) - (estimate.acvTotal || 0)).toFixed(2)}</Depreciation>
      <ACVTotal>${(estimate.acvTotal || 0).toFixed(2)}</ACVTotal>
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
// SKETCH PDF GENERATION
// ============================================

/**
 * Generate sketch PDF underlay
 *
 * Creates a simple PDF with room polygons rendered as a floor plan.
 * Uses a minimal PDF structure without external dependencies.
 */
async function generateSketchPdf(zones: ZoneSketch[], propertyAddress: string): Promise<Buffer> {
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

  // PDF page dimensions (Letter size in points: 612 x 792)
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 50;
  const drawWidth = pageWidth - 2 * margin;
  const drawHeight = pageHeight - 2 * margin - 80; // Leave room for header

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
  content += '0.9 0.9 0.9 RG\n'; // Light gray
  content += '0.5 w\n'; // Thin line
  const gridSpacing = 10; // 10 feet
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
    content += '0.95 0.95 1 rg\n'; // Light blue fill
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
    content += '0 0 0 RG\n'; // Black stroke
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
            content += '0.8 0.5 0.2 RG\n'; // Brown for doors
          } else if (opening.openingType === 'window') {
            content += '0.2 0.6 0.9 RG\n'; // Blue for windows
          } else {
            content += '0.5 0.5 0.5 RG\n'; // Gray for other
          }
          content += '3 w\n';
          content += `${(px - halfWidth * unitY).toFixed(2)} ${(py + halfWidth * unitX).toFixed(2)} m `;
          content += `${(px + halfWidth * unitY).toFixed(2)} ${(py - halfWidth * unitX).toFixed(2)} l S\n`;
        }
      }
    }
  }

  // Scale legend
  content += '0 0 0 RG\n';
  content += '1 w\n';
  const legendY = 30;
  const legendX = margin;
  const legendLen = 72; // 1 inch
  content += `${legendX} ${legendY} m ${legendX + legendLen} ${legendY} l S\n`;
  content += `${legendX} ${legendY - 3} m ${legendX} ${legendY + 3} l S\n`;
  content += `${legendX + legendLen} ${legendY - 3} m ${legendX + legendLen} ${legendY + 3} l S\n`;
  const scaleText = `${(legendLen / scale).toFixed(1)} ft`;
  content += `BT /F1 8 Tf ${legendX + 25} ${legendY + 8} Td (${scaleText}) Tj ET\n`;

  // North arrow
  const northX = pageWidth - margin - 30;
  const northY = pageHeight - margin - 40;
  content += '0 0 0 RG\n';
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

    if (item.xactCode) {
      // Xact codes are typically in format: CAT>SEL>ACT or CAT-SEL-ACT
      const parts = item.xactCode.split(/[>\-]/);
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
      totalRcv: item.totalRcv || item.totalPrice || 0,
      roomName: item.roomName || 'General',
      levelName: item.levelName || 'Main Level',
      notes: item.notes || undefined,
    });
  }

  return items;
}

/**
 * Get photos for an estimate
 */
async function getEstimatePhotos(estimateId: string): Promise<Array<{ name: string; data: Buffer }>> {
  // This would load actual photos from storage
  // For now, return empty array
  return [];
}
