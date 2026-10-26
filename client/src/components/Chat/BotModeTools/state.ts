import { atom } from 'jotai';

/** The progress panel owns the host. Closing it removes the host so the original
 * tool controls return to the conversation rather than becoming inaccessible. */
export const botModeToolsRightHostAtom = atom<HTMLElement | null>(null);
export const botModeToolsRightCountAtom = atom(0);

export const BOTMODE_TOOLS_RIGHT_HOST_ID = 'botmode-tools-right-host';
