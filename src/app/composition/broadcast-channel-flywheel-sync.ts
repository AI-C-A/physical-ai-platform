import type { InMemoryFlywheelSyncTransport } from '@/entities/flywheel';

const mockFlywheelChannelName = 'army-robot.mock.flywheel.realtime.v1';

export interface OwnedInMemoryFlywheelSyncTransport extends InMemoryFlywheelSyncTransport {
  dispose(): void;
}

class BroadcastChannelFlywheelSyncTransport implements OwnedInMemoryFlywheelSyncTransport {
  readonly clientId = globalThis.crypto.randomUUID();
  readonly #channel: BroadcastChannel;
  readonly #listenerWrappers = new Map<(serializedMessage: string) => void, (event: MessageEvent<unknown>) => void>();
  #disposed = false;

  constructor() {
    this.#channel = new window.BroadcastChannel(mockFlywheelChannelName);
  }

  send(serializedMessage: string): void {
    if (!this.#disposed) this.#channel.postMessage(serializedMessage);
  }

  subscribe(listener: (serializedMessage: string) => void): () => void {
    if (this.#disposed) return () => undefined;
    const wrapper = (event: MessageEvent<unknown>): void => {
      if (typeof event.data === 'string') listener(event.data);
    };
    this.#listenerWrappers.set(listener, wrapper);
    this.#channel.addEventListener('message', wrapper);
    return () => {
      const registered = this.#listenerWrappers.get(listener);
      if (registered === undefined) return;
      this.#channel.removeEventListener('message', registered);
      this.#listenerWrappers.delete(listener);
    };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#listenerWrappers.forEach((wrapper) => this.#channel.removeEventListener('message', wrapper));
    this.#listenerWrappers.clear();
    this.#channel.close();
  }
}

/**
 * Mock 환경에서 Backend realtime fan-out을 흉내 내는 휘발성 transport다.
 * 영속 저장이나 인증을 제공하지 않으며 Real bundle에서는 조립되지 않는다.
 */
export function createBroadcastChannelFlywheelSyncTransport(): OwnedInMemoryFlywheelSyncTransport | null {
  if (typeof window === 'undefined' || typeof window.BroadcastChannel === 'undefined') return null;
  return new BroadcastChannelFlywheelSyncTransport();
}
