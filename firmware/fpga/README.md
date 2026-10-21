# FPGA control projects

**Draft source collection · Vivado 2025.2**

Each variant stays self-contained. Choose a variant deliberately: the four-PWM bench and eight-output commutator are different designs.

| Project | Target | Purpose | Imported validation status |
| --- | --- | --- | --- |
| [ECEN 403](ecen403/README.md) | Zynq xc7z010clg400-1 | Original block-design project | Historical project; not rebuilt during import |
| [ECEN 404 · 100 ns](ecen404/Capstone_ArtyZ7_20/) | Arty Z7-20 | Eight-output commutation demonstration | Supplied report records simulation/build success |
| [ECEN 404 · 250 ns](ecen404/Capstone_ArtyZ7_20_250ns/) | Arty Z7-20 | Eight-output commutation variant | Supplied report records simulation/build success |
| [ECEN 404 · Four PWM](ecen404/Capstone_ArtyZ7_20_4PWM_Bench_250ns/) | Arty Z7-20 | Complementary bench PWM with 250 ns dead time | Supplied report records simulation/build success |
| [ECEN 404 · 5 us test](ecen404/Capstone_ArtyZ7_20_8PWM_Test_5us/) | Arty Z7-20 | Eight-output, 5 us commutation-step experiment | Source only; supplied report records blocked regression/build |

## Open an ECEN 404 variant

Read its `START_HERE.md` and `VALIDATION.md`. In the Vivado Tcl console, close any open project and change into the selected variant folder:

```tcl
cd {C:/path/to/matrix2/firmware/fpga/ecen404/Capstone_ArtyZ7_20}
source scripts/create_project.tcl
source scripts/run_simulation.tcl
```

The source scripts derive their project root from their location. Existing documentation contains historical machine paths; substitute the chosen clone folder. `scripts/run_standalone.cmd` is an alternate simulation entry point where supplied. No imported script was executed during organization.

Generated `build/`, `build_xsim/`, caches, crash dumps and run folders were excluded. Supplied `prebuilt/` files and `validation/` reports are retained as historical artifacts, not newly verified outputs. The nested four-PWM directory was an exact duplicate and was omitted after comparing file contents.

[Supplied KiCad settings](../../hardware/capstone/project-settings/README.md) · [ZIP import scope](../../docs/capstone/README.md)
