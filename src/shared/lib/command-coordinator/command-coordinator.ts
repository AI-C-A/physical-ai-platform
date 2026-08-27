import { useCallback, useSyncExternalStore } from 'react';

type CommandKey = string;

export type CoordinatedCommandSnapshot<TResult, TInput = void> =
  | {
      readonly status: 'idle';
      readonly revision: number;
      readonly lastSuccess: {
        readonly operationId: number;
        readonly result: TResult;
      } | null;
    }
  | {
      readonly status: 'pending';
      readonly operationId: number;
      readonly promise: Promise<TResult>;
      readonly submittedInput: TInput;
    }
  | { readonly status: 'success'; readonly operationId: number; readonly result: TResult }
  | {
      readonly status: 'error';
      readonly operationId: number;
      readonly message: string;
      readonly submittedInput: TInput;
    };

interface StoredCommandState {
  snapshot: CoordinatedCommandSnapshot<unknown, unknown>;
  readonly listeners: Set<() => void>;
}

const idleSnapshot: CoordinatedCommandSnapshot<unknown, unknown> = {
  status: 'idle',
  revision: 0,
  lastSuccess: null,
};
const maxRetainedTerminalStates = 32;

function getErrorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : '작업을 완료하지 못했습니다.';
}

class ScopedCommandCoordinator {
  readonly #states = new Map<CommandKey, StoredCommandState>();
  #nextOperationId = 0;

  getSnapshot<TResult, TInput>(key: CommandKey): CoordinatedCommandSnapshot<TResult, TInput> {
    return (this.#states.get(key)?.snapshot ?? idleSnapshot) as CoordinatedCommandSnapshot<
      TResult,
      TInput
    >;
  }

  subscribe(key: CommandKey, listener: () => void): () => void {
    const state = this.#getOrCreateState(key);
    state.listeners.add(listener);
    return () => {
      state.listeners.delete(listener);
      if (
        state.listeners.size === 0
        && state.snapshot.status === 'idle'
        && state.snapshot.lastSuccess === null
      ) {
        this.#states.delete(key);
      } else if (state.listeners.size === 0 && state.snapshot.status !== 'pending') {
        this.#retainRecentTerminal(key);
      }
    };
  }

  execute<TResult, TInput>(
    key: CommandKey,
    submittedInput: TInput,
    operation: () => Promise<TResult>,
  ): Promise<TResult> {
    const current = this.getSnapshot<TResult, TInput>(key);
    if (current.status === 'pending') return current.promise;
    if (current.status === 'success') return Promise.resolve(current.result);

    this.#nextOperationId += 1;
    const operationId = this.#nextOperationId;
    const promise = Promise.resolve().then(operation);
    this.#setSnapshot(key, {
      status: 'pending',
      operationId,
      promise,
      submittedInput,
    });
    void promise.then(
      (result) => {
        const latest = this.getSnapshot<TResult, TInput>(key);
        if (latest.status === 'pending' && latest.promise === promise) {
          this.#setSnapshot(key, { status: 'success', operationId, result });
          this.#retainRecentTerminal(key);
        }
      },
      (reason: unknown) => {
        const latest = this.getSnapshot<TResult, TInput>(key);
        if (latest.status === 'pending' && latest.promise === promise) {
          this.#setSnapshot(key, {
            status: 'error',
            operationId,
            message: getErrorMessage(reason),
            submittedInput,
          });
          this.#retainRecentTerminal(key);
        }
      },
    );
    return promise;
  }

  reset(key: CommandKey, retainSuccess: boolean): void {
    const current = this.getSnapshot(key);
    if (current.status === 'pending' || current.status === 'idle') return;
    this.#setSnapshot(key, {
      status: 'idle',
      revision: current.operationId,
      lastSuccess: retainSuccess && current.status === 'success'
        ? { operationId: current.operationId, result: current.result }
        : null,
    });
  }

  clearLastSuccess(key: CommandKey): void {
    const current = this.getSnapshot(key);
    if (current.status !== 'idle' || current.lastSuccess === null) return;
    this.#setSnapshot(key, {
      status: 'idle',
      revision: current.revision,
      lastSuccess: null,
    });
  }

  #getOrCreateState(key: CommandKey): StoredCommandState {
    const current = this.#states.get(key);
    if (current !== undefined) return current;
    const created: StoredCommandState = {
      snapshot: idleSnapshot,
      listeners: new Set(),
    };
    this.#states.set(key, created);
    return created;
  }

  #setSnapshot<TResult, TInput>(
    key: CommandKey,
    snapshot: CoordinatedCommandSnapshot<TResult, TInput>,
  ): void {
    const state = this.#getOrCreateState(key);
    state.snapshot = snapshot;
    state.listeners.forEach((listener) => listener());
  }

  #retainRecentTerminal(key: CommandKey): void {
    const state = this.#states.get(key);
    if (state === undefined || state.listeners.size > 0) return;
    this.#states.delete(key);
    this.#states.set(key, state);

    const retainedKeys = [...this.#states.entries()]
      .filter(([, candidate]) => (
        candidate.listeners.size === 0
        && candidate.snapshot.status !== 'pending'
        && (candidate.snapshot.status !== 'idle' || candidate.snapshot.lastSuccess !== null)
      ))
      .map(([candidateKey]) => candidateKey);
    while (retainedKeys.length > maxRetainedTerminalStates) {
      const oldestKey = retainedKeys.shift();
      if (oldestKey !== undefined) this.#states.delete(oldestKey);
    }
  }
}

const coordinatorsByScope = new WeakMap<object, ScopedCommandCoordinator>();

function getScopedCommandCoordinator(scope: object): ScopedCommandCoordinator {
  const current = coordinatorsByScope.get(scope);
  if (current !== undefined) return current;
  const created = new ScopedCommandCoordinator();
  coordinatorsByScope.set(scope, created);
  return created;
}

export interface CoordinatedCommand<TResult, TInput = void> {
  readonly snapshot: CoordinatedCommandSnapshot<TResult, TInput>;
  readonly clearLastSuccess: () => void;
  readonly execute: (
    submittedInput: TInput,
    operation: () => Promise<TResult>,
  ) => Promise<TResult>;
  readonly reset: (options?: CoordinatedCommandResetOptions) => void;
}

export interface CoordinatedCommandResetOptions {
  readonly retainSuccess?: boolean;
}

/**
 * Port 인스턴스를 scope로 사용해 route remount 사이에도 같은 command를 공유한다.
 * 같은 scope와 key는 항상 같은 결과 타입과 업무 의미를 사용해야 한다.
 */
export function useCoordinatedCommand<TResult, TInput = void>(
  scope: object,
  key: CommandKey,
): CoordinatedCommand<TResult, TInput> {
  const coordinator = getScopedCommandCoordinator(scope);
  const subscribe = useCallback(
    (listener: () => void) => coordinator.subscribe(key, listener),
    [coordinator, key],
  );
  const getSnapshot = useCallback(
    () => coordinator.getSnapshot<TResult, TInput>(key),
    [coordinator, key],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const execute = useCallback(
    (submittedInput: TInput, operation: () => Promise<TResult>) => coordinator.execute(
      key,
      submittedInput,
      operation,
    ),
    [coordinator, key],
  );
  const reset = useCallback(
    (resetOptions?: CoordinatedCommandResetOptions) => coordinator.reset(
      key,
      resetOptions?.retainSuccess ?? false,
    ),
    [coordinator, key],
  );
  const clearLastSuccess = useCallback(
    () => coordinator.clearLastSuccess(key),
    [coordinator, key],
  );
  return { snapshot, clearLastSuccess, execute, reset };
}
