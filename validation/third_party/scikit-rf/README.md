# Data from scikit-rf

Copied from [scikit-rf](https://github.com/scikit-rf/scikit-rf) at commit `96e1745d499852a9e267f07bad18e5f613f59089` (2 Nov 2026), under the BSD 3-Clause license in [`LICENSE.txt`](LICENSE.txt). Copyright (c) 2010 Alexander Arsenovic and (c) 2020 the scikit-rf developers.

| Here | Source in scikit-rf | Changes |
| --- | --- | --- |
| `tdr_measurement_vs_simulation/measurement/*.s2p`, `*.s1p` | `doc/source/examples/networktheory/tdr_measurement_vs_simulation/measurement/` | Every 10th frequency point kept (10 MHz to 10 GHz in 10 MHz steps, 1000 points instead of 10 000); values unchanged; one comment line added |
| `tdr_measurement_vs_simulation/measurement/readme.txt` | same folder | none |
| `tdr_measurement_vs_simulation/simulation/P1-MSL_Stepped_140-P2.s2p` | `.../tdr_measurement_vs_simulation/simulation/` | decimated the same way |
| `taper/ANSYS_Circuit_taper_*_s_mag.csv` | `doc/source/examples/taper/` | none |

Only the files the validation uses are included: the stepped line, the 100 and 200 mm lines and the 50 mm shorts (for the substrate and connector extraction), and scikit-rf's simulation of the stepped line.

The measurement, per its readme: Anritsu MS46524B, 19 February 2018, 1 MHz to 10 GHz in 1 MHz steps, 1 kHz IF bandwidth, 0 dBm, full two-port eCal. The examples that use this data:

- [Time domain reflectometry, measurement vs simulation](https://scikit-rf.readthedocs.io/en/latest/examples/networktheory/Time%20domain%20reflectometry%2C%20measurement%20vs%20simulation.html)
- [Tapered transmission lines](https://scikit-rf.readthedocs.io/en/latest/examples/taper/tapered_transmission_lines.html)
