"""Build or flash the standalone release. Never enables a motor test."""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
PKG=Path.home()/'.platformio/packages/tool-openocd'

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('action',choices=['build','upload-prebuilt'])
    p.add_argument('--vm-off',action='store_true',help='Confirm VM is off and MCU is powered')
    a=p.parse_args()
    if a.action=='build':
        raise SystemExit(subprocess.call([str(Path.home()/'.platformio/penv/Scripts/platformio.exe'),'run'],cwd=ROOT))
    if not a.vm_off:p.error('Switch VM off; keep MCU powered. Then provide --vm-off.')
    binary=ROOT/'binary/NIU_Throttle_Comms_v4_3.bin'
    manifest=json.loads((ROOT/'binary/manifest.json').read_text())
    if hashlib.sha256(binary.read_bytes()).hexdigest()!=manifest['sha256']:
        p.error('Binary does not match release manifest; not flashing.')
    print('Flashing standalone v4.3. After boot it waits for idle and healthy VM. USB is optional.')
    raise SystemExit(subprocess.call([str(PKG/'bin/openocd.exe'),'-s',str(PKG/'openocd/scripts'),
        '-f',str(ROOT/'tools/stlink_board.cfg'),'-c','program {'+binary.as_posix()+'} verify reset exit 0x08000000'],cwd=ROOT))
