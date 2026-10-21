# ECEN 403 · Original Vivado project

Open `DEMO v1.xpr` with Vivado 2025.2 and Zynq-7000 support. The project targets `xc7z010clg400-1`; do not substitute an Arty Z7-20 bitstream.

The `.srcs` hierarchy, block design, IP configuration, synthesis checkpoint and the generated HDL wrapper explicitly referenced by the XPR are retained at their original relative paths. Both imported `matrix_converter_v30` and `matrix_converter_v30b` sources remain; the XPR selects v30b.

Caches, implementation runs, generated IP products and simulator output are omitted. Regenerate block-design/IP output products before building. This project was inspected for file references but was not rebuilt or migrated during import.
