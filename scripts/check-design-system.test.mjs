import assert from 'node:assert/strict';
import test from 'node:test';

import { inspectDesignSystem } from './check-design-system.mjs';

test('production source follows the design-system color and surface contract', () => {
  assert.deepEqual(inspectDesignSystem(), []);
});
