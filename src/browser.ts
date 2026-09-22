export function canOpenOverlay(url: string | undefined): boolean {
  if (!url) return false;
  const protocol = new URL(url).protocol;
  return protocol === "http:" || protocol === "https:" || protocol === "file:";
}
