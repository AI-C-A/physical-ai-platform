import { useCallback } from 'react';

import {
  useCoordinatedCommand,
  type CoordinatedCommandSnapshot,
} from '@/shared/lib/command-coordinator';

import type { CaptureSession, CreateCaptureSessionInput } from './capture-session';
import { useCaptureOperationsPort } from './capture-operations-context';

export interface CaptureCommand<TResult, TInput> {
  readonly snapshot: CoordinatedCommandSnapshot<TResult, TInput>;
  readonly execute: (input: TInput) => Promise<TResult>;
  readonly reset: () => void;
}

export function useCreateCaptureSessionCommand(): CaptureCommand<
  CaptureSession,
  CreateCaptureSessionInput
> {
  const operations = useCaptureOperationsPort();
  const command = useCoordinatedCommand<
    CaptureSession,
    CreateCaptureSessionInput
  >(operations, 'create');
  const coordinate = command.execute;
  const execute = useCallback(
    (input: CreateCaptureSessionInput) => coordinate(
      input,
      () => operations.createSession(input),
    ),
    [coordinate, operations],
  );
  return { snapshot: command.snapshot, execute, reset: command.reset };
}

type CaptureSessionCommandKind = 'validate' | 'start' | 'stop';

export function useCaptureSessionCommand(
  sessionId: string | null,
  kind: CaptureSessionCommandKind,
): CaptureCommand<void, void> {
  const operations = useCaptureOperationsPort();
  const command = useCoordinatedCommand<void, void>(
    operations,
    `${kind}:${sessionId ?? 'no-session'}`,
  );
  const coordinate = command.execute;
  const execute = useCallback(async () => {
    if (sessionId === null) {
      throw new Error('수집 세션을 선택한 뒤 다시 시도하세요.');
    }
    return coordinate(undefined, async () => {
      if (kind === 'validate') {
        await operations.validateSession(sessionId);
        return;
      }
      if (kind === 'start') {
        await operations.startSession(sessionId);
        return;
      }
      await operations.stopSession(sessionId);
    });
  }, [coordinate, kind, operations, sessionId]);
  return { snapshot: command.snapshot, execute, reset: command.reset };
}
