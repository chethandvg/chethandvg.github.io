---
title: "Rust audio DSP for the browser, with a moving average proved in Lean"
description: "I ported a Python sound toolkit to Rust and WebAssembly, then proved in Lean 4 which frequencies its moving-average filter removes, and why sounds alias."
pubDate: 2026-11-15
tags: [rust, webassembly, lean4, audio]
repo: signal-core
series: "Frequencies of Life"
draft: true
---

Average every 9 neighbouring samples of a 44.1 kHz recording and a 4900 Hz tone disappears completely. Not "gets quieter": it goes to zero, and so do 9800 Hz, 14700 Hz and every multiple of 4900 Hz up to 39200 Hz. And if you sample an 8440 Hz sine wave 8000 times a second, you get exactly the samples of a 440 Hz one.

Both facts sit at the bottom of every piece of digital audio. This post is about [signal-core](https://github.com/chethandvg/signal-core), where I moved the sound toolkit behind Frequencies of Life from Python to Rust so it can run in the browser, and where Lean 4 now proves both of them.

## The idea: one implementation, checked against the old one

The project turns slow rhythms of early life into sound. Cells make no sound, so the sound is always a translation of data, and the translation has to be exact and repeatable. Until now it lived in `lifesound.py`, a small numpy toolkit: sine oscillators, envelopes, pink noise, a moving-average filter, a convolution reverb and a WAV writer.

numpy needs a whole Python runtime to run in a web page, so the core is now one Rust crate. It compiles to WebAssembly for the browser and to a Python package with PyO3, and the function names are the same in all three languages. The old Python code did not go away. It became the oracle: a script runs the `lifesound.py` functions with numpy, copied with two small changes described below, and writes their outputs as 74 JSON test cases. With 34 more cases of invalid input, from the port's own rules, that makes 108, and Rust, Python and WebAssembly must reproduce every output and reject every invalid input.

That only works if the port is faithful, down to the order of floating-point operations.

## The code

Take the oscillator. `lifesound.py` computes the phase with `np.cumsum`, so sample i has phase 2π·(f₀ + … + fᵢ)/sr. That makes frequency sweeps click-free, and it also means the first sample is one step in, not at phase zero. The Rust version keeps the same running sum, in the same order:

```rust
fn for_each_phase(
    freqs: impl IntoIterator<Item = f64>,
    sr: f64,
    phase: f64,
    mut emit: impl FnMut(usize, f64),
) {
    let mut sum = 0.0;
    for (i, f) in freqs.into_iter().enumerate() {
        sum += f;
        emit(i, TAU * sum / sr + phase);
    }
}
```

`osc`, `osc_sweep` and `additive` all go through this one function, so there is one phase rule, and the golden vectors agree with numpy to 1e-12.

The filter is a centred moving average of L = 2h + 1 samples. `lifesound.py` computed it with a cumulative sum: pad the ends, take running totals, and subtract totals L apart. The port does the same, without allocating per sample:

```rust
fn box_pass(y: &mut [f64], h: usize, sums: &mut [f64]) {
    let (n, len) = (y.len(), 2 * h + 1);
    let (first, last) = (y[0], y[n - 1]);
    let mut total = 0.0;
    for (j, c) in sums.iter_mut().enumerate() {
        total += match j.checked_sub(h + 1) {
            None => first,
            Some(i) if i < n => y[i],
            Some(_) => last,
        };
        *c = total;
    }
    let l = len as f64;
    for (i, v) in y.iter_mut().enumerate() {
        *v = (sums[i + len] - sums[i]) / l;
    }
}
```

Three things needed more thought than copying.

- **Randomness.** numpy's generator cannot be reproduced cheaply in Rust, so the crate uses SplitMix64, whose whole state is one 64-bit number. The oracle swaps in a short Python port of the same generator, and the old noise and reverb code runs on it as written. White noise and dither now match to the last bit in all three languages.
- **WAV files.** `write_wav` keeps the old writer's 44-byte header from Python's `wave` module, its dither formula and its rounding, so the bytes match once both draw their dither from SplitMix64. Files the old toolkit wrote are not reproduced, because their dither came from numpy's generator. numpy's `np.round` sends halves to even, so the Rust code calls `round_ties_even`, not `round`.
- **Reverb.** The convolution uses `rustfft`. Both stereo channels go into one complex FFT as real and imaginary parts and are separated again by symmetry, so each block costs one forward and one inverse transform.

In Node, ten seconds of 44.1 kHz stereo (an additive tone, pink noise, the filters, a 2.5-second reverb and the WAV file) takes about 0.2 seconds. That is fast enough to synthesise sound in the page instead of shipping audio files.

## The proof

At ω radians per sample, the frequency response of a length-L moving average is

H(ω) = (1/L) · Σ_{k<L} e^{−iωk}

In Lean that is a one-line definition:

```lean
noncomputable def boxResponse (L : ℕ) (ω : ℝ) : ℂ :=
  (L : ℂ)⁻¹ * ∑ k ∈ range L, exp (-(ω * k * I))
```

The first theorem, `movingAverage_sinusoid`, shows that this really is the filter's behaviour: averaging the sinusoid e^{iωn} gives back the same sinusoid multiplied by H(ω). Then come three facts about H. H(0) = 1, so a constant passes unchanged. ‖H(ω)‖ ≤ 1, because the average of numbers of size 1 has size at most 1, so no frequency gets louder. And the nulls:

```lean
theorem boxResponse_null {L : ℕ} {m : ℤ} (hm : ¬(L : ℤ) ∣ m) :
    boxResponse L (2 * Real.pi * m / L) = 0 := by
```

In plain English: whenever L does not divide m, the response at ω = 2πm/L is exactly zero. Since a frequency f at sample rate sr has ω = 2πf/sr, this says the filter removes f = m·sr/L completely. With L = 9 at 44.1 kHz, that is 4900 Hz and its multiples up to 39200 Hz, from the opening paragraph. The condition on m matters: m = 9 gives 44.1 kHz itself, which sampled 44100 times a second is a constant (aliasing again, below), and a constant passes unchanged.

The proof is the geometric series. Every term e^{−2πimk/L} is a power of ζ = e^{−2πim/L}. Raising ζ to the L-th power gives e^{−2πim} = 1:

```lean
  have hζL : ζ ^ L = 1 := by
    rw [hζ, ← Complex.exp_nat_mul]
    have h : (L : ℂ) * -(2 * Real.pi * m / L * I) = ((-m : ℤ) : ℂ) * (2 * Real.pi * I) := by
      push_cast
      field_simp
    rw [h, Complex.exp_int_mul_two_pi_mul_I]
```

And ζ ≠ 1, because e^x = 1 only when x is a whole multiple of 2πi, which would make m a multiple of L. So the sum is (ζ^L − 1)/(ζ − 1) = 0, and the last line of the proof says exactly that:

```lean
  rw [sum_congr rfl fun k _ => hterm k, geom_sum_eq hζ1, hζL, sub_self, zero_div, mul_zero]
```

Aliasing is shorter still. Sample sin(2πft + φ) at t = n/sr, then add k·sr to the frequency. The phase grows by 2π·k·n, a whole number of turns, so the sine cannot tell the difference:

```lean
theorem aliasing {sr : ℝ} (hsr : sr ≠ 0) (f φ : ℝ) (k n : ℤ) :
    sampleSine (f + k * sr) φ sr n = sampleSine f φ sr n := by
  unfold sampleSine
  have h : 2 * π * (f + k * sr) * (n / sr) + φ =
      2 * π * f * (n / sr) + φ + ((k * n : ℤ) : ℝ) * (2 * π) := by
    push_cast
    field_simp
    ring
  rw [h, sin_add_int_mul_two_pi]
```

All five theorems build in CI with only Lean's three standard axioms, and any `sorry` fails the build. The property tests then check the same facts in the floating-point code: away from the edges, one pass of `box_lowpass` leaves less than 1e-9 of any null frequency, and at sr = 8000 with |k| ≤ 3, `osc` at f and at f + k·sr agrees to 1e-9 over 400 samples. Over longer sounds the rounding in the running phase sum builds up, by an amount that depends on f. For f = 1234.567 Hz and k = 3 it reaches about 2e-6 after 10 seconds at 8 kHz; measured at 44.1 kHz it is about 6e-5, roughly two steps of a 16-bit WAV file (1/32767). Whole-hertz frequencies, whose running sum is exact, show almost none.

## What this does not show

- **The proofs are about exact complex numbers and infinite signals.** The code works in 64-bit floating point through running sums, pads the ends with the edge samples, and may run several passes (whose response is H to that power). Those are tested, not proved.
- **The cutoff rule is a rule of thumb.** `lifesound.py` picks L from 0.44·sr/cutoff to put roughly −3 dB at the cutoff for one pass; three passes, the default, have response H³ and so about three times that in decibels. Only the nulls and the gain bound are theorems, and only one direction of the nulls: the proof shows those frequencies vanish, not that no other frequency does.
- **The sampling theorem is cited, not proved.** That a signal with nothing above B hertz is fixed by 2B samples a second comes from [Shannon (1949), *Proceedings of the IRE*](https://doi.org/10.1109/JRPROC.1949.232969). The ledger lists it as a referenced claim.
- **The noise is new.** Same methods, different generator, so the random samples differ from the old toolkit's. The second change is a constant: the old `exp_decay` used 6.907755 for ln 1000, and the port and the oracle both use the correctly rounded value of ln 1000, so the decay is 60 dB at t60 to within rounding.

## Try it

The crate, the Python and WebAssembly bindings, the golden vectors and the Lean proofs are at [github.com/chethandvg/signal-core](https://github.com/chethandvg/signal-core). The hub page lists every claim and how it is known: [/frequencies-of-life/repos/signal-core/](/frequencies-of-life/repos/signal-core/).

Later in the series, these building blocks become instruments: beats, FM bells and plucked strings, each with its own proof or test.
