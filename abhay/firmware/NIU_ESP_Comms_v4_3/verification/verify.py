"""Offline native tests and source consistency. No device access."""
from pathlib import Path
import subprocess
import re
root=Path(__file__).resolve().parents[1]
compiler=Path('C:/Program Files/Keysight/ADS2026_Update0.1/tiburonda/tools/mingw64/bin/g++.exe')
headers=root/'ESP32_MATRIX2_minimal_reader'
logs=[]
for test in ('test_client','test_recovery'):
    exe=root/'verification'/f'{test}.exe'
    for cmd in ([str(compiler),'-std=c++17','-static','-Wall','-Wextra','-I',str(headers),str(root/'verification'/f'{test}.cpp'),'-o',str(exe)],[str(exe)]):
        r=subprocess.run(cmd,capture_output=True,text=True)
        logs.append(r.stdout+r.stderr);print(logs[-1])
        if r.returncode:raise RuntimeError(cmd)
assert (headers/'comms_protocol.h').read_bytes()==(root.parent/'NIU_Throttle_Comms_v4_3/include/comms_protocol.h').read_bytes()
assert (headers/'telemetry.h').read_text()==(root.parent/'NIU_ESP_Comms_v4_2/ESP32_MATRIX2_minimal_reader/telemetry.h').read_text()
logs.append('PASS: shared protocol headers identical; legacy telemetry definitions unchanged.\n')
before=(root.parent/'NIU_ESP_Comms_v4_2/ESP32_MATRIX2_minimal_reader/ESP32_MATRIX2_minimal_reader.ino').read_text()
after=(headers/'ESP32_MATRIX2_minimal_reader.ino').read_text()
def function(source,name):
    start=re.search(r'^[\w:<>&* ]+\b'+name+r'\(',source,re.M).start()
    end=source.index('{',start)+1;level=1
    while level:
        if source[end]=='{':level+=1
        elif source[end]=='}':level-=1
        end+=1
    return source[start:end]
for name in ('clampf','readAveragedVoltage','readAveragedVoltageSamples','readVsenseAdcVoltage',
             'readCurrentOutVoltage','calibrateCurrentZero','convertCurrOutVoltageToAmps',
             'readBoardTempC','readBoardTempF','buildGnssDate','buildGnssTimeUtc','sendLineBoth','setupBle','setupAdcPin'):
    assert function(before,name)==function(after,name),name
oldkeys=set(re.findall(r'\\"([a-z_]+)\\":',function(before,'buildTelemetryJson')))
newkeys=set(re.findall(r'\\"([a-z_]+)\\":',function(after,'buildTelemetryJson')))
assert oldkeys<=newkeys,oldkeys-newkeys
logs.append(f'PASS: 14 ADC/GNSS/BLE functions unchanged; all {len(oldkeys)} legacy telemetry keys retained.\n')
(root/'verification/results.txt').write_text('\n'.join(logs))
