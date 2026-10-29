import { atom } from 'jotai';

/**
 * null = default responsive behavior (open on desktop, closed on mobile).
 * Explicit user choice overrides that behavior on either screen size.
 */
export const botModeProgressOpenAtom = atom<boolean | null>(null);
