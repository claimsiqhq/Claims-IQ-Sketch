# Codebase Review & Audit Report

**Date:** January 11, 2026
**Reviewer:** AI Assistant

## Executive Summary

The codebase represents a sophisticated, voice-first estimation platform ("Claims IQ Sketch") built on a PERN (Postgres, Express, React, Node) stack. The architecture is modular and generally well-organized.

However, a re-evaluation against the provided database schema reveals **critical data Model mismatches** that will cause runtime failures in key services. Specifically, the "Scope Assembly" engine attempts to query a table that does not exist in the database, and the "Voice Sketch" features write to a table that the "Scope Engine" does not read from.

---

## 🔴 Critical Issues

### 1. Missing Table: `scope_line_items` vs `line_items`

The codebase is attempting to access a table named `scope_line_items` which **does not exist** in the provided database schema.

*   **Code References:** `server/services/scopeAssemblyService.ts` and `server/routes/scopeRoutes.ts` explicitly query `scope_line_items`.
*   **Database Reality:** The database contains `line_items` and `xact_line_items`, but no `scope_line_items`.
*   **Impact:** Any attempt to assemble a scope or use scope-related API endpoints will fail with a "relation does not exist" error.
*   **Recommendation:** Rename the table in the database to match the code, or (better) update the code to use `line_items` if that is the intended catalog table.

### 2. "Missing Wall" Data Inconsistency (Split Truth)

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

### 3. Missing Pricing Data (Infrastructure vs. Content)

While the pricing *engine* (`pricing.ts`, `xactPricing.ts`) is implemented, the database lacks the necessary seed data to function.
*   `xact_line_items`: Schema exists but table is empty.
*   `xact_components`: Schema exists but table is empty.
*   `regional_multipliers`: Schema exists but table is empty.

**Impact:** The application cannot generate valid estimates or prices until this data is imported.

---

## 🟡 High Priority Issues

### 4. Client-Side State Management
The client-side `geometry-engine.ts` uses an in-memory store (Zustand) that tracks walls and notes. It needs to be carefully audited to ensure it syncs correctly with the server's `zone_openings` model when persisting changes, especially for "missing" walls which are treated as openings on the server but potentially as wall properties/notes on the client.

---

## 🟢 Code Quality & Architecture

### Strengths
*   **Documentation:** `CODEBASE_AUDIT_V1.md` and `sketch-esx-architecture.md` provides excellent context.
*   **Modular Design:** Clean separation between `sketchService` (geometry), `scopeEngine` (logic), and `pricing` (calculation).
*   **Voice Integration:** Sophisticated integration with OpenAI Realtime API via `room-sketch-agent.ts` and `voice-session.ts`.
*   **ESX Export:** Functional ESX export with recent fixes for zone connections.

---

## Action Plan

1.  **Fix Table Reference:** Update `scopeAssemblyService.ts` and `scopeRoutes.ts` to query `line_items` instead of the non-existent `scope_line_items`.
2.  **Consolidate Missing Walls:** Refactor `estimateHierarchy.ts` and `scopeAssemblyService.ts` to read/write from `zone_openings` instead of `estimate_missing_walls`.
3.  **Data Migration:** Create a script to migrate any legacy `estimate_missing_walls` data to `zone_openings`.
4.  **Seed Data:** Import Xactimate/Pricing seed data to make the pricing engine functional.
