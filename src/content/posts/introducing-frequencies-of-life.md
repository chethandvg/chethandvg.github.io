---
title: "Frequencies of Life: proved code for the rhythms of life"
description: "A new open series: small repositories that turn life's rhythms into proved maths, tested code and sound, and say how every claim is known."
pubDate: 2026-11-08
tags: [opensource, lean4, rust, science]
series: "Frequencies of Life"
draft: true
---

A fertilised human egg doesn't make a sound, but it does keep time. In the hours after a sperm fuses with it, the calcium level inside the egg rises and falls again and again, roughly once every 10 to 35 minutes ([Taylor et al. 1993, *Human Reproduction*](https://doi.org/10.1093/oxfordjournals.humrep.a137999)). The sperm that started it all beats its tail about 19 times a second in diluted semen and about 10 times a second in thicker, more viscous fluid ([Gallagher et al. 2019, *Human Reproduction*](https://doi.org/10.1093/humrep/dez056)). A few weeks later, the embryo's heart beats at a median of about 176 beats per minute at 9 weeks ([Ouyang et al. 2020, *BMC Pregnancy and Childbirth*](https://doi.org/10.1186/s12884-020-03186-2)).

All of these are frequencies. That simple observation is the starting point of **Frequencies of Life**, an open series of small repositories that I'm starting today.

## Why another project about "frequency"?

Search the web for "frequency" and "life" and you'll find plenty of confident claims: healing tones, cells that sing, a frequency that repairs DNA. When I went through the research, the real story turned out to be more interesting and far more careful. A few things are proved mathematics. Some are well-measured facts. Some are models that might be wrong. Many popular claims have no evidence at all.

So this project has one rule: **every claim says how it is known.**

| Level | Meaning | How it's checked |
|---|---|---|
| **P** | Proved | A Lean 4 proof that CI rebuilds on every change |
| **V** | Verified numerically | Interval arithmetic or an exhaustive check |
| **T** | Tested | Shared golden vectors, checked in every language |
| **R** | Referenced | A DOI or PubMed ID, re-checked for retractions every week |
| **M** | Model assumption | Stated in plain words, never presented as fact |

Each repository keeps its claims in a `claims.yaml` file. Here is a real one from the first foundation repo:

```yaml
- id: rhythm:SCALE-RATIO-INVARIANT
  version: 1.0.0
  level: P
  statement: "Speeding time up by any non-zero factor leaves the ratio between any two frequencies unchanged."
  depends_on: ["rhythm:TIME-SCALING-FREQUENCY@1"]
  proof: proofs/RhythmUnits/Basic.lean#RhythmUnits.scale_ratio_invariant
```

The claim ID is permanent, so other repositories can depend on it and anyone can cite it. If the statement ever changes meaning, its major version goes up and everything downstream gets re-checked.

## Layers instead of one big repository

Instead of one large codebase, the project is a stack of small repositories, each with its own proofs, tests and documentation:

- **Layer 0, foundations:** units, pitch and signal maths, proved where possible.
- **Layer 1, data and models:** a dataset of biological rhythms where every number carries its DOI, models of egg activation, the rules for turning data into sound, and libraries for harmony and visuals.
- **Layer 2, music and experiences:** an album that opens with a sonification of fertilisation, calm music with no health claims, and a browser music lab.
- **Layer 3, research questions** that need partners, data or ethics approval before they can start.

Each layer uses the ones below it as ordinary packages. A fix in a foundation repo flows upward, and the dependency graph shows exactly what rests on what.

## The stack

- **Lean 4 with Mathlib** for the proofs.
- **Rust** for each algorithm, written once and compiled to **Python** (PyO3) and **WebAssembly**, so the same code runs in notebooks and in the browser.
- **Golden vectors**: one JSON file of input/output cases that the Rust crate, the Python package and the WebAssembly build must all reproduce.
- **GitHub Actions**, written once in a shared repository and reused everywhere; **GitHub Pages** for the site; a **Zenodo DOI** for every release, so each version can be cited.

The foundations and the developer libraries are licensed Apache-2.0. The music and videos are CC BY 4.0, so anyone can reuse them with credit. The models, applications and data are free for non-commercial use.

## The first sprint

These repositories make up the first sprint:

- [**Shared CI and settings**](/frequencies-of-life/repos/github/) and a [**repository template**](/frequencies-of-life/repos/repo-template/), so every repo starts with the same licences, citation metadata and checks.
- [**The hub**](/frequencies-of-life/repos/chethandvg.github.io/): this site, with a page for every repository and the cross-repo dependency graph.
- [**evidence-kernel**](/frequencies-of-life/repos/evidence-kernel/): the claims format, the DOI and retraction checks, and the golden-vector runners for Rust, Python and JavaScript.
- [**rhythm-units**](/frequencies-of-life/repos/rhythm-units/): periods, frequencies and beats per minute, with a Lean proof that speeding time up keeps every ratio.
- [**pitch-math**](/frequencies-of-life/repos/pitch-math/): equal temperament, cents and octave folding, with a proof that every frequency folds into exactly one octave.

I'll write one post about each, one a day.

## What this project won't claim

- **Cells don't make audible sound.** When I play you "the sound of fertilisation" later in the series, it will be a translation of measured data (a sonification), with every mapping published.
- **No healing frequencies.** Where sound genuinely helps, for example music easing anxiety during medical procedures, the evidence entry will say how strong that evidence is.
- **Proofs have limits.** A Lean proof covers the exact mathematics. It says nothing about floating-point rounding, which the tests check instead, and nothing about biology, which only measurements can tell us.

Tomorrow: how this site runs on GitHub Pages for free, and is ready for a custom domain from day one.

All the code is on GitHub at [github.com/chethandvg](https://github.com/chethandvg).
