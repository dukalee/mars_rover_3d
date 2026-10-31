// 명령 문자열 검증: L, R, M, C 대문자만 허용
export function validateCommand(input) {
  if (/^[LRMC]+$/.test(input)) {
    return { ok: true, commands: input.split('') };
  }
  if (input === '') {
    return { ok: false, error: '명령을 입력하세요.' };
  }
  return { ok: false, error: 'L, R, M, C 대문자만 입력할 수 있습니다.' };
}
