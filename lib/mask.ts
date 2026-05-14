export function maskKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 8) return "***";
  const head = trimmed.slice(0, 3);
  const tail = trimmed.slice(-3);
  return `${head}...${tail}`;
}
