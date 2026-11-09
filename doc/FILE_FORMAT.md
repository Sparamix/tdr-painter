# Project files

TDR Painter keeps a project only in a file you save. There are two forms of the same content.

**`.tdrp`** (Save, the default) is a standard ZIP archive with one entry, `project.json`, compressed with the browser's built-in deflate. Each entry carries a CRC-32 of its contents, and Open verifies it, so a damaged or truncated file is refused instead of loading wrong values. Rename it to `.zip` and any unzip tool opens it. The page writes and reads this format itself with no library: no ZIP64, no encryption, at most 5 MB unpacked. Inside claude.ai the save dialog only accepts known extensions, so there the file is named `name.tdrp.zip`.

**`.json`** (Export JSON) is the same project as readable, diff-friendly text, handy for examples kept in git. Open accepts both and tells them apart by content, not by extension.

A typical project is about 4.5 KB as JSON and under 1 KB as `.tdrp`.

## `project.json`, format version 1

```json
{
  "format": "tdr-painter-project", "formatVersion": 1, "app": "0.8.6",
  "name": "Via stub study", "savedAt": "2026-11-01T07:20:00.000Z",
  "params": {
    "lenIn": 2, "z0": 50, "Dk": 3.35, "Df": 0.004, "frefGHz": 12, "dsLowHz": 1000, "dsHighHz": 1e12,
    "condLoss": 0.4, "condRefGHz": 10, "rdc": 0.2, "fmaxGHz": 50, "nf": 1001,
    "zTx": 50, "zRx": 50, "beta": 4.2,
    "lossless": false, "condLossless": false, "dielLossless": false, "extremeZ": false
  },
  "profile":  { "cells": 500, "runs": [[50, 230], [49.2, 1], "..."] },
  "elements": [
    { "type": "C", "x": 1, "value": 0.08, "count": 1, "pitch": 0.15, "locked": false, "enabled": true },
    { "type": "stub", "x": 1, "stubZ": 45, "stubLen": 60, "end": "open", "count": 1, "pitch": 0.15, "locked": true },
    { "type": "pad", "x": 0.2, "value": 6, "zIn": 50, "zOut": 50 }
  ],
  "view": { "zMin": 20, "zMax": 80, "log": false, "units": "imperial",
            "panels": ["range", "line", "diel", "cond", "ports", "sweep", "export"] }
}
```

Lengths are always stored in inches, frequencies in GHz or Hz as the key says, impedances in Ω.

### `params`

| Key | Meaning | Range |
| --- | --- | --- |
| `lenIn` | Line length, in | 0.25 to 10 |
| `z0` | Line Z₀, Ω (the level Reset profile returns to) | 20 to 120 |
| `Dk`, `Df`, `frefGHz` | Djordjevic-Sarkar anchor point | Dk 1 to 6, Df 0 to 0.03, f_ref 0.1 to 60 GHz |
| `dsLowHz`, `dsHighHz` | Djordjevic-Sarkar corner frequencies f₁, f₂ | 10 Hz to 1 MHz, 100 GHz to 10 THz |
| `condLoss` | Skin-effect conductor loss at `condRefGHz` (10 GHz), dB/in | 0 to 2 |
| `rdc` | DC resistance, Ω/in | 0 to 2 |
| `fmaxGHz`, `nf` | Sweep from DC to f_max with `nf` points (1001) | 5 to 110 GHz |
| `zTx`, `zRx` | Port impedances, Ω; Tx is also the TDR source | 10 to 150 (1 mΩ to 1 MΩ with `extremeZ`) |
| `beta` | Kaiser window β for the TDR | 0 to 14 |
| `condLossless`, `dielLossless` | Turn off conductor or dielectric loss | |
| `lossless` | Kept equal to `condLossless && dielLossless`. Files from v0.7.0 and earlier have only this flag, and `true` there means both. | |
| `extremeZ` | Experimental range: ports, painted profile, stub impedance and series R from 1 mΩ to 1 MΩ | |

### `profile`

500 cells along the line, run-length encoded as `[impedance in Ω, number of cells]`. The painted range is 5 to 200 Ω, or 1 mΩ to 1 MΩ with `extremeZ`.

### `elements`

Every element has `type`, a position `x` in inches, `count` copies (1 to 30) at `pitch` inches (0.02 to 1), `locked` (default false) and `enabled` (default true; a disabled element stays in the project but is left out of the cascade).

| `type` | Element | Fields |
| --- | --- | --- |
| `C` | Shunt C | `value` in pF, 0.005 to 1 |
| `L` | Series L | `value` in nH, 0.01 to 2 |
| `R` | Series R | `value` in Ω, 0.01 to 25 (1 mΩ to 1 MΩ with `extremeZ`) |
| `stub` | Shunt stub | `stubZ` Ω (20 to 90, or the wide range), `stubLen` mil (2 to 250), `end` `"open"` or `"short"` |
| `pad` | Resistive T attenuator | `value` dB (0.1 to 60), `zIn` Ω facing Tx and `zOut` Ω facing Rx (5 to 500). Between unequal impedances the loss is raised to at least the minimum-loss pad, 20·log₁₀(√r + √(r−1)) dB with r = Z_high / Z_low. |

### `view`

`zMin`, `zMax` and `log` set the TDR plot range. `units` (`"imperial"` or `"metric"`) changes only what the page displays. `panels` is the order of the side-panel groups.

### `example`

Built-in examples add an `example` block with `category`, `note` and `author`; see [CONTRIBUTING.md](../CONTRIBUTING.md).

## Opening a file

Open validates every value: numbers out of range are clamped, unknown fields and unknown element types are ignored, at most 200 elements are read, and a file from a newer format version is refused with a message. The parser is `src/project.js`, shared by the page and the tests.
