---
title: "How an egg might count calcium spikes: a model in the browser"
description: "A small Rust and WebAssembly model of egg activation: which parts are measured, which are assumed, which are tested, and its Lean proofs."
pubDate: 2026-11-19
tags: [rust, webassembly, biology, lean4]
repo: egg-activation-models
series: "Frequencies of Life"
draft: true
---

When a sperm fuses with a human egg, the calcium inside the egg rises and falls again and again, roughly once every 10 to 35 minutes ([Taylor et al. 1993, *Human Reproduction*](https://doi.org/10.1093/oxfordjournals.humrep.a137999), human eggs). In mouse eggs given precisely controlled calcium spikes, different steps of activation start after different numbers of spikes ([Ducibella et al. 2002, *Developmental Biology*](https://doi.org/10.1006/dbio.2002.0788)). So, in some sense, the egg counts. How could a cell count something that happens every quarter of an hour?

This post is about [egg-activation-models](https://github.com/chethandvg/egg-activation-models), a small model of that count, written in Rust and compiled to Python and to WebAssembly, so it runs in a browser tab. The point is less the model than the bookkeeping: every part of it says whether it is measured, assumed or tested.

## The idea: spikes, a leaky counter and a running total

The model has three stages.

1. **Spikes.** A long first calcium transient, then a train of shorter spikes. The interval grows from 12 to 25 minutes over six hours in the human preset, with a little random jitter.
2. **A leaky counter.** A CaMKII-like activity A, a stand-in for an enzyme that calcium switches on, rises during each spike and relaxes between them:

   dA/dt = (1 − A)·h(Ca)/τ_on − A/τ_off, with h = Caⁿ/(Kⁿ + Caⁿ)

   The time constants are τ_on = 8 s and τ_off = 75 s, and h is a steep Hill function of calcium (K = 0.35, n = 4).
3. **A running total.** The egg's "progress" is the integral of A, normalised to 1 at the end. Activation events fire when progress crosses fixed thresholds: cortical granule release first, pronucleus formation last.

In an [earlier post](/frequencies-of-life/posts/leaky-integrator-calcium-spikes-lean4-proof/) I showed that with τ = 75 s each spike is almost entirely forgotten before the next one arrives. So the counter itself cannot hold the count. In this model, the running total holds it.

## Measured, assumed, tested

This is the part I care about most. The repository's claims ledger gives every statement a level, and the model's parameters are almost all assumptions.

| Part of the model | Level | Based on |
|---|---|---|
| Human spikes every 10–35 min, about 2 min long | R (referenced) | Taylor et al. 1993, human eggs, aequorin |
| One zinc spark per human egg, with the first transient | R | [Duncan et al. 2016, *Scientific Reports*](https://doi.org/10.1038/srep24737), human eggs activated with PLCζ, not sperm |
| Mouse oscillations last 4 h | M (assumed) | motivated by [Marangos et al. 2003, *Development*](https://doi.org/10.1242/dev.00340), mouse: about 4 h, stopping near pronucleus formation |
| τ_off = 75 s, so CaMKII is back near baseline about 5 min after a rise | M | motivated by [Markoulaki et al. 2003, *Developmental Biology*](https://doi.org/10.1016/s0012-1606(03)00133-7), mouse; the 5-minute figure is not yet checked against the full text |
| Progress is a running total of the activity | M | motivated by [Tóth et al. 2006, *Reproduction*](https://doi.org/10.1530/rep.1.00764): mouse eggs add up their calcium signals |
| Intervals 12 → 25 min, ±8 % jitter, 6 h | M | chosen inside the human range |
| Spike shapes, τ_on = 8 s, K and n | M | chosen to look like the data, not fitted |
| Zinc spark sizes and the event thresholds | M | illustrative only |
| Every human interval lies in 10–35 min | T (tested) | checked against the dataset |
| The simulated activity always stays between 0 and 1 | P (proved) | Lean 4 |

Only the first two rows are referenced measurements (R). They live in a separate dataset repository, [biological-rhythms-dataset](https://github.com/chethandvg/biological-rhythms-dataset). The papers on the M rows motivated a choice and are cited on it, but nothing here is tested against them. The tests don't copy the measured numbers; they read them from the dataset crate. So if a value in the dataset is corrected, the test checks the model against the new value.

## The code

The spike train is a loop. Each interval is interpolated between the start and end values and scaled by 1 + u, where u is uniform in [−jitter, jitter):

```rust
        let interval =
            60.0 * (p.interval_start_min + frac * (p.interval_end_min - p.interval_start_min));
        t += interval * (1.0 + rng.uniform(-p.jitter, p.jitter));
```

The `rng` is the seeded SplitMix64 generator from the project's [signal-core](https://github.com/chethandvg/signal-core), so the same seed gives the same spikes in Rust, Python and JavaScript. The earlier Python toolkit used numpy's generator here, so its jittered times differ; with the jitter set to 0, the two agree exactly.

The counter is the toolkit's explicit Euler loop, kept as it was, because the step is part of the model:

```rust
    for &c in ca.iter().skip(1) {
        let h = hill(c, k, n, kn);
        a += dt * ((1.0 - a) * h / on - a / off);
        activity.push(a);
    }
```

`hill` computes Caⁿ/(Kⁿ + Caⁿ) as the toolkit did, except where floating point breaks down. With a large exponent, Kⁿ and Caⁿ can both underflow to 0, and 0/0 is NaN. Or Kⁿ underflows to 0 while Caⁿ is a tiny subnormal number, and the quotient is Caⁿ/Caⁿ = 1 even for Ca just above K. So unless Kⁿ is a normal floating-point number and the sum is finite, it switches to the equal form 1/(1 + (K/Ca)ⁿ), which is 0 when Ca is 0:

```rust
fn hill(c: f64, k: f64, n: f64, kn: f64) -> f64 {
    let x = c.powf(n);
    let sum = kn + x;
    if kn.is_normal() && sum.is_finite() {
        x / sum
    } else {
        1.0 / (1.0 + (k / c).powf(n))
    }
}
```

Explicit Euler has a trap. Take a step of dt = 20 s from A = 0 at the top of a spike, where h is close to 1: A jumps to 20/8 = 2.5, which would mean 250 % of the enzyme is active. So before the loop runs, the decoder checks the step:

```rust
fn camkii_step(dt: f64, p: &EggActivationParams) -> Result<f64> {
    positive("dt", dt)?;
    require(
        dt * (1.0 / p.camkii_on_s + 1.0 / p.camkii_off_s) <= 1.0,
        "dt",
        dt,
        STABLE,
    )
}
```

For the presets that allows steps up to 1/(1/8 + 1/75) ≈ 7.2 s, and a larger step is an error. That is a safe limit rather than the tightest one, as the next section shows.

In the browser, the whole pipeline is a few calls on typed arrays:

```js
import init, { preset, calcium_trace, camkii_decoder, activation_events } from "./pkg/web/egg_activation_models_wasm.js";

await init();
const p = preset("mouse"); // a plain object: change any field
p.jitter = 0;
const [t, ca, onsets] = calcium_trace(p, 1); // Float64Arrays: 14400 samples, 20 spikes
const [activity, progress] = camkii_decoder(t, ca, p);
activation_events(t, progress, p); // [["Cortical granule exocytosis / zona block", 274], ...]
```

Six hours of the human preset at one sample per second, through the decoder and the events, take about 3 ms in Node on my machine. That is fast enough to redraw on every slider movement.

## The proof

Why does a 7.2 s step keep the activity a fraction? Write u = dt/τ_on and v = dt/τ_off. One Euler step from activity a is then (1 − a)·h·u + a·(1 − v), and 1 minus the step is (1 − a)·(1 − h·u) + a·v. If 0 ≤ a ≤ 1, 0 ≤ h ≤ 1 and u + v ≤ 1, both are sums of non-negative terms. Lean 4 checks that argument:

```lean
theorem eulerStep_mem {a h dt tauOn tauOff : ℝ} (ha₀ : 0 ≤ a) (ha₁ : a ≤ 1) (hh₀ : 0 ≤ h)
    (hh₁ : h ≤ 1) (hon : 0 < tauOn) (hoff : 0 < tauOff) (hdt : 0 ≤ dt)
    (hstable : dt * (1 / tauOn + 1 / tauOff) ≤ 1) :
    0 ≤ eulerStep a h dt tauOn tauOff ∧ eulerStep a h dt tauOn tauOff ≤ 1 := by
```

In plain English: if the activity is a fraction and the calcium input is a fraction, a stable step gives a fraction again. A helper lemma shows that the Hill input is always in [0, 1) when calcium is not negative, and a third theorem shows, by induction over the samples, that the simulated activity is a valid fraction at every step, for any calcium trace and any Hill exponent. All three build in CI with only Lean's three standard axioms.

The condition is sufficient, not necessary. The same algebra shows that a step stays between 0 and 1 whenever u ≤ 1 and v ≤ 1, so steps up to 8 s, the smaller time constant, would still give a fraction. The stricter u + v ≤ 1 buys one more thing: a step never overshoots the level the activity is heading for, so the simulated activity cannot zigzag around it.

## What the model says about counting

The repository has an in-silico experiment, `decoding_vs_interval`: twelve identical spikes, delivered at different intervals. With the human parameters, the highest activity is about 0.87 whether the spikes are 5, 10 or 20 minutes apart. The mean activity is 0.412, 0.211 and 0.106. Each time the interval doubles, the mean roughly halves.

That is what a counter that forgets each spike should do. Every spike adds about the same area under the curve, so the running total grows with the number of spikes, not with anything subtler about their rhythm. A property test checks that the mean strictly falls as the interval grows, from 2 to 40 minutes, for both presets. (Below about 2 minutes, closer than a spike is wide, the curve turns over.)

For the human preset, the five events fire at 7 minutes, 50 minutes, 1.8 hours, 3.5 hours and 5.8 hours.

## What this does not show

- **Most of it is assumed.** The spike shapes, the intervals, τ_on, the Hill constants, the zinc spark sizes and the event thresholds are model parameters (level M). They were chosen to look reasonable, not fitted to any egg.
- **It cannot show activation failing.** Progress is normalised to the end of the trace, so every event is reached by the end of any trace, however few spikes it has. Too few spikes is exactly the case that matters clinically, and this model is blind to it.
- **It is not evidence that eggs decode frequency.** The evidence in mouse eggs favours summing and counting (Tóth et al. 2006; Ducibella et al. 2002), and that is what this model does. A model that fits a story is not a test of the story.
- **No mechanism.** Nothing here models how the egg makes the spikes. Mechanistic models (Goldbeter, Dupont and Berridge 1990; Li and Rinzel 1994) are planned for a later version.
- **The human data are thin.** Only 10 of the 26 eggs in Taylor et al. showed calcium changes, and the human zinc spark was seen in eggs activated without sperm.
- **The proofs cover exact real numbers.** The code runs in floating point; its bound, and the switch to 1/(1 + (K/Ca)ⁿ), are tested on random and extreme inputs, not proved.

## Try it

The crate, the Python and WebAssembly bindings, the golden vectors and the Lean proofs are at [github.com/chethandvg/egg-activation-models](https://github.com/chethandvg/egg-activation-models). The hub page lists every claim with its level: [/frequencies-of-life/repos/egg-activation-models/](/frequencies-of-life/repos/egg-activation-models/).

Next in the series: turning these spike times into sound, without pretending that eggs make any.
