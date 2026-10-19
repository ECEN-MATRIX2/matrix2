"""Full PlatformIO build; never relink another project's cached core.
The old manual build omitted UART HAL flags, causing an incompatible class layout.
"""
from pathlib import Path
import subprocess
root=Path(__file__).resolve().parents[1]
pio=Path.home()/'.platformio/penv/Scripts/platformio.exe'
raise SystemExit(subprocess.call([str(pio),'run','-d',str(root)]))
