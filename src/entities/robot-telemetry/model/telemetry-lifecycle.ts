import type { RobotTelemetryPort } from './robot-telemetry-port';

const skippedConnection = Symbol('skipped telemetry connection');

interface ConnectionLeaseState {
  readonly epoch: number;
  readonly promise: Promise<void>;
  readonly reject: (reason: unknown) => void;
  readonly resolve: () => void;
  registered: boolean;
  released: boolean;
  settled: boolean;
}

export interface TelemetryConnectionLease {
  /** 연결 시도가 끝나거나 이 lease가 시작 전에 해제되면 종료된다. */
  readonly connected: Promise<void>;
  /** idempotent하며 마지막 활성 lease만 실제 Port 연결을 해제한다. */
  release(): void;
}

class TelemetryConnectionCoordinator {
  readonly #port: RobotTelemetryPort;
  readonly #leases = new Set<ConnectionLeaseState>();
  #connected = false;
  #connectionAttempt: Promise<void> | null = null;
  #connectionAttemptEpoch: number | null = null;
  #connectionAttemptStarted = false;
  #epoch = 0;

  constructor(port: RobotTelemetryPort) {
    this.#port = port;
  }

  acquire(): TelemetryConnectionLease {
    let resolvePromise: (() => void) | undefined;
    let rejectPromise: ((reason: unknown) => void) | undefined;
    const promise = new Promise<void>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    const lease: ConnectionLeaseState = {
      epoch: this.#epoch,
      promise,
      reject: (reason) => rejectPromise?.(reason),
      resolve: () => resolvePromise?.(),
      registered: true,
      released: false,
      settled: false,
    };
    this.#leases.add(lease);

    if (this.#connected) this.#resolve(lease);
    else this.#pump();

    return {
      connected: lease.promise,
      release: () => this.#release(lease),
    };
  }

  #pump(): void {
    if (
      this.#connected
      || this.#connectionAttempt !== null
      || !this.#hasLeaseForEpoch(this.#epoch)
    ) return;

    const attemptEpoch = this.#epoch;
    let started = false;
    const attempt = Promise.resolve()
      .then<Promise<void> | typeof skippedConnection>(() => {
        if (
          attemptEpoch !== this.#epoch
          || !this.#hasLeaseForEpoch(attemptEpoch)
        ) return skippedConnection;
        started = true;
        this.#connectionAttemptStarted = true;
        return this.#port.connect();
      })
      .then(
        (result) => {
          if (result === skippedConnection) return;
          if (
            attemptEpoch !== this.#epoch
            || !this.#hasLeaseForEpoch(attemptEpoch)
          ) {
            this.#disconnectSafely();
            this.#resolveReleasedLeases(attemptEpoch);
            return;
          }
          this.#connected = true;
          this.#leases.forEach((lease) => {
            if (lease.epoch !== attemptEpoch) return;
            this.#resolve(lease);
            if (!lease.registered) this.#leases.delete(lease);
          });
        },
        (reason: unknown) => {
          if (started) this.#disconnectSafely();
          if (attemptEpoch !== this.#epoch) {
            this.#resolveReleasedLeases(attemptEpoch);
            return;
          }
          this.#connected = false;
          [...this.#leases].forEach((lease) => {
            if (lease.epoch !== attemptEpoch) return;
            lease.registered = false;
            this.#leases.delete(lease);
            if (lease.released) this.#resolve(lease);
            else this.#reject(lease, reason);
          });
          this.#epoch += 1;
        },
      )
      .finally(() => {
        if (this.#connectionAttempt !== attempt) return;
        this.#connectionAttempt = null;
        this.#connectionAttemptEpoch = null;
        this.#connectionAttemptStarted = false;
        this.#pump();
      });
    this.#connectionAttempt = attempt;
    this.#connectionAttemptEpoch = attemptEpoch;
  }

  #release(lease: ConnectionLeaseState): void {
    if (lease.released) return;
    lease.released = true;
    if (!lease.registered) return;

    lease.registered = false;
    if (this.#hasActiveLease()) {
      this.#resolve(lease);
      this.#leases.delete(lease);
      return;
    }

    if (lease.epoch === this.#epoch) this.#epoch += 1;
    if (this.#connected) {
      this.#disconnectSafely();
      this.#connected = false;
      this.#resolve(lease);
      this.#leases.delete(lease);
      return;
    }
    if (
      this.#connectionAttemptStarted
      && this.#connectionAttemptEpoch === lease.epoch
    ) {
      this.#disconnectSafely();
      return;
    }
    this.#resolve(lease);
    this.#leases.delete(lease);
  }

  #hasLeaseForEpoch(epoch: number): boolean {
    return [...this.#leases].some((lease) => lease.registered && lease.epoch === epoch);
  }

  #disconnectSafely(): void {
    try {
      this.#port.disconnect();
    } catch {
      // 해제 실패가 lease 정산과 다음 연결 세대까지 막지 않게 격리한다.
    }
  }

  #hasActiveLease(): boolean {
    return [...this.#leases].some((lease) => lease.registered);
  }

  #resolveReleasedLeases(epoch: number): void {
    [...this.#leases].forEach((lease) => {
      if (lease.epoch !== epoch || !lease.released) return;
      this.#resolve(lease);
      this.#leases.delete(lease);
    });
  }

  #resolve(lease: ConnectionLeaseState): void {
    if (lease.settled) return;
    lease.settled = true;
    lease.resolve();
  }

  #reject(lease: ConnectionLeaseState, reason: unknown): void {
    if (lease.settled) return;
    lease.settled = true;
    lease.reject(reason);
  }
}

const coordinatorsByPort = new WeakMap<RobotTelemetryPort, TelemetryConnectionCoordinator>();

function getCoordinator(port: RobotTelemetryPort): TelemetryConnectionCoordinator {
  const current = coordinatorsByPort.get(port);
  if (current !== undefined) return current;
  const created = new TelemetryConnectionCoordinator(port);
  coordinatorsByPort.set(port, created);
  return created;
}

/** 같은 Port의 연결을 app scope에서 공유해 한 소비자의 stop이 다른 구독을 끊지 않게 한다. */
export function acquireTelemetryConnection(
  port: RobotTelemetryPort,
): TelemetryConnectionLease {
  return getCoordinator(port).acquire();
}
