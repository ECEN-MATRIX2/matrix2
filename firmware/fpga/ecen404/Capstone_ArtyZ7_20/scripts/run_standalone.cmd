@echo off
setlocal
set "CHECK_ONLY=0"
if /I "%~1"=="--check" set "CHECK_ONLY=1"
set "VIVADO_BIN=%XILINX_VIVADO%\bin"
if not exist "%VIVADO_BIN%\xvlog.bat" set "VIVADO_BIN=C:\AMDDesignTools\2025.2\Vivado\bin"
if not exist "%VIVADO_BIN%\xvlog.bat" set "VIVADO_BIN=C:\AMDDesignTools\2025.2\bin"
if not exist "%VIVADO_BIN%\xvlog.bat" (
  echo Edit VIVADO_BIN in this file to match your installation.
  if "%CHECK_ONLY%"=="0" pause
  exit /b 1
)
pushd "%~dp0.."
if not exist build_xsim mkdir build_xsim
pushd build_xsim
copy /y ..\sim\arty_analog.txt arty_analog.txt >nul
if errorlevel 1 goto failed
call "%VIVADO_BIN%\xvlog.bat" ..\rtl\arty_clock.v ..\rtl\arty_xadc.v ..\rtl\arty_z7_top.v ..\rtl\commutation_cell.v ..\rtl\dab_mc_controller.v "%VIVADO_BIN%\..\data\verilog\src\glbl.v"
if errorlevel 1 goto failed
call "%VIVADO_BIN%\xvlog.bat" --sv ..\sim\arty_z7_tb.sv ..\sim\commutation_cell_tb.sv
if errorlevel 1 goto failed
call "%VIVADO_BIN%\xelab.bat" arty_z7_tb glbl -L unisims_ver -s arty_sim -debug all
if errorlevel 1 goto failed
if "%CHECK_ONLY%"=="1" goto check
rem Forward slashes are required here because this path is later parsed as Tcl.
call "%VIVADO_BIN%\xsim.bat" arty_sim -gui -tclbatch ../scripts/standalone_waves.tcl -log arty_sim.log
if errorlevel 1 goto failed
goto done
:check
call "%VIVADO_BIN%\xsim.bat" arty_sim -tclbatch ../scripts/standalone_waves.tcl -log arty_sim.log
if errorlevel 1 goto failed
findstr /C:"PASS: Arty clock/XADC integration" arty_sim.log >nul
if errorlevel 1 goto failed
call "%VIVADO_BIN%\xelab.bat" commutation_cell_tb -s commutation_sim
if errorlevel 1 goto failed
call "%VIVADO_BIN%\xsim.bat" commutation_sim -runall -log commutation_sim.log
if errorlevel 1 goto failed
findstr /C:"PASS: all four sequences" commutation_sim.log >nul
if errorlevel 1 goto failed
echo ALL SIMULATION CHECKS PASSED
:done
popd
popd
exit /b 0
:failed
echo Simulation failed. Read the messages above.
if "%CHECK_ONLY%"=="0" pause
popd
popd
exit /b 1

