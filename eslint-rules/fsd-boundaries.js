import path from 'node:path';

const layerOrder = new Map([
  ['app', 0],
  ['pages', 1],
  ['widgets', 2],
  ['entities', 3],
  ['shared', 4],
]);

function getSourceElement(filePath) {
  const normalizedPath = filePath.replaceAll('\\', '/');
  const sourceMarker = '/src/';
  const markerIndex = normalizedPath.lastIndexOf(sourceMarker);

  if (markerIndex < 0) {
    return null;
  }

  const sourcePath = normalizedPath.slice(markerIndex + sourceMarker.length);
  return getElementFromSegments(sourcePath.split('/'));
}

function getElementFromSegments(segments) {
  const layer = segments[0];

  if (layer === undefined || !layerOrder.has(layer)) {
    return null;
  }

  if (layer === 'app') {
    return { key: 'app', layer, publicPath: '@/app' };
  }

  if (layer === 'pages') {
    const group = segments[1];
    const slice = segments[2];

    if (group === undefined || slice === undefined) {
      return null;
    }

    return {
      key: `${layer}/${group}/${slice}`,
      layer,
      publicPath: `@/${layer}/${group}/${slice}`,
    };
  }

  if (
    layer === 'shared' &&
    (segments[1] === 'ui' || segments[1] === 'lib')
  ) {
    const segment = segments[1];
    const component = segments[2];

    if (component === undefined) {
      return null;
    }

    return {
      key: `${layer}/${segment}/${component}`,
      layer,
      publicPath: `@/${layer}/${segment}/${component}`,
    };
  }

  const slice = segments[1];

  if (slice === undefined) {
    return null;
  }

  return {
    key: `${layer}/${slice}`,
    layer,
    publicPath: `@/${layer}/${slice}`,
  };
}

function getTargetElement(importerPath, importSource) {
  if (importSource.startsWith('@/')) {
    return getElementFromSegments(importSource.slice(2).split('/'));
  }

  if (!importSource.startsWith('.')) {
    return null;
  }

  return getSourceElement(path.resolve(path.dirname(importerPath), importSource));
}

function isPublicApiImport(importSource, targetElement) {
  return importSource === targetElement.publicPath;
}

function checkImport(context, node, importSource) {
  const importerPath = context.filename;
  const sourceElement = getSourceElement(importerPath);
  const targetElement = getTargetElement(importerPath, importSource);

  if (targetElement === null) {
    return;
  }

  const crossesElementBoundary =
    sourceElement === null || sourceElement.key !== targetElement.key;

  if (crossesElementBoundary && !isPublicApiImport(importSource, targetElement)) {
    context.report({
      node,
      message: `다른 Slice는 Public API(${targetElement.publicPath})로만 import해야 합니다.`,
    });
    return;
  }

  if (sourceElement === null) {
    return;
  }

  const sourceOrder = layerOrder.get(sourceElement.layer);
  const targetOrder = layerOrder.get(targetElement.layer);

  if (
    sourceOrder !== undefined &&
    targetOrder !== undefined &&
    targetOrder < sourceOrder
  ) {
    context.report({
      node,
      message: `${sourceElement.layer} 레이어는 상위 ${targetElement.layer} 레이어를 import할 수 없습니다.`,
    });
    return;
  }

  const sameLayerDifferentSlice =
    sourceElement.layer === targetElement.layer &&
    sourceElement.key !== targetElement.key &&
    !['app', 'shared'].includes(sourceElement.layer);

  if (sameLayerDifferentSlice) {
    context.report({
      node,
      message: `${sourceElement.layer} 레이어의 Slice끼리는 직접 참조할 수 없습니다.`,
    });
  }
}

const fsdBoundariesRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'FSD 레이어 방향과 Slice Public API를 강제합니다.',
    },
    schema: [],
  },
  create(context) {
    return {
      ExportAllDeclaration(node) {
        checkImport(context, node, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source !== null) {
          checkImport(context, node, node.source.value);
        }
      },
      ImportDeclaration(node) {
        checkImport(context, node, node.source.value);
      },
      ImportExpression(node) {
        if (typeof node.source.value === 'string') {
          checkImport(context, node, node.source.value);
        }
      },
    };
  },
};

const uiAdapterIsolationRule = {
  meta: {
    type: 'problem',
    docs: {
      description: '업무 UI가 Adapter 구현과 Runtime 조립 정보를 인지하지 못하게 합니다.',
    },
    schema: [],
  },
  create(context) {
    const normalizedPath = context.filename.replaceAll('\\', '/');
    const isBusinessUi = /\/src\/(pages|widgets)\//.test(normalizedPath)
      || /\/src\/entities\/[^/]+\/ui\//.test(normalizedPath);
    const isTest = /\.test\.(ts|tsx)$/.test(normalizedPath);
    if (!isBusinessUi || isTest) return {};

    const implementationName = /^(InMemory|Mock|Fixture|Simulated)/;
    const runtimeName = /^(RuntimeConfig|RuntimeConnections|AdapterImplementation|AdapterComposition|loadRuntimeConfig|parseRuntimeConfig)$/;
    const forbiddenText = /\b(adapter|mock|fixture|in-memory|simulated|simulator)\b|어댑터|테스트\s*패턴|실제\s+연결이\s+아님/iu;

    return {
      ImportDeclaration(node) {
        node.specifiers.forEach((specifier) => {
          if (specifier.type !== 'ImportSpecifier') return;
          const importedName = specifier.imported.name ?? specifier.imported.value;
          if (implementationName.test(importedName)) {
            context.report({ node: specifier, message: '업무 UI는 Adapter 구현 식별자를 import할 수 없습니다.' });
          }
          if (node.source.value === '@/shared/config' && runtimeName.test(importedName)) {
            context.report({ node: specifier, message: 'Runtime Config 전체는 app에서만 소비할 수 있습니다.' });
          }
        });
      },
      JSXText(node) {
        if (forbiddenText.test(node.value)) {
          context.report({ node, message: '업무 UI 문구에 Adapter 구현 정보를 노출할 수 없습니다.' });
        }
      },
      Literal(node) {
        if (typeof node.value === 'string' && forbiddenText.test(node.value)) {
          context.report({ node, message: '업무 UI 문자열에 Adapter 구현 정보를 노출할 수 없습니다.' });
        }
      },
    };
  },
};

export const fsdBoundariesPlugin = {
  rules: {
    boundaries: fsdBoundariesRule,
    'ui-adapter-isolation': uiAdapterIsolationRule,
  },
};
