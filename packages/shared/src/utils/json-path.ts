export function getValueAtPath(
  source: Record<string, unknown>,
  path: string
): unknown {
  if (!path.startsWith("/")) {
    return undefined;
  }

  const segments = path
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));

  let current: unknown = source;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      current = current[Number(segment)];
      continue;
    }

    if (typeof current !== "object" || current === null) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}
