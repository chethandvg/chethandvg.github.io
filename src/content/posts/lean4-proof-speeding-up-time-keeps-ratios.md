---
title: "Proving in Lean 4 that speeding up time keeps every ratio"
description: "To hear a 10-minute biological rhythm you must speed it up. A Lean 4 proof shows why that keeps every ratio, and Rust does the maths."
pubDate: 2026-11-11
tags: [lean4, rust, math, webassembly]
repo: rhythm-units
series: "Frequencies of Life"
draft: true
---

Inside a fertilised human egg, calcium rises and falls about once every 10 to 35 minutes ([Taylor et al. 1993, *Human Reproduction*](https://doi.org/10.1093/oxfordjournals.humrep.a137999)). That is a frequency of roughly 0.5 to 1.7 millihertz, more than ten thousand times too slow to hear. To turn it into sound, you have to speed time up.

Speeding up a recording changes every frequency in it. The question that matters for an honest sonification is what it *doesn't* change. This post is about the first foundation repository of Frequencies of Life, [rhythm-units](https://github.com/chethandvg/rhythm-units), and the Lean 4 proofs behind it.

## The idea: scale time, keep the ratios

Play a recording at double speed and every frequency doubles. A note at 220 Hz becomes 440 Hz, and one at 330 Hz becomes 660 Hz. The ratio between them, 3:2 (a perfect fifth), stays exactly the same. That's why a sped-up melody is still the same melody, only higher.

The same holds for any speed-up factor `k`. Two calcium rhythms, one twice as fast as the other, stay "twice as fast" after any time compression. That's the guarantee a sonification needs: you can change *when* things happen without distorting *how they relate*.

## The code

rhythm-units is a small Rust crate. Every function checks that its inputs and its result are finite and positive:

```rust
/// The frequency after speeding time up by the factor `k`: f · k.
///
/// `k > 1` compresses time (a slow biological rhythm becomes audible);
/// `k < 1` stretches it.
pub fn scale_frequency(hz: f64, k: f64) -> Result<f64> {
    positive("result", positive("hz", hz)? * positive("k", k)?)
}
```

A 10-minute rhythm sped up 180 times repeats 0.3 times a second, once every 3⅓ seconds. That's slow enough to follow, but now it fits inside a piece of music:

```rust
use rhythm_units::{hz_from_period_minutes, scale_frequency};

// A rhythm with a 10-minute period, sped up 180 times, repeats 0.3 times a second.
let f = hz_from_period_minutes(10.0)?;
assert!((scale_frequency(f, 180.0)? - 0.3).abs() < 1e-15);
```

The same Rust code is compiled to a Python package (PyO3) and to WebAssembly, keeping the same function names. A Python notebook and a browser demo therefore compute exactly what the Rust crate does.

## The proof

The proofs live in `proofs/RhythmUnits/Basic.lean`. Each definition mirrors a Rust function:

```lean
/-- The frequency after speeding time up by the factor `k`. -/
def scaleFrequency (f k : ℝ) : ℝ := f * k

/-- The ratio of two frequencies. -/
noncomputable def ratio (f₁ f₂ : ℝ) : ℝ := f₁ / f₂
```

Here is the theorem this post is named after:

```lean
/-- **Ratios survive time scaling.** For any non-zero speed-up `k`, the ratio of two
sped-up frequencies equals the ratio of the original frequencies. -/
theorem scale_ratio_invariant {f₁ f₂ k : ℝ} (hk : k ≠ 0) :
    ratio (scaleFrequency f₁ k) (scaleFrequency f₂ k) = ratio f₁ f₂ := by
  unfold ratio scaleFrequency; exact mul_div_mul_right f₁ f₂ hk
```

In plain English: for any real numbers f₁, f₂ and any k that isn't zero, (f₁·k)/(f₂·k) = f₁/f₂. The proof is one line because Mathlib already has the lemma `mul_div_mul_right`. That's part of the point: a proof assistant lets you build on decades of checked mathematics instead of trusting your own algebra.

The deeper statement is about signals, not numbers. If a signal `x` repeats every `T` seconds, the sped-up signal `t ↦ x(k·t)` repeats every `T / k`:

```lean
theorem time_scaling_periodic {α : Type*} {x : ℝ → α} {T : ℝ} (hx : Function.Periodic x T)
    (k : ℝ) : Function.Periodic (fun t => x (k * t)) (scalePeriod T k) := by
  simpa [scalePeriod, div_eq_inv_mul] using hx.const_mul k
```

Even the example above is a theorem. `ten_minutes_sped_up_180` proves that a 10-minute rhythm sped up 180 times has a frequency of exactly 3/10 Hz.

CI rebuilds all 12 theorems on every change and audits their axioms. Each one may use only Lean's three standard axioms (`propext`, `Classical.choice`, `Quot.sound`), and any `sorry` placeholder fails the build.

## One subtle detail: dividing by zero

Lean defines `1 / 0 = 0`. That's a convention that keeps division total, and it means this theorem holds for *every* real `T`, zero included:

```lean
theorem period_hz_roundtrip (T : ℝ) : periodFromHz (hzFromPeriod T) = T := by
  simp [periodFromHz, hzFromPeriod]
```

A period of zero seconds is meaningless, though, so the Rust code rejects it with an error instead of returning 0. The proofs describe the mathematics, and separate tests check how the code handles inputs that make no sense. Every claim in the repo says which kind of evidence backs it.

## Golden vectors: one set of answers for three languages

The tests use **golden vectors**: a JSON file of 38 cases that the Rust crate, the Python package and the WebAssembly build must all reproduce. The expected values are computed exactly with Python's `fractions.Fraction` from the same double-precision inputs, then rounded once:

```python
ORACLE = {
    "hz_from_period": lambda t: 1 / t,
    "scale_frequency": lambda f, k: f * k,
    "ratio": lambda a, b: a / b,
    # ...
}
```

The file also contains 12 error cases: zero, negative values, and a period so small that its frequency would overflow to infinity. All three implementations must reject every one of them.

## What this does not show

- **The proofs cover exact real numbers, not floating point.** The Rust code rounds; the golden vectors check that the rounding stays within a few units in the last place.
- **The proofs say nothing about biology.** That calcium spikes come every 10 to 35 minutes is a measurement, cited by DOI, not a theorem.
- **A sped-up rhythm is a translation.** The egg makes no sound; speeding up its calcium rhythm is a choice of mapping, which later posts will publish in full.

## Try it

The crate, the bindings, the vectors and the proofs are at [github.com/chethandvg/rhythm-units](https://github.com/chethandvg/rhythm-units). Its hub page lists every claim and how it's checked: [/frequencies-of-life/repos/rhythm-units/](/frequencies-of-life/repos/rhythm-units/).

Next in the series: pitch-math, and why a 10-minute biological rhythm is a slightly flat A.
