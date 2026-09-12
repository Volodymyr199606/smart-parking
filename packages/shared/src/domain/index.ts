/**
 * Parking Domain Model (V1).
 *
 * Framework-independent, storage-independent TypeScript types describing
 * parking concepts (location, legality, availability, evidence) as facts
 * that can be separately known, unknown, or upgraded — see each file's doc
 * comment for the reasoning. No React, Supabase, LLM, or database-row
 * dependencies of any kind.
 *
 * Database-row -> domain-model mapping lives outside this directory, in
 * packages/shared/src/adapters/. This directory must never import from
 * there — dependencies point one way only: adapters -> domain.
 *
 * This module is NOT yet imported by apps/mobile or apps/web. It exists so
 * future deterministic parking services, mobile UI, and agent tools can
 * share one contract instead of re-deriving it. See
 * packages/shared/README.md and docs/ARCHITECTURE.md §13 for status.
 */

export type { GeoPoint } from "./geo";

export type { DataSourceCategory, ParkingEvidence } from "./evidence";

export type { FreshnessStatus } from "./freshness";

export type { LegalityStatus, ParkingLegality } from "./legality";

export type { AvailabilityStatus, ParkingAvailability } from "./availability";

export type { ParkingLocation } from "./location";

export type { ParkingCandidate } from "./candidate";

export type { ParkingCandidateSearchRequest, ParkingSearchConstraints } from "./search";

export type {
  ParkingRule,
  ParkingRuleKind,
  ParkingRuleSchedule,
  ParkingTimeWindow,
  DayOfWeek,
} from "./rule";
