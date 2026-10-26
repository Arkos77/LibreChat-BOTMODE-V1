import { atom } from 'jotai';

/** Shared between the app sidebar and BOT MODE's message components. */
export const botModeToolsSidebarExpandedAtom = atom(false);
export const botModeToolsInSidebarAtom = atom(0);

export const BOTMODE_TOOLS_LEFT_HOST_ID = 'botmode-tools-left-host';
