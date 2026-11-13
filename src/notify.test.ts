import { expect, test } from 'vitest';

import type { Toast } from './notify';
import { withToast } from './notify';

const toast = (id: string, message: string): Toast => ({ id, message });

test('a new message joins the toasts at the end', () => {
  expect(
    withToast(
      [toast('a', 'Volume didn’t load')],
      toast('b', 'X didn’t download'),
    ),
  ).toEqual([
    toast('a', 'Volume didn’t load'),
    toast('b', 'X didn’t download'),
  ]);
});

test('the same failure again replaces its toast instead of stacking another', () => {
  let toasts: Toast[] = [];
  for (const id of ['1', '2', '3']) {
    toasts = withToast(
      toasts,
      toast(id, 'Heritage Board No.3 didn’t download'),
    );
  }
  expect(toasts).toEqual([toast('3', 'Heritage Board No.3 didn’t download')]);
});
