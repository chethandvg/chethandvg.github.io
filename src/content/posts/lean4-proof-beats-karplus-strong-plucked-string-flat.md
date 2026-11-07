---
title: "Sound synthesis in Lean: proving beats and a flat plucked string"
description: "Why two sines beat and a Karplus-Strong string plays flat, proved in Lean 4 and measured in Rust, with FM sidebands checked against Bessel functions."
pubDate: 2026-11-17
tags: [rust, lean4, audio, music]
repo: synthesis-theory
series: "Frequencies of Life"
draft: true
---

Play a 440 Hz sine and a 443 Hz sine together and you don't hear two notes. You hear one note that swells and fades three times a second. And the classic plucked-string algorithm, [Karplus–Strong (1983)](https://doi.org/10.2307/3680062), written the simple way and asked for A4 at 44.1 kHz, plays 438.81 Hz: 4.7 cents flat. Two octaves up it is 30 cents flat, nearly a third of a semitone.

Both facts fall out of a few lines of trigonometry. This time I proved those lines in Lean 4, then measured the strings the code really renders.

## The idea: three small identities

**Beats.** The sum-to-product identity says

> sin a + sin b = 2 · sin((a + b)/2) · cos((a − b)/2)

so two tones at f₁ and f₂ add up to a tone at their mean frequency, multiplied by a slow envelope |2 · cos(π(f₁ − f₂)t)|. That envelope goes silent once every 1/|f₁ − f₂| seconds. For 440 and 443 Hz, that is three beats a second.

**A plucked string.** Karplus–Strong fills a loop of N samples with noise and, at every step, writes back the average of two neighbouring samples. The average is a low-pass filter, which is why the noise mellows into a string tone. Its frequency response is

> (1 + e^{−iω})/2 = e^{−iω/2} · cos(ω/2)

The factor e^{−iω/2} is a delay of exactly half a sample, at every frequency. So the loop is not N samples long. It is N + ½. The string resonates at sr/(N + ½), not at sr/N, and the cos(ω/2) factor shrinks the high partials on every trip, which is why they die first.

**FM.** Chowning's FM synthesis puts one sine inside another: sin(2π·fc·t + I·sin 2π·fm·t). The Jacobi–Anger expansion (in the [NIST Digital Library of Mathematical Functions, §10.12](https://dlmf.nist.gov/10.12)) rewrites it as a sum of plain sines at fc + n·fm, the n-th with amplitude Jₙ(I), a Bessel function of the index. With the bell's ratio fm = 1.4·fc, those sidebands land between the harmonics, which is why the bell sounds metallic.

## The code

The new repo, `synthesis-theory`, ports the instruments of my old Python toolkit, `lifesound.py`, to Rust, with Python and WebAssembly bindings. The string's inner loop is one line, exactly as the old toolkit wrote it:

```rust
    let k = gain(decay)? * 0.5;
    pluck(n, p, sr, seed, pluck_brightness_hz, |y, i| {
        k * (y[i - p] + y[i - p - 1])
    })
```

The old toolkit chose the loop length as `round(sr / freq)` and stopped there. That rounding is where the half sample goes missing. The crate now says out loud what the string will really play:

```rust
pub fn karplus_strong_pitch(freq: f64, sr: u32) -> Result<f64> {
    let sr = rate(sr)?;
    Ok(sr / (period(freq, sr)? as f64 + 0.5))
}
```

At 44.1 kHz:

| Asked for | N | Sounds at sr/(N + ½) | Detuning |
|---|---|---|---|
| 220 Hz | 200 | 219.95 Hz | −0.39 cents |
| 440 Hz | 100 | 438.81 Hz | −4.70 cents |
| 880 Hz | 50 | 873.27 Hz | −13.30 cents |
| 1760 Hz | 25 | 1729.41 Hz | −30.35 cents |

The rounding adds its own error on top. At 440 Hz the ideal loop is 100.23 samples; rounding it to 100 alone would give 441 Hz, slightly sharp, and the half sample then pulls the string down to 438.81 Hz. At 110 Hz the loop rounds up from 400.9 to 401 samples, and the string ends up 2.55 cents flat.

The fix is old: [Jaffe and Smith (1983)](https://doi.org/10.2307/3680063) put a first-order allpass filter in the loop, which delays the signal by a fraction of a sample without changing its loudness. `karplus_strong_tuned` picks N and the fraction Δ so that N + ½ + Δ = sr/freq:

```rust
    let delta = d - 0.5 - p;
    let c = (1.0 - delta) / (1.0 + delta);
```

and the loop gains one line of allpass:

```rust
        let v = k * (y[i - p] + y[i - p - 1]);
        let out = c * v + v1 - c * y1;
        (v1, y1) = (v, out);
```

From Python, with `lifesound.py`'s defaults:

```python
import synthesis_theory as st

st.karplus_strong_pitch(440.0)  # 438.8059701492537 (sr=SR)
st.karplus_strong_detune_cents(880.0)  # -13.296193133050858
st.fm_spectrum(1000.0, 1400.0, 2.0, 3)  # array([0.1289, 0.3528, 0.5767, 0.2239, 0.5767, 0.3528, 0.1289]) (rounded)
```

That last line renders one second of FM with carrier 1000 Hz, modulator 1400 Hz and index 2, and measures its spectrum at 1000 + 1400n Hz for n = −3 to 3. The numbers are |J₃(2)|, |J₂(2)|, |J₁(2)|, J₀(2) and back again.

## The proof

The Lean file for beats proves the two-tone form, with the envelope as a definition:

```lean
theorem beats (f₁ f₂ t : ℝ) :
    sin (2 * π * f₁ * t) + sin (2 * π * f₂ * t) =
        2 * cos (π * (f₁ - f₂) * t) * sin (π * (f₁ + f₂) * t) ∧
      |sin (2 * π * f₁ * t) + sin (2 * π * f₂ * t)| =
        beatEnvelope f₁ f₂ t * |sin (π * (f₁ + f₂) * t)| := by
```

A second theorem, `beat_rate`, shows that for f₁ ≠ f₂ the envelope repeats every 1/|f₁ − f₂| seconds and is zero exactly at t = (k + ½)/(f₁ − f₂): one silence per period, so the beat rate is |f₁ − f₂|.

For the string, `avgResponse_eq` proves the half-sample identity, and `loopGain_pos_real_iff` proves where the string rings. The loop gain e^{−iωN} · (1 + e^{−iω})/2 is a positive real number, the condition for a wave to come back round in step with itself, exactly when ω = 2πk/(N + ½), for |ω| < π. In plain English: the string's partials sit at k · sr/(N + ½), and nowhere else below the Nyquist frequency. A third theorem, `loopGain_decay`, shows that each trip scales a partial by |decay| · |cos(ω/2)|, which falls as the frequency rises. Higher partials die faster.

All five P-level proofs build in CI with Mathlib, with no `sorry` and only Lean's three standard axioms.

## The evidence beyond the proofs

The proofs are about exact complex numbers, so I also measured the code. A property test renders one second of string, finds the peak of its Hann-windowed spectrum, and compares it with sr/(N + ½). From 110 to 1760 Hz at 44.1 kHz, and at 440 and 1760 Hz at 48 kHz, the measured fundamental is within 0.02 cents of the prediction. The largest gap, 0.008 cents at 1760 Hz, is real rather than measurement noise: damping moves the fundamental's pole a hair off 2π/(N + ½). The tuned string measures within 0.15 cents of the requested pitch everywhere in the same range.

The FM claim is a V (verified numerics) claim, not a proof: the Jacobi–Anger expansion is cited, not proved in Lean. The test oracle computes the expected amplitudes from mpmath's Bessel functions alone, and the Rust, Python and WebAssembly builds all match them within 1e-12. One case has the modulator equal to the carrier. There, the sideband at −440 Hz reflects onto the 440 Hz carrier with its sign flipped, and the measurement reads |J₀(1) − J₋₂(1)|, as the expansion predicts.

The old toolkit's struck bar uses mode ratios 1 : 2.756 : 5.404 : 8.933, from the free–free bar equation cos x · cosh x = 1. The oracle certifies its first roots with interval arithmetic. The ratios begin 2.7565385…, 5.4039176… and 8.9329503…, so 5.404 and 8.933 are correctly rounded and 2.756 was cut off (rounded, it is 2.757).

## What this does not show

- **Not the ear.** The identity describes the physical sum of two waves. Put 440 Hz in one ear and 443 Hz in the other and the waves never add, yet people still hear a beat: a binaural beat, made in the brain. A systematic review of human EEG studies ([Ingendoh, Posny and Heine 2023, *PLOS ONE*](https://doi.org/10.1371/journal.pone.0286023)) describes it as a percept of the auditory pathway, heard only with carriers up to about 1 kHz. The repo lists this as a referenced claim, with no proof. It makes no claim that binaural beats change brain rhythms or mood; the same review found the EEG evidence inconsistent.
- **Not floating point.** The proofs cover exact numbers. Rounding, finite signals and the damping are tested, not proved.
- **Not the allpass.** It has exactly the delay Δ only at 0 Hz; its accuracy at the partials is measured, not proved. And it only fixes the range I tested: a 5 kHz string, under nine samples long, still measures 2.9 cents flat, and a 10 kHz one 16.8 cents flat.
- **Not new noise.** The string's noise comes from a seeded SplitMix64 generator, not numpy's, so the samples differ from the old toolkit's. The algorithm is the same.

## Try it

The crate, the Python and WebAssembly bindings, the golden vectors, the oracle and the Lean proofs are at [github.com/chethandvg/synthesis-theory](https://github.com/chethandvg/synthesis-theory). The hub page lists every claim and how it is known: [/frequencies-of-life/repos/synthesis-theory/](/frequencies-of-life/repos/synthesis-theory/).

Later in the series, these instruments start turning the rhythms of early life into sound.
