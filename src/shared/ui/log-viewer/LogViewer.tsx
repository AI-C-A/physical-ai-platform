interface LogViewerProps {
  readonly lines: readonly string[];
}

export function LogViewer({ lines }: LogViewerProps) {
  return (
    <div aria-label="실행 로그" className="max-h-72 overflow-auto rounded-[var(--design-radius-control)] bg-layer-canvas p-4 font-mono text-xs leading-6 text-foreground" role="log">
      {lines.length === 0 ? <p className="text-muted">아직 로그가 없습니다.</p> : lines.map((line, index) => (
        <p key={`${String(index)}-${line}`}><span className="text-info">{String(index + 1).padStart(3, '0')}</span> {line}</p>
      ))}
    </div>
  );
}
