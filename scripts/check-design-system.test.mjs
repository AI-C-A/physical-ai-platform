import assert from 'node:assert/strict';
import test from 'node:test';

import { inspectDesignSystem, inspectDesignSystemSource } from './check-design-system.mjs';

test('production source follows the design-system color and surface contract', () => {
  assert.deepEqual(inspectDesignSystem(), []);
});

test('화면의 직접 컨트롤과 내부 디자인 우회를 검출하고 공식 변형과 배치는 허용한다', () => {
  const path = 'src/pages/example/Page.tsx';
  for (const source of [
    '<input aria-label="검색" />',
    '<Select itemClassName="p-2" />',
    '<Menu.Item className="ui-menu-item" />',
    "import * as Menu from '@radix-ui/react-dropdown-menu';",
    '<SearchField className="bg-transparent" />',
    '<Select style={{ borderRadius: 20 }} />',
    '<Input className={large ? "rounded-xl" : "rounded-md"} />',
  ]) {
    assert.ok(inspectDesignSystemSource(path, source).length > 0, source);
  }
  assert.deepEqual(inspectDesignSystemSource(path, '<Select surface="overlay" controlSize="large" className="w-full min-w-0" />'), []);
  assert.deepEqual(inspectDesignSystemSource(path, '<Panel contentClassName="flex flex-col" />'), []);
  assert.deepEqual(inspectDesignSystemSource('src/shared/ui/input/Input.tsx', '<input />'), []);
});

test('수집 카드의 표면 누락과 의미 토큰 우회를 검출한다', () => {
  const panelPath = 'src/entities/flywheel/ui/CollectionBodyPoseViewer.tsx';
  const rules = inspectDesignSystemSource(panelPath, '<section className="bg-black" />; const color = 0x38bdf8;');
  assert.equal(rules.filter((item) => item.id === 'collection-media-panel').length, 1);
  assert.equal(rules.filter((item) => item.id === 'media-semantic-color').length, 2);
  assert.deepEqual(inspectDesignSystemSource(panelPath, '<MediaPanel title="전신 자세" />'), []);
  assert.equal(inspectDesignSystemSource('src/shared/ui/textarea/Textarea.tsx', '<textarea className="rounded-md" />')[0].id, 'input-radius-token');
});
