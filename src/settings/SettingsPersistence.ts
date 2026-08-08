/**
 * Determines whether normalized settings differ from the data loaded from
 * Obsidian. Keeping this comparison separate makes load-time migrations
 * explicit and avoids a needless write on every startup.
 */
export function settingsNeedPersist(loaded: unknown, normalized: unknown): boolean {
  return JSON.stringify(loaded ?? {}) !== JSON.stringify(normalized ?? {});
}
