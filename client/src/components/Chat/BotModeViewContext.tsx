import { createContext, useContext } from 'react';

/** BOT MODE alone adopts the mission progress surface. Other chats stay unchanged. */
export const BotModeViewContext = createContext(false);
export const useBotModeView = () => useContext(BotModeViewContext);
