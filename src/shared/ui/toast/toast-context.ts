import { createContext, useContext, type ReactNode } from 'react';

export interface ToastContextValue {
  readonly showToast: (message: ReactNode, tone?: 'success' | 'error') => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (context === null) throw new Error('ToastProvider 안에서 useToast를 사용해야 합니다.');
  return context;
}
