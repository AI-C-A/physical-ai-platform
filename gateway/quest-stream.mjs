import { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';

/** 실시간 프레임은 저장 대기열과 분리하며 느린 수신자에게 쌓지 않는다. */
export function createQuestStream({ authorize, isValid, snapshot, receive }) {
  const sockets = new Map();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32_768, perMessageDeflate: false });
  const send = (socket, value) => {
    if (socket.readyState !== 1) return;
    if (socket.bufferedAmount > 65_536) { socket.terminate(); return; }
    socket.send(JSON.stringify(value));
  };
  const sendSnapshot = (socket, client) => {
    if (!client.modern) { send(socket, snapshot(client.session)); return; }
    if (client.awaiting !== null || socket.bufferedAmount > 0) { client.dirty = true; return; }
    client.sequence += 1;
    client.awaiting = client.sequence;
    client.sentAt = Date.now();
    client.dirty = false;
    send(socket, { ...snapshot(client.session), streamProtocol: 2, snapshotSequence: client.sequence });
  };
  const publish = (session) => {
    for (const [socket, client] of sockets) {
      if (client.session === session && client.role === 'viewer') sendSnapshot(socket, client);
    }
  };
  const attach = (server) => {
    server.on('upgrade', (request, socket, head) => {
      if (request.url !== '/api/quest/stream' || wss.clients.size >= 256) { socket.destroy(); return; }
      wss.handleUpgrade(request, socket, head, (ws) => {
        const deadline = setTimeout(() => ws.close(1008, 'Authentication required'), 5_000);
        ws.on('error', () => ws.terminate());
        ws.on('close', () => {
          clearTimeout(deadline);
          const client = sockets.get(ws);
          sockets.delete(ws);
          if (client) for (const [other, peer] of sockets) {
            if (peer.modern && peer.session === client.session) send(other, { type: 'peer-left', peerId: client.id });
          }
        });
        ws.on('message', (data, binary) => {
          try {
            if (binary) throw new Error();
            const message = JSON.parse(data.toString());
            let client = sockets.get(ws);
            if (!client) {
              client = authorize(message);
              if (!client) throw new Error();
              Object.assign(client, { id: randomUUID(), modern: message.streamProtocol === 2,
                sequence: 0, awaiting: null, sentAt: 0, dirty: false });
              sockets.set(ws, client);
              clearTimeout(deadline);
              sendSnapshot(ws, client);
              if (client.modern) for (const [other, peer] of sockets) {
                if (other === ws || !peer.modern || peer.session !== client.session) continue;
                if (client.role === 'viewer' && peer.role === 'sender') send(other, { type: 'peer', peerId: client.id });
                if (client.role === 'sender' && peer.role === 'viewer') send(ws, { type: 'peer', peerId: peer.id });
              }
              return;
            }
            if (!isValid(client.session)) throw new Error();
            if (client.modern && message.type === 'snapshot-ack') {
              if (message.sequence === client.awaiting) {
                client.awaiting = null;
                if (client.dirty) sendSnapshot(ws, client);
              }
              return;
            }
            if (client.modern && message.type === 'signal') {
              const target = [...sockets].find(([, peer]) => peer.id === message.peerId
                && peer.session === client.session && peer.role !== client.role && peer.modern);
              if (!target || !message.signal || !['offer', 'answer', 'candidate'].includes(message.signal.type)) return;
              send(target[0], { type: 'signal', peerId: client.id, signal: message.signal });
              return;
            }
            if (client.role !== 'sender' || message.type !== 'frame') throw new Error();
            if (client.modern && !Number.isSafeInteger(message.sequence)) throw new Error();
            receive(client.session, message.observation);
            publish(client.session);
            if (client.modern) send(ws, { type: 'frame-ack', sequence: message.sequence });
          } catch { ws.close(1008, 'Invalid stream message'); }
        });
      });
    });
    // 센서가 멎어도 stale/offline 상태를 전달하고 만료된 인증을 폐기한다.
    const heartbeat = setInterval(() => {
      for (const [socket, client] of sockets) {
        if (!isValid(client.session)) socket.close(1008, 'Session expired');
        else if (client.awaiting !== null && Date.now() - client.sentAt > 3_000) socket.terminate();
        else sendSnapshot(socket, client);
      }
    }, 500);
    heartbeat.unref();
    server.on('close', () => {
      clearInterval(heartbeat);
      for (const socket of wss.clients) socket.terminate();
      wss.close();
    });
  };
  return { attach, publish };
}
