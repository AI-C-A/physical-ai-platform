import { useMemo, useState } from 'react';
import { useFlywheelQuery } from '@/entities/flywheel';
import { formatBytes } from '@/shared/lib/format';
import { PageHeader } from '@/shared/ui/page-header';
import { SearchField } from '@/shared/ui/search-field';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { loadEpisodes } from './flywheel-loaders';
import { AsyncState, DetailLink } from './flywheel-page-shared';
import { formatDateTime, formatDuration } from './flywheel-page-utils';
import { getEpisodeStorageLabel } from './episode-presentation';

export function CollectedEpisodesPage() {
  const query = useFlywheelQuery(loadEpisodes);
  const [search, setSearch] = useState('');
  const rows = useMemo(() => query.status === 'ready' ? [...query.data]
    .filter((episode) => `${episode.name} ${episode.instruction}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.startedAtMs - a.startedAtMs) : [], [query, search]);
  return <div className="grid gap-6">
    <PageHeader title="수집 에피소드" description="에피소드별 저장 상태와 원본 데이터를 확인하세요." />
    <SearchField label="에피소드 검색" placeholder="이름 또는 작업 지시 검색" value={search} onValueChange={setSearch} />
    <AsyncState query={query} emptyMessage="수집된 에피소드가 없습니다.">
      {() => rows.length === 0 ? <p className="text-sm text-muted">검색 결과가 없습니다.</p> : <Table aria-label="수집 에피소드">
        <TableHeader><TableRow><TableHead>에피소드</TableHead><TableHead>작업 지시</TableHead><TableHead>시작 시각</TableHead><TableHead>길이</TableHead><TableHead>기록량</TableHead><TableHead>상태</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((episode) => <TableRow key={episode.id}>
          <TableCell><DetailLink to={`/mlops/episodes/${episode.id}`}>{episode.name}</DetailLink></TableCell>
          <TableCell>{episode.instruction}</TableCell><TableCell>{formatDateTime(episode.startedAtMs)}</TableCell>
          <TableCell>{episode.endedAtMs === null ? '녹화 중' : formatDuration(episode.endedAtMs - episode.startedAtMs)}</TableCell>
          <TableCell>{formatBytes(episode.bytesWritten)}</TableCell><TableCell>{getEpisodeStorageLabel(episode)}</TableCell>
        </TableRow>)}</TableBody>
      </Table>}
    </AsyncState>
  </div>;
}
