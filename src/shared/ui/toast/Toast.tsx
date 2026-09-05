import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from 'react';

import { ToastContext } from './toast-context';
import { ToastItem } from './ToastItem';
import { ToastViewport } from './ToastViewport';

const MAX_VISIBLE_TOASTS = 3;

interface ToastMessage {
  readonly id: number;
  readonly message: ReactNode;
  readonly tone: 'success' | 'error';
}

export function ToastProvider({ children }: PropsWithChildren) {
  const [messages, setMessages] = useState<readonly ToastMessage[]>([]);
  const toastIdPrefix = useId();
  const nextMessageIdRef = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setMessages((current) => current.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback((message: ReactNode, tone: ToastMessage['tone'] = 'success') => {
    nextMessageIdRef.current += 1;
    const id = nextMessageIdRef.current;
    setMessages((current) => (
      [...current, { id, message, tone }].slice(-MAX_VISIBLE_TOASTS)
    ));
  }, []);
  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport>
        {messages.map((item) => {
          const messageId = `${toastIdPrefix}-message-${String(item.id)}`;
          return (
            <div
              className="min-w-0"
              data-toast-layout-id={item.id}
              key={item.id}
            >
              <ToastItem
                id={item.id}
                message={item.message}
                messageId={messageId}
                onDismiss={dismissToast}
                tone={item.tone}
              />
            </div>
          );
        })}
      </ToastViewport>
    </ToastContext.Provider>
  );
}
