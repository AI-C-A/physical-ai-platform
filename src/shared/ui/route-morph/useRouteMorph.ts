import {
  useContext,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import type { To } from 'react-router-dom';

import { RouteMorphContext } from './route-morph-context';
import type {
  RouteMorphContextValue,
  RouteMorphElementProps,
  RouteMorphNavigationOptions,
  RouteMorphTriggerProps,
} from './route-morph-types';

function shouldUseNativeLinkNavigation(
  event: ReactMouseEvent<HTMLElement>,
): boolean {
  const source = event.currentTarget;
  if (!(source instanceof HTMLAnchorElement)) return false;

  const target = source.getAttribute('target');
  return event.button !== 0
    || event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey
    || source.hasAttribute('download')
    || (target !== null && target !== '' && target !== '_self');
}

function useRouteMorphContext(): RouteMorphContextValue {
  const context = useContext(RouteMorphContext);
  if (context === null) {
    throw new Error('useRouteMorph는 RouteMorphProvider 안에서 사용해야 합니다.');
  }
  return context;
}

function getElementProps(
  id: string,
  activeId: string | null,
): RouteMorphElementProps {
  return activeId === id
    ? { 'data-route-morph-active': '', 'data-route-morph-id': id }
    : { 'data-route-morph-id': id };
}

/** 버튼, 링크 또는 다른 HTMLElement와 라우트 목적지를 연결한다. */
export function useRouteMorph(id: string) {
  const context = useRouteMorphContext();
  const elementProps = getElementProps(id, context.activeId);
  const getTriggerProps = (
    to: To,
    options?: RouteMorphNavigationOptions,
  ): RouteMorphTriggerProps => ({
    ...elementProps,
    onClick: (event) => {
      if (event.defaultPrevented || shouldUseNativeLinkNavigation(event)) return;
      event.preventDefault();
      context.open(id, event.currentTarget, to, options);
    },
  });

  return {
    close: (to: To, options?: RouteMorphNavigationOptions) => {
      context.close(id, to, options);
    },
    getTriggerProps,
    isActive: context.activeId === id,
    open: (
      source: HTMLElement,
      to: To,
      options?: RouteMorphNavigationOptions,
    ) => {
      context.open(id, source, to, options);
    },
    targetProps: elementProps,
    triggerProps: elementProps,
  };
}

/** 현재 진행 중인 morph의 라우트 목적지에 사용할 props를 반환한다. */
export function useRouteMorphTarget(): RouteMorphElementProps | Record<string, never> {
  const { activeId } = useRouteMorphContext();
  return activeId === null ? {} : getElementProps(activeId, activeId);
}
