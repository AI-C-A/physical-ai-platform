import { useCallback, useEffect, useRef, useState } from 'react';

import {
  downloadTextFile,
  serializeCsv,
  serializeJson,
  type ExportRecord,
} from './record-export';

export type RecordExportFormat = 'csv' | 'json';

interface StartRecordExportOptions {
  readonly baseFileName: string;
  readonly format: RecordExportFormat;
  readonly isCurrent?: () => boolean;
  readonly loadRecords: () => Promise<readonly ExportRecord[]>;
  readonly subscribeInvalidation?: (listener: () => void) => () => void;
}

interface RecordExportController {
  readonly error: string | null;
  readonly isExporting: boolean;
  readonly start: (options: StartRecordExportOptions) => Promise<void>;
}

function releaseInvalidationSubscription(
  unsubscribe: (() => void) | null | undefined,
): void {
  try {
    unsubscribe?.();
  } catch {
    // Adapter 해제 실패가 화면 이탈이나 다음 내보내기의 상태 정리를 막지 않게 한다.
  }
}

export function useRecordExport(): RecordExportController {
  const activeRef = useRef(true);
  const pendingRef = useRef(false);
  const invalidationUnsubscribeRef = useRef<(() => void) | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      const unsubscribe = invalidationUnsubscribeRef.current;
      invalidationUnsubscribeRef.current = null;
      releaseInvalidationSubscription(unsubscribe);
    };
  }, []);

  const start = useCallback(async ({
    baseFileName,
    format,
    isCurrent,
    loadRecords,
    subscribeInvalidation,
  }: StartRecordExportOptions): Promise<void> => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setIsExporting(true);
    setError(null);
    let invalidated = false;
    let unsubscribe: (() => void) | undefined;
    try {
      const assertCurrent = (): void => {
        if (invalidated || isCurrent?.() === false) {
          throw new Error('내보내는 동안 결과 집합이 변경되었습니다. 잠시 후 다시 시도하세요.');
        }
      };
      const unsubscribeInvalidation = subscribeInvalidation?.(() => {
        invalidated = true;
      });
      if (unsubscribeInvalidation !== undefined) {
        let released = false;
        unsubscribe = () => {
          if (released) return;
          released = true;
          if (invalidationUnsubscribeRef.current === unsubscribe) {
            invalidationUnsubscribeRef.current = null;
          }
          releaseInvalidationSubscription(unsubscribeInvalidation);
        };
        invalidationUnsubscribeRef.current = unsubscribe;
      }
      assertCurrent();
      const records = await loadRecords();
      if (!activeRef.current) return;
      assertCurrent();
      downloadTextFile(
        `${baseFileName}.${format}`,
        format === 'csv' ? serializeCsv(records) : serializeJson(records),
        format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json',
      );
    } catch (reason: unknown) {
      if (!activeRef.current) return;
      const detail = reason instanceof Error ? ` ${reason.message}` : '';
      setError(`내보내기에 실패했습니다.${detail}`);
    } finally {
      releaseInvalidationSubscription(unsubscribe);
      pendingRef.current = false;
      if (activeRef.current) setIsExporting(false);
    }
  }, []);

  return { error, isExporting, start };
}
