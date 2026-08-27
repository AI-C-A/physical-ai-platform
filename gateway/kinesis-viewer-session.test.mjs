import assert from 'node:assert/strict';
import test from 'node:test';

import { createKinesisViewerSession } from './kinesis-viewer-session.mjs';

const config = {
  wssUrl: 'wss://v-example.kinesisvideo.ap-northeast-2.amazonaws.com',
  httpsUrl: 'https://r-example.kinesisvideo.ap-northeast-2.amazonaws.com',
  channelArn: 'arn:aws:kinesisvideo:ap-northeast-2:123456789012:channel/example/1',
  awsRegion: 'ap-northeast-2',
  awsKey: 'AWS_ACCESS_KEY',
  awsSecretKey: 'AWS_SECRET_KEY',
};

test('VIEWER용 ICE 설정과 서명 URL만 브라우저 계약으로 반환한다', async () => {
  let destroyed = false;
  let commandInput;
  let signerInput;
  const result = await createKinesisViewerSession(config, {
    createClientId: () => 'viewer-1',
    createSignalingClient: () => ({
      async send(command) {
        commandInput = command.input;
        return {
          IceServerList: [{
            Uris: ['turn:turn.example.test:443'],
            Username: 'turn-user',
            Password: 'turn-password',
          }],
        };
      },
      destroy() {
        destroyed = true;
      },
    }),
    createSigner: (region, credentials) => ({
      async getSignedURL(endpoint, query) {
        signerInput = { region, credentials, endpoint, query };
        return 'wss://signed.example.test/?credential=temporary';
      },
    }),
  });

  assert.deepEqual(commandInput, {
    ChannelARN: config.channelArn,
    ClientId: 'viewer-1',
  });
  assert.deepEqual(signerInput.query, {
    'X-Amz-ChannelARN': config.channelArn,
    'X-Amz-ClientId': 'viewer-1',
  });
  assert.equal(signerInput.credentials.accessKeyId, 'AWS_ACCESS_KEY');
  assert.deepEqual(result, {
    clientId: 'viewer-1',
    channelArn: config.channelArn,
    region: 'ap-northeast-2',
    iceServers: [
      { urls: ['stun:stun.kinesisvideo.ap-northeast-2.amazonaws.com:443'] },
      {
        urls: ['turn:turn.example.test:443'],
        username: 'turn-user',
        credential: 'turn-password',
      },
    ],
    signedWssUrl: 'wss://signed.example.test/?credential=temporary',
  });
  assert.equal(destroyed, true);
  assert.doesNotMatch(JSON.stringify(result), /AWS_ACCESS_KEY|AWS_SECRET_KEY/);
});

test('잘못된 TURN 응답은 Viewer Session을 만들지 않는다', async () => {
  await assert.rejects(
    () => createKinesisViewerSession(config, {
      createClientId: () => 'viewer-1',
      createSignalingClient: () => ({
        send: async () => ({ IceServerList: [{ Uris: [] }] }),
        destroy() {},
      }),
      createSigner: () => ({ getSignedURL: async () => 'wss://signed.example.test' }),
    }),
    /ICE server/,
  );
});
