function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0,
    ),
  );
  const at = (i: number, j: number): number => rows[i]?.[j] ?? 0;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        at(i - 1, j) + 1,
        at(i, j - 1) + 1,
        at(i - 1, j - 1) + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, at(i - 2, j - 2) + 1);
      }
      const row = rows[i];
      if (row) row[j] = best;
    }
  }
  return at(a.length, b.length);
}

export function closestMatch(
  input: string,
  candidates: readonly string[],
): string | undefined {
  const maxDistance = Math.max(1, Math.min(2, Math.floor(input.length / 3)));
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const distance =
      candidate.startsWith(input) && input.length >= 3
        ? 1
        : editDistance(input, candidate);
    if (distance <= maxDistance && distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}
