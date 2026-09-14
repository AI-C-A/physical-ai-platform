import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 경로는 셸 코드에 삽입하지 않고 위치 인수로 전달한다.
const script = `
set -eu
repository="$1"
if [ "$2" = win32 ]; then repository=$(wslpath -u "$repository"); fi
model_dir="$3"
if [ -z "$model_dir" ]; then model_dir="$HOME/4D-Humans"; fi
python="$4"
if [ -z "$python" ]; then python="$model_dir/.venv/bin/python"; fi
if [ ! -d "$model_dir" ]; then
  echo "4D Humans 폴더를 찾을 수 없습니다: $model_dir" >&2
  echo "Run 설정의 FOUR_D_HUMANS_DIR에 WSL/Linux 모델 폴더의 절대 경로를 지정해 주세요." >&2
  exit 1
fi
if [ ! -x "$python" ]; then
  echo "Python 환경을 찾을 수 없습니다: $python" >&2
  echo "Run 설정의 PERCEPTION_PYTHON에 4D Humans가 설치된 WSL/Linux Python의 절대 경로를 지정해 주세요." >&2
  exit 1
fi
cd "$model_dir"
export PERCEPTION_DEVICE=cuda:0 PYOPENGL_PLATFORM=egl PYTHONUNBUFFERED=1
exec "$python" "$repository/perception/server.py" --mode full-body --host 0.0.0.0 --port 8791
`;

function shellQuote(value) {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

export function getBodyAnalysisCommand({ platform = process.platform, env = process.env, repositoryDirectory = repositoryRoot } = {}) {
  // WSL의 명령행 재해석을 피하도록 스크립트와 인수를 표준 입력으로 전달한다.
  const parameters = [repositoryDirectory, platform, env.FOUR_D_HUMANS_DIR ?? '', env.PERCEPTION_PYTHON ?? ''];
  const input = `set -- ${parameters.map(shellQuote).join(' ')}\n${script}`;
  const distribution = env.PERCEPTION_WSL_DISTRO?.trim();
  return platform === 'win32'
    ? { command: 'wsl.exe', args: [...(distribution ? ['--distribution', distribution] : []), '--exec', '/bin/sh', '-s'], input }
    : { command: '/bin/sh', args: ['-s'], input };
}

function main() {
  if (process.platform === 'darwin') {
    console.error('4D Humans 실행 항목은 NVIDIA GPU가 있는 Windows(WSL) 또는 Linux에서 실행해 주세요.');
    process.exitCode = 1;
  } else {
    const launch = getBodyAnalysisCommand();
    const child = spawn(launch.command, launch.args, { stdio: ['pipe', 'inherit', 'inherit'] });
    child.stdin.on('error', (error) => {
      if (error.code !== 'EPIPE') console.error(`실행 스크립트를 전달하지 못했습니다: ${error.message}`);
    });
    child.stdin.end(launch.input);
    const stop = () => child.kill();
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    child.once('error', (error) => {
      console.error(`4D Humans 서버를 시작하지 못했습니다: ${error.message}`);
      process.exitCode = 1;
    });
    child.once('exit', (code) => {
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
      process.exitCode = code ?? 1;
    });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
