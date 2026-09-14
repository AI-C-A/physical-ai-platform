import { Button } from '@/shared/ui/button';

export function CollectionEmptyState({ onConnect, showConnect = true }: { readonly onConnect: () => void; readonly showConnect?: boolean }) {
  return (
    <section aria-label="수집 장치 연결 안내" className="grid h-full min-h-0 place-items-center overflow-auto rounded-[var(--design-radius-surface)] bg-layer p-6 sm:p-10">
      <div className="w-full max-w-sm">
        <h2 className="text-lg font-semibold text-foreground">장치를 연결해 수집을 준비하세요</h2>
        <p className="mt-2 text-sm leading-6 text-muted">Quest나 카메라를 연결하면 이곳에 실시간 미리보기가 표시됩니다.</p>
        {showConnect ? <Button className="mt-6" onClick={onConnect}>장치 연결</Button> : null}
      </div>
    </section>
  );
}
