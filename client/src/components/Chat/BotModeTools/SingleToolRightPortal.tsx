import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAtomValue, useSetAtom } from 'jotai';
import { ContentTypes } from 'librechat-data-provider';
import type { TMessageContentParts } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { botModeToolsRightCountAtom, botModeToolsRightHostAtom } from './state';
import { useBotModeView } from '~/components/Chat/BotModeViewContext';
import { hasPendingApprovalInPart } from '~/utils';

/** One-tool replies bypass ToolCallGroup. Preserve the interactive part, but
 * display it in Progression; never relocate an approval or an attachment. */
export default function SingleToolRightPortal({
  part,
  withinActivityPhase,
  hasAttachments,
  children,
}: {
  part: TMessageContentParts;
  withinActivityPhase: boolean;
  hasAttachments: boolean;
  children: ReactNode;
}) {
  const isBotModeView = useBotModeView();
  const rightHost = useAtomValue(botModeToolsRightHostAtom);
  const setRightCount = useSetAtom(botModeToolsRightCountAtom);
  const showOnRight =
    isBotModeView &&
    rightHost != null &&
    part.type === ContentTypes.TOOL_CALL &&
    part[ContentTypes.TOOL_CALL] != null &&
    !withinActivityPhase &&
    !hasAttachments &&
    !hasPendingApprovalInPart(part);

  useEffect(() => {
    if (!showOnRight) return;
    setRightCount((previous) => previous + 1);
    return () => setRightCount((previous) => Math.max(0, previous - 1));
  }, [setRightCount, showOnRight]);

  const card = <div className="min-w-0" data-testid="botmode-single-tool-card">{children}</div>;
  return showOnRight && rightHost != null ? createPortal(card, rightHost) : card;
}
