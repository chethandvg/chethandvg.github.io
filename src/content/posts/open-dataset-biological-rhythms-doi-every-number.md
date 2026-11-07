---
title: "Every number has a DOI: a dataset of the rhythms of early life"
description: "40 measured rhythms of early life, from sperm beat to embryonic heart rate, each with its species, method and DOI, re-checked for retractions weekly."
pubDate: 2026-11-16
tags: [opendata, science, rust, opensource]
repo: biological-rhythms-dataset
series: "Frequencies of Life"
draft: true
---

A fertilised human egg fires a wave of calcium roughly every 10 to 35 minutes. A mouse egg does the same thing about every three and a half minutes. Both numbers are true, and they are easy to confuse: the first draft of this project's own report quoted the mouse range for human eggs.

Everything else in this series turns rhythms like these into maths, sound and code, so they need a home where that cannot happen. This post is about that home: a small dataset in which every number carries its species, its method and the paper it came from, and in which CI keeps asking whether that paper still stands.

## One measurement, one species, one source

The dataset holds 40 measurements: calcium spikes and zinc sparks when an egg is activated, the beat of the sperm tail, the cilia of the fallopian tube, uterine contractions, the times of the first cell divisions, embryonic heart rate, the segmentation clock that lays down the vertebrae, and the stage at which the embryo's own genes switch on.

The rule that shapes everything is that a record is one measurement in one species. There is no "egg calcium interval"; there is a human one and a mouse one, with different ids, methods and sources. This is the human record as I edit it, in `data/rhythms.yaml`:

```yaml
  taylor1993: &taylor1993
    topic: egg-activation
    species: Homo sapiens
    stage: "Oocyte donated during IVF treatment, inseminated in vitro"
    method: "Aequorin Ca2+ measurement with a photomultiplier in eggs donated during IVF treatment, zona-intact and zona-free, inseminated under perfusion"
    n: 10
    n_unit: "eggs with Ca2+ transients, of 26 inseminated"
    sources: [taylor1993]
```

```yaml
  - <<: *taylor1993
    id: bio:HUMAN-CA-SPIKE-INTERVAL
    quantity: "Interval between Ca2+ spikes in human eggs at fertilisation"
    kind: period
    min: 10
    max: 35
    unit: min
    statistic: range
    notes: "Amplitude (up to 2.5 µM), duration and interval were similar in zona-intact and zona-free eggs. Only 10 of 26 inseminated eggs responded."
```

The source is Taylor et al. 1993 in Human Reproduction (doi:10.1093/oxfordjournals.humrep.a137999), and the sample size is part of the record: only 10 of the 26 eggs responded. The mouse value, 3.4 minutes on average, comes from zona-free eggs imaged with fluo-3 by Kline and Kline in 1992 (Developmental Biology, doi:10.1016/0012-1606(92)90265-i), and it sits in its own record.

The same paper often gives several measurements, so shared fields are written once and merged in with a YAML anchor. That keeps the file short without copying a method description eleven times.

Each record also says what its number is: a mean, a median, a range, an estimate. Human sperm beat at a median of 19 Hz when they swim in diluted semen, but at 10 Hz in a viscous medium (Gallagher et al. 2019, Human Reproduction, doi:10.1093/humrep/dez056, 205 and 119 cells). A single "sperm beat at 15 Hz" would be a number nobody measured.

## Checks a schema cannot do

The YAML is validated against a JSON Schema, which catches missing fields and impossible units. Some rules are about meaning, though, and those live in the build script:

```python
        if not rid.startswith(f"bio:{prefix}-"):
            errors.append(
                f"{rid}: the id must start with bio:{prefix}- for {r['species']}"
            )
        if word not in r["quantity"].lower():
            errors.append(f"{rid}: the quantity must name the species ('{word}')")
```

A record whose species is *Mus musculus* must have an id that starts with `bio:MOUSE-` and a description that says "mouse". It is a blunt rule, and it is meant to be: if I ever paste a mouse number into a human record, the build fails before anyone reads it.

The YAML is the only file I edit. `scripts/build.py` generates everything else from it: a JSON file, a CSV for spreadsheets, the measurement tables in the README, and one claim per record in the repository's claims ledger. CI runs it with `--check`, so a generated file that has drifted from the source fails the build.

The claim generated for the human calcium record reads:

```yaml
  - id: bio:HUMAN-CA-SPIKE-INTERVAL
    version: 1.0.0
    level: R
    statement: "Interval between Ca2+ spikes in human eggs at fertilisation: 10–35 min (range; n = 10 eggs with Ca2+ transients, of 26 inseminated)."
```

Level R means referenced: the number is reported in a paper, not proved by anything in this repository.

## The dataset caught one of my mistakes

The toolkit this project grew out of had a table of human embryo timings, and its comment said that t6 and t7, the times to reach six and seven cells, were interpolated because the study only published t5 and t8. When I checked each value against the paper's Table 5 for this dataset, that turned out to be wrong. The study (Lorenzo Rodríguez et al. 2026, JBRA Assisted Reproduction, doi:10.5935/1518-0557.20260005) reports both: 54.25 and 57.57 hours after insemination, as means in its fresh-sperm group of 2,523 correctly fertilised human oocytes. My interpolated guesses were 55.0 and 58.5.

Neither the gap nor the size of the error matters much on its own. What matters is that the old table could not have told me it was wrong, because it held numbers without saying where each one came from.

## Re-checking the sources every week

Papers change after they are published. They are corrected, and sometimes retracted. The repository's hygiene workflow runs on a schedule:

```yaml
  schedule:
    - cron: "23 4 * * 1" # weekly, to catch newly retracted sources
```

Every Monday it resolves every DOI with Crossref and every PubMed ID with PubMed, and fails if any source is retracted or withdrawn. A correction does not fail the build, but it is shown. This is part of the real output for the human segmentation clock, which runs with a period of about five hours in human cells grown in a dish:

```text
claim                                           source                                     status  detail
bio:HUMAN-SEGMENTATION-CLOCK-PERIOD             doi:10.1038/s41586-020-2144-9              ok      2020 Recapitulating the human segmentation clock with pluripot...
bio:HUMAN-SEGMENTATION-CLOCK-PERIOD             pmid:32238941                              ok      2020 Recapitulating the human segmentation clock with pluripot...
bio:HUMAN-SEGMENTATION-CLOCK-PERIOD             doi:10.1038/s41586-019-1885-9              ok      2020 In vitro characterization of the human segmentation clock; correction 10.1038/s41586-026-10651-z (2026-05-26)
```

Diaz-Cuadros et al. 2020 (Nature, doi:10.1038/s41586-019-1885-9) received an editor's note in 2024 about errors in its cell-tracking code, and an author correction in 2026 that says its conclusions still hold. The dataset flags the record as contested and keeps a second, independent source beside it (Matsuda et al. 2020, Nature, doi:10.1038/s41586-020-2144-9). If either paper were ever retracted, the record would turn the build red the following Monday.

## Small helpers, one proof

The data is embedded in a Rust crate, with Python and WebAssembly bindings, and a few helpers sit on top. `heart_rate_at` interpolates the median human embryonic heart rate between the weekly values of Ouyang et al. 2020 (BMC Pregnancy and Childbirth, doi:10.1186/s12884-020-03186-2), measured in 30,416 IVF pregnancies: 117 bpm at six weeks, 176 at nine, 174 at ten.

```rust
fn lerp((w0, b0): (f64, f64), (w1, b1): (f64, f64), x: f64) -> f64 {
    (b0 + (x - w0) * (b1 - b0) / (w1 - w0)).clamp(b0.min(b1), b0.max(b1))
}
```

The Lean proof says that, in exact arithmetic, this formula never leaves the range of the two measurements on either side:

```lean
theorem lerp_between {w₀ w₁ x : ℝ} (b₀ b₁ : ℝ) (hw : w₀ < w₁) (h₀ : w₀ ≤ x) (h₁ : x ≤ w₁) :
    min b₀ b₁ ≤ lerp w₀ b₀ w₁ b₁ x ∧ lerp w₀ b₀ w₁ b₁ x ≤ max b₀ b₁ := by
```

In plain English: between the nine- and ten-week medians, the interpolated rate is never above 176 or below 174 bpm. The `clamp` in the Rust makes floating-point rounding obey the same rule, and the golden vectors check sample results against an oracle that computes with exact fractions.

One choice in this function is neither proved nor measured, and the ledger says so. The paper gives one median per gestational week, which most likely covers the whole week, from 6+0 to 6+6 days and so on, so I place each median at the middle of its week: 6.5 weeks for week six, treating age within the week as continuous. Counted in whole days, the middle would be 6+3, half a day earlier, which moves the curve by 2 bpm at most. The paper's own fitted curve supports that: at mid-week it lies within 5 bpm of every median, but at 6.0 weeks it gives 99 bpm, 18 below the six-week median. The choice is recorded as an M claim, a model assumption, and `heart_rate_at` declares that it depends on it. Before the middle of week six or after the middle of week ten, the function refuses to answer, because there is no median to interpolate from.

`frequency_hz` turns any period or rate into hertz with the conversions proved in [rhythm-units](https://github.com/chethandvg/rhythm-units), so a human egg's calcium spike every 10 to 35 minutes becomes 1/2100 to 1/600 Hz. It rejects durations and stages: a two-minute human calcium spike (Taylor et al. 1993) has a length, not a frequency.

## What this does not show

The only things proved here are about interpolation. Every measurement is referenced, not proved, and is only as good as its paper. Several come from small samples. The human zinc spark was seen in eggs activated without sperm (Duncan et al. 2016, Scientific Reports, doi:10.1038/srep24737), and the human segmentation clock has only been recorded in cells in a dish. The records say so in their notes, but a note cannot fix the underlying evidence.

A retraction check is not a correctness check either. A paper can be wrong for years without being retracted, and many papers cite numbers they never measured. The weekly check catches the one failure that publishers record; reading the methods is still my job, and yours.

Finally, the helpers describe the average embryo. A real human embryo can reach eight cells hours before or after 61.5 hours, and no single pregnancy follows the median heart rate. The heart-rate curve also rests on the mid-week assumption above: the paper uses the gestational day divided by 7 as the gestational week, but its methods state no rule for assigning scans to whole weeks, so if the authors grouped them differently, the offset changes, and so does every interpolated value.

## Try it

The data, the build script, the proofs and the bindings are in [biological-rhythms-dataset](https://github.com/chethandvg/biological-rhythms-dataset), and the [hub page](/frequencies-of-life/repos/biological-rhythms-dataset/) lists every record with its source. The CSV is plain UTF-8, ready for pandas, R or a spreadsheet's import dialog. If you find a value that its paper does not support, the repository has an issue form for claim corrections.

Later posts in the series put these numbers to work, and each of them will have to say which species, and which paper, it means.
