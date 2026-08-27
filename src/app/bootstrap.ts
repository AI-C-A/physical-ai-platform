import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

import { loadRuntimeConfig } from '@/shared/config';

import { App } from './App';
import { createApplicationServices } from './composition/application-services';
import { DEFAULT_BRANDING } from './config';
import './styles/global.css';
import { StartupFailure, StartupLoading } from './ui/startup-failure';

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : '알 수 없는 이유로 앱을 시작하지 못했습니다.';
}

/**
 * 런타임 설정 검증이 끝난 뒤에만 React 애플리케이션을 마운트한다.
 * 검증되지 않은 설정으로 Adapter가 시작되지 않도록 실패 시 앱을 중단한다.
 */
export async function bootstrapApplication(
  rootElement: Element | null,
): Promise<void> {
  if (rootElement === null) {
    throw new Error('React 루트 요소를 찾을 수 없습니다.');
  }

  const root = createRoot(rootElement);
  root.render(createElement(StartupLoading));

  try {
    const runtimeConfig = await loadRuntimeConfig(DEFAULT_BRANDING);
    const services = createApplicationServices(runtimeConfig);
    root.render(createElement(App, { branding: runtimeConfig.branding, services }));
  } catch (error: unknown) {
    root.render(
      createElement(StartupFailure, { message: getErrorMessage(error) }),
    );
  }
}
