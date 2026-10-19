"""One explicit fault-clear request with VM OFF; must be refused, never starts motion."""
from pathlib import Path
import serial,time,json
port=serial.Serial(port=None,baudrate=115200,timeout=.15,write_timeout=1)
port.dtr=False;port.rts=False;port.port='COM3'
rows=[];raw=[];sent=False;reply=None;buffer=b''
with port:
    end=time.monotonic()+8
    port.write(b'STATUS?\n')
    while time.monotonic()<end:
        buffer+=port.read(8192)
        while b'\n' in buffer:
            line,buffer=buffer.split(b'\n',1)
            text=line.decode('utf-8',errors='replace');raw.append(text)
            try:row=json.loads(text)
            except ValueError:continue
            if not isinstance(row,dict) or 'motor_link_ok' not in row:continue
            rows.append(row)
            if not sent:
                if not(row.get('motor_link_ok') and row.get('motor_vm_v') is not None and row['motor_vm_v']<1
                       and row.get('motor_running') is False and row.get('motor_tx_open_drain') is True):
                    raise SystemExit('Prerequisites not satisfied: no command sent. '+str(row))
                previous=row['reset_request_id'];port.write(b'{"cmd":"motor_clear_fault"}\n');sent=True
            elif row.get('reset_request_id',0)>previous and row.get('reset_state')=='refused':
                assert row.get('reset_result') in (4,5,6),row
                assert row.get('motor_running') is False and row.get('motor_vm_v',100)<1,row
                reply=row
        if reply:break
folder=Path(__file__).resolve().parent
(folder/'return_channel_capture.txt').write_text('\n'.join(raw)+'\n',encoding='utf-8')
result={'sent':sent,'acknowledged_refusal':bool(reply),'latest':reply or (rows[-1] if rows else None)}
(folder/'return_channel_result.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
raise SystemExit(0 if reply else 1)
