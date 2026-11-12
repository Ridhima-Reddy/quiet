const g = typeof globalThis !== 'undefined' ? globalThis : {};
export const isExt = !!(g.chrome?.runtime?.id) && typeof location !== 'undefined' && location.protocol === 'chrome-extension:';
export const isDesktop = !!g.quietNative;
export const isWeb = !isExt && !isDesktop;
export const hasDOM = typeof document !== 'undefined';
export const isTouch = hasDOM && g.matchMedia?.('(pointer: coarse)').matches;
export const isStandalone = hasDOM && (g.matchMedia?.('(display-mode: standalone)').matches || g.navigator?.standalone);
export const platformName = isExt ? 'Chrome extension' : isDesktop ? 'Desktop app' : isStandalone ? 'Phone/desktop app' : 'Web';
