import { describe, expect, it } from 'vitest';

import { shortcutFor } from './shortcuts';

const press = (key: string, extra: Partial<KeyboardEvent> = {}) => ({
  key,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  ...extra,
});

describe('in-window shortcuts', () => {
  it('never act while a text field has focus or with a modifier held', () => {
    for (const key of ['/', 'Escape', 'ArrowLeft', ' ', 'Enter', 'Tab']) {
      expect(shortcutFor(press(key), 'packs', 'text')).toBeNull();
      expect(shortcutFor(press(key), 'home', 'text')).toBeNull();
    }
    expect(
      shortcutFor(press('/', { metaKey: true }), 'home', 'none'),
    ).toBeNull();
    expect(
      shortcutFor(press('ArrowUp', { ctrlKey: true }), 'home', 'none'),
    ).toBeNull();
  });

  it('opens Settings with ⌘, outside a sheet, even from a text field', () => {
    const comma = press(',', { metaKey: true });
    expect(shortcutFor(comma, 'home', 'none')).toEqual({ kind: 'settings' });
    expect(shortcutFor(comma, 'packs', 'text')).toEqual({ kind: 'settings' });
    expect(shortcutFor(comma, 'sheet', 'none')).toBeNull();
    expect(shortcutFor(press(','), 'home', 'none')).toBeNull();
  });

  it('opens Settings with Ctrl+, where there is no ⌘ key', () => {
    const comma = press(',', { ctrlKey: true });
    expect(shortcutFor(comma, 'home', 'none')).toEqual({ kind: 'settings' });
    expect(shortcutFor(comma, 'sheet', 'none')).toBeNull();
  });

  it('switches packs and volume on Home', () => {
    expect(shortcutFor(press('ArrowLeft'), 'home', 'none')).toEqual({
      kind: 'pack',
      delta: -1,
    });
    expect(shortcutFor(press('ArrowRight'), 'home', 'button')).toEqual({
      kind: 'pack',
      delta: 1,
    });
    expect(shortcutFor(press('ArrowUp'), 'home', 'none')).toEqual({
      kind: 'volume',
      delta: 5,
    });
    expect(shortcutFor(press('ArrowDown'), 'home', 'none')).toEqual({
      kind: 'volume',
      delta: -5,
    });
    expect(shortcutFor(press('/'), 'home', 'button')).toEqual({ kind: 'find' });
  });

  it('leaves arrows to a focused slider and Enter to a focused button', () => {
    expect(shortcutFor(press('ArrowUp'), 'home', 'widget')).toBeNull();
    expect(shortcutFor(press('ArrowRight'), 'packs', 'widget')).toBeNull();
    expect(shortcutFor(press('Enter'), 'packs', 'button')).toBeNull();
    expect(shortcutFor(press(' '), 'packs', 'button')).toBeNull();
  });

  it('browses packs with tab, arrows, space and enter', () => {
    expect(shortcutFor(press('Tab'), 'packs', 'none')).toEqual({
      kind: 'shelf',
      delta: 1,
    });
    expect(
      shortcutFor(press('Tab', { shiftKey: true }), 'packs', 'none'),
    ).toEqual({ kind: 'shelf', delta: -1 });
    // Tab from a focused control keeps moving focus.
    expect(shortcutFor(press('Tab'), 'packs', 'button')).toBeNull();
    expect(shortcutFor(press('ArrowDown'), 'packs', 'none')).toEqual({
      kind: 'move',
      move: 'down',
    });
    expect(shortcutFor(press(' '), 'packs', 'none')).toEqual({
      kind: 'preview',
    });
    expect(shortcutFor(press('Enter'), 'packs', 'none')).toEqual({
      kind: 'activate',
    });
    expect(shortcutFor(press('Escape'), 'packs', 'button')).toEqual({
      kind: 'back',
    });
  });

  it('picks a character, previews and downloads on first launch', () => {
    expect(shortcutFor(press('ArrowRight'), 'first', 'none')).toEqual({
      kind: 'pack',
      delta: 1,
    });
    expect(shortcutFor(press('ArrowUp'), 'first', 'none')).toBeNull();
    expect(shortcutFor(press(' '), 'first', 'none')).toEqual({
      kind: 'preview',
    });
    expect(shortcutFor(press('Enter'), 'first', 'none')).toEqual({
      kind: 'activate',
    });
  });

  it('only closes an open sheet', () => {
    expect(shortcutFor(press('Escape'), 'sheet', 'button')).toEqual({
      kind: 'back',
    });
    expect(shortcutFor(press('/'), 'sheet', 'none')).toBeNull();
    expect(shortcutFor(press('ArrowLeft'), 'sheet', 'none')).toBeNull();
  });
});
