import { describe, expect, it } from 'vitest';

import { parseArgs } from './release-notes';

describe('release notes CLI arguments', () => {
  it('accepts the pnpm argument separator used by the release workflow', () => {
    expect(parseArgs(['--', '--tag', 'v1.0.0', '--out', 'notes.md'])).toEqual({
      out: 'notes.md',
      tag: 'v1.0.0',
    });
  });
});
