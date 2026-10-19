"""Read ESP USB console and send only PING / STATUS?. Never motor commands."""
from pathlib import Path
from datetime import datetime, timezone
import json
import time
import serial

port=serial.Serial(port=None,baudrate=115200,timeout=0.15,write_timeout=1)
port.dtr=False;port.rts=False;port.port='COM3'
capture=bytearray()
with port:
    started=time.monotonic();sent=False
    while time.monotonic()-started<5:
        capture.extend(port.read(8192))
        if not sent and time.monotonic()-started>0.5:
            port.write(b'PING\nSTATUS?\n');sent=True
text=capture.decode('utf-8',errors='replace')
folder=Path(__file__).resolve().parent
stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%SZ')
(folder/(stamp+'_serial.txt')).write_text(text,encoding='utf-8')
rows=[]
for line in text.splitlines():
    try:
        row=json.loads(line)
        if isinstance(row,dict) and 'motor_link_ok' in row:rows.append(row)
    except ValueError:pass
print(json.dumps({'pong':'PONG' in text,'telemetry_rows':len(rows),
                  'latest':rows[-1] if rows else None,
                  'log':str(folder/(stamp+'_serial.txt'))},indent=2))
if not rows:print(text[-3500:])
if not rows or 'PONG' not in text:raise SystemExit(1)
