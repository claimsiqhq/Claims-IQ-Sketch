# ESX Export Documentation

## Overview

The ESX (Xactimate Exchange) Export feature generates standards-compliant ZIP archives that can be imported into Xactimate. This document covers the export format, validation rules, and API usage.

## Export Philosophy: Tier A

Claims iQ Sketch generates **Tier A ESX files** - import-ready archives that Xactimate can read but not edit as native sketches. This approach provides:

- Full claim metadata import
- Line items with room/level grouping
- Sketch geometry as structured XML
- Visual floor plan as PDF underlay
- Photo attachments

### Why Tier A?

Editable Xactimate sketches (SKX format) require:
- Proprietary Verisk partner SDK access
- Complex binary/XML encoding not publicly documented
- Ongoing compatibility maintenance with Xactimate versions

The Tier A approach provides ~95% of the value without proprietary dependencies.

## ESX Archive Structure

```
estimate_{id}.esx (ZIP file)
├── XACTDOC.XML           # Claim metadata
├── GENERIC_ROUGHDRAFT.XML # Estimate hierarchy and line items
├── SKETCH.XML            # Full sketch geometry data
├── SKETCH_UNDERLAY.PDF   # Visual floor plan rendering
├── 1.JPG                 # Photo attachments (optional)
├── 2.JPG
└── ...
```

## XML File Specifications

### XACTDOC.XML

Claim metadata including:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<XACTDOC Version="1.0">
  <Header>
    <ExportDate>2026-01-11</ExportDate>
    <ExportTime>14:30:00</ExportTime>
    <Generator>Claims iQ Sketch</Generator>
    <GeneratorVersion>1.0.0</GeneratorVersion>
  </Header>
  <Claim>
    <ClaimNumber>CLM-2026-001234</ClaimNumber>
    <DateOfLoss>2026-01-05</DateOfLoss>
    <TypeOfLoss>Property Damage</TypeOfLoss>
  </Claim>
  <Property>
    <Address>
      <FullAddress>123 Main St, Denver, CO 80202</FullAddress>
    </Address>
  </Property>
  <Insured>
    <Name>John Smith</Name>
    <Phone>(555) 123-4567</Phone>
    <Email>john.smith@email.com</Email>
  </Insured>
  <Policy>
    <PolicyNumber>POL-12345678</PolicyNumber>
    <Carrier>ABC Insurance</Carrier>
  </Policy>
  <Assignment>
    <Adjuster>
      <Name>Jane Doe</Name>
      <Phone>(555) 987-6543</Phone>
      <Email>jane.doe@insurer.com</Email>
    </Adjuster>
  </Assignment>
  <Summary>
    <TotalRCV>25000.00</TotalRCV>
    <TotalACV>21250.00</TotalACV>
    <TotalDepreciation>3750.00</TotalDepreciation>
    <Deductible>1000.00</Deductible>
    <NetClaim>20250.00</NetClaim>
  </Summary>
</XACTDOC>
```

### GENERIC_ROUGHDRAFT.XML

Estimate hierarchy with line items:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<GENERIC_ROUGHDRAFT Version="1.0">
  <Header>
    <ExportDate>2026-01-11</ExportDate>
    <Generator>Claims iQ Sketch</Generator>
  </Header>
  <Estimate>
    <ID>est_abc123</ID>
    <Totals>
      <MaterialTotal>10000.00</MaterialTotal>
      <LaborTotal>12000.00</LaborTotal>
      <EquipmentTotal>500.00</EquipmentTotal>
      <Subtotal>22500.00</Subtotal>
      <Overhead>2250.00</Overhead>
      <Profit>2250.00</Profit>
      <Tax>1500.00</Tax>
      <RCVTotal>25000.00</RCVTotal>
      <Depreciation>3750.00</Depreciation>
      <ACVTotal>21250.00</ACVTotal>
    </Totals>
    <Structure>
      <Name>Main Structure</Name>
      <Levels>
        <Level>
          <Name>Main Level</Name>
          <Rooms>
            <Room>
              <Name>Living Room</Name>
              <Dimensions>
                <Length>20.00</Length>
                <Width>15.00</Width>
                <CeilingHeight>8.00</CeilingHeight>
                <SquareFeet>300.00</SquareFeet>
              </Dimensions>
              <LineItems>
                <LineItem>
                  <Category>DRY</Category>
                  <Selector>DRYWALL</Selector>
                  <Action>R&R</Action>
                  <Description>Drywall - remove &amp; replace</Description>
                  <Quantity>300.00</Quantity>
                  <Unit>SF</Unit>
                  <UnitPrice>2.50</UnitPrice>
                  <TotalRCV>750.00</TotalRCV>
                </LineItem>
              </LineItems>
            </Room>
          </Rooms>
        </Level>
      </Levels>
    </Structure>
  </Estimate>
</GENERIC_ROUGHDRAFT>
```

### SKETCH.XML

Complete sketch geometry data:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<SKETCH Version="1.0">
  <Header>
    <ExportDate>2026-01-11T14:30:00.000Z</ExportDate>
    <Generator>Claims iQ Sketch</Generator>
    <GeneratorVersion>1.0.0</GeneratorVersion>
    <Units>feet</Units>
    <CoordinateSystem>Cartesian</CoordinateSystem>
  </Header>
  <Bounds>
    <MinX>0.0000</MinX>
    <MaxX>50.0000</MaxX>
    <MinY>0.0000</MinY>
    <MaxY>40.0000</MaxY>
    <TotalWidthFt>50.0000</TotalWidthFt>
    <TotalLengthFt>40.0000</TotalLengthFt>
  </Bounds>
  <Zones Count="3">
    <Zone>
      <ID>zone_abc123</ID>
      <Name>Living Room</Name>
      <ZoneCode>LR</ZoneCode>
      <ZoneType>room</ZoneType>
      <LevelName>Main Level</LevelName>
      <ShapeType>RECT</ShapeType>
      <Origin>
        <XFt>0.0000</XFt>
        <YFt>0.0000</YFt>
      </Origin>
      <Dimensions>
        <LengthFt>20.0000</LengthFt>
        <WidthFt>15.0000</WidthFt>
        <CeilingHeightFt>8.0000</CeilingHeightFt>
        <AreaSqFt>300.00</AreaSqFt>
        <PerimeterFt>70.00</PerimeterFt>
        <WallAreaSqFt>560.00</WallAreaSqFt>
      </Dimensions>
      <Polygon PointCount="4" WindingOrder="CCW">
        <Point Index="0">
          <X>0.0000</X>
          <Y>0.0000</Y>
        </Point>
        <Point Index="1">
          <X>15.0000</X>
          <Y>0.0000</Y>
        </Point>
        <Point Index="2">
          <X>15.0000</X>
          <Y>20.0000</Y>
        </Point>
        <Point Index="3">
          <X>0.0000</X>
          <Y>20.0000</Y>
        </Point>
      </Polygon>
      <Openings Count="2">
        <Opening>
          <ID>open_door1</ID>
          <Type>door</Type>
          <WallIndex>0</WallIndex>
          <OffsetFt>5.0000</OffsetFt>
          <WidthFt>3.0000</WidthFt>
          <HeightFt>7.0000</HeightFt>
          <ConnectsToZoneID>zone_hallway</ConnectsToZoneID>
        </Opening>
        <Opening>
          <ID>open_win1</ID>
          <Type>window</Type>
          <WallIndex>2</WallIndex>
          <OffsetFt>6.0000</OffsetFt>
          <WidthFt>4.0000</WidthFt>
          <HeightFt>4.0000</HeightFt>
          <SillHeightFt>3.0000</SillHeightFt>
        </Opening>
      </Openings>
    </Zone>
  </Zones>
  <Connections Count="1">
    <Connection>
      <ID>conn_lr_hall</ID>
      <ToZoneID>zone_hallway</ToZoneID>
      <Type>door</Type>
      <OpeningID>open_door1</OpeningID>
    </Connection>
  </Connections>
</SKETCH>
```

### SKETCH_UNDERLAY.PDF

Visual floor plan rendering with:
- Room polygons rendered to scale
- Room names and dimensions
- Door/window indicators (color-coded)
- Grid overlay (10-foot spacing)
- Scale legend
- North arrow

## API Endpoints

### GET /api/estimates/:id/export/esx-zip

Export estimate as ESX ZIP archive with full validation.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| includeSketchPdf | boolean | true | Include PDF floor plan |
| includeSketchXml | boolean | true | Include SKETCH.XML |
| includePhotos | boolean | false | Include claim photos |
| maxPhotos | number | 50 | Maximum photos to include |
| strictValidation | boolean | true | Fail on validation errors |

**Success Response (200):**
- Content-Type: `application/zip`
- Content-Disposition: `attachment; filename="estimate-{id}.esx"`
- Headers:
  - `X-ESX-Files`: Comma-separated list of files in archive
  - `X-ESX-Zone-Count`: Number of zones
  - `X-ESX-LineItem-Count`: Number of line items

**Validation Error Response (400):**
```json
{
  "message": "ESX export validation failed",
  "validation": {
    "isValid": false,
    "errors": [
      {
        "code": "INVALID_POLYGON",
        "message": "Zone \"Living Room\" has invalid polygon (2 points)",
        "severity": "error",
        "field": "polygonFt",
        "zoneId": "zone_abc123",
        "zoneName": "Living Room"
      }
    ],
    "warnings": [],
    "canExport": false
  }
}
```

### GET /api/estimates/:id/export/esx-validated

Export with full metadata and validation results in JSON response.

**Response:**
```json
{
  "success": true,
  "validation": {
    "isValid": true,
    "errors": [],
    "warnings": [
      {
        "code": "UNUSUAL_CEILING",
        "message": "Zone \"Garage\" has unusual ceiling height: 12ft",
        "severity": "warning"
      }
    ],
    "canExport": true
  },
  "metadata": {
    "estimateId": "est_abc123",
    "claimNumber": "CLM-2026-001234",
    "exportDate": "2026-01-11T14:30:00.000Z",
    "totalRcv": 25000.00,
    "totalAcv": 21250.00,
    "zoneCount": 5,
    "lineItemCount": 42,
    "photoCount": 0
  },
  "files": ["XACTDOC.XML", "GENERIC_ROUGHDRAFT.XML", "SKETCH.XML", "SKETCH_UNDERLAY.PDF"],
  "archive": "UEsDBBQAAAAI..."  // Base64-encoded ZIP archive
}
```

### GET /api/estimates/:id/export/esx-validate

Validate estimate for ESX export without generating the archive.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| strict | boolean | true | Use strict validation mode |

**Response:**
```json
{
  "estimateId": "est_abc123",
  "validation": {
    "isValid": true,
    "errors": [],
    "warnings": [],
    "canExport": true
  }
}
```

## Validation Rules

### Estimate Validation

| Rule | Severity | Code |
|------|----------|------|
| Estimate ID is required | Error | MISSING_ESTIMATE_ID |
| RCV total is required | Error | MISSING_RCV_TOTAL |
| RCV total cannot be negative | Error | NEGATIVE_RCV |
| ACV total is not set | Warning | MISSING_ACV_TOTAL |
| Estimate has no line items | Warning | NO_LINE_ITEMS |

### Line Item Validation

| Rule | Severity | Code |
|------|----------|------|
| Line item has no description | Warning | MISSING_DESCRIPTION |
| Invalid quantity (<=0) | Error | INVALID_QUANTITY |
| Negative unit price | Error | NEGATIVE_PRICE |
| Non-standard Xactimate code | Warning | INVALID_XACT_CODE |

### Sketch Validation

| Rule | Severity | Code |
|------|----------|------|
| Zone has no name | Error | MISSING_ZONE_NAME |
| Invalid polygon (<3 points) | Error | INVALID_POLYGON |
| Zone area <1 sq ft | Error | TINY_ZONE |
| Zone area >100,000 sq ft | Warning | HUGE_ZONE |
| Zero dimensions | Warning | ZERO_DIMENSIONS |
| Unusual ceiling height | Warning | UNUSUAL_CEILING |
| Invalid wall index for opening | Error | INVALID_OPENING_WALL |
| Opening has invalid width | Error | INVALID_OPENING_WIDTH |
| Opening has invalid height | Error | INVALID_OPENING_HEIGHT |
| Connection references non-existent zone | Warning | INVALID_CONNECTION |

## Usage Examples

### Basic Export (TypeScript)

```typescript
import { generateEsxZipArchive } from './services/esxExport';

// Generate ESX archive (throws on validation errors)
const archive = await generateEsxZipArchive(estimateId, {
  includeSketchPdf: true,
  includeSketchXml: true,
  includePhotos: false,
});

// Save to file
await fs.writeFile(`estimate-${estimateId}.esx`, archive);
```

### Export with Validation Results

```typescript
import { generateValidatedEsxArchive } from './services/esxExport';

const result = await generateValidatedEsxArchive(estimateId, {
  includeSketchPdf: true,
  includePhotos: true,
  maxPhotos: 20,
  strictValidation: false, // Continue even with errors
});

if (!result.validation.isValid) {
  console.error('Validation errors:', result.validation.errors);
}

if (result.validation.warnings.length > 0) {
  console.warn('Validation warnings:', result.validation.warnings);
}

if (result.validation.canExport) {
  await fs.writeFile(`estimate-${estimateId}.esx`, result.archive);
  console.log('Export metadata:', result.metadata);
}
```

### Validation Only

```typescript
import { validateEsxExport } from './services/esxExport';

const validation = await validateEsxExport(estimateId, true);

if (validation.isValid) {
  console.log('Estimate is ready for ESX export');
} else {
  console.error('Export blocked:', validation.errors);
}
```

### REST API Usage (curl)

```bash
# Export ESX archive
curl -o estimate.esx \
  "http://localhost:3000/api/estimates/est_abc123/export/esx-zip"

# Export with photos
curl -o estimate.esx \
  "http://localhost:3000/api/estimates/est_abc123/export/esx-zip?includePhotos=true&maxPhotos=25"

# Validate only
curl "http://localhost:3000/api/estimates/est_abc123/export/esx-validate"

# Export with full metadata (JSON)
curl "http://localhost:3000/api/estimates/est_abc123/export/esx-validated"
```

## File References

| Component | Location |
|-----------|----------|
| ESX Export Service | `/server/services/esxExport.ts` |
| ZIP Builder | `/server/utils/zipBuilder.ts` |
| Sketch Service | `/server/services/sketchService.ts` |
| Geometry Types | `/shared/geometry/index.ts` |
| Geometry Constants | `/shared/geometry/constants.ts` |
| API Routes | `/server/routes/estimates.ts` |
| Architecture Docs | `/docs/sketch-esx-architecture.md` |

## Change History

- **v1.0.0** (2026-01-11): Initial release with SKETCH.XML support, enhanced validation, and fail-loud behavior
