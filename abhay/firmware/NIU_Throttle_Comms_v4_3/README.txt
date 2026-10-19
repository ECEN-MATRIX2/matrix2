NIU v4.3 - acknowledged app clear-and-enable
NOT FLASHED. Built and tested offline; hardware validation remains pending.

New app command: {"cmd":"motor_clear_fault_and_enable"} followed by LF.
Existing motor_clear_fault stays clear-only. The new sequence confirms MCU clear, then
requests MCU enable, and confirms actual arming. Held throttle cannot enable motion.
The existing current throttle, startup assist, protections and WAIT_TORQUE are retained.
This is 0-2 A sampled phase-current magnitude control, not FOC or speed control.

Read APP_CONTRACT.txt for exact packets, prerequisites, result codes, retry deadlines,
cancel/unknown semantics and remaining physical validation. Both v4.3 images are required.
No wiring changes from the existing v4.2 Y connection. No hardware was accessed in this release.
Local GUI Enable/Stop/Reset behavior remains available; the bundled GUI expects v4.3.
Never interpret BLE disconnect, timeout or cancellation as proof that the motor stopped.

Source and tests are included, with full PlatformIO build outputs in binary/ and manifests.
verification/results.txt records offline checks. verification/build.log records the build.
Do not use old manually relinked STM32 cached-core images; build the entire PlatformIO project.

Motor source: src/main.cpp and src/comms.inc; protocol: include/comms_protocol.h.
GUI: Start Motor GUI.cmd (connecting the GUI is a hardware operation, not part of these tests).
Build: platformio run
Offline tests: python verification/verify.py
The preservation audit also uses previous sibling project sources present in this workspace.
GUI regression uses a local mocked RTT server; it does not launch real OpenOCD.
Native test compiler path is configured in verification/verify.py.
Future manual flashing requires VM OFF and MCU powered; no flashing was done here.
