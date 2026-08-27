import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCameraConfigRequest,
  fetchCameraConfig,
  parseCameraConfig,
  summarizeCameraConfig,
} from './patrol-camera-smoke.mjs';

const validResponse = {
  wssUrl: 'wss://example.kinesisvideo.ap-northeast-2.amazonaws.com',
  httpsUrl: 'https://example.kinesisvideo.ap-northeast-2.amazonaws.com',
  channelArn: 'arn:aws:kinesisvideo:ap-northeast-2:123456789012:channel/example/1',
  awsRegion: 'ap-northeast-2',
  awsKey: 'TEST_ACCESS_KEY',
  awsSecretKey: 'TEST_SECRET_KEY',
};

test('공식 query와 header 이름으로 요청을 만든다', () => {
  const request = createCameraConfigRequest({
    origin: 'https://platform.example.test',
    apiKey: 'patrol-key',
    secret: 'patrol-secret',
    robotSerialNumber: 'ROBOT 01',
    cameraConfigPath: '/camera-config/',
  });

  assert.equal(
    request.url.href,
    'https://platform.example.test/camera-config/?robotSerialNumber=ROBOT+01',
  );
  assert.deepEqual(request.headers, {
    Accept: 'application/json',
    apiKey: 'patrol-key',
    secret: 'patrol-secret',
  });
});

test('비 HTTPS origin에는 비밀정보를 보내지 않는다', () => {
  assert.throws(
    () => createCameraConfigRequest({
      origin: 'http://example.com',
      apiKey: 'patrol-key',
      secret: 'patrol-secret',
      robotSerialNumber: 'ROBOT01',
      cameraConfigPath: '/camera-config/',
    }),
    /HTTPS/,
  );
});

test('필수 Kinesis 설정과 endpoint protocol을 검증한다', () => {
  assert.deepEqual(parseCameraConfig(validResponse), validResponse);
  assert.throws(
    () => parseCameraConfig({ ...validResponse, wssUrl: 'https://example.com' }),
    /wss:/,
  );
  assert.throws(
    () => parseCameraConfig({ ...validResponse, awsSecretKey: '' }),
    /awsSecretKey/,
  );
});

test('성공 요약에 AWS 자격 증명과 channel ARN을 노출하지 않는다', () => {
  const summary = JSON.stringify(summarizeCameraConfig(validResponse));
  assert.doesNotMatch(summary, /TEST_ACCESS_KEY|TEST_SECRET_KEY|123456789012/);
  assert.match(summary, /ap-northeast-2/);
});

test('오류 응답은 raw detail 없이 상태와 계약 code만 보고한다', async () => {
  await assert.rejects(
    () => fetchCameraConfig(
      {
        origin: 'https://platform.example.test',
        apiKey: 'patrol-key',
        secret: 'patrol-secret',
        robotSerialNumber: 'ROBOT01',
        cameraConfigPath: '/camera-config/',
      },
      {
        fetcher: async () => new Response(
          JSON.stringify({ code: 'ROBOT_ACCESS_DENIED', detail: '민감한 상세' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } },
        ),
      },
    ),
    (error) => {
      assert.match(error.message, /HTTP 403/);
      assert.match(error.message, /ROBOT_ACCESS_DENIED/);
      assert.doesNotMatch(error.message, /민감한 상세/);
      return true;
    },
  );
});
