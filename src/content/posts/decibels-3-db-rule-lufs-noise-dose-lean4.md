---
title: "Decibels, the 3 dB rule and LUFS: noise-dose maths proved in Lean"
description: "Why two 85 dB machines make 88 dB, why 3 dB more halves the allowed time, and how LUFS meters work, with the dose algebra proved in Lean 4."
pubDate: 2026-11-18
tags: [lean4, rust, audio, math]
repo: audio-safety-math
series: "Frequencies of Life"
draft: true
---

Put two machines that each measure 85 dBA side by side and the room does not get 170 dBA. It gets 88. And by the noise-at-work rule this library takes from NIOSH, the US occupational health institute, those 3 extra decibels halve the time you can spend there, from 8 hours a day to 4.

This post is about [audio-safety-math](https://github.com/chethandvg/audio-safety-math), the part of Frequencies of Life that keeps the project's sounds at sensible levels: decibel arithmetic, the noise-dose rule and broadcast loudness in LUFS, in Rust for Python and the browser, with the algebra of the dose rule proved in Lean 4. First, a clear line: this is maths and published reference values, not medical advice. It does not measure what reaches anyone's ears, and a dose under 100 % does not mean a sound is safe for you.

## The idea: decibels are logarithms of power

A decibel compares two powers: 10·log₁₀ of their ratio. Amplitudes (sound pressure, sample values) are square roots of power, so for them it is 20·log₁₀. Two things follow.

Gains multiply, so their decibels add: an amplifier of +6 dB after one of +10 dB is +16 dB. And unrelated sources add their powers, not their decibels. Two equal sources double the power, which is 10·log₁₀ 2 ≈ 3.0103 dB more. That is where the 88 comes from.

The dose rule builds on that. NIOSH's recommended exposure limit is 85 dBA averaged over 8 hours, with a 3 dB exchange rate: every 3 dB more halves the allowed time ([NIOSH 1998, publication 98-126](https://doi.org/10.26616/NIOSHPUB98126), Section 1.1). Those are the library's default parameters. With those numbers, the time allowed at a level L is

T(L) = 8 h / 2^((L − 85)/3)

and a day made of several stretches has a dose of 100 · Σ Cᵢ/Tᵢ percent, where Cᵢ is the time spent at a level whose allowed time is Tᵢ. Because 3 dB is almost exactly a doubling of power, this rule is close to "equal energy": the same total sound energy gives the same dose.

## The code

The time allowed is short once the inputs are checked:

```rust
pub fn allowed_time(
    level_dba: f64,
    criterion_db: f64,
    exchange_db: f64,
    criterion_hours: f64,
) -> Result<f64> {
    let level = finite("level_dba", level_dba)?;
    let (l0, q) = rule(criterion_db, exchange_db)?;
    let tc = positive("criterion_hours", criterion_hours)?;
    let d = doublings(level, l0, q);
    let p = d.exp2();
    fits(if p.is_normal() {
        tc / p
    } else {
        (tc.log2() - d).exp2()
    })
}
```

where `doublings` is `(level - criterion_db) / exchange_db`, the number of times the allowed time halves. When 2^d itself would overflow, vanish or lose precision in a double, the time is taken as the one power of two 2^(log₂ T_c − d), so it is not rounded to 0 or infinity on the way. The criterion, exchange rate and duration are parameters, so OSHA's 90 dBA with a 5 dB exchange rate is the same function. With NIOSH's numbers, 88 dBA gives exactly 4 hours and 100 dBA exactly 15 minutes. A day of 2 hours at 91 dBA and 6 hours at 80 dBA is a dose of 123.6 %, over the limit, even though most of the day was quiet.

Adding levels needs one piece of care. 10^(L/10) overflows a double for levels above about 3080 dB. No room is that loud, but a library should not return infinity for valid input, so the sum is factored around its largest term M, as M + 10·log₁₀ Σ 10^((Lᵢ − M)/10):

```rust
fn power_sum_db(levels: &[f64], gain_db: impl Fn(usize) -> f64) -> Result<f64> {
    let terms = || {
        (0..levels.len())
            .map(|i| (levels[i], gain_db(i)))
            .filter(|&(_, g)| g > f64::NEG_INFINITY)
    };
    let (top, top_gain) = terms().fold((f64::NEG_INFINITY, 0.0), |m, t| {
        if t.0 + t.1 > m.0 + m.1 { t } else { m }
    });
    let sum: f64 = terms()
        .map(|(l, g)| 10f64.powf(((l - top) + (g - top_gain)) / 10.0))
        .sum();
    fits(top + (top_gain + 10.0 * sum.log10()))
}
```

Each level also carries a gain in dB, and the factoring is around the largest level plus gain. That is how one function gives three results: a gain of 0 for the incoherent sum, −10·log₁₀ n for the energetic mean of n levels, and each segment's share of the time, in dB, for Leq, the equivalent steady level of timed segments. Because the shares come from the logarithms of the durations, durations whose sum is beyond the range of a double, or a segment far shorter than the rest, need no special case.

Silence was a design decision. The project's earlier Python toolkit added 10⁻¹² inside the logarithm, so a silent buffer came out as −240 dBFS. That number means nothing, and it also nudged quiet signals (by 8.7 × 10⁻⁶ dB at −120 dBFS). Here, silence has no level: asking for the level of a zero ratio or an all-zero signal is an error, in Rust, Python and JavaScript alike. So is normalising a constant signal: once the high-pass has removed its DC, a constant such as 1,000 samples of 0.3 leaves only rounding residue of about 10⁻¹⁴, and scaling that up to −20 dBFS would manufacture noise. The loudness meters, which must report something for every window, give −∞ for a silent one.

### Loudness in LUFS

Decibels of signal level are not loudness. Streaming services and broadcasters measure loudness with ITU-R BS.1770: filter each channel with "K-weighting" (a +4 dB shelf above about 1.7 kHz, for the effect of the head, and a high-pass at about 38 Hz), take mean squares over 400 ms blocks every 100 ms, weight the channels, and average the blocks that pass two gates: an absolute one at −70 LKFS and a relative one 10 LU below the loudness of the blocks above the first. The result is in LUFS.

The standard publishes the K-weighting only as coefficients at 48 kHz. I mapped those back through the bilinear transform to two analogue filters and discretise them again at any sample rate, prewarped at each filter's corner:

```rust
    fn biquad(&self, sr: f64) -> Biquad {
        let k = (std::f64::consts::PI * self.f0 / sr).tan();
        let (kq, k2) = (k / self.q, k * k);
        let d = 1.0 + kq + k2;
        [
            (self.vh + self.vb * kq + self.vl * k2) / d,
            2.0 * (self.vl * k2 - self.vh) / d,
            (self.vh - self.vb * kq + self.vl * k2) / d,
            2.0 * (k2 - 1.0) / d,
            (1.0 - kq + k2) / d,
        ]
    }
```

At 48 kHz this returns the published coefficients to within 10⁻¹⁴, and below 6 kHz the filter at 44.1, 96 or 192 kHz stays within 0.01 dB of the 48 kHz one. A 1 kHz sine at −23 dBFS in both channels of a stereo file reads −22.99 LUFS: the K-weighting adds about 0.70 dB at 1 kHz, and the standard's −0.691 offset takes most of it back.

## The proof

Five results underlie this, and Lean 4 proves them for exact real numbers. The first two are the decibel facts above: 20·log₁₀(a·b) = 20·log₁₀ a + 20·log₁₀ b for a, b > 0, and for n ≥ 1 levels with maximum M, the incoherent sum lies between M and M + 10·log₁₀ n:

```lean
theorem sumDb_bounds {ι : Type*} (s : Finset ι) (hs : s.Nonempty) (L : ι → ℝ) :
    s.sup' hs L ≤ sumDb s L ∧ sumDb s L ≤ s.sup' hs L + powerDb s.card := by
```

So adding a source can never make a room quieter. The bound is tight, although the theorem itself only proves the inequality: straight from the formula, ten equal sources are exactly 10·log₁₀ 10 = 10 dB louder than one.

The third is the exchange rate itself. One exchange rate more divides the allowed time by 2, and more generally k exchange rates divide it by 2^k:

```lean
theorem allowedTime_add_mul (L₀ q Tc L k : ℝ) (hq : q ≠ 0) :
    allowedTime L₀ q Tc (L + k * q) = allowedTime L₀ q Tc L / 2 ^ k := by
  unfold allowedTime
  have h : (L + k * q - L₀) / q = (L - L₀) / q + k := by
    field_simp
    ring
  rw [h, rpow_add (by norm_num : (0 : ℝ) < 2)]
  ring
```

From it follows the statement people actually use: t hours at L and t/2 hours at L + q are the same dose. A fourth theorem shows that the time-weighted average level, L₀ + q·log₂(D/100), turns the dose of a steady day back into its level.

The last one is my favourite, because it is a statement about a number: 3.0102 < 10·log₁₀ 2 < 3.0103. Bounding log 2 and log 10 separately to enough decimal places would be tedious, but the claim is equivalent to an inequality between whole numbers, 10^30102 < 2^100000 < 10^30103, and Lean's kernel can check that directly with arbitrary-precision arithmetic, on numbers of about 30,100 digits:

```lean
    have h : (10 : ℕ) ^ 30102 < 2 ^ 100000 := by decide +kernel
```

Taking logarithms of both sides turns it back into the bound. All five theorems build in CI with only Lean's three standard axioms.

## What this does not show

- **The proofs are exact; the code is floating point.** Rounding is checked by 147 golden vectors, shared by Rust, Python and WebAssembly. 109 of them have expected values from 50-digit arithmetic, the old Python toolkit, scipy, pyloudnorm and a direct transcription of BS.1770, never from the Rust output; the other 38 are invalid inputs that must be rejected. Property tests then check the proved identities in the floating-point code.
- **The proofs are about the rule, not about ears.** They show what the 3 dB rule implies, not that it protects anyone's hearing. The 85 dBA limit and the 3 dB exchange rate are taken from NIOSH's recommendation, not derived. Other rules exist: the WHO-ITU safe-listening standard for personal audio uses reference exposures of 80 dB for 40 hours a week for adults and 75 dB for children ([WHO 2019](https://www.who.int/publications/i/item/9789241515276)). In this library those are `allowed_time(L, 80.0, 3.0, 40.0)`, with the 3 dB exchange rate as my assumption, so 90 dB gives 3.97 hours a week.
- **The 3 dB rule is only close to equal energy.** For a day of 3 h at 82, 0.5 h at 97, 1.5 h at 90 and 3 h at 75 dBA, the rule's average is 87.592 dBA and the true energy average is 87.574 dBA.
- **Nothing about loudness is proved.** K-weighting, gating and the meters are tested: against BS.1770's coefficients, against pyloudnorm, and against the EBU Tech 3341 test signals, where every reading lands within the published ±0.1 LU (case 1 reads −22.993 LUFS against −23.0). I synthesised those signals from their descriptions rather than using EBU's files, and the programme-material and true-peak cases are not covered.

## Try it

The crate, the Python and WebAssembly bindings, the golden vectors and the Lean proofs are at [github.com/chethandvg/audio-safety-math](https://github.com/chethandvg/audio-safety-math). The hub page lists every claim and how it is known: [/frequencies-of-life/repos/audio-safety-math/](/frequencies-of-life/repos/audio-safety-math/).

Next in the series, these limits get used: the generators that make lullabies and sleep sounds will have to state their level, and stay under it.
