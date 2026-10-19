"""Offline checks for the paired firmware. Never connects to either board."""
from pathlib import Path
import os
import re
import shutil
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parent
motor = root / 'NIU_Throttle_Comms_v4_3'
esp = root / 'NIU_ESP_Comms_v4_3'
compiler = os.environ.get('CXX') or shutil.which('g++')
if not compiler:
    raise SystemExit('Install a C++17 compiler and put g++ on PATH, or set CXX to its full path.')
env = os.environ.copy()
env['PATH'] = str(Path(compiler).resolve().parent) + os.pathsep + env.get('PATH', '')
env['PYTHONDONTWRITEBYTECODE'] = '1'

def run(args):
    subprocess.run([str(arg) for arg in args], check=True, env=env, cwd=root)

def extract_function(source, name):
    match = re.search(r'^(?:static )?[\w:<>&* ]+\b' + re.escape(name) + r'\(', source, re.M)
    if not match:
        raise AssertionError('Missing function: ' + name)
    end = source.index('{', match.end()) + 1
    depth = 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[match.start():end]

with tempfile.TemporaryDirectory(prefix='matrix2-native-') as folder:
    build = Path(folder)
    source = (motor / 'src/main.cpp').read_text()
    (build / 'remote_functions.generated.h').write_text('\n'.join(
        extract_function(source, name)
        for name in ('requestThrottleEnable', 'enableThrottleRequest', 'handleRemoteCommand')))
    for name in ('test_standalone', 'test_comms', 'test_scheduler', 'test_launch', 'test_remote_enable'):
        executable = build / (name + ('.exe' if os.name == 'nt' else ''))
        run([compiler, '-std=c++17', '-Wall', '-Wextra', '-I', motor/'include', '-I', build,
             motor/'tests'/f'{name}.cpp', '-o', executable])
        run([executable])
    for name in ('test_client', 'test_recovery'):
        executable = build / (name + ('.exe' if os.name == 'nt' else ''))
        run([compiler, '-std=c++17', '-Wall', '-Wextra', '-I', esp/'ESP32_MATRIX2_minimal_reader',
             esp/'verification'/f'{name}.cpp', '-o', executable])
        run([executable])
    run([sys.executable, '-m', 'unittest', 'discover', '-s', motor/'tests', '-p', 'test_gui.py'])

assert (motor/'include/comms_protocol.h').read_bytes() == (esp/'ESP32_MATRIX2_minimal_reader/comms_protocol.h').read_bytes()
for path in (motor/'tools').glob('*.py'):
    compile(path.read_bytes(), str(path), 'exec')
print('PASS: seven native test suites, GUI regressions, Python syntax and matching UART protocol headers.')
