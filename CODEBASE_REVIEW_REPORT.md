# Codebase Review & Audit Report

**Date:** January 11, 2026
**Reviewer:** AI Assistant

## Executive Summary

The codebase represents a sophisticated, voice-first estimation platform ("Claims IQ Sketch") built on a PERN (Postgres, Express, React, Node) stack. The architecture is modular and generally well-organized, with a clear separation of concerns between client UI, voice processing, geometry engines, and server-side logic.

However, a **critical data consistency issue** was identified regarding "Missing Walls" (openings between rooms) that effectively disconnects the Voice/Sketch features from the Scope/Pricing engine. Additionally, the lack of Xactimate seed data currently prevents the application from generating accurate pricing.

---

## 🔴 Critical Issues

### 1. "Missing Wall" Data Inconsistency (Split Truth)

There are two conflicting sources of truth for missing walls (room openings), causing a disconnect between the Voice Sketch tool and the Scope Engine.

*   **Source A (`zone_openings` table):**
    *   Used by: `sketchTools.ts` (Voice Agent), `sketchService.ts` (Sketch UI).
    *   Status: The intended "canonical" storage for all openings (doors, windows, missing walls).
*   **Source B (`estimate_missing_walls` table):**
    *   Used by: `estimateHierarchy.ts` (API/CRUD), `scopeAssemblyService.ts` (Scope Engine), `zoneMetrics.ts` (via scope service).
    *   Status: Deprecated but still fully active in core business logic.

**Impact:**
*   **Voice -> Scope Failure:** If a user creates a missing wall via Voice command, it is saved to `zone_openings`. The Scope Engine reads `estimate_missing_walls` and **will not see it**, resulting in incorrect room surface area calculations (walls won't be deducted).
*   **UI Inconsistency:** Missing walls created in the standard Estimate editor won't appear in the Sketch UI, and vice versa.

**Recommendation:**
*   **Immediate Fix:** Refactor `scopeAssemblyService.ts` and `estimateHierarchy.ts` to read/write from `zone_openings` instead of `estimate_missing_walls`.
*   **Migration:** Run a migration to move any existing data from `estimate_missing_walls` to `zone_openings`.

### 2. Missing Pricing Data (Infrastructure vs. Content)

While the pricing *engine* (`pricing.ts`, `xactPricing.ts`) is implemented, the database lacks the necessary seed data to function.
*   `xact_line_items`: Schema exists but table is empty.
*   `xact_components`: Schema exists but table is empty.
*   `regional_multipliers`: Schema exists but table is empty.

**Impact:** The application cannot generate valid estimates or prices until this data is imported.

---

## 🟡 High Priority Issues

### 3. Server-Side Deprecated Table Usage
Multiple server services still rely on the deprecated `estimate_missing_walls` table:
*   `server/services/scopeAssemblyService.ts`
*   `server/services/estimateHierarchy.ts`
*   `server/routes.ts` (endpoints `/api/zones/:id/missing-walls`)

### 4. Client-Side State Management
The client-side `geometry-engine.ts` uses an in-memory store (Zustand) that tracks walls and notes. It needs to be carefully audited to ensure it syncs correctly with the server's `zone_openings` model when persisting changes, especially for "missing" walls which are treated as openings on the server but potentially as wall properties/notes on the client.

---

## 🟢 Code Quality & Architecture

### Strengths
*   **Documentation:** `CODEBASE_AUDIT_V1.md` and `sketch-esx-architecture.md` provides excellent context.
*   **Modular Design:** Clean separation between `sketchService` (geometry), `scopeEngine` (logic), and `pricing` (calculation).
*   **Voice Integration:** Sophisticated integration with OpenAI Realtime API via `room-sketch-agent.ts` and `voice-session.ts`.
*   **ESX Export:** Functional ESX export with recent fixes for zone connections.

### Areas for Improvement
*   **Type Safety:** Some manual mapping between DB rows and TypeScript interfaces could be replaced with Drizzle ORM's type inference to reduce boilerplate and errors.
*   **Testing:** While there are some tests in `services/__tests__`, core logic like the "split truth" issue suggests a need for better integration testing between modules (e.g., test that a voice command results in a correct scope line item).

---

## Action Plan

1.  **Refactor Core Services:** Update `estimateHierarchy.ts` and `scopeAssemblyService.ts` to use `zone_openings`.
2.  **Update API:** Update `/api/zones/:id/missing-walls` endpoints to interact with `zone_openings`.
3.  **Data Migration:** Create a script to migrate any legacy `estimate_missing_walls` data to `zone_openings`.
4.  **Seed Data:** Import Xactimate/Pricing seed data to make the pricing engine functional.
5.  **Integration Test:** Add a test case that creates a missing wall via `sketchTools` and asserts that `scopeEngine` correctly deducts the wall area.
