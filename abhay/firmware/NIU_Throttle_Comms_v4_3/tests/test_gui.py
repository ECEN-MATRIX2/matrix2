import json
from pathlib import Path
import queue
import socket
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import Mock,patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from transport import Link,parse_status
import transport

GOOD=dict(revision='4.3',ms=1000,state='READY',fault='none',requested=1,armed=1,idle=1,
          throttle=.5,target=0,reference=0,speed=0,vm=36,current=0,pcb=25,duty=0,soc=50,hall=6,gstat=0)

class Tests(unittest.TestCase):
    def test_valid(self):self.assertEqual(parse_status(json.dumps(GOOD)),GOOD)
    def test_wait_torque_is_status_not_fault(self):
        data=dict(GOOD,state='WAIT_TORQUE',target=.2,reference=0,armed=1,duty=0)
        self.assertEqual(parse_status(json.dumps(data)),data)
    def test_reject_corrupt_and_old(self):
        for s in ['', '{', 'STOP fault=none', json.dumps(dict(GOOD,revision='3.15')),
                  json.dumps(dict(GOOD,vm=float('nan'))),json.dumps(dict(GOOD,state='bogus'))]:
            self.assertIsNone(parse_status(s))
        for key in GOOD:
            x=GOOD.copy();del x[key];self.assertIsNone(parse_status(json.dumps(x)))
    def test_missing_connection_does_not_queue_start(self):
        x=Link();self.assertFalse(x.send('start'));self.assertTrue(x.commands.empty())
    def test_stop_discards_pending_enable(self):
        x=Link();x.thread=Mock();x.thread.is_alive.return_value=True
        x.send('start');x.send('status');x.send('stop')
        self.assertEqual(x.commands.get_nowait(),'stop');self.assertTrue(x.commands.empty())
    def test_disconnect_does_not_stop_or_restart(self):
        x=Link();x.disconnect();self.assertTrue(x.cancel.is_set());self.assertTrue(x.commands.empty())
    def test_reject_arbitrary_commands(self):
        x=Link()
        for command in ['reset halt','start\nstop','top15','sweep10']:
            with self.assertRaises(ValueError):x.send(command)

    def test_real_socket_handshake_and_detach_have_no_motor_side_effects(self):
        # Run the real worker/line parser against a local fake RTT device.
        # Old buffered data/pong must not make the GUI appear connected.
        received=[];ready=threading.Event();release=threading.Event()
        server=socket.socket();server.bind(('127.0.0.1',0));port=server.getsockname()[1];server.close()
        listener=socket.socket()
        def board():
            listener.bind(('127.0.0.1',port));listener.listen(1);ready.set()
            with listener.accept()[0] as c:
                c.settimeout(2)
                c.sendall((json.dumps(GOOD)+'\npong\n').encode())
                line=b''
                while b'\n' not in line:line+=c.recv(1024)
                first=line.decode().splitlines();received.extend(first)
                hello=next(x for x in first if x.startswith('hello '))
                release.wait(2)
                c.sendall((hello+'\n'+json.dumps(GOOD)+'\n').encode())
                while True:
                    try:data=c.recv(1024)
                    except socket.timeout:break
                    if not data:break
                    received.extend(data.decode().splitlines())
            listener.close()
        process=Mock();process.poll.return_value=None
        def launch(*args,**kwargs):
            self.assertNotIn('reset',str(args));self.assertNotIn('halt',str(args))
            thread.start();ready.wait(2);return process
        thread=threading.Thread(target=board,daemon=True)
        with tempfile.TemporaryDirectory() as directory,patch.object(transport,'ROOT',Path(directory)),patch.object(transport,'PORT',port),patch.object(transport.subprocess,'Popen',side_effect=launch):
            x=Link();x.connect()
            try:
                time.sleep(.3)
                early=[]
                while not x.events.empty():early.append(x.events.get_nowait())
                self.assertFalse(any(kind=='status' for kind,value in early),early)
                self.assertFalse(any(kind=='error' for kind,value in early),early)
                release.set();deadline=time.monotonic()+5;got=False;later=[]
                while time.monotonic()<deadline:
                    try:kind,value=x.events.get(timeout=.2)
                    except queue.Empty:continue
                    later.append((kind,value))
                    if kind=='status':got=True;break
                self.assertTrue(got,repr((early,later,received,thread.is_alive())))
            finally:
                release.set();x.disconnect();x.thread.join(4);thread.join(4)
            self.assertFalse(x.thread.is_alive());process.terminate.assert_called_once()
        self.assertTrue(any(x.startswith('hello ') for x in received))
        self.assertFalse({'start','stop','reset'}&set(received))

if __name__=='__main__':unittest.main()
