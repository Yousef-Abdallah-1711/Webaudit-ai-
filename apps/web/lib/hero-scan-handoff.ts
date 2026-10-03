export const HERO_SCAN_URL_KEY = 'wa-hero-scan-url';

/** Keep the hero target scoped to this tab and only until `/scan` consumes it. */
export function storeHeroScanUrl(value: string): void {
  try {
    const trimmed = value.trim();
    if (trimmed === '') {
      window.sessionStorage.removeItem(HERO_SCAN_URL_KEY);
      return;
    }
    window.sessionStorage.setItem(HERO_SCAN_URL_KEY, trimmed);
  } catch {
    // Signup remains usable when browser storage is disabled.
  }
}

/** Read once and clear immediately so a later, unrelated scan starts empty. */
export function readAndClearHeroScanUrl(): string | null {
  try {
    const value = window.sessionStorage.getItem(HERO_SCAN_URL_KEY)?.trim() ?? '';
    window.sessionStorage.removeItem(HERO_SCAN_URL_KEY);
    return value === '' ? null : value;
  } catch {
    return null;
  }
}
