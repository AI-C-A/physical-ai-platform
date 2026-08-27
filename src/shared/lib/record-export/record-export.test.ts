import { afterEach, describe, expect, it, vi } from 'vitest';

import { downloadTextFile, serializeCsv, serializeJson } from './record-export';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('record export', () => {
  it('CSV의 쉼표와 따옴표를 안전하게 이스케이프한다', () => {
    expect(serializeCsv([{ name: 'a,"b"', count: 2 }])).toContain('"a,""b"""');
  });

  it.each(['=1+1', '+SUM(A1:A2)', '-2+3', '@command', '\tformula', '\rformula', '\nformula', '＝1+1', '＋1', '－1', '＠command'])(
    '수식으로 해석될 수 있는 문자열 %s 앞에 작은따옴표를 붙인다',
    (value) => {
      expect(serializeCsv([{ value }])).toContain(`"'${value}"`);
    },
  );

  it('음수 숫자는 숫자 값으로 유지한다', () => {
    expect(serializeCsv([{ value: -12 }])).toContain('"-12"');
    expect(serializeCsv([{ value: -12 }])).not.toContain('"\'-12"');
  });

  it('레코드 행을 CRLF로 구분한다', () => {
    expect(serializeCsv([{ value: 'one' }, { value: 'two' }])).toContain(
      '"value"\r\n"one"\r\n"two"',
    );
  });

  it('JSON metadata 배열을 직렬화한다', () => {
    expect(JSON.parse(serializeJson([{ id: 'one' }]))).toEqual([{ id: 'one' }]);
  });

  it('배열 구조를 JSON과 CSV에서 가역적으로 보존한다', () => {
    const records = [{ tags: ['alpha|beta', 'gamma'] }];

    expect(JSON.parse(serializeJson(records))).toEqual(records);
    expect(serializeCsv(records)).toContain(
      '"[""alpha|beta"",""gamma""]"',
    );
  });

  it('다운로드 click이 실패해도 Object URL을 회수한다', () => {
    const createObjectUrl = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:test');
    const revokeObjectUrl = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('download blocked');
    });

    expect(() => downloadTextFile('records.json', '[]', 'application/json'))
      .toThrow('download blocked');
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:test');
  });
});
