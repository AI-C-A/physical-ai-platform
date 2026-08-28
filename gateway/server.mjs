import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  createPatrolIntegration,
  GatewayError,
  parseRobotRegistrations,
} from './patrol-integration.mjs';
import { createKinesisViewerSession } from './kinesis-viewer-session.mjs';
import { createRobotEventLog } from './robot-event-log.mjs';
import { createStatusPollingService } from './status-polling.mjs';

const apiBasePath = '/api/integrations/patrol';

function sendJson(response, status, value) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(value));
}

function sendError(response, error) {
  const normalized = error instanceof GatewayError
    ? error
    : new GatewayError(500, 'INTERNAL_ERROR', '연동 게이트웨이 요청을 처리하지 못했습니다.');
  sendJson(response, normalized.status, {
    code: normalized.code,
    message: normalized.message,
  });
}

function parseStatusPollInterval(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('PATROL_STATUS_POLL_INTERVAL_MS 환경변수가 필요합니다.');
  }
  const intervalMs = Number(value);
  if (!Number.isInteger(intervalMs) || intervalMs < 1 || intervalMs > 2_147_483_647) {
    throw new Error('PATROL_STATUS_POLL_INTERVAL_MS는 Node.js timer 범위 안의 양의 정수여야 합니다.');
  }
  return intervalMs;
}

export function parseBatteryLowThreshold(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('PATROL_EVENT_BATTERY_LOW_THRESHOLD 환경변수가 필요합니다.');
  }
  const threshold = Number(value);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    throw new Error('PATROL_EVENT_BATTERY_LOW_THRESHOLD는 0 이상 100 이하의 숫자여야 합니다.');
  }
  return threshold;
}

const robotEventTypes = new Set(['info', 'warning', 'error']);

function readSingleEventQueryValue(url, name) {
  const values = url.searchParams.getAll(name);
  if (values.length > 1) {
    throw new GatewayError(400, 'INVALID_EVENT_QUERY', '이벤트 조회 조건이 올바르지 않습니다.');
  }
  return values[0] ?? null;
}

function readPositiveEventQueryInteger(url, name, defaultValue, maximum) {
  const raw = readSingleEventQueryValue(url, name);
  if (raw === null) return defaultValue;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new GatewayError(400, 'INVALID_EVENT_QUERY', '이벤트 페이지 조건이 올바르지 않습니다.');
  }
  return value;
}

function readRobotEventQuery(url) {
  const type = readSingleEventQueryValue(url, 'type');
  if (type !== null && !robotEventTypes.has(type)) {
    throw new GatewayError(400, 'INVALID_EVENT_QUERY', '지원하지 않는 이벤트 유형입니다.');
  }
  const robotIdValue = readSingleEventQueryValue(url, 'robotId');
  const robotId = robotIdValue === null ? null : robotIdValue.trim();
  if (robotId === '') {
    throw new GatewayError(400, 'INVALID_EVENT_QUERY', 'Robot ID가 올바르지 않습니다.');
  }
  const startMsValue = readSingleEventQueryValue(url, 'startMs');
  const startMs = startMsValue === null ? null : Number(startMsValue);
  if (startMs !== null && (!Number.isFinite(startMs) || startMs < 0)) {
    throw new GatewayError(400, 'INVALID_EVENT_QUERY', '이벤트 시작 시각이 올바르지 않습니다.');
  }
  return {
    page: readPositiveEventQueryInteger(url, 'page', 1, Number.MAX_SAFE_INTEGER),
    pageSize: readPositiveEventQueryInteger(url, 'pageSize', 20, 100),
    robotId,
    startMs,
    type,
  };
}

function readStatusStreamRobotIds(url) {
  const robotIds = [...new Set(url.searchParams.getAll('robotId').map((value) => value.trim()))];
  if (robotIds.length === 0 || robotIds.some((robotId) => robotId === '')) {
    throw new GatewayError(400, 'ROBOT_IDS_REQUIRED', '상태 stream에는 Robot ID가 필요합니다.');
  }
  return robotIds;
}

function writeStatusEvent(response, event) {
  response.write(
    `id: ${event.id}\n`
    + `event: ${event.type}\n`
    + `data: ${JSON.stringify(event.data)}\n\n`,
  );
}

function openStatusStream(request, response, url, statusPolling) {
  const robotIds = readStatusStreamRobotIds(url);
  response.writeHead(200, {
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream; charset=utf-8',
    'X-Accel-Buffering': 'no',
    'X-Content-Type-Options': 'nosniff',
  });
  response.flushHeaders?.();

  let closed = false;
  const unsubscribes = [];
  const close = () => {
    if (closed) return;
    closed = true;
    for (const unsubscribe of unsubscribes) unsubscribe();
  };
  request.on('close', close);
  response.on?.('close', close);

  for (const robotId of robotIds) {
    unsubscribes.push(statusPolling.subscribe(robotId, (event) => {
      if (!closed) writeStatusEvent(response, event);
    }));
  }
}

function writeRobotEvent(response, event) {
  response.write(
    `id: ${event.id}\n`
    + 'event: event-created\n'
    + `data: ${JSON.stringify(event)}\n\n`,
  );
}

function openRobotEventStream(request, response, eventLog) {
  response.writeHead(200, {
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream; charset=utf-8',
    'X-Accel-Buffering': 'no',
    'X-Content-Type-Options': 'nosniff',
  });
  response.flushHeaders?.();

  let closed = false;
  const unsubscribe = eventLog.subscribe((event) => {
    if (!closed) writeRobotEvent(response, event);
  });
  const close = () => {
    if (closed) return;
    closed = true;
    unsubscribe();
  };
  request.on('close', close);
  response.on?.('close', close);
}

export function createGatewayRequestHandler(integration, options = {}) {
  const eventLog = options.eventLog;
  const statusPolling = options.statusPolling;
  return async (request, response) => {
    try {
      const method = request.method ?? 'GET';
      const url = new URL(request.url ?? '/', 'http://gateway.internal');
      if (method === 'GET' && url.pathname === `${apiBasePath}/robots`) {
        sendJson(response, 200, await integration.listRobots());
        return;
      }
      if (method === 'GET' && url.pathname === `${apiBasePath}/events/stream`) {
        if (eventLog === undefined) {
          throw new GatewayError(503, 'EVENT_LOG_UNAVAILABLE', '이벤트 로그를 사용할 수 없습니다.');
        }
        openRobotEventStream(request, response, eventLog);
        return;
      }
      if (method === 'GET' && url.pathname === `${apiBasePath}/events`) {
        if (eventLog === undefined) {
          throw new GatewayError(503, 'EVENT_LOG_UNAVAILABLE', '이벤트 로그를 사용할 수 없습니다.');
        }
        sendJson(response, 200, eventLog.queryEvents(readRobotEventQuery(url)));
        return;
      }
      if (method === 'GET' && url.pathname === `${apiBasePath}/robot-status/events`) {
        if (statusPolling === undefined) {
          throw new GatewayError(503, 'STATUS_STREAM_UNAVAILABLE', '상태 stream을 사용할 수 없습니다.');
        }
        openStatusStream(request, response, url, statusPolling);
        return;
      }
      const statusMatch = url.pathname.match(
        new RegExp(`^${apiBasePath}/robots/([^/]+)/status$`),
      );
      if (method === 'GET' && statusMatch !== null) {
        const robotId = decodeURIComponent(statusMatch[1]);
        sendJson(
          response,
          200,
          await (statusPolling === undefined
            ? integration.getRobotStatus(robotId)
            : statusPolling.getStatus(robotId)),
        );
        return;
      }
      const viewerMatch = url.pathname.match(
        new RegExp(`^${apiBasePath}/robots/([^/]+)/camera-viewer-session$`),
      );
      if (method === 'POST' && viewerMatch !== null) {
        sendJson(
          response,
          200,
          await integration.createCameraViewerSession(decodeURIComponent(viewerMatch[1])),
        );
        return;
      }
      sendJson(response, 404, { code: 'ROUTE_NOT_FOUND', message: '요청 경로를 찾지 못했습니다.' });
    } catch (error) {
      sendError(response, error);
    }
  };
}

export function createGatewayFromEnvironment(environment = process.env) {
  return createPatrolIntegration({
    origin: environment.PATROL_ORIGIN,
    apiKey: environment.PATROL_API_KEY,
    secret: environment.PATROL_API_SECRET,
    cameraConfigPath: environment.PATROL_CAMERA_CONFIG_PATH,
    registrations: parseRobotRegistrations(environment.PATROL_ROBOTS_JSON),
    createViewerSession: createKinesisViewerSession,
  });
}

async function main() {
  const integration = createGatewayFromEnvironment();
  const statusPolling = createStatusPollingService({
    loadStatus: (robotId) => integration.getRobotStatus(robotId),
    pollIntervalMs: parseStatusPollInterval(process.env.PATROL_STATUS_POLL_INTERVAL_MS),
  });
  const eventLog = createRobotEventLog({
    batteryLowThreshold: parseBatteryLowThreshold(
      process.env.PATROL_EVENT_BATTERY_LOW_THRESHOLD,
    ),
    statusPolling,
  });
  eventLog.start(
    parseRobotRegistrations(process.env.PATROL_ROBOTS_JSON).map((registration) => registration.id),
  );
  const port = Number(process.env.PATROL_GATEWAY_PORT ?? '8787');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PATROL_GATEWAY_PORT는 유효한 TCP port여야 합니다.');
  }
  const server = createServer(createGatewayRequestHandler(integration, { eventLog, statusPolling }));
  server.on('close', () => {
    eventLog.dispose();
    statusPolling.dispose();
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Patrol 연동 게이트웨이가 127.0.0.1:${String(port)}에서 시작되었습니다.`);
  });
}

const executedPath = process.argv[1];
if (executedPath !== undefined && pathToFileURL(resolve(executedPath)).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : '연동 게이트웨이를 시작하지 못했습니다.');
    process.exitCode = 1;
  });
}
