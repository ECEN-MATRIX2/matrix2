"""Bounded passive status capture; no reset, stop, enable or motion command."""
import json
import queue
import time
from transport import Link

if __name__=='__main__':
    link=Link();link.connect();deadline=time.monotonic()+15;count=0
    try:
        while time.monotonic()<deadline:
            try: kind,value=link.events.get(timeout=.2)
            except queue.Empty:continue
            if kind=='status':
                print(json.dumps(value));count+=1
                if count>=3:break
            elif kind in {'error','disconnected'}:print(kind,value);break
    finally:
        link.disconnect()
        if link.thread:link.thread.join(timeout=5)
    raise SystemExit(0 if count>=3 else 1)
