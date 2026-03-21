export function deepMerge<T extends Record<string, unknown>>(
  current: T,
  patch: Record<string, unknown>
): T {
  const next = { ...current } as Record<string, unknown>;

  for (const [key, value] of Object.entries(patch)) {
    const previous = next[key];
    if (
      isPlainObject(previous) &&
      isPlainObject(value)
    ) {
      next[key] = deepMerge(
        previous as Record<string, unknown>,
        value as Record<string, unknown>
      );
      continue;
    }

    next[key] = value;
  }

  return next as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
