# Changelog

All notable changes to the Claims IQ Sketch application will be documented in this file.

## [2026-01-23] - Sketch & Scope Agent Refactoring & Enhancements

### Added
- **Geometry Validation**: Comprehensive validation for room dimensions, wall placement, openings, and features with voice-friendly error messages
- **Flow Context Integration**: Flow instance ID and movement ID are now read from URL query parameters and stored in geometry engine state
- **Photo Binding**: Photos now automatically link to flow instances, movements, claims, rooms, and damage zones
- **Blocking Step Validation**: Integration with new flow engine to check for blocking steps before allowing progression
- **Undo/Redo Confirmation**: Undo and redo actions now require user confirmation to prevent accidental reversals
- **Full Redo Stack**: Complete redo implementation with proper state management
- **Multi-Room Navigation**: `list_rooms`, `select_room`, and `list_structures` tools for navigating between rooms and structures
- **Floor Plan Visualization**: Toggle between 3D interactive mode and 2D floor plan view with orientation controls
- **Damage Zone Editing**: Extended `edit_damage_zone` tool to support severity (minor/moderate/severe/total) and surface (ceiling/wall/floor) editing
- **Pantry & Alcove Support**: Added pantry and alcove as feature types for architectural elements
- **Angled Walls**: Support for non-90-degree walls with angle parameter in openings
- **Depreciation Integration**: Basic depreciation calculation in scope engine with RCV/ACV tracking
- **Visual Framing Guidance**: Overlay component for camera preview with grid lines, horizon leveling, and peril-specific guidance
- **Caching Improvements**: Caching for room dimensions, scope context, and workflow step data
- **Structured Error Outputs**: Standardized error format for voice-friendly responses

### Changed
- **Workflow Integration**: Updated all workflow methods to use new flow engine endpoints (`/api/flows/*`) instead of deprecated endpoints
- **Photo Capture**: Photos now include flow context (flowInstanceId, movementId) in metadata
- **Room Creation**: Rooms now store flow context for proper workflow linking
- **Damage Zone Creation**: Damage zones now store flow context and support severity/surface fields
- **Scope Engine**: Added depreciation fields (depreciationAmount, depreciationPercent, acv, itemAge, condition) to line items
- **Error Handling**: All errors now use structured format with voice-friendly messages

### Fixed
- **Photo Annotation**: Validation to ensure photo exists before adding annotation
- **Geometry Validation**: Proper validation for openings and features against room bounds
- **Flow Context**: Proper reading and passing of flowInstanceId and movementId from URL to geometry engine
- **Workflow Step Completion**: Updated to use new flow engine movement completion endpoint
- **Photo Requirements**: Updated to fetch from new flow engine evidence endpoints

### Database Schema
- Added `surface` column to `claim_damage_zones` table (migration 057)
- Flow context fields already exist in `claim_photos`, `claim_rooms`, and `claim_damage_zones` tables

### Technical Notes
- All workflow methods migrated from `/api/claims/:id/workflow` to `/api/flows/:id/*` endpoints
- Depreciation uses straight-line calculation (20-year useful life) - future enhancement will tie to `depreciation_schedules` table
- Angled walls support added to Opening interface - UI rendering may need updates for full visualization
- Visual framing guidance is peril-aware but currently uses static content - future enhancement will fetch from claim context
- Caching strategy documented in code comments for future optimization

## [2026-01-23] - Sketch & Scope Agent Refactoring

### Added

#### Error Handling
- **Structured error handler** (`client/src/features/voice-sketch/utils/error-handler.ts`)
  - Voice-friendly error formatting for TTS output
  - Structured error responses with codes and recoverability flags
  - Consistent error handling across Sketch and Scope agents

#### Geometry Validation
- **Geometry validation utilities** (`client/src/features/voice-sketch/utils/geometry-validation.ts`)
  - Room dimension validation (zero/negative lengths, aspect ratios)
  - Wall placement validation against room bounds
  - Room geometry consistency checks (polygon closure, opening overlaps)
  - Voice-friendly validation error messages

#### Damage Zone Enhancements
- **Severity and Surface fields** for damage zones
  - Added `severity` field (minor, moderate, severe, total) to `claimDamageZones` schema
  - Added `surface` field (ceiling, wall, floor, combinations) to `claimDamageZones` schema
  - Migration `057_add_damage_zone_surface_column.sql` to add surface column
  - Extended `edit_damage_zone` tool to support severity and surface editing
  - Extended `mark_damage` tool to accept severity and surface during creation
  - Updated `VoiceDamageZone` type with `DamageSeverity` and `DamageSurface` types

#### Undo/Redo with Confirmation
- **Confirmation mechanism** for undo/redo operations
  - Undo now requires confirmation before executing
  - Redo requires confirmation (basic implementation)
  - Pending undo/redo state tracking
  - Voice-friendly confirmation prompts
  - New tools: `confirm_undo`, `redo`, `confirm_redo`

#### Multi-Room Navigation
- **Room listing and selection** tools
  - `list_rooms` tool to enumerate all rooms in current structure or all rooms
  - `select_room` tool to switch focus to a specific room for editing
  - `list_structures` tool to list all structures
  - Improved room name matching (case-insensitive, handles formatted names)
  - Context-aware room listing (respects current structure selection)

### Changed

#### Error Handling Standardization
- Updated both Sketch and Scope agents to use structured error format
- Errors now formatted for voice/TTS output (short sentences, clear diction)
- Technical details logged to console, user-friendly messages returned

#### Geometry Engine
- Integrated dimension validation into `createRoom` function
- Added validation checks before room creation
- Improved error messages for invalid geometry

#### Agent Tools
- Updated `edit_damage_zone` tool description and parameters
- Updated `mark_damage` tool to support severity and surface
- Added new tools for undo/redo confirmation and room navigation

### Database Schema Changes

#### Migration 057: Add Damage Zone Surface Column
- Added `surface` VARCHAR(50) column to `claim_damage_zones` table
- Added index on `surface` column
- Updated existing records to infer surface from `floor_affected` and `ceiling_affected`
- Added column comment documenting surface values

### Technical Notes

#### Model References
- Using OpenAI GPT-4.1 via Realtime API for voice agents (ensures latest model capabilities)
- Prompt content fetched from `ai_prompts.voice.room_sketch` and `ai_prompts.voice.scope` tables
- Workflow integration uses `ai_prompts.workflow.inspection_generator` for dynamic step guidance

#### Caching Improvements
- Prompt caching with 5-minute TTL for both agents
- Claim context caching with 2-minute TTL for Scope Agent
- Cache invalidation on stale data

#### State Synchronization
- Improved voice/UI state synchronization
- Geometry engine state changes emit events for external listeners
- Room selection updates current room state for subsequent operations

### Future Enhancements (Planned)

- Full redo stack implementation
- Angled walls support (non-90-degree walls)
- Pantry and alcove feature types
- Floor plan visualization mode toggle
- Depreciation workflow integration in Scope Agent
- Visual framing guidance overlay for photo capture
- Enhanced workflow step validation and blocking enforcement
- Photo binding improvements for flow context

### Breaking Changes

None - all changes are backward compatible.

### Migration Required

Run migration `057_add_damage_zone_surface_column.sql` to add the `surface` column to `claim_damage_zones` table.
