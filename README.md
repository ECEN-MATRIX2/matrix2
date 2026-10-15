# ECEN 403/404 Matrix 2 Electric Scooter

Shared repository for the Matrix 2 ECEN 403/404 senior design project.

## Repository structure

```text
firmware/
  comms/esp32/ESP32_MATRIX2_minimal_reader/  ESP32 comms board firmware
  motor/stm32/                             STM32 motor controller firmware (placeholder)
software/
  mobile-app/scooter-app/                   Mobile application
hardware/
  fpga/                                    FPGA PCB files (placeholder)
  motor/                                   Motor controller PCB files (placeholder)
  comms/                                   Comms board KiCad project
  matrix/                                  Matrix converter hardware and design files
```

The matrix hardware folder includes the existing ECEN 403 and 404 schematics and layouts, simulations, and transformer design documents.

Run mobile app commands from `software/mobile-app/scooter-app`.

## Team workflow

Create a branch for future work, commit your changes, and open a pull request before merging into `main`.
