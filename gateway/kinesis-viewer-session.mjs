import {
  GetIceServerConfigCommand,
  KinesisVideoSignalingClient,
} from '@aws-sdk/client-kinesis-video-signaling';
import { SigV4RequestSigner } from 'amazon-kinesis-video-streams-webrtc';
import { randomUUID } from 'node:crypto';

export async function createKinesisViewerSession(config, dependencies = {}) {
  const clientId = dependencies.createClientId?.() ?? randomUUID();
  const credentials = {
    accessKeyId: config.awsKey,
    secretAccessKey: config.awsSecretKey,
  };
  const signalingClient = dependencies.createSignalingClient?.({
    region: config.awsRegion,
    endpoint: config.httpsUrl,
    credentials,
  }) ?? new KinesisVideoSignalingClient({
    region: config.awsRegion,
    endpoint: config.httpsUrl,
    credentials,
  });

  try {
    const iceResponse = await signalingClient.send(
      new GetIceServerConfigCommand({
        ChannelARN: config.channelArn,
        ClientId: clientId,
      }),
    );
    const turnServers = (iceResponse.IceServerList ?? []).map((server) => {
      if (
        !Array.isArray(server.Uris)
        || server.Uris.length === 0
        || !server.Uris.every((uri) => typeof uri === 'string' && uri.trim() !== '')
        || typeof server.Username !== 'string'
        || server.Username.trim() === ''
        || typeof server.Password !== 'string'
        || server.Password.trim() === ''
      ) {
        throw new Error('Kinesis ICE server 응답이 올바르지 않습니다.');
      }
      return {
        urls: server.Uris,
        username: server.Username,
        credential: server.Password,
      };
    });
    const signer = dependencies.createSigner?.(config.awsRegion, credentials)
      ?? new SigV4RequestSigner(config.awsRegion, credentials);
    const signedWssUrl = await signer.getSignedURL(config.wssUrl, {
      'X-Amz-ChannelARN': config.channelArn,
      'X-Amz-ClientId': clientId,
    });
    return {
      clientId,
      channelArn: config.channelArn,
      region: config.awsRegion,
      iceServers: [
        { urls: [`stun:stun.kinesisvideo.${config.awsRegion}.amazonaws.com:443`] },
        ...turnServers,
      ],
      signedWssUrl,
    };
  } finally {
    signalingClient.destroy?.();
  }
}
