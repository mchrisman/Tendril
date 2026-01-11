// Type definitions for Tendril
// Pattern matching for tree structures

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

// ==================== Core Types ====================

export interface Site {
  kind: 'scalar' | 'group';
  path: (string | number)[];
  valueRef?: JsonValue;
  // Array group sites
  groupStart?: number;
  groupEnd?: number;
  valueRefs?: JsonValue[];
  // Object group sites
  keys?: string[];
}

export interface CASFailure {
  site: Site;
  siteKey: string;
  expected: JsonValue;
  actual: JsonValue;
  to: JsonValue;
}

export interface EditConflict {
  siteKey: string;
  site: Site;
  existing: JsonValue;
  attempted: JsonValue;
  existingSol: Solution;
  attemptedSol: Solution;
}

// ==================== Solution ====================

export interface Solution {
  /** Variable bindings as properties (e.g., sol.x, sol.name) */
  readonly [key: string]: JsonValue;

  /** Get a copy of all bindings */
  bindings(): Record<string, JsonValue>;

  /** Get the occurrence this solution belongs to */
  occurrence(): Occurrence;

  /** Get sites for a variable */
  sites(name: string): Site[];

  /**
   * Edit data using this solution's bindings.
   * @param plan - Object mapping variable names to replacement values, or function returning such object
   * @param opts - Options
   */
  edit(plan: EditPlan, opts?: EditOptions): JsonValue;

  /**
   * Replace the entire match ($0) using this solution.
   * @param replacement - Replacement value or function
   * @param opts - Options
   */
  replace(replacement: JsonValue | ((sol: Solution) => JsonValue), opts?: MutateOptions): JsonValue;

  /** Iterate occurrences with equivalent bindings */
  occurrences(): Iterable<Occurrence>;

  /** Convert bindings to plain object */
  toObject(): Record<string, JsonValue>;
}

// ==================== Occurrence ====================

export interface Occurrence {
  /** Get the path to this occurrence */
  path(): (string | number)[];

  /** Get the matched value ($0) */
  value(): JsonValue;

  /** Iterate solutions for this occurrence */
  solutions(): Iterable<Solution>;

  /**
   * Replace the entire match ($0).
   * @param replacement - Replacement value or function
   * @param opts - Options
   */
  replace(replacement: JsonValue | ((sol: Solution) => JsonValue), opts?: MutateOptions): JsonValue;

  /**
   * Edit data using variable bindings from this occurrence.
   * @param plan - Edit plan
   * @param opts - Options
   */
  edit(plan: EditPlan, opts?: OccurrenceEditOptions): JsonValue;
}

// ==================== SolutionSet ====================

export interface SolutionSet extends Iterable<Solution> {
  /** Get the first solution, or null */
  first(): Solution | null;

  /** Convert to array */
  toArray(): Solution[];

  /** Count unique solutions */
  count(): number;

  /** Filter solutions */
  filter(predicate: (sol: Solution) => boolean): FilteredSolutionSet;

  /** Take first n solutions */
  take(n: number): FilteredSolutionSet;
}

export interface FilteredSolutionSet extends Iterable<Solution> {
  first(): Solution | null;
  toArray(): Solution[];
  count(): number;
  filter(predicate: (sol: Solution) => boolean): FilteredSolutionSet;
  take(n: number): FilteredSolutionSet;
}

// ==================== OccurrenceSet ====================

export interface OccurrenceSet extends Iterable<Occurrence> {
  /** Iterate occurrences */
  occurrences(): Iterable<Occurrence>;

  /** Get the first occurrence, or null */
  first(): Occurrence | null;

  /** Take first n occurrences */
  take(n: number): OccurrenceSet;

  /** Filter occurrences */
  filter(predicate: (occ: Occurrence) => boolean): OccurrenceSet;

  /** Convert to array */
  toArray(): Occurrence[];

  /** Count occurrences */
  count(): number;

  /** Check if any occurrences exist */
  hasMatch(): boolean;

  /** Get unique solutions across all occurrences */
  solutions(): SolutionSet;

  /**
   * Replace $0 for all occurrences.
   * @param replacement - Replacement value or function
   * @param opts - Options
   */
  replaceAll(replacement: JsonValue | ((sol: Solution) => JsonValue), opts?: MutateOptions): JsonValue;

  /**
   * Edit all sites across all occurrences.
   * @param plan - Edit plan
   * @param opts - Options
   */
  editAll(plan: EditPlan, opts?: EditAllOptions): JsonValue;
}

// ==================== Simple API ====================

/** Location result from InMatcher.locations() */
export interface Location {
  path: (string | number)[];
  fragment: JsonValue;
  bindings: Record<string, JsonValue>;
}

/** Replacement value or function that computes replacement from bindings */
export type Replacement = JsonValue | ((bindings: Record<string, JsonValue>) => JsonValue);

/** Mutation plan: object mapping variable names to values/functions, or function returning such object */
export type Mutation =
  | Record<string, JsonValue | ((bindings: Record<string, JsonValue>) => JsonValue)>
  | ((bindings: Record<string, JsonValue>) => Record<string, JsonValue>);

/**
 * Simple API for anchored matching.
 * @example
 * Tendril("{name: $x}").on({name: "Alice"}).solve()
 * // => {x: "Alice"}
 */
export interface OnMatcher {
  /** Boolean: does the pattern match the data at root? */
  test(): boolean;

  /**
   * First solution as a plain object, or null if no match.
   * Empty object {} means "matched but no bindings".
   */
  solve(): Record<string, JsonValue> | null;

  /** All solutions as an array of plain objects. */
  solutions(): Record<string, JsonValue>[];

  /**
   * Replace the entire match.
   * @param replacement - value or function (bindings) => value
   */
  replace(replacement: Replacement): JsonValue;

  /**
   * Mutate (surgically edit) specific bindings.
   * @param mutation - {varName: value|fn, ...} or function (bindings) => {...}
   */
  mutate(mutation: Mutation): JsonValue;
}

/**
 * Simple API for searching within data.
 * @example
 * Tendril("{name: $n}").in(data).locations()
 * // => [{path: [...], fragment: {...}, bindings: {n: "Alice"}}, ...]
 */
export interface InMatcher {
  /** Count of matching occurrences. */
  count(): number;

  /**
   * Array of {path, fragment, bindings} for each occurrence.
   * Uses first solution per occurrence (with warning if multiple solutions).
   */
  locations(): Location[];

  /**
   * Replace all occurrences.
   * @param replacement - value or function (bindings) => value
   */
  replace(replacement: Replacement): JsonValue;

  /**
   * Mutate (surgically edit) specific bindings across all occurrences.
   * @param mutation - {varName: value|fn, ...} or function (bindings) => {...}
   */
  mutate(mutation: Mutation): JsonValue;
}

// ==================== Pattern ====================

export interface Pattern {
  // ==================== Simple API ====================

  /**
   * Simple anchored matching API.
   * @param data - Data to match against
   * @example
   * Tendril("{name: $x}").on({name: "Alice"}).solve()
   * // => {x: "Alice"}
   */
  on(data: JsonValue): OnMatcher;

  /**
   * Simple search-within API.
   * @param data - Data to search
   * @example
   * Tendril("{name: $n}").in(data).locations()
   */
  in(data: JsonValue): InMatcher;

  // ==================== Advanced API ====================

  /**
   * Advanced: Match pattern at the root (anchored).
   * Returns OccurrenceSet for fine-grained control.
   * @param data - Data to match against
   */
  advancedMatch(data: JsonValue): OccurrenceSet;

  /**
   * Advanced: Find all matches at any depth.
   * Returns OccurrenceSet for fine-grained control.
   * @param data - Data to search
   */
  advancedFind(data: JsonValue): OccurrenceSet;

  /**
   * Find first match only (optimized).
   * @param data - Data to search
   */
  first(data: JsonValue): OccurrenceSet;

  /**
   * Check if pattern matches at root (fast path).
   * @param data - Data to match against
   */
  hasMatch(data: JsonValue): boolean;

  /**
   * Check if pattern matches anywhere (fast path).
   * @param data - Data to search
   */
  hasAnyMatch(data: JsonValue): boolean;

  /**
   * Return new Pattern with additional options.
   * @param opts - Options to merge
   */
  withOptions(opts: PatternOptions): Pattern;

  /**
   * Return new Pattern with debug listener.
   * @param listener - Debug listener object
   */
  debug(listener: DebugListener): Pattern;

  // ==================== Legacy Aliases (deprecated) ====================

  /**
   * @deprecated Use advancedMatch() instead
   */
  match(data: JsonValue): OccurrenceSet;

  /**
   * @deprecated Use advancedFind() instead
   */
  find(data: JsonValue): OccurrenceSet;
}

// ==================== Options ====================

export interface PatternOptions {
  maxSteps?: number;
}

export interface DebugListener {
  onEnter?: (type: string, node: JsonValue, path: (string | number)[]) => void;
  onExit?: (type: string, node: JsonValue, path: (string | number)[], matched: boolean) => void;
  onBind?: (kind: 'scalar' | 'group', name: string, value: JsonValue) => void;
}

export interface MutateOptions {
  mutate?: boolean;
  onCASFailure?: (failure: CASFailure) => 'skip' | 'force';
}

export interface EditOptions extends MutateOptions {}

export interface OccurrenceEditOptions extends MutateOptions {
  per?: 'site' | 'occurrence';
  onConflict?: (conflict: EditConflict) => void;
}

export interface EditAllOptions extends OccurrenceEditOptions {}

export type EditPlan =
  | Record<string, JsonValue | ((sol: Solution) => JsonValue)>
  | ((sol: Solution) => Record<string, JsonValue>);

// ==================== Group (internal, but exported) ====================

export class Group {
  readonly length?: number;
  readonly [index: number]: JsonValue;

  static array(...items: JsonValue[]): Group;
  static object(obj: Record<string, JsonValue>): Group;

  at(index: number): JsonValue;
  [Symbol.iterator](): Iterator<JsonValue>;
}

// ==================== Main API ====================

/**
 * Create a Tendril pattern.
 * @param pattern - Pattern string
 * @example
 * Tendril("{ name: $x }").match({ name: "Alice" }).solutions().first()
 * // => { x: "Alice" }
 */
export function Tendril(pattern: string): Pattern;

/**
 * Check if pattern matches data at root.
 * @param pattern - Pattern string
 * @param data - Data to match
 */
export function matches(pattern: string, data: JsonValue): boolean;

/**
 * Extract first solution bindings (anchored).
 * @param pattern - Pattern string
 * @param data - Data to match
 */
export function extract(pattern: string, data: JsonValue): Record<string, JsonValue> | null;

/**
 * Extract all unique solution bindings (anchored).
 * @param pattern - Pattern string
 * @param data - Data to match
 */
export function extractAll(pattern: string, data: JsonValue): Record<string, JsonValue>[];

/**
 * Find first match and replace it.
 * @param pattern - Pattern string
 * @param data - Data to search
 * @param replacement - Replacement value or function
 */
export function replace(
  pattern: string,
  data: JsonValue,
  replacement: JsonValue | ((sol: Solution) => JsonValue)
): JsonValue;

/**
 * Find all matches and replace them.
 * @param pattern - Pattern string
 * @param data - Data to search
 * @param replacement - Replacement value or function
 */
export function replaceAll(
  pattern: string,
  data: JsonValue,
  replacement: JsonValue | ((sol: Solution) => JsonValue)
): JsonValue;

/**
 * Get unique matches projected to specific variables.
 * @param pattern - Pattern string
 * @param data - Data to match
 * @param vars - Variable names to project
 */
export function uniqueMatches(
  pattern: string,
  data: JsonValue,
  ...vars: string[]
): Record<string, JsonValue>[];
