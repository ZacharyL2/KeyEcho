import type { GridMove } from './packs';

/** Which screen the window shows; shortcuts differ per screen. */
export type ShortcutScreen = 'home' | 'first' | 'packs' | 'sheet';

/** What has focus: a text field never gets shortcuts, a widget keeps its arrows. */
export type FocusKind = 'none' | 'button' | 'widget' | 'text';

export type Shortcut =
  | { kind: 'back' }
  | { kind: 'find' }
  | { kind: 'settings' }
  | { kind: 'pack'; delta: number }
  | { kind: 'volume'; delta: number }
  | { kind: 'shelf'; delta: number }
  | { kind: 'move'; move: GridMove }
  | { kind: 'preview' }
  | { kind: 'activate' };

export interface ShortcutKey {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

const ARROWS: Record<string, GridMove> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

export const VOLUME_STEP = 5;

const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'email',
  'url',
  'tel',
  'password',
  'number',
]);

export function focusKind(element: Element | null): FocusKind {
  if (!element || element.tagName === 'BODY') {
    return 'none';
  }
  const tag = element.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') {
    return 'text';
  }
  if (element instanceof HTMLElement && element.isContentEditable) {
    return 'text';
  }
  if (tag === 'INPUT') {
    const type = (element.getAttribute('type') ?? 'text').toLowerCase();
    return TEXT_INPUT_TYPES.has(type) ? 'text' : 'widget';
  }
  const role = element.getAttribute('role');
  if (role === 'slider' || role === 'radio' || role === 'listbox') {
    return 'widget';
  }
  if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY') {
    return 'button';
  }
  return 'none';
}

/**
 * Maps a key press inside the window to an in-window shortcut. These only
 * drive the window; the system-wide key sounds never pass through here.
 */
export function shortcutFor(
  event: ShortcutKey,
  screen: ShortcutScreen,
  focus: FocusKind,
): Shortcut | null {
  // ⌘, (Ctrl+, on Windows and Linux) opens Settings from anywhere outside a sheet.
  if (
    event.metaKey !== event.ctrlKey &&
    event.key === ',' &&
    !event.altKey &&
    screen !== 'sheet'
  ) {
    return { kind: 'settings' };
  }
  if (event.altKey || event.ctrlKey || event.metaKey || focus === 'text') {
    return null;
  }
  const { key } = event;
  if (key === 'Escape') {
    return { kind: 'back' };
  }
  if (screen === 'sheet') {
    return null;
  }
  if (key === '/') {
    return { kind: 'find' };
  }
  const arrow = ARROWS[key];
  const freeArrows = focus === 'none' || focus === 'button';
  if (screen === 'packs') {
    if (key === 'Tab' && focus === 'none') {
      return { kind: 'shelf', delta: event.shiftKey ? -1 : 1 };
    }
    if (arrow && freeArrows) {
      return { kind: 'move', move: arrow };
    }
  } else if (arrow && freeArrows) {
    if (arrow === 'left' || arrow === 'right') {
      return { kind: 'pack', delta: arrow === 'left' ? -1 : 1 };
    }
    if (screen === 'home') {
      return {
        kind: 'volume',
        delta: arrow === 'up' ? VOLUME_STEP : -VOLUME_STEP,
      };
    }
  }
  if (focus !== 'none' || screen === 'home') {
    return null;
  }
  if (key === ' ') {
    return { kind: 'preview' };
  }
  if (key === 'Enter') {
    return { kind: 'activate' };
  }
  return null;
}
