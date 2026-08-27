import { StrictMode } from 'react';
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { RuntimeConfig } from '@/shared/config';

import { createApplicationServices } from '../composition/application-services';
import { DEFAULT_BRANDING } from '../config';
import { AppProviders } from './app-providers';

const runtimeConfig: RuntimeConfig = {
  branding: DEFAULT_BRANDING,
  adapters: { mode: 'bundle', implementation: 'in-memory' },
  connections: {
    patrol: { endpoint: null },
    telemetry: { endpoint: null, integrationProfileId: null },
    video: { endpoint: null },
    capture: { endpoint: null },
  },
};

async function flushLifecycleCleanup(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('AppProviders lifecycle', () => {
  it('Strict Mode effect 재실행에서는 서비스를 유지하고 실제 unmount에서 한 번 dispose한다', async () => {
    const services = createApplicationServices(runtimeConfig);
    const dispose = vi.spyOn(services, 'dispose');
    const view = render(
      <StrictMode>
        <AppProviders branding={DEFAULT_BRANDING} services={services}>
          <p>애플리케이션</p>
        </AppProviders>
      </StrictMode>,
    );

    await flushLifecycleCleanup();
    expect(dispose).not.toHaveBeenCalled();

    view.unmount();
    await flushLifecycleCleanup();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('서비스 조립 객체가 교체되면 이전 객체만 dispose한다', async () => {
    const firstServices = createApplicationServices(runtimeConfig);
    const secondServices = createApplicationServices(runtimeConfig);
    const firstDispose = vi.spyOn(firstServices, 'dispose');
    const secondDispose = vi.spyOn(secondServices, 'dispose');
    const view = render(
      <AppProviders branding={DEFAULT_BRANDING} services={firstServices}>
        <p>애플리케이션</p>
      </AppProviders>,
    );

    view.rerender(
      <AppProviders branding={DEFAULT_BRANDING} services={secondServices}>
        <p>애플리케이션</p>
      </AppProviders>,
    );
    await flushLifecycleCleanup();

    expect(firstDispose).toHaveBeenCalledOnce();
    expect(secondDispose).not.toHaveBeenCalled();

    view.unmount();
    await flushLifecycleCleanup();
    expect(secondDispose).toHaveBeenCalledOnce();
  });
});
