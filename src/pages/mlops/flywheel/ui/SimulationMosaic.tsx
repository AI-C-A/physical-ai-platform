import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';

import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { Surface } from '@/shared/ui/surface';

export interface MosaicTile {
  readonly id: string;
  readonly title: string;
  readonly node: ReactNode;
  /** 헤더 오른쪽에 놓을 타일별 조작(예: 새로고침). */
  readonly actions?: ReactNode;
  /** 최대화/숨기기를 막을 타일(예: 항상 보여야 하는 것)을 위해 끌 수 있다. */
  readonly canMaximize?: boolean;
  readonly canHide?: boolean;
}

/**
 * 타일을 개수에 맞춰 자동 배치하고, 하나를 크게 보거나 안 보이게 숨길 수 있는 모자이크.
 *
 * 타일이 늘거나 줄면(숨김 포함) 열·행이 다시 잡히고, 최대화하면 그 타일만 꽉 채운다. 최대화·
 * 숨김 어느 쪽이든 타일을 언마운트하지 않고 감추기만 해서 iframe·카메라 스트림·캔버스가 다시
 * 로드되지 않는다. 숨긴 화면은 위 바에서 다시 불러온다. 세로로 긴 창에서는 한 열로 쌓인다.
 */
export function SimulationMosaic({ tiles }: { readonly tiles: readonly MosaicTile[] }) {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<readonly string[]>([]);

  const hidden = useMemo(() => new Set(hiddenIds.filter((id) => tiles.some((tile) => tile.id === id))), [hiddenIds, tiles]);
  const visibleTiles = tiles.filter((tile) => !hidden.has(tile.id));
  const focused = focusedId !== null && visibleTiles.some((tile) => tile.id === focusedId) ? focusedId : null;
  const hiddenTiles = tiles.filter((tile) => hidden.has(tile.id));

  const count = Math.max(1, visibleTiles.length);
  const columns = focused !== null ? 1 : Math.min(3, Math.ceil(Math.sqrt(count)));
  const rows = focused !== null ? 1 : Math.ceil(count / columns);
  const style = { '--mosaic-columns': columns, '--mosaic-rows': rows } as CSSProperties;

  const hide = (id: string) => {
    setHiddenIds((current) => (current.includes(id) ? current : [...current, id]));
    setFocusedId((current) => (current === id ? null : current));
  };
  const show = (id: string) => setHiddenIds((current) => current.filter((item) => item !== id));

  return (
    <div className="simulation-mosaic-wrap">
      {hiddenTiles.length === 0 ? null : (
        <div className="simulation-mosaic-bar" role="group" aria-label="숨긴 화면">
          <span className="text-xs text-muted">숨긴 화면</span>
          {hiddenTiles.map((tile) => (
            <Button key={tile.id} aria-label={`${tile.title} 다시 보기`} className="min-h-0 gap-1 px-2 py-1 text-xs" onClick={() => show(tile.id)} variant="secondary">
              <Icon name="play" />{tile.title}
            </Button>
          ))}
        </div>
      )}

      <div className="simulation-mosaic" data-focused={focused !== null} style={style} aria-label="시뮬레이션 수집 화면 배치">
        {tiles.map((tile) => {
          const isFocused = focused === tile.id;
          const canMaximize = tile.canMaximize !== false;
          const canHide = tile.canHide !== false;
          const isHidden = hidden.has(tile.id) || (focused !== null && !isFocused);
          return (
            <Surface
              key={tile.id}
              as="section"
              layer="raised"
              aria-label={tile.title}
              className="simulation-tile"
              data-tile={tile.id}
              hidden={isHidden}
            >
              <header className="simulation-tile-header">
                <h3 className="min-w-0 truncate text-sm font-semibold">{tile.title}</h3>
                <div className="flex shrink-0 items-center gap-1">
                  {tile.actions}
                  {canMaximize ? (
                    <Button
                      aria-label={isFocused ? `${tile.title} 원래대로` : `${tile.title} 크게 보기`}
                      className="size-8 min-h-0 p-0"
                      onClick={() => setFocusedId(isFocused ? null : tile.id)}
                      title={isFocused ? '원래대로' : '크게 보기'}
                      variant="ghost"
                    >
                      <Icon name={isFocused ? 'minimize' : 'maximize'} />
                    </Button>
                  ) : null}
                  {canHide && visibleTiles.length > 1 ? (
                    <Button
                      aria-label={`${tile.title} 숨기기`}
                      className="size-8 min-h-0 p-0"
                      onClick={() => hide(tile.id)}
                      title="숨기기"
                      variant="ghost"
                    >
                      <Icon name="close" />
                    </Button>
                  ) : null}
                </div>
              </header>
              <div className="simulation-tile-body">{tile.node}</div>
            </Surface>
          );
        })}
      </div>

      {focused === null ? null : (
        <div className="simulation-mosaic-rail" role="group" aria-label="화면 전환">
          {visibleTiles.filter((tile) => tile.id !== focused && tile.canMaximize !== false).map((tile) => (
            <Button key={tile.id} className="min-h-0 px-3 py-1 text-xs" onClick={() => setFocusedId(tile.id)} variant="secondary">
              {tile.title}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
