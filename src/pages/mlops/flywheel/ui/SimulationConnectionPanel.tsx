import { useState, type FormEvent } from 'react';

import { normalizeSimulationRoom, SIMULATION_ROOM_MAX, simulationPageUrl } from '@/entities/simulation-collection';
import { Button, getButtonClassName } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

function RoomForm({ room, onRoomChange }: { readonly room: string; readonly onRoomChange: (room: string) => void }) {
  const [value, setValue] = useState(room);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onRoomChange(value);
  };
  return (
    <form className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2" onSubmit={submit}>
      <Input label="방 코드 바꾸기" maxLength={SIMULATION_ROOM_MAX} value={value} onChange={(event) => setValue(event.target.value)} />
      <Button disabled={normalizeSimulationRoom(value) === room} type="submit" variant="secondary">적용</Button>
    </form>
  );
}

/**
 * VR로 접속하는 안내. 헤드셋에서 주소를 열고 방 코드를 입력하면 그 방의 작업 화면이
 * 이 콘솔에 관전으로 뜬다. PC에서 직접 작업해 볼 수도 있다.
 */
export function SimulationConnectionPanel({ room, connected, participantCount, onRoomChange }: {
  readonly room: string;
  readonly connected: boolean;
  readonly participantCount: number;
  readonly onRoomChange: (room: string) => void;
}) {
  const questLink = simulationPageUrl(room, { spectate: false });
  const pcLink = simulationPageUrl(room, { name: 'PC' });
  return (
    <div className="simulation-connect grid gap-4">
      <div className="grid gap-1">
        <p className="text-xs font-medium text-muted">헤드셋 접속 방 코드</p>
        <output aria-label="방 코드" className="simulation-connect-code text-foreground">{room}</output>
        <p className="text-xs text-muted" role="status">
          {connected
            ? participantCount > 0 ? `참가자 ${String(participantCount)}명 연결됨` : '시뮬레이션 화면 연결됨 · 참가자 대기'
            : '아직 연결된 화면이 없습니다'}
        </p>
      </div>

      <ol className="grid list-decimal gap-1.5 pl-5 text-sm leading-6 text-muted">
        <li>Quest 브라우저에서 아래 주소를 엽니다.</li>
        <li>로비의 방 코드 입력란에 <span className="font-mono text-foreground">{room}</span>을 입력합니다(링크로 열면 자동 입력).</li>
        <li><strong className="text-foreground">VR로 입장</strong> 후 스테이션 받침대의 START 버튼으로 작업을 시작합니다.</li>
      </ol>

      <div className="grid gap-1">
        <p className="text-xs font-medium text-muted">헤드셋 접속 주소</p>
        <code aria-label="헤드셋 접속 주소" className="break-all text-sm text-foreground">{questLink}</code>
      </div>

      <div className="flex flex-wrap gap-2">
        <a className={getButtonClassName('secondary')} href={pcLink} rel="noreferrer" target="_blank">PC로도 참가</a>
        <a className={getButtonClassName('ghost')} href={questLink} rel="noreferrer" target="_blank">주소 새 창에서 열기</a>
      </div>

      <RoomForm key={room} room={room} onRoomChange={onRoomChange} />
    </div>
  );
}
