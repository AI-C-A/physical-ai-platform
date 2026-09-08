import { useEffect, useRef, useState } from 'react';

import type { QuestLivePreviewPort, QuestLiveSession, QuestLiveSnapshot } from '@/entities/hand-pose';

export function useQuestLiveMonitor(port: QuestLivePreviewPort) {
  const [session, setSession] = useState<QuestLiveSession | null>(null);
  const [snapshot, setSnapshot] = useState<QuestLiveSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const currentSession = useRef<QuestLiveSession | null>(null);
  const mounted = useRef(false);
  const busy = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    mounted.current = true;
    const release = (): void => {
      generation.current += 1;
      const current = currentSession.current;
      currentSession.current = null;
      if (current !== null) void port.closeSession(current).catch(() => undefined);
    };
    const onPageHide = (): void => {
      release();
      setSession(null);
      setSnapshot(null);
    };
    globalThis.addEventListener('pagehide', onPageHide);
    return () => {
      mounted.current = false;
      globalThis.removeEventListener('pagehide', onPageHide);
      release();
    };
  }, [port]);

  useEffect(() => {
    if (session === null) return;
    const controller = new AbortController();
    let lastPushAt = -Infinity;
    const unsubscribe = port.subscribeSession?.(session, (next) => {
      if (controller.signal.aborted) return;
      lastPushAt = Date.now();
      setSnapshot(next);
      setError(null);
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async (): Promise<void> => {
      if (controller.signal.aborted) return;
      if (Date.now() >= session.expiresAtMs) {
        unsubscribe?.();
        setSnapshot(null);
        setError('연결 시간이 만료되었습니다. 새 연결 코드를 만드세요.');
        return;
      }
      let delayMs = 100;
      try {
        if (Date.now() - lastPushAt < 1_000) {
          timer = setTimeout(() => void poll(), 500);
          return;
        }
        const pushAtStart = lastPushAt;
        const next = await port.readSession(session, controller.signal);
        if (controller.signal.aborted) return;
        if (pushAtStart === lastPushAt) setSnapshot(next);
        setError(null);
      } catch {
        if (controller.signal.aborted) return;
        setSnapshot(null);
        setError('손 데이터를 받지 못했습니다. 서버 연결을 확인하세요. 자동으로 다시 연결합니다.');
        delayMs = 1_000;
      }
      if (!controller.signal.aborted) timer = setTimeout(() => void poll(), delayMs);
    };
    void poll();
    return () => {
      controller.abort();
      unsubscribe?.();
      clearTimeout(timer);
    };
  }, [port, session]);

  async function create(): Promise<void> {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    const attempt = generation.current;
    try {
      const next = await port.createSession();
      if (!mounted.current || generation.current !== attempt) {
        await port.closeSession(next).catch(() => undefined);
        return;
      }
      const previous = currentSession.current;
      currentSession.current = next;
      setSession(next);
      setSnapshot(null);
      if (previous !== null) void port.closeSession(previous).catch(() => undefined);
    } catch {
      if (mounted.current) setError('연결 코드를 만들지 못했습니다. 손 추적 서버가 실행 중인지 확인하고 다시 시도하세요.');
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }

  async function close(): Promise<void> {
    const current = currentSession.current;
    if (current === null || busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      await port.closeSession(current);
      if (!mounted.current) return;
      currentSession.current = null;
      setSession(null);
      setSnapshot(null);
      setError(null);
    } catch {
      if (mounted.current) setError('연결을 종료하지 못했습니다. 다시 시도하세요.');
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }

  return { session, snapshot, error, pending, create, close };
}
