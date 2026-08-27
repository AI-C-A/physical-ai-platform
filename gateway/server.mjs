import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  createPatrolIntegration,
  GatewayError,
  parseRobotRegistrations,
} from './patrol-integration.mjs';
import { createKinesisViewerSession } from './kinesis-viewer-session.mjs';

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

export function createGatewayRequestHandler(integration) {
  return async (request, response) => {
    try {
      const method = request.method ?? 'GET';
      const url = new URL(request.url ?? '/', 'http://gateway.internal');
      if (method === 'GET' && url.pathname === `${apiBasePath}/robots`) {
        sendJson(response, 200, await integration.listRobots());
        return;
      }
      const statusMatch = url.pathname.match(
        new RegExp(`^${apiBasePath}/robots/([^/]+)/status$`),
      );
      if (method === 'GET' && statusMatch !== null) {
        sendJson(
          response,
          200,
          await integration.getRobotStatus(decodeURIComponent(statusMatch[1])),
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
  const port = Number(process.env.PATROL_GATEWAY_PORT ?? '8787');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PATROL_GATEWAY_PORT는 유효한 TCP port여야 합니다.');
  }
  const server = createServer(createGatewayRequestHandler(integration));
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
