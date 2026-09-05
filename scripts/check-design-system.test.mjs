import assert from 'node:assert/strict';
import test from 'node:test';

import { inspectDesignSystem, inspectDesignSystemSource } from './check-design-system.mjs';

test('production source follows the design-system color and surface contract', () => {
  assert.deepEqual(inspectDesignSystem(), []);
});

test('수집 카드의 표면 누락과 의미 토큰 우회를 검출한다', () => {
  const panelPath = 'src/entities/flywheel/ui/CollectionBodyPoseViewer.tsx';
  const rules = inspectDesignSystemSource(panelPath, '<section className="bg-black" />; const color = 0x38bdf8;');
  assert.equal(rules.filter((item) => item.id === 'collection-media-panel').length, 1);
  assert.equal(rules.filter((item) => item.id === 'media-semantic-color').length, 2);
  assert.deepEqual(inspectDesignSystemSource(panelPath, '<MediaPanel title="전신 자세" />'), []);
  assert.equal(inspectDesignSystemSource('src/shared/ui/textarea/Textarea.tsx', '<textarea className="rounded-md" />')[0].id, 'input-radius-token');
});
