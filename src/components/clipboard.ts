import type { BoardItem } from '../model/types';

// Shared clipboard for board items (system clipboard carries them too, under BOARD_MIME).
export const BOARD_MIME = 'application/x-slateline-board-items';
let boardClip: BoardItem[] = [];
export const getBoardClipboard = () => boardClip;
export const setBoardClipboard = (items: BoardItem[]) => { boardClip = items.map((i) => ({ ...i })); };
