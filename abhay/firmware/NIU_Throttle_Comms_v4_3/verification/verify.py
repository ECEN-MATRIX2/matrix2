"""Offline release checks; never touches the MCU."""
from pathlib import Path
import os
import subprocess
import sys
import re

root=Path(__file__).resolve().parents[1]
old=root.parent/'NIU_Hall_Firmware'
compiler=Path('C:/Program Files/Keysight/ADS2026_Update0.1/tiburonda/tools/mingw64/bin/g++.exe')
log=[]
def run(args):
    env=os.environ.copy();env['PATH']=str(compiler.parent)+os.pathsep+env.get('PATH','')
    r=subprocess.run([str(x) for x in args],capture_output=True,text=True,env=env)
    log.append(r.stdout+r.stderr)
    print(log[-1])
    if r.returncode:raise RuntimeError('Check failed: '+str(args))

run([compiler,'-std=c++17','-Wall','-Wextra','-I',root/'include',root/'tests/test_standalone.cpp',
     '-o',root/'verification/test_standalone.exe'])
run([root/'verification/test_standalone.exe'])
run([compiler,'-std=c++17','-Wall','-Wextra','-Werror','-I',root/'include',root/'tests/test_comms.cpp',
     '-o',root/'verification/test_comms.exe'])
run([root/'verification/test_comms.exe'])
run([compiler,'-std=c++17','-Wall','-Wextra','-I',root/'include',root/'tests/test_scheduler.cpp',
     '-o',root/'verification/test_scheduler.exe'])
run([root/'verification/test_scheduler.exe'])
run([compiler,'-std=c++17','-Wall','-Wextra','-I',root/'include',root/'tests/test_launch.cpp','-o',root/'verification/test_launch.exe'])
run([root/'verification/test_launch.exe'])
run([sys.executable,'-m','unittest','discover','-s',root/'tests','-p','test_gui.py'])
run([sys.executable,'-m','py_compile',*list((root/'tools').glob('*.py'))])

def function(source,name):
    match=re.search(r'^(?:static )?[\w:<>&* ]+\b'+re.escape(name)+r'\(',source,re.M)
    assert match,name
    start=match.start();pos=match.end()-1
    end=source.index('{',pos)+1;level=1
    while level:
        if source[end]=='{':level+=1
        elif source[end]=='}':level-=1
        end+=1
    return source[start:end]

# Audit against the exact previous on-board backend, not a generic rewrite.
before=(old/'src/main.cpp').read_text();after=(root/'src/hardware.inc').read_text()
names=('phasesOff','killHardware','phaseSector','spiByte','transaction','tmcRead','tmcWrite',
       'snapshotDriver','initDriver','calibrateCurrentZero','updateSpeedMeasurement')
for name in names:assert function(before,name)==function(after,name),name
for name in ('telemetry.h','current_calibration.h','control.h','thermal_policy.h','lab_rtt.h','demo_battery.h'):
    assert (old/'include'/name).read_text()==(root/'include'/name).read_text(),name
main=(root/'src/main.cpp').read_text()
for removed in ('HostTimeout','hostHeartbeat','sweepActive','topMode','TestTracking','beginRun'):
    assert removed not in main,removed
assert 'IWatchdog.reload()' in main
assert 'RCC_CSR_IWDGRSTF' in (root/'src/setup.inc').read_text()
log.append(f'PASS: {len(names)} hardware functions and six protection/protocol modules match v3.15.\n')
print(log[-1]);(root/'verification/results.txt').write_text('\n'.join(log))

v4=root.parent/'NIU_Startup_v4_0_2'
for file in (v4/'include').glob('*.h'):
    before=file.read_text();after=(root/'include'/file.name).read_text()
    if file.name=='config.h':before=before.replace('"4.0.2"','"4.3"')
    assert before==after,file.name
assert (v4/'src/setup.inc').read_text()==(root/'src/setup.inc').read_text()
assert (v4/'src/hardware.inc').read_text().split('static void beginCommUart()')[0]==(root/'src/hardware.inc').read_text()
log.append('PASS: all v4.0.2 current/startup/protection headers, setup and non-UART hardware backend unchanged (revision string excepted).\n')
print(log[-1]);(root/'verification/results.txt').write_text('\n'.join(log))

before=(v4/'src/main.cpp').read_text()
for name in ('readHall','trip','coast','disableDriver','stop','fastTick','faultISR',
             'sampleCurrentAndBus','sampleThrottle','startVoltage','stationary',
             'readySensors','prepareAtIdle','serviceThrottle','currentControl','faultName','printStatus','loop'):
    actual=function(main,name).replace('remoteClearPermit=false;','')
    assert re.sub(r'\s+','',function(before,name))==re.sub(r'\s+','',actual),name
previous=(root.parent/'NIU_Throttle_Comms_v4_2/src/comms.inc').read_text()
assert function(previous,'serviceComms').replace('clearFaultRequest()','handleRemoteCommand(cmd)')==function((root/'src/comms.inc').read_text(),'serviceComms')
assert 'launch.idle();faultSnapshot={};' in function(main,'clearFaultRequest')
assert 'if(launch.waiting)return comms::WaitTorque;' in function(main,'stateCode')
assert 'shouldCoast(' not in main and 'speedControl(' not in main
log.append('PASS: current control, startup, Hall, protection thresholds and runtime match v4.0.2; stop/trip additionally revoke remote permission; UART scheduling unchanged.\n')
print(log[-1]);(root/'verification/results.txt').write_text('\n'.join(log))

generated=root/'verification/remote_functions.generated.h'
generated.write_text('\n'.join(function(main,n) for n in ('requestThrottleEnable','enableThrottleRequest','handleRemoteCommand')))
run([compiler,'-std=c++17','-Wall','-Wextra','-Werror','-I',root/'include','-I',root/'verification',
     root/'tests/test_remote_enable.cpp','-o',root/'verification/test_remote_enable.exe'])
run([root/'verification/test_remote_enable.exe'])
(root/'verification/results.txt').write_text('\n'.join(log))
