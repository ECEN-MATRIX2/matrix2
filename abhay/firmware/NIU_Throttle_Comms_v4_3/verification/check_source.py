"""Read-only installed headers/compiler; writes reports only in this project.
No package-manager installation, upload, or board access.
"""
from pathlib import Path
import subprocess
import os

project=Path(__file__).resolve().parents[1]
packages=Path(os.environ.get('USERPROFILE',str(Path.home())))/'.platformio/packages'
fw=packages/'framework-arduinoststm32'
includes=['cores/arduino','cores/arduino/stm32','cores/arduino/stm32/LL','cores/arduino/stm32/usb',
          'libraries/SrcWrapper/inc','libraries/SrcWrapper/inc/LL','libraries/USBDevice/inc','libraries/USBDevice/App',
          'libraries/USBDevice/Target','libraries/IWatchdog/src','variants/STM32F4xx/F405RGT_F415RGT',
          'system/STM32F4xx','system/Drivers/STM32F4xx_HAL_Driver/Inc',
          'system/Drivers/STM32F4xx_HAL_Driver/Inc/Legacy',
          'system/Drivers/CMSIS/Device/ST/STM32F4xx/Include',
          'system/Middlewares/ST/STM32_USB_Device_Library/Core/Inc',
          'system/Middlewares/ST/STM32_USB_Device_Library/Class/CDC/Inc']
compiler=packages/'toolchain-gccarmnoneeabi/bin/arm-none-eabi-g++.exe'
cmd=[str(compiler),'-std=gnu++17','-mcpu=cortex-m4','-mthumb','-mfloat-abi=hard',
     '-mfpu=fpv4-sp-d16','-fsyntax-only','-Wall','-Wextra','-I',str(project/'include')]
for s in includes:cmd+=['-I',str(fw/s)]
cmd+=['-I',str(packages/'framework-cmsis/CMSIS/Core/Include')]
defines=['STM32F4','STM32F4xx','STM32F405xx','USE_HAL_DRIVER','HAL_UART_MODULE_ENABLED','ARDUINO_GENERIC_F405RGTX',
         'ARDUINO_ARCH_STM32','ARDUINO=10805','F_CPU=168000000L','VARIANT_H="variant_generic.h"',
         'PIO_FRAMEWORK_ARDUINO_ENABLE_CDC','USBCON','USBD_USE_CDC','HAL_PCD_MODULE_ENABLED',
         'USBD_VID=0x0483','USBD_PID=0x0003']
for d in defines:cmd+=['-D'+d]
cmd+=[str(project/'src/main.cpp')]
if __name__=='__main__':
    r=subprocess.run(cmd,capture_output=True,text=True)
    text=r.stdout+r.stderr+f'\nFinal source syntax/type check exit_code={r.returncode}\n'
    (project/'verification/final_syntax.log').write_text(text)
    print(text)
    raise SystemExit(r.returncode)
