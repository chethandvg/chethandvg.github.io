---
title: "Sonification you can check: Lean proofs, a manifest, a round trip"
description: "Turning data into sound anyone can check: core maps proved in Lean 4, a manifest for every note, and a round trip from the WAV file back to the data."
pubDate: 2026-11-20
tags: [sonification, rust, lean4, audio]
repo: sonification-core
series: "Frequencies of Life"
draft: true
---

A human sperm tail beats about 19 times a second in diluted semen (a median from Gallagher et al. 2019). That is far too slow to be a note, but play it four octaves up and it is 304 Hz, just under the E♭ above middle C. Turning data into sound like this is easy. The hard part is the question a listener should ask next: how do I know the sound really came from the data, and not from my taste?

Many sonifications ask you to trust them. For this series I wanted the opposite, so I built a small library, sonification-core, around three ideas: a mapping grammar whose core maps (time, octave, linear and log) are proved in Lean 4, a manifest that records every note, and a round trip that recovers the data's timing from the audio alone.

## The idea: a grammar, a receipt and a way back

**A grammar.** A sonification is a handful of maps. A time map squeezes real time into audio time: audio = offset + real / k, for a speed-up k. A pitch map turns a value into a frequency. That might be a rhythm heard sped up and moved by octaves, or a value placed on a log-frequency scale, where equal steps of the data give equal musical intervals. Gain, pan and note length are maps too. Each map is a small value with named constants, so the whole mapping can be written down.

**A receipt.** When the library renders a piece, it writes a manifest: the sources of the data (claim ids and DOIs), every constant of every mapping, every note with the data point that made it, the render settings, and the SHA-256 of the WAV file. Anyone with the manifest can rebuild the piece and compare hashes.

**A way back.** Given the WAV file and the manifest, the library renders the manifest's notes again and checks that they give the same bytes. Then it finds the note onsets in the sound, matches each one to its event, and runs the time map backwards. If the manifest is honest, you get the data's real times back.

## The code

Here is the sperm example from the README, in Python. The two beat rates are medians from Gallagher et al. 2019 (*Human Reproduction* 34(7):1173–1185, [doi:10.1093/humrep/dez056](https://doi.org/10.1093/humrep/dez056)): 10 Hz in a viscous medium and 19 Hz in diluted semen.

```python
beat = {
    "time": {"speedup": 1.0, "offset_s": 0.1},
    "pitch": {"kind": "rhythm", "octaves": 4},
    "gain_db": {"kind": "constant", "value": -9.0},
    "duration_s": {"kind": "constant", "value": 0.4},
    "instrument": {"kind": "karplus_strong_tuned"},  # decay 0.996 and a 2000 Hz pluck by default
}
```

The `rhythm` pitch map treats the value as a frequency. It speeds it up through rhythm-units' `scale_frequency` and moves it by octaves through pitch-math's `octave_transpose`, so 19 Hz becomes 19 · 2⁴ = 304 Hz. The library rewrites none of that maths; it calls the crates that already prove it.

Two series, one per measurement, go into the writer:

```python
manifest, wav = sc.write_manifest(info, series)  # 44.1 kHz, seed 0
manifest["layers"][1]["events"][0]["hz"]  # 304.0
manifest["audio"]["sha256"] == sc.sha256_hex(wav)  # True: 78efc56a…, the same in Rust and JavaScript
```

And this is one note from the manifest's JSON:

```json
{
  "real_s": 0.0,
  "value": 19.0,
  "claim": "bio:HUMAN-SPERM-BEAT-DILUTED-SEMEN",
  "audio_s": 0.6,
  "hz": 304.0,
  "gain_db": -9.0,
  "pan": 0.0,
  "dur_s": 0.4,
  "instrument": {
    "kind": "karplus_strong_tuned",
    "decay": 0.996,
    "pluck_brightness_hz": 2000.0
  }
}
```

The claim id points to the dataset entry, which carries the species, the method and the DOI. The writer refuses a series whose claim is not among the manifest's sources, and verification fails a manifest edited to break that rule, so a note cannot cite a source the manifest does not list.

The round trip is two more lines:

```python
report = sc.verify_wav(manifest, wav)  # the file: its notes, its bytes and its timing
report["pass"], [m["recovered_real_s"] for m in report["matched"]]  # (True, [0.0, 0.0])
```

The same calls exist in Rust and in the browser through WebAssembly. Here all three build the same WAV file, byte for byte, and print the same hash, `78efc56a…`.

## The proof

The maps are where proofs pay off, because their properties are what make a sonification honest. The time map must keep the shape of the data's timing: if one gap between events is twice another, it must stay twice as long in the audio. In Lean 4:

```lean
theorem time_map (offset : ℝ) {k : ℝ} (hk : 0 < k) :
    StrictMono (timeMap offset k) ∧
      (∀ t₁ t₂ t₃ : ℝ,
        (timeMap offset k t₃ - timeMap offset k t₂) / (timeMap offset k t₂ - timeMap offset k t₁) =
          (t₃ - t₂) / (t₂ - t₁)) ∧
      (∀ t, timeInv offset k (timeMap offset k t) = t) ∧
      ∀ a, timeMap offset k (timeInv offset k a) = a
```

In plain English: for any positive speed-up, the map never reorders events, every ratio of durations survives, and the inverse map recovers every real time exactly. That last part is what the round trip relies on. `timeMap` is defined with rhythm-units' own `scalePeriod`, so the proof builds on that library's definitions rather than restating them.

Two more theorems cover the pitch side. `octave_shift` shows that moving frequencies by the same number of octaves keeps every interval in cents; it reuses pitch-math's proof that ratios survive. `log_map` shows that the exponential map hits both ends of its range, always rises, and gives the same frequency ratio for the same step of data wherever the step starts. A fourth, `linear_map`, covers the ends, the slope and the clamp of the linear map. All four build in CI with Mathlib, with no `sorry` and only Lean's standard axioms. The other pitch maps (MIDI notes, folding into an octave) and the scale quantiser are tested against exact arithmetic, not proved.

## The evidence: does the round trip work?

The onset detector is deliberately simple. It compares the energy in the 20 ms after each millisecond with the 20 ms before it, takes a rise of 6 dB or more that is the largest within 50 ms, and refines it to the sample. Looking for a burst of energy is the classic approach reviewed by Bello et al. 2005 ([doi:10.1109/TSA.2005.851998](https://doi.org/10.1109/TSA.2005.851998)); the details are mine, so they are tested rather than cited.

My first version had a bug worth knowing about. It passed on the float render and failed on the WAV file it had just written. A 16-bit file is dithered, so its "silence" is noise about 93 dB below full scale, and my detector's floor sat lower than that: the quiet before the first note looked like a rise of 7.5 dB, so it reported an onset at 0 s.

Raising the floor fixed that, but a floor has two edges. Too high, and a quiet note that fades in, like the soft voice with its 80 ms attack, is found late, because its first milliseconds count as silence. Too close to the dither, and the noise still nudges the energy ratio and moves struck notes early. So the detector now raises each window's energy to the floor rather than adding the floor to it, which turns anything quieter into exact silence, and the floor comes from a bound: a dithered 16-bit sample is at most one step from zero, so a window of silence holds at most 1.86 times the energy of a −90 dB floor. That is a rise of 2.7 dB, below the 6 dB threshold, so dithered silence can never be an onset.

A property test renders pieces with all six instruments (struck bar, FM bell, two plucked strings, a soft voice and a heartbeat) at 8, 22.05, 44.1 and 48 kHz. When notes start from silence at −18 to −6 dB, every onset must be found within 0.5 ms of where the manifest says, in the float render and in the WAV file; the worst is 0.38 ms. At a speed-up of 600, that recovers each real time within 0.23 s. Quiet notes are found too: within 1 ms for the struck, plucked and beating instruments at −50 dB, and within 1.5 ms for the soft voice at −30 dB. Overlapping FM bells stay within 2 ms, also in 40 random pieces. And the check fails when it should: shift the manifest's times by 10 ms, even consistently, and every note is reported missing. Keep the timing but change the pitches, and the onsets still match; that is why `verify_wav` also compares the file with a fresh render of the manifest's notes, and that comparison fails.

The expected values in the shared test vectors come from an independent Python oracle: the old toolkit's instruments in numpy, exact fractions and 50-digit arithmetic for the maps, and separate Python versions of the manifest writer and the detector. The oracle validates every manifest it writes against the JSON Schema, and the Rust, Python and WebAssembly builds reproduce its 138 cases, hashes included.

## What this does not show

- **Not biology, and not health.** The library translates numbers into sound. Sperm make no sound we could hear, and nothing here says that any sound is good for anyone. The meaning of the data comes from its sources.
- **Not every piece.** Energy onsets only separate what rises above what is already sounding. A soft voice fading in over sustained notes, or a quiet note while a loud one still rings, can hide an onset. Some soft-voice notes at −40 dB are found more than 2 ms late, outside the tolerance, and in 3 of 40 random pieces of overlapping struck bars, a bar was found over 2 ms early or not at all. The round-trip claim covers the renders I tested, not all music.
- **Not pitch from sound.** The detector finds when notes start, not what they are. Pitch, gain and pan are checked by rendering the manifest again and comparing bytes, not by listening to the file.
- **Not floating point.** The proofs are about exact real numbers. The code's rounding is checked against exact arithmetic (the maps agree to about one part in 4 × 10¹⁵), not proved. WebAssembly's samples can differ from native ones in the last bits, and identical hashes across platforms are checked in CI, not guaranteed.
- **Not a standard yet.** The manifest format is a draft, `sonification-manifest/0.1-draft`. An open specification and validator are planned for their own repository.

## Try it

The crate, the Python and WebAssembly bindings, the schema, the golden vectors, the oracle and the Lean proofs are at [github.com/chethandvg/sonification-core](https://github.com/chethandvg/sonification-core). The hub page lists every claim and how it is known: [/frequencies-of-life/repos/sonification-core/](/frequencies-of-life/repos/sonification-core/).

Next in the series, the Genesis piece is rebuilt on this library, so every note in it comes with a receipt.
