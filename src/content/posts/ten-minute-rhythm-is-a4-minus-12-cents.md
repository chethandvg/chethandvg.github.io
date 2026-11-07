---
title: "A 10-minute rhythm is A4 minus 12 cents: octave folding proved in Lean"
description: "Raise a 10-minute biological rhythm 18 octaves and it lands 12 cents below concert A. Rust does the maths; Lean 4 proves every frequency folds just once."
pubDate: 2026-11-12
tags: [lean4, rust, music, opensource]
repo: pitch-math
series: "Frequencies of Life"
draft: true
---

In a fertilised human egg, calcium rises and falls roughly once every 10 to 35 minutes ([Taylor et al. 1993, *Human Reproduction*](https://doi.org/10.1093/oxfordjournals.humrep.a137999)). Take the fastest of those, one spike every ten minutes, and double its frequency 18 times. You get 436.91 Hz: an A, a little flat, 12 cents below the A that orchestras tune to.

This post is about [pitch-math](https://github.com/chethandvg/pitch-math), the second foundation repository of Frequencies of Life. It does the arithmetic of notes, cents and octaves in Rust, and it uses Lean 4 to prove that "fold this frequency into one octave" always has exactly one answer.

## The idea: octaves, cents and folding

Two notes an octave apart sound like "the same note, higher". Physically, the upper one has exactly twice the frequency. Western equal temperament splits each octave into 12 equal semitones, and pins one note down: A4, MIDI note 69, is 440 Hz. Every other note follows from that:

f(m) = 440 · 2^((m − 69) / 12)

Musicians measure small differences in **cents**. An octave is 1200 cents, so a semitone is 100 cents, and the interval from f to g is 1200 · log₂(g / f).

A biological rhythm is far too slow to hear. A 10-minute period is 1/600 Hz, about 1.7 millihertz. Doubling a frequency moves it up one octave, and doubling is the same as speeding time up by a factor of 2. Keep doubling until the result lands in a chosen octave, here [220, 440) Hz. That is **octave folding**:

- 1/600 Hz × 2¹⁸ = 32768/75 Hz ≈ 436.907 Hz
- 1200 · log₂(436.907 / 440) ≈ −12.21 cents, so the nearest note is A4, 12 cents flat

A 24-hour rhythm needs 25 doublings and lands on 388.36 Hz, which is G4 minus 16 cents.

## The code

The crate is small, and its functions return a `Result` instead of a wrong number. Folding has a trap. The obvious approach computes n = ⌈log₂(low / hz)⌉ in floating point and multiplies by 2ⁿ. Usually that works. But take hz = 13.749999999999998, the double just below A−1 (13.75 Hz). Then 220 / hz is 16.000000000000004, its `log2` rounds to exactly 4.0, and hz · 2⁴ = 219.99999999999997. That is one octave short, just outside [220, 440).

pitch-math avoids logarithms here. A double already stores its binary exponent, which is ⌊log₂ x⌋ exactly, so the code reads it off and compares the significands:

```rust
pub fn octave_fold(hz: f64, low_hz: f64) -> Result<(i64, f64)> {
    let (m, e) = split(positive("hz", hz)?);
    let low = require(
        (f64::MIN_POSITIVE..=f64::MAX / 2.0).contains(&low_hz),
        "low_hz",
        low_hz,
        NORMAL_OCTAVE,
    )?;
    let (low_m, low_e) = split(low);
    let up = i64::from(m < low_m);
    Ok((low_e - e + up, m * pow2(low_e + up)))
}
```

`split(x)` returns (m, e) with x = m · 2ᵉ and 1 ≤ m < 2, read straight from the bits. Multiplying by a power of two is exact for normal floats, so `low ≤ folded < 2·low` holds exactly in floating point, at the boundaries too. For the example above, it returns n = 5 and 439.99999999999994.

Moving by octaves reuses the previous repository, [rhythm-units](https://github.com/chethandvg/rhythm-units). An octave shift is a time speed-up by 2ⁿ:

```rust
pub fn octave_transpose(hz: f64, n: i64) -> Result<f64> {
    in_range(rhythm_units::scale_frequency(positive("hz", hz)?, pow2(n)))
}
```

Using it looks like this:

```rust
use pitch_math::{nearest_note, octave_fold};

// A rhythm with a 10-minute period (1/600 Hz), folded into the octave [220, 440) Hz.
let (n, hz) = octave_fold(1.0 / 600.0, 220.0)?;
assert_eq!(n, 18);
let (midi, name, cents) = nearest_note(hz)?;
assert_eq!((midi, name.as_str()), (69, "A4"));
assert!((cents + 12.21).abs() < 0.01); // 436.91 Hz is A4 minus 12.21 cents
```

The same Rust code is compiled to a Python package and to WebAssembly, with the same function names. In Python, `pitch_math.octave_fold(1 / 600, 220)` returns `[18, 436.9066666666667]`.

## The proof

The folding function only makes sense if there is exactly one right n. Here is the Lean 4 statement:

```lean
/-- `pitch:OCTAVE-FOLD-UNIQUE`: for `f, a > 0` there is exactly one integer `n`
with `a ≤ f·2ⁿ < 2a`. -/
theorem octave_fold_unique {f a : ℝ} (hf : 0 < f) (ha : 0 < a) :
    ∃! n : ℤ, a ≤ f * 2 ^ n ∧ f * 2 ^ n < 2 * a := by
```

In plain English: for any positive frequency f and any positive lower bound a, exactly one whole number of octaves (up or down) puts f into [a, 2a).

The proof has two halves. **Existence** comes from Mathlib's `exists_mem_Ioc_zpow`: because the reals are Archimedean, the ratio a / f lies between two consecutive powers of two, 2ᵏ < a / f ≤ 2ᵏ⁺¹, and n = k + 1 works. **Uniqueness** is one inequality. If n lands in the octave and m > n, then f · 2ᵐ ≥ f · 2ⁿ⁺¹ ≥ 2a, so m overshoots:

```lean
  have le_of_fold : ∀ n m : ℤ, a ≤ f * 2 ^ n → f * 2 ^ m < 2 * a → m ≤ n := by
    intro n m hn hm
    by_contra h
    have h2 : (2 : ℝ) ^ (n + 1) ≤ 2 ^ m := zpow_le_zpow_right₀ one_le_two (by omega)
    rw [zpow_add_one₀ two_ne_zero] at h2
    linarith [mul_le_mul_of_nonneg_left h2 hf.le]
```

Applying it in both directions gives m ≤ n and n ≤ m, so the two are equal.

The headline number is a theorem too. Lean checks it with exact rational arithmetic, built from the same definitions as the code:

```lean
theorem ten_minute_rhythm_pitch : octaveTranspose (hzFromPeriod 600) 18 = 32768 / 75 := by
  norm_num [octaveTranspose, hzFromPeriod, scaleFrequency]
```

Other proofs in the repository: A4 is 440 Hz, twelve semitones double the frequency, an octave is 1200 cents, and cents add up (a to c equals a to b plus b to c). Octave shifts keep frequency ratios; that proof is a single line that reuses `RhythmUnits.scale_ratio_invariant`. And the N-th harmonic is an exact octave of the fundamental only when N is a power of two: the 2nd, 4th and 8th harmonics are octaves, while the 3rd, 5th and 6th are not.

All eight theorems build in CI with only Lean's three standard axioms, and any `sorry` fails the build.

## Golden vectors

The Rust crate, the Python package and the WebAssembly build all check the same 120 JSON test cases. A Python oracle computes the expected values. It mirrors the project's earlier Python toolkit, and it uses exact `fractions.Fraction` arithmetic wherever the answer is rational: octave folding, octave shifts and harmonics. Those cases have zero tolerance, so all three languages must agree to the last bit. The 13.749999999999998 Hz case above is one of them.

## What this does not show

- **The proofs cover exact real numbers, not floating point.** `midi_to_hz`, `hz_to_midi` and `cents` call `exp2` and `log2`, whose rounding is checked by the golden vectors (within 1e-12 relative), not by Lean.
- **A4 minus 12 cents is not a property of the egg.** Every positive frequency folds into every octave; that is exactly what the theorem says. Landing near A comes from choosing a 10-minute period, 440 Hz tuning and the [220, 440) octave. It is a mapping, not a discovery.
- **The biology is referenced, not proved.** The 10-to-35-minute interval comes from calcium imaging of human eggs at IVF, and in Taylor et al. only 10 of 26 sperm-exposed eggs showed the calcium changes at all. Treat it as a measurement with a small sample.
- **Cells make no sound.** Raising a rhythm by 18 octaves translates data into sound; nothing is recorded.

## Try it

The crate, the Python and WebAssembly bindings, the golden vectors and the Lean proofs are at [github.com/chethandvg/pitch-math](https://github.com/chethandvg/pitch-math). The hub page lists every claim and says whether it is proved or tested: [/frequencies-of-life/repos/pitch-math/](/frequencies-of-life/repos/pitch-math/).

Next in the series: the signal maths that turns these folded frequencies into sound.
