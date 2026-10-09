/**
 * Depot-code matching helpers for OCR output. OCR frequently misreads a single letter of a
 * short depot code (e.g. `LLK` read as `LLL`), so after an exact lookup fails we allow a
 * one-character substitution, but only when the guess is unambiguous.
 */

/** Minimal depot shape needed for matching. */
export type DepotLike = { code: string };

/**
 * Counts differing positions between two strings of equal length.
 * @returns Hamming distance, or `Infinity` when lengths differ
 */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let distance = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) distance += 1;
  }
  return distance;
}

/**
 * Finds the depot whose code differs from `ocrCode` by exactly one character.
 *
 * Returns `undefined` when there is no candidate, when more than one depot is one edit
 * away (e.g. `SRD` sits between `SRB` and `SRC`), or when the only candidate is already
 * claimed by an exact match in the same batch (listed in `takenCodes`).
 *
 * @param ocrCode depot code as read by OCR (any case)
 * @param depots master depots to search, ideally already filtered to one refinery
 * @param takenCodes upper-case codes that matched exactly in this batch
 */
export function findDepotByFuzzyCode<T extends DepotLike>(
  ocrCode: string,
  depots: T[],
  takenCodes: Set<string> = new Set(),
): T | undefined {
  const target = ocrCode.trim().toUpperCase();
  if (target.length < 2) return undefined;

  const candidates = depots.filter((depot) => {
    const code = depot.code.trim().toUpperCase();
    return !takenCodes.has(code) && hammingDistance(code, target) === 1;
  });

  return candidates.length === 1 ? candidates[0] : undefined;
}
