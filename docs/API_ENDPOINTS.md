# API Endpoints Documentation

This document provides a comprehensive list of all API endpoints in the Claims-IQ application.

## Authentication Endpoints

- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/supabase/register` - User registration
- `POST /api/auth/supabase/logout` - Supabase logout
- `POST /api/auth/supabase/forgot-password` - Request password reset
- `GET /api/auth/ms365/status` - Check MS365 connection status
- `GET /api/auth/ms365/connect` - Initiate MS365 OAuth flow
- `GET /api/auth/ms365/callback` - MS365 OAuth callback
- `POST /api/auth/ms365/disconnect` - Disconnect from MS365

## Calendar Endpoints

- `GET /api/calendar/today` - Get today's appointments
- `GET /api/calendar/appointments` - List appointments with date range filtering
- `POST /api/calendar/appointments` - Create new appointment
- `GET /api/claims/:id/appointments` - Get appointments for a claim
- `PATCH /api/calendar/appointments/:id` - Update appointment
- `DELETE /api/calendar/appointments/:id` - Delete appointment
- `GET /api/calendar/ms365/events` - Get MS365 calendar events
- `GET /api/calendar/ms365/connection-status` - Check MS365 connection
- `POST /api/calendar/sync/from-ms365` - Sync appointments from MS365
- `POST /api/calendar/sync/to-ms365` - Sync appointments to MS365
- `POST /api/calendar/sync/full` - Full bidirectional sync
- `GET /api/calendar/sync/status` - Get sync status

## User Management

- `GET /api/users/me` - Get current user
- `PUT /api/users/profile` - Update user profile
- `PUT /api/users/password` - Change password
- `GET /api/users/preferences` - Get user preferences
- `PUT /api/users/preferences` - Update user preferences

## Claims Endpoints

- `GET /api/claims` - List claims with filtering
- `POST /api/claims` - Create new claim
- `GET /api/claims/:id` - Get claim details
- `PUT /api/claims/:id` - Update claim
- `DELETE /api/claims/:id` - Delete claim
- `GET /api/claims/:id/documents` - Get claim documents
- `GET /api/claims/:id/scope-items` - Get scope items
- `GET /api/claims/:id/endorsement-extractions` - Get endorsement extractions
- `GET /api/claims/:id/appointments` - Get claim appointments
- `GET /api/claims/:id/inspection-intelligence` - Get inspection intelligence
- `GET /api/claims/:id/effective-policy` - Get effective policy
- `GET /api/claims/:id/context` - Get claim context
- `GET /api/claims/:id/coverage-analysis` - Get coverage analysis
- `GET /api/claims/:id/coverage-analysis/summary` - Get coverage summary
- `GET /api/claims/:id/briefing` - Get claim briefing
- `DELETE /api/claims/:id/briefing` - Delete claim briefing
- `POST /api/claims/:id/briefing/generate` - Generate claim briefing
- `GET /api/claims/:id/rooms` - Get claim rooms
- `DELETE /api/claims/:id/rooms` - Delete claim rooms
- `GET /api/claims/map` - Get claims for map view
- `DELETE /api/claims/purge-all` - Purge all claims (owner only)

## Estimates Endpoints

- `POST /api/estimates/calculate` - Calculate estimate
- `POST /api/estimates` - Create estimate
- `GET /api/estimates` - List estimates
- `GET /api/estimates/:id` - Get estimate
- `PUT /api/estimates/:id` - Update estimate
- `POST /api/estimates/:id/line-items` - Add line item
- `DELETE /api/estimates/:id/line-items/:code` - Remove line item
- `POST /api/estimates/:id/submit` - Submit estimate
- `GET /api/estimates/:id/validate` - Validate estimate
- `GET /api/estimates/:id/lock-status` - Get lock status
- `GET /api/estimates/:id/report/pdf` - Generate PDF report
- `GET /api/estimates/:id/report/html` - Generate HTML report
- `GET /api/estimates/:id/export/esx` - Export ESX format
- `GET /api/estimates/:id/export/esx-xml` - Export ESX XML
- `GET /api/estimates/:id/export/csv` - Export CSV
- `GET /api/estimates/:id/export/esx-zip` - Export ESX ZIP
- `GET /api/estimates/:id/sketch` - Get sketch
- `PUT /api/estimates/:id/sketch` - Update sketch
- `POST /api/estimates/:id/sketch/validate` - Validate sketch
- `POST /api/estimates/:id/sketch/connections` - Create zone connection
- `GET /api/estimates/:id/sketch/connections` - Get zone connections
- `PUT /api/estimates/:id/sketch/connections/:connId` - Update connection
- `DELETE /api/estimates/:id/sketch/connections/:connId` - Delete connection
- `GET /api/estimates/:id/hierarchy` - Get estimate hierarchy
- `GET /api/estimates/:id/coverages` - Get coverages

## Estimate Templates

- `GET /api/estimate-templates` - List templates
- `POST /api/estimate-templates/:id/create` - Create estimate from template

## Line Items & Pricing

- `GET /api/line-items` - Search line items
- `GET /api/line-items/categories` - Get categories
- `POST /api/pricing/calculate` - Calculate price
- `GET /api/pricing/region/:zipCode` - Get region by ZIP

## Xactimate Integration

- `GET /api/xact/search` - Search Xactimate items
- `GET /api/xact/price/:code` - Get price for code
- `GET /api/xact/components/:code` - Get components

## Estimate Hierarchy

- `POST /api/structures` - Create structure
- `GET /api/structures/:id` - Get structure
- `PUT /api/structures/:id` - Update structure
- `DELETE /api/structures/:id` - Delete structure
- `POST /api/areas` - Create area
- `GET /api/areas/:id` - Get area
- `PUT /api/areas/:id` - Update area
- `DELETE /api/areas/:id` - Delete area
- `POST /api/zones` - Create zone
- `GET /api/zones/:id` - Get zone
- `GET /api/zones/:id/full` - Get zone with children
- `PUT /api/zones/:id` - Update zone
- `DELETE /api/zones/:id` - Delete zone
- `GET /api/zones/:id/line-items` - Get zone line items
- `POST /api/zones/:id/line-items` - Add line item to zone
- `POST /api/missing-walls` - Create missing wall
- `GET /api/missing-walls/:id` - Get missing wall
- `PUT /api/missing-walls/:id` - Update missing wall
- `DELETE /api/missing-walls/:id` - Delete missing wall
- `POST /api/subrooms` - Create subroom
- `GET /api/subrooms/:id` - Get subroom
- `PUT /api/subrooms/:id` - Update subroom
- `DELETE /api/subrooms/:id` - Delete subroom

## Documents

- `GET /api/documents` - List documents
- `POST /api/documents` - Upload document
- `POST /api/documents/bulk` - Bulk upload
- `GET /api/documents/:id` - Get document
- `PUT /api/documents/:id` - Update document
- `DELETE /api/documents/:id` - Delete document
- `GET /api/documents/:id/download` - Download document
- `GET /api/documents/batch-status` - Get batch status
- `POST /api/documents/:id/generate-previews` - Generate previews
- `POST /api/documents/:id/process` - Process document
- `POST /api/documents/associate` - Associate with claim
- `POST /api/documents/create-claim` - Create claim from documents

## Photos

- `POST /api/photos/upload` - Upload photo
- `GET /api/photos` - List photos
- `GET /api/photos/:id` - Get photo
- `DELETE /api/photos/:id` - Delete photo

## Organizations

- `GET /api/organizations/mine` - Get user organizations
- `POST /api/organizations` - Create organization
- `GET /api/organizations/current` - Get current organization
- `GET /api/organizations/current/members` - Get members
- `DELETE /api/organizations/current/members/:userId` - Remove member
- `POST /api/organizations/switch` - Switch organization
- `GET /api/admin/organizations` - List all organizations (admin)

## AI & Intelligence

- `POST /api/ai/suggest-estimate` - Generate estimate suggestions
- `POST /api/ai/quick-suggest` - Quick line item suggestions
- `GET /api/ai/search-line-items` - Search line items by description
- `GET /api/inspection-intelligence/:peril` - Get inspection rules for peril
- `GET /api/inspection-intelligence/:peril/tips` - Get inspection tips
- `GET /api/carriers/:id/overlays` - Get carrier overlays
- `GET /api/claims/:id/carrier-guidance` - Get carrier guidance

## Workflow

- `GET /api/claims/:id/workflow` - Get workflow
- `POST /api/claims/:id/workflow/generate` - Generate workflow
- `POST /api/claims/:id/workflow/regenerate` - Regenerate workflow
- `POST /api/claims/:id/workflow/expand-rooms` - Expand workflow for rooms
- `PATCH /api/workflow/steps/:id` - Update workflow step
- `POST /api/workflow/steps` - Create workflow step
- `POST /api/workflow/rooms` - Add workflow room

## Checklists

- `GET /api/claims/:id/checklist` - Get checklist
- `POST /api/claims/:id/checklist/generate` - Generate checklist
- `PATCH /api/checklist/items/:id` - Update checklist item
- `POST /api/checklist/items` - Create checklist item

## Prompts

- `GET /api/prompts` - List prompts
- `GET /api/prompts/:key` - Get prompt
- `PUT /api/prompts/:key` - Update prompt
- `GET /api/prompts/:key/config` - Get prompt config

## Configuration

- `GET /api/carrier-profiles` - List carrier profiles
- `GET /api/tax-rates` - List tax rates
- `GET /api/tax-rates/region/:regionCode` - Get tax rate for region
- `GET /api/depreciation-schedules` - List depreciation schedules
- `GET /api/depreciation-schedules/category/:categoryCode` - Get schedule for category
- `GET /api/regional-multipliers` - List regional multipliers
- `GET /api/regional-multipliers/:regionCode` - Get multiplier for region
- `GET /api/labor-rates` - List labor rates
- `GET /api/labor-rates/trade/:tradeCode` - Get labor rate for trade
- `GET /api/price-lists` - List price lists
- `GET /api/price-lists/:code` - Get price list

## Route Optimization

- `POST /api/route/optimize` - Optimize route
- `POST /api/route/drive-times` - Calculate drive times

## Weather

- `POST /api/weather/locations` - Get weather for locations

## Voice Features

- `POST /api/voice/session` - Create voice session
- `GET /api/voice/config` - Get voice config

## Scraping (Admin)

- `POST /api/scrape/home-depot` - Run Home Depot scrape
- `GET /api/scrape/test` - Test scraper
- `GET /api/scrape/config` - Get scraper config
- `GET /api/scrape/prices` - Get scraped prices
- `GET /api/scrape/jobs` - Get scrape job history

## System

- `GET /api/system/status` - System health check (minimal info, no auth)

## Response Format Standards

### Success Responses

- **DELETE operations**: `{ success: true }`
- **Data retrieval**: Direct data object or array
- **Create operations**: Created object
- **Update operations**: Updated object

### Error Responses

All errors use the standard error handler format:
```json
{
  "success": false,
  "message": "Error message",
  "code": "ERROR_CODE",
  "requestId": "uuid"
}
```

## Authentication & Authorization

Most endpoints require:
- `requireAuth` - User must be authenticated
- `requireOrganization` - User must have active organization
- `requireOrgRole('owner'|'admin'|'member')` - User must have specific role
- `requireSuperAdmin` - User must be super admin

## Rate Limiting

- `authRateLimiter` - Authentication endpoints
- `apiRateLimiter` - General API endpoints
- `aiRateLimiter` - AI-powered endpoints
- `uploadRateLimiter` - File upload endpoints

## Validation

All endpoints use Zod schemas for:
- Request body validation (`validateBody`)
- Query parameter validation (`validateQuery`)
- URL parameter validation (`validateParams`)
