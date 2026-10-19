"""Package this release after tests/build; no hardware access."""
from pathlib import Path
import hashlib
import json
import shutil
import zipfile
from datetime import datetime,timezone

root=Path(__file__).resolve().parents[1]
build=root/'.pio/build/genericSTM32F405RG'
binary=root/'binary/NIU_Throttle_Comms_v4_3.bin'
shutil.copy2(build/'firmware.bin',binary)
shutil.copy2(build/'firmware.elf',binary.with_suffix('.elf'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest={'revision':'4.3','binary':binary.name,'sha256':sha(binary),'bytes':binary.stat().st_size,
          'built_at_utc':datetime.now(timezone.utc).isoformat(),
          'sources':{p.relative_to(root).as_posix():sha(p) for folder in ('src','include') for p in sorted((root/folder).glob('*')) if p.is_file()}}
(root/'binary/manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
out=root.parent/'outputs/NIU_Comms_v4_3';out.mkdir(parents=True,exist_ok=True)
archive=out/'NIU_Throttle_Comms_v4_3.zip'
files=[]
for p in root.rglob('*'):
    if not p.is_file() or any(part in {'.pio','__pycache__','logs','final_build'} for part in p.relative_to(root).parts):continue
    if p.suffix=='.exe' or p.name in {'final_build.log','gui_preview.png','prepare_current.py','prepare_startup.py','gui_current_preview.png'}:continue
    files.append(p)
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for p in files:z.write(p,'NIU_Throttle_Comms_v4_3/'+p.relative_to(root).as_posix())
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert hashlib.sha256(z.read('NIU_Throttle_Comms_v4_3/binary/'+binary.name)).hexdigest()==manifest['sha256']
print(json.dumps({'zip':str(archive),'files':len(files),'binary_bytes':manifest['bytes'],'binary_sha256':manifest['sha256']},indent=2))
