# Abhay - motor control and power distribution

| Folder | Contents |
| --- | --- |
| `firmware/NIU_Throttle_Comms_v4_3` | STM32F405 motor firmware, local GUI, tests and v4.3 binary |
| `firmware/NIU_ESP_Comms_v4_3` | Matching ESP32-S3 UART/BLE firmware and app protocol |
| `hardware/rev-o` | Rev O intermediate board: editable KiCad project, libraries, 3D models, BOM and manufacturing files |
| `hardware/motor-controller` | Final motor-control PCB and its original license |

## Working with this folder

Edit these repository copies for future revisions. The original lab folders are separate copies; edits there do not automatically appear here. In GitHub Desktop, select Matrix 2, review changes, commit, push the branch and open a pull request. Keep shared team files outside `abhay/` unchanged unless coordinating a team update.

## Firmware

These are the paired v4.3 sources, with sampled phase-current throttle control and acknowledged app fault-clear/enable commands. This firmware is not FOC. The ESP copy here is the matching motor-integration baseline; it does not replace the team's separate `firmware/comms/` project.

Open either firmware directory in VS Code with PlatformIO, or run `pio run` from that directory. This builds only. The STM32 project targets `genericSTM32F405RG`; the ESP project targets `esp32-s3-devkitc-1` with 4 MB flash. PlatformIO installs the pinned dependencies. The ESP's workstation-specific cache directory override was removed.

Run `python firmware/run_checks.py` for offline native and GUI tests. It needs Python 3 with Tkinter and a C++17 compiler (`g++` on PATH, or set `CXX` to its full path). No boards are accessed. The original `verification/verify.py` files are historical preservation audits: they additionally require older development folders not included in this repository. Use `run_checks.py` for checks in this clone.

Launch the local motor GUI with `firmware/NIU_Throttle_Comms_v4_3/Start Motor GUI.cmd`. Its hardware connection uses ST-Link/OpenOCD; see the project tools and `APP_CONTRACT.txt`. No firmware was flashed as part of this import.

The original release notes/manifests record the state at packaging time and are retained unchanged. The `binary/` folders contain the existing release binaries, not fresh builds from this import. ELF debug files, build caches and serial logs are omitted; the ESP historical manifest still lists the omitted ELF's checksum. Hardware validation is not implied by offline test results. The recent bench discrepancy between indicated supply voltage and MCU VM telemetry remains unresolved; this import does not change VM scaling or safety limits.

## KiCad

Use KiCad 9 and install its standard symbol, footprint and 3D-model libraries.

- Rev O: open `hardware/rev-o/NIU_Intermediate_RevO.kicad_pro`. Gerbers and drill files are in `Manufacturing/Gerbers`; assembly files are in `Manufacturing/Assembly`; the full purchasing BOM is in `Purchasing`. Read `FABRICATION.txt` and `BENCH_CHECKS.txt` before fabrication/assembly. Stock records and validation reports are dated snapshots.
- Motor controller: open `hardware/motor-controller/PCB/Abhay_Board.kicad_pro`. Electrical design and layout are unchanged. Only the two local library-table paths were corrected to the supplied `Abhay.pretty` and `Abhay.lib` files. The board references both `KICAD6_3DMODEL_DIR` and `KICAD9_3DMODEL_DIR`; configure the older variable to the installed standard 3D-model directory if needed.

The motor controller's inherited license and upstream README are included in its folder. Statements in the upstream README describe the original xESC project, not validation or ratings of this modified motor board or the current firmware.

`import_manifest.json` lists SHA-256 checksums for the imported source files and identifies the three packaging-only changes. No motor runtime source, PCB or schematic was changed.
