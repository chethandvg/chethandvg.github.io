---
title: "Leaky integrators: why an egg forgets most of each calcium spike"
description: "Calcium spikes 10 to 35 minutes apart and a memory with a 75 s time constant: Lean proves earlier spikes add under 0.04 % to each peak."
pubDate: 2026-11-14
tags: [lean4, rust, biology, opensource]
repo: dynamics-core
series: "Frequencies of Life"
draft: true
---

When a sperm fuses with a human egg, the calcium inside the egg rises and falls again and again, roughly once every 10 to 35 minutes ([Taylor et al. 1993, *Human Reproduction*](https://doi.org/10.1093/oxfordjournals.humrep.a137999)). The egg is often said to "count" these spikes. Now suppose the counter is a memory that fades with a time constant of 75 seconds. By the time the next spike arrives, how much of the last one is still there? About 0.03 % when they are 10 minutes apart, and under 10⁻¹⁰ % at 35 minutes.

This post is about [dynamics-core](https://github.com/chethandvg/dynamics-core), a foundation repository of Frequencies of Life. It does the maths of that fading memory in Rust, and it uses Lean 4 to prove when repeated pulses add up and when they are forgotten.

## The idea: a bucket with a hole

A leaky integrator is about the simplest memory there is. Between pulses, its state A decays exponentially with time constant τ:

A(t + Δt) = A(t) · e^(−Δt/τ)

and each pulse adds a fixed amount h at once. After one τ, 37 % is left; after τ·ln 2, half.

Now send a pulse every T. Each period multiplies the state by the same residual factor r = e^(−T/τ), so the peaks just after each pulse follow a simple recurrence:

A(1) = h, A(n + 1) = A(n) · r + h

That is a geometric series. The n-th peak is h·(1 − rⁿ)/(1 − r), and as n grows the peaks climb towards a steady state, h/(1 − r). Divide by h and you get one number that says how much the pulses add up:

summation ratio = 1/(1 − r)

If pulses come much faster than τ, r is close to 1 and the ratio is large: pulses every τ/2 settle at 2.54 times a single pulse. If they come much more slowly, r is close to 0 and the ratio is close to 1: each pulse is forgotten before the next one arrives.

For the egg, T = 600 s and τ = 75 s, so T/τ = 8 and r = e^(−8) ≈ 0.000335. The summation ratio is 1.000336. At 35 minutes it is 1 + 7·10⁻¹³.

## Where 75 seconds comes from

The 75 s is not a measurement. It is a parameter of the project's egg-activation model, which reads calcium with an integrator standing in for CaMKII, an enzyme switched on by calcium. In mouse eggs, CaMKII activity returns to baseline within about 5 minutes of a calcium rise ([Markoulaki et al. 2003, *Developmental Biology*](https://doi.org/10.1016/s0012-1606(03)00133-7)). A time constant of 75 s matches that: after 5 minutes, e^(−4) ≈ 1.8 % is left. The repository's claims ledger records this as a model assumption (level M), not as a fact.

## The code

The crate is written in Rust and compiled to a Python package and to WebAssembly, with the same function names. Every function checks its inputs and returns a `Result`. The n-th peak uses `exp_m1`, so that 1 − rⁿ and 1 − r keep their precision even when the period is much shorter than τ:

```rust
pub fn peak_after_pulses(h: f64, period: f64, tau: f64, n: i64) -> Result<f64> {
    let h = positive("h", h)?;
    let x = time_constants(period, tau)?;
    let n = require(n >= 1, "n", n as f64, WHOLE)?;
    // Without decay, n pulses add up to n·h; using that below 2⁻⁶⁰ also keeps a
    // subnormal x from losing precision.
    let sum = if n * x < NO_DECAY {
        n
    } else {
        one_minus_exp_neg(n * x) / one_minus_exp_neg(x)
    };
    finite_result(h * sum)
}
```

The steady peak is one line, and the summation ratio is the steady peak of a pulse of size 1:

```rust
pub fn summation_ratio(period: f64, tau: f64) -> Result<f64> {
    steady_state_peak(1.0, period, tau)
}

pub fn steady_state_peak(h: f64, period: f64, tau: f64) -> Result<f64> {
    finite_result(positive("h", h)? / one_minus_exp_neg(time_constants(period, tau)?))
}
```

Using the crate looks like this:

```rust
use dynamics_core::{pulses_to_fraction, summation_ratio};

// Spikes 10 minutes apart, read by an integrator with τ = 75 s: r = e^-8.
let ratio = summation_ratio(600.0, 75.0)?;
assert!(1.0 < ratio && ratio < 1.0004);
// Pulses every τ/2 instead: the fifth peak is the first past 90 % of the steady state.
assert_eq!(pulses_to_fraction(0.9, 37.5, 75.0)?, 5);
```

In Python, `dynamics_core.summation_ratio(600, 75)` returns `1.0003355752008412`.

### An off-by-one that floating point hides

`pulses_to_fraction(p, T, τ)` answers the question "after how many pulses does the peak reach the fraction p of its steady state?" The maths says: the smallest n with rⁿ ≤ 1 − p, which is n = ⌈ln(1 − p)/ln r⌉. That formula is right for real numbers, but with doubles it can be off by one on a boundary.

Take T/τ = 0.001, and let p be the double nearest to the fraction that the third pulse reaches, 1 − e^(−0.003). That double, 0.002995504496627024, sits 2·10⁻¹⁹ above 1 − e^(−0.003), so the third peak falls just short and the right answer is 4. In floating point, −ln(1 − p)/0.001 comes out as exactly 3.0 (with ln(1 − p) computed as log1p(−p); naively, just under 3), and the formula says 3.

dynamics-core uses the formula only as a first guess. Then it checks the guess, and its neighbours, against the definition:

```rust
    let mut n = guess as i64;
    while n > 1 && goal.reached(n - 1) {
        n -= 1;
    }
    while !goal.reached(n) {
        n += 1;
        if n > MAX_PULSES {
            return Err(too_many(n as f64));
        }
    }
    Ok(n)
```

`reached(n)` decides whether 1 − e^(−n·T/τ) ≥ p in double-double arithmetic, about 106 bits, after splitting every input into significand and exponent so that nothing underflows. The tests include p one double either side of 1 − rⁿ, a subnormal period and an exact tie: with p = T/τ = 2⁻³⁰⁰, one pulse gives 1 − e^(−p), which is just below p, so two pulses are needed. The formula says one.

## The proof

Lean 4 proves the maths. The closed form is an induction on the recurrence:

```lean
theorem peaks_closed_form (h : ℝ) {r : ℝ} (hr : r ≠ 1) (n : ℕ) :
    peaks h r n = h * (1 - r ^ n) / (1 - r) := by
  have h1 : 1 - r ≠ 0 := sub_ne_zero.mpr hr.symm
  induction n with
  | zero => simp [peaks]
  | succ n ih =>
    rw [peaks, ih, eq_div_iff h1]
    field_simp
    ring
```

Other theorems show that the peaks rise strictly towards h/(1 − r) and converge to it, and that the summation ratio falls as T grows and tends to 1. The headline result is this one:

```lean
theorem human_spikes_barely_add_up {T : ℝ} (hT : 600 ≤ T) :
    decayFactor 600 75 = Real.exp (-8) ∧ 1 < summationRatio T 75 ∧
      summationRatio T 75 < 1.0004 := by
```

In plain English: with τ = 75 s, a 10-minute period leaves r = e^(−8), and for every period of 10 minutes or more the summation ratio is above 1 but below 1.0004. What is left of all the earlier spikes adds at most 0.04 % to each peak. The proof needs only one fact about e: e⁸ > 2501, which follows from the first twelve terms of its Taylor series. Because the ratio falls as T grows, one bound at 10 minutes covers the whole 10-to-35-minute range.

One more proof was shorter than I expected. The calcium spike in the egg model has the shape (1 − e^(−s/rise))·e^(−s/decay), and its peak is at s* = rise·ln(1 + decay/rise). Instead of taking derivatives, the Lean proof uses the convexity of exp once, to bound the shape at every s, before or after the peak, by its value at s*. For the model's human spike (rise 15 s, decay 60 s) the peak comes 15·ln 5 ≈ 24.1 s after the start.

All ten theorems build in CI with only Lean's three standard axioms, and any `sorry` fails the build.

## Golden vectors

The Rust crate, the Python package and the WebAssembly build check the same 124 JSON test cases. The oracle that computes the expected values shares no code with the crate. It works in Python's `decimal` module at 400 significant digits, starting from the exact values of the input doubles, and it computes peaks by iterating the recurrence rather than with the closed form. Real-valued results must agree to within 10⁻¹³ relative, and pulse counts exactly.

## What this does not show

- **It is a model, not a measurement.** τ = 75 s was chosen to match CaMKII in mouse eggs, and the time constant has not been measured in human eggs. The repository marks it as an assumption.
- **Real CaMKII is not a linear integrator.** The project's egg model switches it on through a steep, saturating function of calcium; only the decay between spikes is the linear leak studied here.
- **Forgetting each spike does not stop the egg counting.** In mouse eggs given precisely controlled calcium spikes, different events start after different numbers of spikes ([Ducibella et al. 2002, *Developmental Biology*](https://doi.org/10.1006/dbio.2002.0788)). If CaMKII forgets each spike, the count is presumably kept further downstream. This result rules out one simple place to keep it, and no more.
- **The proofs cover exact real numbers.** The Rust code uses floating point. Its rounding is checked by the golden vectors, and the double-double check in `pulses_to_fraction` is tested, not proved.
- **The human interval rests on few eggs.** In Taylor et al., only 10 of 26 sperm-exposed eggs showed the calcium changes. Treat it as a measurement with a small sample.

## Try it

The crate, the Python and WebAssembly bindings, the golden vectors and the Lean proofs are at [github.com/chethandvg/dynamics-core](https://github.com/chethandvg/dynamics-core). The hub page lists every claim and says whether it is proved, tested or assumed: [/frequencies-of-life/repos/dynamics-core/](/frequencies-of-life/repos/dynamics-core/).

Next in the series: the egg-activation models that put this integrator to work.
