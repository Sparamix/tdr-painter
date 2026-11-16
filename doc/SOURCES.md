# Sources

This page lists every source used to check TDR Painter's physics, examples and documentation. It covers the ones
the repository cites, the ones that were checked but are not cited, and the ones that were withdrawn. For each source
it gives the statement it supports and where in the source that statement is.

## How the sources were checked

A literature check of v0.8.10 (tag `v0.8.10`, commit `54d6959`) was carried out on 2026-11-15 and 2026-11-16. It
was done by a separate Claude session from the one that wrote the code, working from the sources listed here under
the author's direction. The author obtained the sources and made every decision about the findings.

The check covered 133 items: every cited statement, equation and number in the code comments, the page, the example
notes, the README, the roadmap and the validation report, and every field of every reference entry. Each item was
compared with the source at the page given below; numbers that come from the engine were re-run with separate
scripts, and the area labels and the ILD fit were also recomputed with independent implementations.

- Of the 39 claims checked, 14 were confirmed, 24 were confirmed with caveats, and one was split: part confirmed,
  part with no published source.
- The check raised 3 high, 11 medium and 26 low findings. The high ones were numbers shown to users: the L and C
  labels read up to 11 % low, the ghost distance in one example was doubled, and the edge shift of a series L on a
  short was halved.
- All findings were fixed in v0.8.11 (see the [changelog](../CHANGELOG.md)). A re-check of the changed places is
  pending.

"Checked" below means that the bibliographic fields were compared with the title page, copyright page or first page
of the source, and that the statement was found at the location given. The source documents themselves are not in
the repository.

Numbers 1 to 27 match the [README's reference list](../README.md#references). The roadmap's footnotes [1] to [4] are
numbers 16, 26, 29 and 30 here.

## Cited in the repository

1. D. M. Pozar, *Microwave Engineering*, 4th ed. Hoboken, NJ, USA: Wiley, 2012.

   *Supports:* the ABCD matrix and the cascade, Sec. 4.4, pp. 189–192; the reflection coefficient, eq. (2.35), p. 57,
   which also gives the phase turn of a series L on a short; the shorted and open stub, eqs. (2.45c) and (2.46c),
   the latter on p. 61, including the quarter-wave null; per-unit-length R′, L′, C′, Table 2.1, p. 54, exact for a parallel-plate
   line, which is the basis of the tool's scaling assumption; surface resistance, eq. (1.114), p. 31, and
   α_c = R/(2Z₀), eq. (2.85a), p. 79; the single-section transformer that gives the Beatty closed form,
   eqs. (5.39)–(5.41), pp. 250–251; tapers, p. 263; the Bloch relation, eq. (8.9a), p. 383; the image-parameter
   T pad, eqs. (8.27)–(8.31), pp. 388–390; return loss through an attenuator, eq. (12.3a), p. 560; microstrip,
   pp. 141 and 148–149, and its frequency-dependent ε_eff, eq. (3.200), p. 150.

   *Cited in:* README, validation report, engine comments, `validation/models.py`.

2. D. A. Frickey, "Conversions between S, Z, Y, h, ABCD, and T parameters which are valid for complex source and
   load impedances," *IEEE Trans. Microw. Theory Techn.*, vol. 42, no. 2, pp. 205–211, Feb. 1994,
   doi: [10.1109/22.275248](https://doi.org/10.1109/22.275248).

   *Supports:* ABCD to S with unequal real port impedances, Table III, p. 208, matched term by term.

   *Cited in:* README, engine comments.

3. A. R. Djordjević, R. M. Biljić, V. D. Likar-Smiljanić, and T. K. Sarkar, "Wideband frequency-domain
   characterization of FR-4 and time-domain causality," *IEEE Trans. Electromagn. Compat.*, vol. 43, no. 4,
   pp. 662–667, Nov. 2001, doi: [10.1109/15.974647](https://doi.org/10.1109/15.974647).

   *Supports:* the dielectric model, eq. (5), p. 665 (the tool leaves out its DC-conductivity term); a dielectric with
   constant Dk and Df is not causal, pp. 665–666, Fig. 5; the conductor term, eq. (9), p. 666. Its own corner
   frequencies are 10⁴ and 10¹² rad/s, not the tool's defaults.

   *Cited in:* README, validation report, engine comments.

4. S. H. Hall and H. L. Heck, *Advanced Signal Integrity for High-Speed Digital Designs*. Hoboken, NJ, USA: Wiley,
   2009.

   *Supports:* the infinite-pole (Djordjevic-Sarkar) model, eq. (6-29), p. 266, and anchoring it at one (Dk, Df)
   point, Sec. 6.3.5, pp. 266–268; non-causal dielectric, Sec. 8.2.1, p. 332; the skin effect, p. 216, and the
   DC-to-skin transition, eq. (5-13), p. 209; causality of the conductor term, pp. 201–202 and App. E, p. 650;
   surface roughness, Sec. 5.3; back-drilled via stubs, p. 435.

   *Cited in:* README, validation report, engine comments.

5. Y. Shlepnev, "Broadband material model identification with GMS-parameters," in *Proc. IEEE 24th Elect. Perform.
   Electron. Packag. Syst. (EPEPS)*, San Jose, CA, USA, Oct. 2015, pp. 155–158,
   doi: [10.1109/EPEPS.2015.7347151](https://doi.org/10.1109/EPEPS.2015.7347151).

   *Supports:* defining a wideband dielectric model by Dk and Df at one frequency, Sec. IV, p. 157.

   *Cited in:* README, engine comments.

6. scikit-rf developers, *scikit-rf*, ver. 2.2.0. [Online]. Available: https://scikit-rf.org

   *Supports:* the same Djordjevic-Svensson algebra and the 1 kHz and 1 THz corner defaults (class
   `DefinedAEpTandZ0`); trapezoid-rule integration in `Network.step_response`; the window defaults (Kaiser β = 6 in
   `windowed()` and `time_gate()`, Hamming in `step_response()` and `impulse_response()`); `extrapolate_to_dc`
   defaults to `kind='cubic'`. Read from the 2.2.0 source.

   *Cited in:* README, validation report, page note, engine comments, the validation code.

7. A. Arsenovic *et al.*, "scikit-rf: An open source Python package for microwave network creation, analysis, and
   calibration [Speaker's Corner]," *IEEE Microw. Mag.*, vol. 23, no. 1, pp. 98–105, Jan. 2022,
   doi: [10.1109/MMM.2021.3117139](https://doi.org/10.1109/MMM.2021.3117139).

   *Supports:* the citation for scikit-rf itself.

   *Cited in:* README, validation report.

8. Panasonic, "Laminate R-5775(N), prepreg R-5670(N): High speed, low loss multi-layer materials (low Dk glass cloth
   version)," Data Sheet No. 17061630, Jun. 2017.

   *Supports:* the default material, Dk 3.35 and Df 0.004 at 12 GHz (0.75 mm core, disk-resonator method). Superseded
   by No. 22040130, Apr. 2022, which gives 3.34 and 0.0037 at 13 GHz; the tool keeps the 2017 point.

   *Cited in:* README, page note.

9. H. A. Wheeler, "Formulas for the skin effect," *Proc. IRE*, vol. 30, no. 9, pp. 412–424, Sep. 1942,
   doi: [10.1109/JRPROC.1942.232015](https://doi.org/10.1109/JRPROC.1942.232015).

   *Supports:* the surface impedance of a good conductor, resistance equal to internal reactance, eqs. (5)–(7),
   p. 415, for smooth conductors at least two skin depths thick.

   *Cited in:* README, validation report, engine comments.

10. H. Johnson and M. Graham, *High-Speed Signal Propagation: Advanced Black Magic*. Upper Saddle River, NJ, USA:
    Prentice Hall, 2003.

    *Supports:* the skin term with its internal inductance and why causality needs it, Sec. 2.8, pp. 70–71; adding
    R_dc to the skin term, eq. [2.51], pp. 71–73 and 75; TDR creep from series resistance, pp. 169–171, 188–189 and
    205; the minimum-loss pad, Table 5.6, pp. 315–317; corner capacitance, p. 304; coupling in a serpentine, p. 612.

    *Cited in:* README, validation report, page note, engine comments, `doc/FILE_FORMAT.md`.

11. C. Svensson and G. E. Dermer, "Time domain modeling of lossy interconnects," *IEEE Trans. Adv. Packag.*, vol. 24,
    no. 2, pp. 191–196, May 2001, doi: [10.1109/6040.928754](https://doi.org/10.1109/6040.928754).

    *Supports:* the same dielectric function, eq. (11), pp. 192–193; non-causal constant Dk and Df, Fig. 1, p. 192;
    the causal skin term, eq. (5), pp. 191–192.

    *Cited in:* README.

12. J. F. Kaiser and R. W. Schafer, "On the use of the I0-sinh window for spectrum analysis," *IEEE Trans. Acoust.,
    Speech, Signal Process.*, vol. ASSP-28, no. 1, pp. 105–107, Feb. 1980,
    doi: [10.1109/TASSP.1980.1163349](https://doi.org/10.1109/TASSP.1980.1163349).

    *Supports:* the Kaiser window, eq. (1), p. 105. The paper calls the parameter α; the tool calls it β.

    *Cited in:* README, engine comments.

13. SciPy developers, "scipy.signal.windows.kaiser," in *SciPy v1.18.0 Manual*. [Online]. Available:
    https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.windows.kaiser.html

    *Supports:* the same window definition, in current form. The engine's window equals NumPy's to 1e-15.

    *Cited in:* README, engine comments.

14. P. J. Pupalaikis, *S-Parameters for Signal Integrity*. Cambridge, U.K.: Cambridge Univ. Press, 2020,
    doi: [10.1017/9781108784863](https://doi.org/10.1017/9781108784863).

    *Supports:* Z = Z_Tx(1 + ρ)/(1 − ρ), eq. (14.6), pp. 442–443; ABCD to S, Table 3.6, p. 60 (its B and C carry
    the opposite sign, from its ABCD definition); TDR creep on a lossy line, p. 456. Not a source for the (1 + j) conductor
    form: p. 188 uses R + R_se√f with a constant L.

    *Cited in:* README, engine comments.

15. Keysight Technologies, "High precision time domain reflectometry (TDR)," Appl. Note 5988-9826EN, Jan. 29, 2024.

    *Supports:* resolution as the one-way distance v·t_r/2 that two reflections need to show separately, a rule of
    thumb, p. 14.

    *Cited in:* README.

16. Keysight Technologies, "Transformation to time domain," E5071C network analyzer online help. [Online].
    Available: https://helpfiles.keysight.com/csg/e5071c/measurement_with_options/time_domain_analysis/transformation_to_time_domain.htm

    *Supports:* the 10–90 % step rise time from 0.45/f_max (Kaiser β = 0) to 1.466/f_max (β = 13); the window sets
    rise time and ringing together.

    *Cited in:* README, roadmap.

17. D. J. Dascher, "Measuring parasitic capacitance and inductance using TDR," *Hewlett-Packard J.*, vol. 47, no. 2,
    pp. 83–96, Apr. 1996.

    *Supports:* the TDR area method, L = 2Z₀∫ρ dt and C = −(2/Z₀)∫ρ dt over round-trip time, pp. 88–91; the time
    constants Z₀C/2 (p. 88) and L/(2Z₀) (p. 89).

    *Cited in:* README, engine comments.

18. Optical Internetworking Forum, "Common electrical I/O (CEI): Electrical and jitter interoperability agreements
    for 6G+ bps, 11G+ bps, 25G+ bps I/O and 56G+ bps," Implementation Agreement OIF-CEI-04.0, Dec. 29, 2017.
    [Online]. Available: https://www.oiforum.com/wp-content/uploads/2019/01/OIF-CEI-04.0.pdf

    *Supports:* the fitted insertion loss a₀ + a₁√f + a₂f + a₄f², Sec. 12.2.1.1, eq. (12-1), p. 251; the |S21|
    weighting, eqs. (12-2) and (12-3), pp. 251–252; the 0.05 GHz lower limit, Table 10-4, p. 221; ILD = IL − IL_fitted,
    eq. (10-3), p. 221.

    *Cited in:* README, page note, engine comments, tests.

19. A. Healey, "Proposed text for fitted insertion loss," IEEE P802.3ba Task Force, San Francisco, CA, USA,
    doc. healey_05_0709, Jul. 15, 2009. [Online]. Available:
    https://www.ieee802.org/3/ba/public/jul09/healey_05_0709.pdf

    *Supports:* the origin of the idea: a three-term fit a₁√f + a₂f + a₄f² from 50 MHz to 7.5 GHz, eq. (1), p. 1,
    and ILD = IL − IL_fitted, eq. (4), p. 2. Not the four-term fit the tool uses.

    *Cited in:* README.

20. W. M. Middleton and M. E. Van Valkenburg, Eds., *Reference Data for Engineers: Radio, Electronics, Computer, and
    Communications*, 9th ed. Boston, MA, USA: Newnes, 2002, ch. 11.

    *Supports:* the minimum-loss pad formula as printed, and that the bound holds for a pad matched at both ends,
    p. 11-3.

    *Cited in:* README, page note, engine comments, `doc/FILE_FORMAT.md`.

21. H. Johnson, "Who's afraid of the big bad bend?," *EDN*, May 11, 2000. [Online]. Available:
    https://sigcon.com/Pubs/edn/bigbadbend.htm

    *Supports:* about 0.012 pF per 90° corner, for an 8 mil, 50 Ω microstrip in FR-4.

    *Cited in:* README, the serpentine example.

22. E. Hammerstad and Ø. Jensen, "Accurate models for microstrip computer-aided design," in *IEEE MTT-S Int.
    Microw. Symp. Dig.*, Washington, DC, USA, May 1980, pp. 407–409,
    doi: [10.1109/MWSYM.1980.1124303](https://doi.org/10.1109/MWSYM.1980.1124303).

    *Supports:* for 42 Ω on Dk 3.35, W/h = 3.04 and ε_eff = 2.71, eqs. (1)–(5), p. 407, and the dielectric loss
    factor 0.90, eq. (33), p. 408.

    *Cited in:* README, the microstrip examples.

23. FormFactor, "InfinityXT probe: RF/mmW probe series," Data Sheet INFINITYXT-DS-0820, 2020.

    *Supports:* typical contact resistance under 0.05 Ω on aluminum pads and under 0.02 Ω on gold pads, p. 3.

    *Cited in:* README, the probing examples.

24. FormFactor, "Infinity Probe mechanical layout rules," Appl. Note InfLayoutRule-AN-1115, 2022; and FormFactor,
    "Layout rules for GHz-probing," Appl. Note Layout-0720, 2020.

    *Supports:* SG and GS probes have about four times the common-mode inductance of GSG probes,
    InfLayoutRule-AN-1115, p. 2, a ratio only and not a value for a lifted ground; that a probe cannot land on a buried
    stripline, pp. 5–6 (with number 1, p. 141).

    *Cited in:* README, the probing examples.

25. [Author not named on the slides], "Probe tip characterization using self-calibration," Lab. RF Modeling,
    Fachhochschule Würzburg-Schweinfurt, presented at AK Bipolarmodellierung, 2008. [Online]. Available:
    https://www.iee.et.tu-dresden.de/iee/eb/forsch/AK-Bipo/2008/AKB2008_10_Baureis_Probe_Characterization2.pdf

    *Supports:* the short standard reads 49.8 pH through a Cascade ACP GS probe and 2.4 pH through an HPC GSG
    (slide 10), and 4.8 pH through an ACP40 GSG (slide 11). These are figures for scale; none is a lifted ground.

    *Cited in:* README, the probing examples.

26. E. Bogatin, *Bogatin's Practical Guide to Transmission Line Design and Characterization for Signal Integrity
    Applications*. Norwood, MA, USA: Artech House, 2020.

    *Supports:* time to distance with one velocity, Sec. 9.2, eqs. (9.1) and (9.2), pp. 224–226; Z from ρ,
    eq. (9.16), p. 254; the step on a second mismatch is (1 + ρ₁) times the original, eq. (9.17), pp. 254–255;
    masking, Sec. 9.9, pp. 254–257; series resistance makes the reflected voltage rise, Sec. 10.6, p. 272, and does
    so from both ends while a real taper flips its slope, p. 274.

    *Cited in:* README, roadmap.

27. PKWARE Inc., "APPNOTE.TXT – .ZIP file format specification," ver. 6.3.10, Nov. 1, 2022. [Online]. Available:
    https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT

    *Supports:* the `.tdrp` file is a standard ZIP archive.

    *Cited in:* README, `src/tdrp.js`.

28. Anritsu, "Verification kit components," in *VectorStar MS4640A Series Microwave Vector Network Analyzer
    Calibration and Measurement*, doc. 10450-00008, Rev. L, ch. "Verification." [Online]. Available:
    https://dl.cdn-anritsu.com/en-us/test-measurement/ohs/10450-00008L/Calibration_and_Measurement/MG_Ch11_VerificationTools.12.3.html

    *Supports:* the name and idea of the stepped-impedance "Beatty" standard. Its 25 Ω and 1 in in the validation are
    the tool's own values.

    *Cited in:* validation report.

29. Keysight Technologies, "Time domain," E5080B network analyzer online help. [Online]. Available:
    https://helpfiles.keysight.com/csg/e5080b/Time/TimeDomain.htm

    *Supports:* time gating does not undo masking (section "Gating"); the step rise time may be defined by
    10–90 % or 20–80 %.

    *Cited in:* roadmap.

30. Keysight Technologies, ":GRAPh:T:OHMS:X:DCONstant," FlexDCA programming online help. [Online]. Available:
    https://helpfiles.keysight.com/scopes/FlexDCA-PG/Content/Topics/Commands/GRAPh/T_OHMS_X_DCONstant.htm

    *Supports:* a TDR's distance axis uses one dielectric constant for the whole path.

    *Cited in:* roadmap.

31. E. Bogatin, *Signal and Power Integrity—Simplified*, 3rd ed. Boston, MA, USA: Prentice Hall, 2018.

    *Supports:* the dielectric-loss rule of thumb α ≈ 2.3·f·Df·√Dk dB/in, Sec. 9.11, eq. (9-69); the quarter-wave
    notch of a via stub, Sec. 12.14.

    *Cited in:* `test/engine.test.js`, which prints the rule for comparison.

## Checked but not cited

These were read for the check and either agree with sources already cited or were set aside.

32. Y. Shlepnev and M. Marin, "40 GHz PCB interconnect validation: Expectations vs. reality," *Microw. J.*,
    Mar. 13, 2019. [Online]. Available:
    https://www.microwavejournal.com/articles/31901-ghz-pcb-interconnect-validation-expectations-vs-reality

    *Supports:* identifying a dielectric model from Dk and Df at one frequency. Numbers 4 and 5 are cited instead.

33. W. Beyene, Y.-C. Hahm, J. Ren, D. Secker, D. Mullen, and Y. Shlepnev, "Lessons learned: How to make predictable
    PCB interconnects for data rates of 50 Gbps and beyond," presented at DesignCon, 2014. [Online]. Available:
    https://signalintegrityjournal.com/ext/resources/article-images-2017/Lessons-learnedHow-to-Make-Predictable-PCB-Interconnects/Lessons-learned_-How-to-Make-Predictable-PCB-Interconnects.pdf

    *Supports:* the same one-point identification. Numbers 4 and 5 are cited instead.

34. Rohde & Schwarz, "Using TDR to debug signal integrity issues," Appl. Note, ver. 1.00, PAD-T-M:
    3572.7186.00/01.00/EN, Aug. 2020. [Online]. Available:
    https://cdn.rohde-schwarz.com/pws/campaigns/rsa/Rohde_Schwarz_AppliedTDRforSignalIntegrity_AppNote.pdf

    *Set aside:* on resolution, p. 6 states the travel-time condition the wrong way round and p. 7 does not show the
    factor ½ clearly. Number 15 is cited instead.

35. C. Rauscher, *Fundamentals of Spectrum Analysis*, 1st ed. Rohde & Schwarz, 2001.

    *Supports:* a 25 Ω series resistor between 75 and 50 Ω loses about 1.8 dB and matches one side, p. 35: the
    counter-example that led to "matched at both ends" in the pad hint.

36. S. J. Orfanidis, *Electromagnetic Waves and Antennas*. Rutgers Univ., 2008. [Online]. Available:
    https://www.ece.rutgers.edu/~orfanidi/ewa

    *Supports:* the Kaiser window, eq. (20.4.5), p. 807. Number 13 is cited instead.

## Withdrawn or not read

37. Y. Shlepnev, U.S. Patent 8 577 632, 2013, on identifying the permittivity of a transmission-line dielectric.
    Not checked and not cited, at the author's request.

38. Analog Devices, Appl. Note AN-972, on a minimum-loss pad for 75 Ω measurements. Not read: the page returned
    "Access Denied". Numbers 1 and 10 cover the pad.

39. Tektronix, FAQ on the smallest discontinuity a TDR can measure. Withdrawn: the page no longer exists (HTTP 410).
    Number 15 states the resolution rule.

40. *IEEE Standard for Ethernet*, IEEE Std 802.3-2022, 2022, doi:
    [10.1109/IEEESTD.2022.9844436](https://doi.org/10.1109/IEEESTD.2022.9844436). Not read; number 18 is cited for
    the ILD fit. The place to check is Annex 93A, subclause 93A.3.

41. Hewlett-Packard, "Time domain reflectometry theory," Appl. Note 1304-2, pub. 5966-4855E, 1998 (© 1988).
    Replaced by number 26, which covers every statement it was cited for.

42. J.-P. Joosting, "TDR interconnect analysis – applications, measurement caveats, tips and techniques," *eeNews
    Europe*, Feb. 5, 2018. Withdrawn: a secondary source, and both statements it supported are in number 26,
    Sec. 10.6.

43. IEEE P802.3bm Task Force, Annex 83D, in IEEE Draft P802.3bm/D3.1, Jul. 22, 2014. Read as evidence only: it uses
    the same four fit coefficients, in the same units, and points to subclause 93A.3. An unapproved draft, so it is
    not cited.

## Statements without a published source

These are stated in the repository on other grounds, and say so where they appear.

- **70 pH for a lifted ground tip:** a contributor's value, matched to a TDR he measured with a 150 µm GSG probe.
  No published value was found. Numbers 24 and 25 give GS and GSG figures for scale only.
- **2 Ω as a poor probe contact:** an illustrative value. No published typical value was found.
- **Derivations:** a one-port cannot tell signal-tip from ground-tip resistance, and the two ground tips count in
  parallel; a series R makes the line beyond it read R higher down to DC; a compensated pad behaves like a line of
  √(L/C); a span of another Dk appears len·√(Dk_span/Dk_line) long on a lossless line; the S21 and the peak of the
  Beatty closed form follow from Pozar eq. (5.41).
- **The scaling of R′ and L′ with Z and of C′ with 1/Z:** exact for a parallel-plate line (number 1, Table 2.1) and
  a modelling assumption otherwise. It is stated as such in the README and the validation report.
- **Numbers in the example notes:** computed with the engine. The check re-ran them with its own scripts.
