import type { FlywheelEpisode } from './flywheel';

export function isEpisodeTransferComplete(episode: FlywheelEpisode): boolean {
  const binding = episode.humanDemonstration;
  return binding === null || binding.sourceBindings.every((source) => (
    !source.required || binding.collectorAcknowledgements.some((acknowledgement) => (
      acknowledgement.episodeId === episode.id
      && acknowledgement.sourceDeviceId === source.sourceDeviceId
      && acknowledgement.command === 'stop'
      && acknowledgement.state === 'acknowledged'
    ))
  ));
}
