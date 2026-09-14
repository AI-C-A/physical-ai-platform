import { lazy, Suspense, useCallback, useState } from 'react';
import { loadQuestHandPoseViewer, type useFlywheelPort, useFlywheelQuery, type FlywheelEpisode } from '@/entities/flywheel';
import { PlaybackBar } from '@/shared/ui/playback-bar';
import { QueryFeedback } from '@/shared/ui/query-feedback';
import { Panel } from '@/shared/ui/panel';
import { getButtonClassName } from '@/shared/ui/button';
import { formatDuration } from './flywheel-page-utils';

const HandPoseViewer = lazy(async () => ({ default: (await loadQuestHandPoseViewer()).QuestHandPoseViewer }));

function RecordedPose({ episode }: { readonly episode: FlywheelEpisode }) {
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const load = useCallback((port: ReturnType<typeof useFlywheelPort>) => port.getEpisodeHandPoseAt(episode.id, position), [episode.id, position]);
  const query = useFlywheelQuery(load);
  const pose = query.status === 'ready' ? query.data : null;
  return <Panel title="손·머리 위치 원본">
    {query.status === 'error' ? <QueryFeedback kind="error" message={query.message} onRetry={query.retry} /> :
      <div className="h-80"><Suspense fallback={<QueryFeedback kind="loading" />}><HandPoseViewer handPose={pose} streamState="recorded" /></Suspense></div>}
    {pose?.viewerPose ? <p className="text-sm text-muted">머리 위치 (m): {pose.viewerPose.positionMeters.map((value) => value.toFixed(3)).join(', ')}</p> : null}
    <PlaybackBar durationMs={Math.max(1, (episode.endedAtMs ?? episode.startedAtMs) - episode.startedAtMs)} formatTime={formatDuration} label="손·머리 위치" positionMs={position} playing={playing} onPlayingChange={setPlaying} onPositionChange={setPosition} />
    <a className={getButtonClassName('secondary')} href={episode.rawFramesUrl} download>손·머리 원본 다운로드</a>
  </Panel>;
}

export function EpisodeRecordingPreview({ episode }: { readonly episode: FlywheelEpisode }) {
  const [failedVideos, setFailedVideos] = useState<readonly string[]>([]);
  if (!episode.rawFramesUrl) return null;
  return <div className="grid gap-6">
    {(episode.frameCount ?? 0) > 0 ? <RecordedPose key={episode.id} episode={episode} /> : <p className="text-sm text-muted">저장된 손·머리 위치 프레임이 없습니다.</p>}
    <div className="grid gap-6 lg:grid-cols-2">{episode.videos?.map((video) => <Panel key={video.id} title={video.label}>
      {video.status === 'completed' ? <>
        <video aria-label={`${video.label} 녹화 영상`} controls playsInline preload="metadata" className="max-h-96 w-full object-contain" src={video.url} onError={() => setFailedVideos((current) => current.includes(video.id) ? current : [...current, video.id])} />
        {failedVideos.includes(video.id) ? <p role="alert" className="text-sm text-negative">영상을 재생하지 못했습니다. 원본을 다운로드해 확인하세요.</p> : null}
        <a className={getButtonClassName('secondary')} href={`${video.url}&download=1`} download>영상 원본 다운로드</a>
      </> : <p className="text-sm text-muted">영상 전송이 완료되지 않았습니다.</p>}
    </Panel>)}</div>
  </div>;
}
