"""Local ST-Link RTT transport. Attaches without reset/halt or motor commands."""
from datetime import datetime
from pathlib import Path
import json
import math
import os
import queue
import socket
import subprocess
import threading
import time

ROOT = Path(__file__).resolve().parents[1]
PKG = Path.home() / '.platformio/packages/tool-openocd'
PORT = 9090
COMMANDS = {'start', 'stop', 'reset', 'status', 'ping'}


def parse_status(line):
    """Reject malformed/foreign records instead of displaying invented zeros."""
    try:
        data = json.loads(line)
        if data['revision'] != '4.3' or not isinstance(data['fault'], str):
            return None
        if data['state'] not in {'WAIT_VM','WAIT_SENSORS','WAIT_STILL','WAIT_IDLE',
                                 'WAIT_TORQUE','READY','DRIVING','COASTING','STOPPED','CHARGE','FAULT'}:
            return None
        for key in ('ms','requested','armed','idle','throttle','target','reference',
                    'speed','vm','current','pcb','duty','soc','hall','gstat'):
            if not isinstance(data[key], (int, float)) or not math.isfinite(data[key]):
                return None
        optional=('fault_vm','fault_current','fault_duty')
        if any(key in data for key in optional):
            if any(not isinstance(data.get(key),(int,float)) or not math.isfinite(data[key]) for key in optional):
                return None
        return data
    except (ValueError, KeyError, TypeError):
        return None


class Link:
    def __init__(self):
        self.events = queue.Queue()
        self.commands = queue.Queue()
        self.cancel = threading.Event()
        self.thread = None

    def connect(self):
        if self.thread and self.thread.is_alive():
            return False
        self.cancel.clear()
        self.commands = queue.Queue()
        self.thread = threading.Thread(target=self._worker, daemon=True)
        self.thread.start()
        return True

    def send(self, command):
        if command not in COMMANDS:
            raise ValueError('Unknown motor command')
        if not self.thread or not self.thread.is_alive():
            return False
        # Stop must not sit behind queued requests or a stale Enable.
        if command == 'stop':
            while True:
                try: self.commands.get_nowait()
                except queue.Empty: break
        self.commands.put(command)
        return True

    def disconnect(self):
        # Intentionally no stop/reset: MCU operation is independent of this GUI.
        self.cancel.set()

    def _worker(self):
        process = connection = log = capture = None
        try:
            # Never attach to an unrelated/stale server that may own another board.
            probe = socket.socket()
            try:
                probe.bind(('127.0.0.1', PORT))
            except OSError:
                raise RuntimeError('Port 9090 is busy. Close the other NIU console/OpenOCD first.')
            finally:
                probe.close()
            (ROOT / 'logs').mkdir(exist_ok=True)
            stamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            log_path = ROOT / 'logs' / (stamp + '_gui_openocd.txt')
            log = log_path.open('w', encoding='utf-8')
            capture = (ROOT / 'logs' / (stamp + '_gui.txt')).open('w', encoding='utf-8')
            args = [str(PKG/'bin/openocd.exe'), '-s', str(PKG/'openocd/scripts'),
                    '-f', str(ROOT/'tools/stlink_board.cfg'), '-f', str(ROOT/'tools/rtt.cfg')]
            self.events.put(('message', 'Connecting to ST-Link...'))
            process = subprocess.Popen(args, stdout=log, stderr=subprocess.STDOUT,
                                       creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            deadline = time.monotonic() + 12
            while not self.cancel.is_set():
                if process.poll() is not None:
                    raise RuntimeError(f'ST-Link connection failed. Check MCU power, SWD, GND and reset. Log: {log_path}')
                try:
                    connection = socket.create_connection(('127.0.0.1', PORT), timeout=.25)
                    break
                except OSError:
                    if time.monotonic() > deadline:
                        raise TimeoutError(f'No RTT connection. Log: {log_path}')
                    self.cancel.wait(.1)
            if connection is None: return
            connection.settimeout(.1)
            buffer = ''
            synced = False
            hello = 'hello ' + os.urandom(8).hex()
            last_query = 0
            last_status = time.monotonic()
            warned = False
            while not self.cancel.is_set():
                now = time.monotonic()
                if now-last_query >= 1:
                    # A fresh nonce marks the end of old buffered target text, not
                    # a motor heartbeat and has no control side effects.
                    connection.sendall(((hello+'\n' if not synced else '')+'status\n').encode('ascii'))
                    last_query = now
                if synced:
                    try:
                        command = self.commands.get_nowait()
                        connection.sendall((command+'\n').encode('ascii'))
                        self.events.put(('message', f'Sent {command}; awaiting board response.'))
                    except queue.Empty:
                        pass
                try:
                    raw = connection.recv(8192)
                    if not raw: raise ConnectionError('ST-Link RTT disconnected.')
                    buffer += raw.decode('ascii', errors='replace')
                except socket.timeout:
                    pass
                while '\n' in buffer:
                    line,buffer = buffer.split('\n',1)
                    line = line.strip()
                    capture.write(datetime.now().isoformat(timespec='milliseconds')+' '+line+'\n')
                    if line == hello:
                        synced = True
                        continue
                    if not synced: continue
                    data = parse_status(line)
                    if data:
                        last_status = time.monotonic();warned = False
                        self.events.put(('status', data))
                    elif line and not line.startswith('{'):
                        self.events.put(('message', line))
                if len(buffer)>8192: buffer=''
                capture.flush()
                if time.monotonic()-last_status>2 and not warned:
                    warned=True
                    self.events.put(('stale', 'No fresh v4.3 telemetry. The motor may still be running.'))
                if time.monotonic()-last_status>12:
                    raise TimeoutError('No v4.3 telemetry. Check firmware version and ST-Link; motor state is unknown.')
        except Exception as exc:
            self.events.put(('error', str(exc)))
        finally:
            if connection: connection.close()
            if process and process.poll() is None:
                process.terminate()
                try: process.wait(timeout=3)
                except subprocess.TimeoutExpired: process.kill();process.wait()
            if log: log.close()
            if capture: capture.close()
            self.events.put(('disconnected', 'GUI disconnected. This does not stop the standalone motor.'))
