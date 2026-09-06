import { readdirSync, readFileSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceRoot = resolve(repositoryRoot, 'src');
const supportedExtensions = new Set(['.css', '.ts', '.tsx']);

const normalizePath = (filePath) => relative(repositoryRoot, filePath).replaceAll('\\', '/');

function collectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(absolutePath);
    if (!supportedExtensions.has(extname(entry.name))) return [];
    if (/\.(?:spec|test)\.[^.]+$/u.test(entry.name)) return [];
    return [absolutePath];
  });
}

const visualizationAllowlist = new Set([
  'src/entities/robot-video/ui/RobotCameraGrid.tsx',
  'src/entities/site/ui/IndoorSiteMap.tsx',
]);

const elevationAllowlist = new Set([
  'src/shared/ui/dialog/Dialog.tsx',
  'src/shared/ui/dropdown/Dropdown.tsx',
  'src/shared/ui/select/Select.tsx',
  'src/shared/ui/sheet/Sheet.tsx',
  'src/shared/ui/surface/floating-surface.ts',
  'src/shared/ui/surface/Surface.tsx',
  'src/shared/ui/surface/overlay-surface.ts',
  'src/shared/ui/input/field-styles.ts',
  'src/shared/ui/toast/ToastItem.tsx',
  'src/shared/ui/tooltip/Tooltip.tsx',
]);

const collectionMediaPanels = new Set([
  'src/entities/flywheel/ui/CollectionPerceptionViewer.tsx',
  'src/entities/flywheel/ui/CollectionBodyPoseViewer.tsx',
  'src/entities/flywheel/ui/QuestHandPoseViewer.tsx',
]);

const rules = [
  {
    id: 'shared-control',
    message: '입력·버튼은 shared/ui의 공통 컴포넌트를 사용해야 합니다.',
    pattern: /<(?:input|select|textarea|button)\b/gu,
    appliesTo: isProductSource,
  },
  {
    id: 'shared-control-internals',
    message: '입력·메뉴·선택 카드의 내부 스타일은 공통 컴포넌트에서 관리해야 합니다.',
    pattern: /\bui-(?:field|menu|choice)[\w-]*\b|\b(?:inputClassName|triggerClassName|itemClassName)\s*=/gu,
    appliesTo: isProductSource,
  },
  {
    id: 'shared-interaction-primitive',
    message: 'Radix 상호작용 부품은 shared/ui에서 감싸고 화면에서는 공통 컴포넌트를 조합해야 합니다.',
    pattern: /['"]@radix-ui\/react-[^'"]+['"]/gu,
    appliesTo: isProductSource,
  },
  {
    id: 'collection-media-panel',
    message: '수집 시각화 카드는 공통 MediaPanel의 곡률·헤더·clipping 계약을 사용해야 합니다.',
    pattern: /^(?![\s\S]*<MediaPanel\b)/gu,
    appliesTo: (path) => collectionMediaPanels.has(path),
  },
  {
    id: 'media-semantic-color',
    message: '미디어와 3D 색상은 media/visual-pose 의미 토큰을 사용해야 합니다.',
    pattern: /\b(?:bg|text|stroke|fill|outline)-(?:black|white)\b|\b0x[0-9a-f]{6}\b/giu,
    appliesTo: (path) => collectionMediaPanels.has(path)
      || path === 'src/shared/ui/synchronized-player/SynchronizedPlayer.tsx',
  },
  {
    id: 'input-radius-token',
    message: '공통 입력 곡률은 design-radius-field 토큰을 사용해야 합니다.',
    pattern: /\brounded-(?:sm|md|lg|xl|2xl|3xl|full)\b/gu,
    appliesTo: (path) => path === 'src/shared/ui/input/Input.tsx'
      || path === 'src/shared/ui/textarea/Textarea.tsx',
  },
  {
    id: 'raw-color',
    message: '색상 값은 color-tokens.css의 semantic token으로 정의해야 합니다.',
    pattern: /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/giu,
    appliesTo: (path) => path !== 'src/app/styles/color-tokens.css',
  },
  {
    id: 'base-palette',
    message: 'Tailwind base palette 대신 semantic color token을 사용해야 합니다.',
    pattern: /\b(?:bg|text|border|ring|outline|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}\b/gu,
    appliesTo: (path) => !visualizationAllowlist.has(path),
  },
  {
    id: 'page-elevation',
    message: '그림자와 backdrop은 floating/translucent surface 또는 명시적 시각화 overlay에서만 허용됩니다.',
    pattern: /\bshadow\b(?!-)|\bshadow-(?:sm|md|lg|xl|2xl|\[[^\]]+\])\b|\bbackdrop-[a-z-]+/gu,
    appliesTo: (path) => (
      (path.startsWith('src/pages/') || path.startsWith('src/shared/ui/'))
      && !elevationAllowlist.has(path)
    ),
  },
  {
    id: 'floating-contract',
    message: '플로팅 표면은 반투명 배경·blur·elevation을 묶은 getFloatingSurfaceClassName()을 사용해야 합니다.',
    pattern: /\bbg-layer-floating(?:\/[0-9]+)?\b/gu,
    appliesTo: (path) => path !== 'src/shared/ui/surface/floating-surface.ts',
  },
  {
    id: 'page-radius',
    message: '페이지 로컬 radius 대신 design radius token 또는 공통 surface를 사용해야 합니다.',
    pattern: /\brounded-(?:sm|md|lg|xl|2xl|3xl|full)\b/gu,
    appliesTo: (path) => path.startsWith('src/pages/'),
  },
  {
    id: 'static-card-boundary',
    message: '정적 surface는 외곽 border·shadow 없이 레이어 차이로 구분해야 합니다.',
    pattern: /rounded-[^"'\s]+[^"'\n]*(?:border\s+border-border|shadow-(?:sm|md|lg|xl|2xl))/gu,
    appliesTo: (path) => path.startsWith('src/pages/') && !elevationAllowlist.has(path),
  },
];

function isProductSource(path) {
  return /^src\/(?:pages|widgets|entities)\//u.test(path);
}

function inspectControlProps(path, source) {
  if (!isProductSource(path) || !path.endsWith('.tsx')) return [];
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations = [];
  const controls = new Set(['Input', 'SearchField', 'Select', 'Textarea', 'ChoiceCard', 'Menu.Content', 'Menu.Item']);
  function visit(node) {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && controls.has(node.tagName.getText(file))) {
      for (const prop of node.attributes.properties) {
        if (!ts.isJsxAttribute(prop)) continue;
        const name = prop.name.getText(file);
        const value = prop.initializer?.getText(file) ?? '';
        if (name !== 'style' && !(name === 'className' && /\b(?:bg|text|rounded|border|ring|outline|shadow|backdrop|font|p[xytrblse]?)-/u.test(value))) continue;
        violations.push({ id: 'control-design-override', path, line: file.getLineAndCharacterOfPosition(prop.getStart(file)).line + 1, value: prop.getText(file), message: '컨트롤 디자인은 공식 size·surface·density 옵션으로 선택하고 className은 외부 배치에 사용해야 합니다.' });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return violations;
}

export function inspectDesignSystemSource(path, source) {
  const violations = inspectControlProps(path, source);
  for (const rule of rules) {
    if (!rule.appliesTo(path)) continue;
    for (const match of source.matchAll(rule.pattern)) {
      const index = match.index ?? 0;
      const line = source.slice(0, index).split('\n').length;
      violations.push({
        id: rule.id,
        line,
        message: rule.message,
        path,
        value: match[0],
      });
    }
  }
  return violations;
}

export function inspectDesignSystem() {
  return collectFiles(sourceRoot).flatMap((absolutePath) => inspectDesignSystemSource(
    normalizePath(absolutePath), readFileSync(absolutePath, 'utf8'),
  ));
}

const isMainModule = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const violations = inspectDesignSystem();
  if (violations.length === 0) {
    console.log('Design system check passed.');
  } else {
    for (const violation of violations) {
      console.error(
        `${violation.path}:${String(violation.line)} [${violation.id}] ${violation.value} — ${violation.message}`,
      );
    }
    process.exitCode = 1;
  }
}
