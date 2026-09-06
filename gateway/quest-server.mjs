import { createServer } from 'node:http';
import { createQuestRelayHandler } from './quest-relay.mjs';

const port = Number(process.env.QUEST_GATEWAY_PORT ?? '8787');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('QUEST_GATEWAY_PORT가 올바르지 않습니다.');
const handle = createQuestRelayHandler();
createServer(async (request, response) => {
  if (!await handle(request, response)) {
    response.writeHead(404);
    response.end();
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Quest 중계 서버: 127.0.0.1:${String(port)}`);
});
