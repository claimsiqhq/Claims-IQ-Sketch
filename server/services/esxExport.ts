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
import { getEstimateSketch, type ZoneSketch, type ZoneConnectionData, validateEstimateSketchForExport } from './sketchService';
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
    
    // Validate sketch before export if it exists
    if (sketch && sketch.zones.length > 0) {
      const validation = await validateEstimateSketchForExport(estimateId);
      if (!validation.isValid) {
        const errors = validation.zones
          .filter(z => !z.validation.isValid)
          .map(z => `${z.zoneName}: ${z.validation.warnings.map(w => w.message).join(', ')}`)
          .join('; ');
        throw new Error(`Sketch validation failed: ${errors}`);
      }
    }
  } catch (error) {
    // If validation fails, throw the error
    if (error instanceof Error && error.message.includes('validation failed')) {
      throw error;
    }
    // Otherwise, sketch may not exist, that's OK
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

  // 3. SKETCH_UNDERLAY.PDF - Visual floorplan (if sketch exists)
  if (config.includeSketchPdf !== false && sketch && sketch.zones.length > 0) {
    const sketchPdf = await generateSketchPdf(
      sketch.zones,
      sketch.connections || [],
      claimMetadata.propertyAddress
    );
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
