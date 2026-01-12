# API Documentation

Complete API reference for Claims IQ backend.

## Base URL

All API endpoints are prefixed with `/api`.

## Authentication

Most endpoints require authentication. Include session cookie or Authorization header.

### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123",
  "rememberMe": false
}
```

**Response**:
```json
{
  "user": {
    "id": "uuid",
    "username": "admin",
    "email": "admin@example.com"
  }
}
```

### Logout

```http
POST /api/auth/logout
```

### Check Auth

```http
GET /api/auth/me
```

---

## Claims

### List Claims

```http
GET /api/claims?status=draft&limit=50&offset=0
```

**Query Parameters**:
- `status` (optional): Filter by status
- `limit` (optional): Results per page (default: 50)
- `offset` (optional): Pagination offset

**Response**:
```json
{
  "claims": [
    {
      "id": "uuid",
      "claimId": "CLM-001",
      "insuredName": "John Doe",
      "propertyAddress": "123 Main St",
      "status": "draft",
      "primaryPeril": "wind_hail",
      "dateOfLoss": "2024-01-15"
    }
  ],
  "total": 100
}
```

### Get Claim

```http
GET /api/claims/:id
```

**Response**:
```json
{
  "id": "uuid",
  "claimId": "CLM-001",
  "insuredName": "John Doe",
  "propertyAddress": "123 Main St",
  "status": "draft",
  "primaryPeril": "wind_hail",
  "dateOfLoss": "2024-01-15",
  "structures": [...],
  "rooms": [...],
  "damageZones": [...],
  "photos": [...]
}
```

### Create Claim

```http
POST /api/claims
Content-Type: application/json

{
  "claimId": "CLM-001",
  "insuredName": "John Doe",
  "propertyAddress": "123 Main St",
  "primaryPeril": "wind_hail",
  "dateOfLoss": "2024-01-15"
}
```

### Update Claim

```http
PUT /api/claims/:id
Content-Type: application/json

{
  "status": "in_progress",
  "notes": "Updated notes"
}
```

### Delete Claim

```http
DELETE /api/claims/:id
```

### Get Claim Briefing

```http
GET /api/claims/:id/briefing
```

**Response**:
```json
{
  "id": "uuid",
  "claimId": "uuid",
  "peril": "wind_hail",
  "briefingJson": {
    "peril_overview": {...},
    "inspection_strategy": {...},
    "photo_requirements": [...]
  }
}
```

### Generate Briefing

```http
POST /api/claims/:id/briefing/generate?force=true
```

**Query Parameters**:
- `force` (optional): Force regeneration even if cached

### Get Claim Workflow

```http
GET /api/claims/:id/workflow
```

**Response**:
```json
{
  "workflow": {
    "id": "uuid",
    "claimId": "uuid",
    "status": "in_progress",
    "steps": [
      {
        "id": "uuid",
        "stepIndex": 0,
        "phase": "exterior",
        "title": "Inspect Roof",
        "status": "pending",
        "evidenceRequirements": {
          "photos": {
            "minCount": 5,
            "types": ["overview", "detail"]
          }
        }
      }
    ]
  }
}
```

### Generate Workflow

```http
POST /api/claims/:id/workflow/generate
```

### Get Scope Context

```http
GET /api/claims/:id/scope-context
```

Returns briefing, workflow, and peril information for voice scope agent.

---

## Documents

### Upload Document

```http
POST /api/documents
Content-Type: multipart/form-data

file: <file>
claimId: uuid (optional)
type: fnol|policy|endorsement|photo|estimate|correspondence|auto
```

**Response**:
```json
{
  "id": "uuid",
  "name": "document.pdf",
  "type": "fnol",
  "processingStatus": "pending",
  "extractedData": {}
}
```

### Get Document

```http
GET /api/documents/:id
```

### Download Document

```http
GET /api/documents/:id/download
```

Returns file stream.

### List Documents

```http
GET /api/documents?claimId=uuid&type=fnol
```

### Delete Document

```http
DELETE /api/documents/:id
```

### Process Document Queue

```http
POST /api/documents/process
```

Processes queued documents in background.

---

## Photos

### Upload Photo

```http
POST /api/photos
Content-Type: multipart/form-data

file: <image file>
claimId: uuid (optional)
structureId: uuid (optional)
roomId: uuid (optional)
label: string (optional)
hierarchyPath: string (optional)
latitude: number (optional)
longitude: number (optional)
```

**Response**:
```json
{
  "id": "uuid",
  "publicUrl": "https://...",
  "analysisStatus": "pending",
  "aiAnalysis": {}
}
```

### Get Photo

```http
GET /api/photos/:id
```

### Update Photo

```http
PUT /api/photos/:id
Content-Type: application/json

{
  "label": "Kitchen Damage",
  "hierarchyPath": "Interior/Kitchen"
}
```

### Delete Photo

```http
DELETE /api/photos/:id
```

### Re-analyze Photo

```http
POST /api/photos/:id/reanalyze
```

Triggers new AI analysis.

### Get Claim Photos

```http
GET /api/claims/:id/photos
```

---

## Estimates

### List Estimates

```http
GET /api/estimates?claimId=uuid&status=draft
```

### Get Estimate

```http
GET /api/estimates/:id
```

**Response**:
```json
{
  "id": "uuid",
  "claimId": "uuid",
  "status": "draft",
  "structures": [...],
  "lineItems": [...],
  "totals": {
    "rcvTotal": 50000,
    "acvTotal": 40000,
    "depreciationTotal": 10000
  }
}
```

### Create Estimate

```http
POST /api/estimates
Content-Type: application/json

{
  "claimId": "uuid",
  "regionId": "US-NATIONAL",
  "carrierProfileId": "uuid"
}
```

### Update Estimate

```http
PUT /api/estimates/:id
Content-Type: application/json

{
  "status": "in_progress"
}
```

### Calculate Estimate

```http
POST /api/estimates/:id/calculate
```

Recalculates all totals.

### Submit Estimate

```http
POST /api/estimates/:id/submit
```

Locks estimate and validates for submission.

### Export ESX

```http
GET /api/estimates/:id/export/esx
```

Returns ESX file download.

### Get Estimate Hierarchy

```http
GET /api/estimates/:id/hierarchy
```

Returns full structure/area/zone hierarchy.

---

## Estimate Hierarchy

### Create Structure

```http
POST /api/estimates/:id/structures
Content-Type: application/json

{
  "name": "Main House",
  "description": "Primary dwelling"
}
```

### Create Area

```http
POST /api/estimates/:id/areas
Content-Type: application/json

{
  "structureId": "uuid",
  "name": "First Floor",
  "areaType": "floor"
}
```

### Create Zone

```http
POST /api/estimates/:id/zones
Content-Type: application/json

{
  "areaId": "uuid",
  "name": "Kitchen",
  "roomType": "kitchen",
  "lengthFt": 12,
  "widthFt": 15
}
```

### Add Line Item

```http
POST /api/estimates/:id/line-items
Content-Type: application/json

{
  "zoneId": "uuid",
  "lineItemCode": "DRYWALL",
  "quantity": 180,
  "unit": "SF"
}
```

### Update Line Item

```http
PUT /api/estimates/:id/line-items/:itemId
Content-Type: application/json

{
  "quantity": 200
}
```

### Delete Line Item

```http
DELETE /api/estimates/:id/line-items/:itemId
```

---

## Workflows

### Get Workflow

```http
GET /api/workflow/:id
```

### Update Step

```http
PATCH /api/workflow/:id/steps/:stepId
Content-Type: application/json

{
  "status": "completed",
  "notes": "Completed inspection",
  "actualMinutes": 30
}
```

### Expand Workflow for Rooms

```http
POST /api/workflow/:id/expand-rooms
Content-Type: application/json

{
  "roomNames": ["Kitchen", "Living Room"]
}
```

Adds room-specific steps to workflow.

---

## Voice Sessions

### Create Voice Session

```http
POST /api/voice/session
Content-Type: application/json

{
  "type": "sketch" | "scope",
  "claimId": "uuid" (optional, for scope)
}
```

**Response**:
```json
{
  "sessionId": "uuid",
  "websocketUrl": "wss://..."
}
```

### Get Session Info

```http
GET /api/voice/session/:id
```

---

## Line Items

### Search Line Items

```http
GET /api/line-items/search?q=drywall&category=interior
```

**Query Parameters**:
- `q`: Search query
- `category`: Filter by category
- `limit`: Results limit

### Get Line Item

```http
GET /api/line-items/:code
```

Returns Xactimate item details.

### Calculate Price

```http
POST /api/pricing/calculate
Content-Type: application/json

{
  "lineItemCode": "DRYWALL",
  "quantity": 180,
  "unit": "SF",
  "regionId": "US-NATIONAL"
}
```

**Response**:
```json
{
  "unitPrice": 2.50,
  "subtotal": 450.00,
  "materialCost": 180.00,
  "laborCost": 270.00
}
```

---

## Organizations

### List Organizations

```http
GET /api/organizations
```

### Get Organization

```http
GET /api/organizations/:id
```

### Create Organization

```http
POST /api/organizations
Content-Type: application/json

{
  "name": "Acme Insurance",
  "slug": "acme-insurance",
  "type": "carrier"
}
```

### Update Organization

```http
PUT /api/organizations/:id
Content-Type: application/json

{
  "name": "Updated Name"
}
```

### Switch Organization

```http
POST /api/organizations/:id/switch
```

Sets active organization for session.

---

## Users

### Get Profile

```http
GET /api/users/profile
```

### Update Profile

```http
PUT /api/users/profile
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com"
}
```

### Change Password

```http
PUT /api/users/password
Content-Type: application/json

{
  "currentPassword": "oldpass",
  "newPassword": "newpass"
}
```

---

## Prompts

### Get Prompt

```http
GET /api/prompts/:key
```

**Example**: `GET /api/prompts/voice.scope`

**Response**:
```json
{
  "key": "voice.scope",
  "name": "Voice Scope Agent",
  "systemPrompt": "...",
  "userPromptTemplate": "...",
  "model": "gpt-4o",
  "temperature": 0.3
}
```

### Update Prompt

```http
PUT /api/prompts/:key
Content-Type: application/json

{
  "systemPrompt": "Updated prompt..."
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE" (optional),
  "details": {} (optional)
}
```

**Status Codes**:
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

---

## Rate Limiting

Some endpoints have rate limiting:
- Document upload: 10 requests/minute
- AI generation: 5 requests/minute
- General API: 100 requests/minute

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1234567890
```

---

## WebSocket API

### Voice Sessions

Connect to voice session WebSocket:

```
wss://your-domain/api/voice/session/:sessionId
```

**Message Format**:
```json
{
  "type": "audio",
  "data": "base64-encoded-audio"
}
```

**Response Format**:
```json
{
  "type": "transcript" | "tool_call" | "audio",
  "data": "..."
}
```

---

For implementation details, see server code in `server/routes.ts` and `server/services/`.
