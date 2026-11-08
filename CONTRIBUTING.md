# Contributing

The easiest way to help is a new **example**: a small channel that teaches one SI/PI idea well. Ideas without a file are welcome too; open an issue with the [*Example idea* template](https://github.com/Sparamix/tdr-painter/issues/new?template=example-idea.md).

## Submit an example

1. Build it in the page: paint the profile, drop in elements, set the line and sweep parameters.
2. Click **Export JSON** (not Save, which writes the compressed `.tdrp`).
3. Add an `example` block next to `format`, `params` and the rest:

   ```json
   "example": {
     "category": "TDR artifacts",
     "note": "What to look at, and what to try next. One short paragraph.",
     "author": "Your name or handle"
   }
   ```

   `category` is one of `Basics`, `Discontinuities`, `TDR artifacts`, `Realistic channels` or `Community`. The note shows above the plot when the example loads, so write it for the person looking at the screen: name the feature, say where it is, and suggest one thing to change. Keep it under 600 characters.
4. Save it as `examples/NN-short-slug.json`. The two-digit prefix sets the order in the menu; pick a free number in your category's range (10s Basics, 20s Discontinuities, 30s TDR artifacts, 40s Realistic channels, 50s and up Community).
5. Run `npm test` (Node 18 or later, no installs). `test/examples.test.js` opens your file with the page's own parser and fails if any value is out of range, the note is missing, or the simulated S-parameters are not passive. Then open a [pull request](https://github.com/Sparamix/tdr-painter/pulls).

## Ground rules for examples

- **Only data you may share.** Synthetic structures are ideal. Never submit measured or extracted data from a product or a design under NDA, even reduced to an impedance profile.
- **Teach one thing.** If the note needs more than a paragraph, it is probably two examples.
- **Check the claim.** If the note says a notch sits at 27 GHz, it should be there with the parameters in the file. Reviewers will load it.

## Bugs and questions

Open an [issue](https://github.com/Sparamix/tdr-painter/issues). For a wrong result, attach the project file (Export JSON) and say what you expected and why: a closed form, a measurement, another tool. Physics corrections are the most valuable reports this project gets.

## Code changes

Keep the page dependency-free and offline: no network requests, no browser storage, no external scripts or fonts. `npm test` enforces this (`test/privacy.test.js`). For UI changes, `python test/ui_smoke.py` runs the page in Chrome (needs Playwright).

Engine changes should keep `python validation/run_validation.py` passing (see [`validation/`](validation/README.md)); if a change moves a result on purpose, say why in the pull request.

By contributing you agree that your contribution is licensed under the GNU GPL v3 or later, like the rest of the project.
