import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import { ToastContext } from './toast-context';

interface ToastMessage {
  readonly id: number;
  readonly message: string;
  readonly tone: 'success' | 'error';
}

export function ToastProvider({ children }: PropsWithChildren) {
  const [messages, setMessages] = useState<readonly ToastMessage[]>([]);
  const nextMessageIdRef = useRef(0);
  const removalTimersRef = useRef(new Set<number>());
  useEffect(() => () => {
    removalTimersRef.current.forEach((timerId) => globalThis.clearTimeout(timerId));
    removalTimersRef.current.clear();
  }, []);
  const showToast = useCallback((message: string, tone: ToastMessage['tone'] = 'success') => {
    nextMessageIdRef.current += 1;
    const id = nextMessageIdRef.current;
    setMessages((current) => [...current, { id, message, tone }]);
    const timerId = globalThis.setTimeout(() => {
      removalTimersRef.current.delete(timerId);
      setMessages((current) => current.filter((item) => item.id !== id));
    }, 3500);
    removalTimersRef.current.add(timerId);
  }, []);
  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed right-4 bottom-4 z-[70] grid max-w-sm gap-2">
        {messages.map((item) => (
          <div
            className={item.tone === 'error'
              ? 'rounded-md bg-status-negative-background p-3 text-sm text-status-negative-foreground shadow-lg'
              : 'rounded-md bg-status-positive-background p-3 text-sm text-status-positive-foreground shadow-lg'}
            key={item.id}
            role={item.tone === 'error' ? 'alert' : 'status'}
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
