---
title: "Proof levels and retraction checks: every claim says how it is known"
description: "Tag each claim as proved, verified, tested, referenced or assumed; fail CI on retracted papers; hold Rust, Python and WebAssembly to one test set."
pubDate: 2026-11-10
tags: [opensource, python, rust, testing]
repo: evidence-kernel
series: "Frequencies of Life"
draft: true
---

Two of the papers in this project's reference list have been retracted. One, on how human sperm steer, was retracted the year after it appeared; the other, a meta-analysis on sound during sleep, in June 2025. Nothing in an ordinary repository would have flagged either of them.

So before writing any of the maths or the sound for Frequencies of Life, I built the piece that keeps the rest honest: a ledger in which every claim says how it is known, and a set of checks that fail the build when that stops being true.

## Five ways of knowing something

A statement in a README can mean very different things. "The octave fold is unique" might be a theorem checked by a machine, a property I tested on a thousand inputs, or something I read in a paper. Those deserve different amounts of trust, so each claim carries a level:

| Level | Meaning | What CI checks |
|---|---|---|
| **P** | Proved | A Lean 4 theorem that builds, with no `sorry` |
| **V** | Verified numerics | An interval or exhaustive check that runs |
| **T** | Tested | Test files and golden vectors that pass |
| **R** | Referenced | A DOI or PMID that resolves and is not retracted |
| **M** | Model assumption | Nothing: it is stated plainly, never as fact |

The rule that matters most is the last column. A level is not a label I choose to feel good about; it names the check that has to pass.

## The ledger

Every repo in the series has a `claims.yaml`. This is a real entry from the evidence kernel's own ledger:

```yaml
  - id: evidence:RUNNERS-AGREE
    version: 1.0.0
    level: T
    statement: >-
      The Rust, Python and JavaScript golden-vector runners give the same verdict on every shared
      conformance case: numbers inside and outside tolerance, nested arrays and objects, strings,
      booleans versus numbers, null, and expected or unexpected errors.
    tests:
      - conformance/compare-cases.json
      - crates/golden-vectors/src/lib.rs
      - tests/test_vectors.py
      - js/golden-vectors.test.mjs
```

Claim ids are permanent, and the major version changes whenever the statement's meaning does. That lets another repo write `depends_on: [rhythm:TIME-SCALING@1]` and have its CI fail if the claim it relies on disappears or changes meaning.

`ek validate claims.yaml` checks the file against a JSON Schema, then checks the things a schema cannot: ids are unique, every proof, check and test file exists, every R claim cites a DOI or PMID, and every dependency exists at the stated major version. For a dependency in another repo, it looks the prefix up in a registry of all the project's repos and fetches that repo's ledger. A repo that has not been published yet gives a warning rather than an error, so the repos can be built in order.

`ek readme-table` turns the ledger into the table at the top of each README, and `--check` fails CI when the two drift apart. The table in the evidence kernel's README is generated this way.

## Retractions are metadata

A retraction is not hidden. Crossref, which registers most journal DOIs, lists notices about a work in an `updated-by` field, and it now includes the Retraction Watch database. PubMed tags a retracted paper with the publication type "Retracted Publication". So checking for retractions comes down to reading the right fields and deciding which notices matter:

```python
FAILING_NOTICES = {
    "retraction": "retracted",
    "partial_retraction": "partially retracted",
    "withdrawal": "withdrawn",
    "removal": "removed",
}
TITLE_MARKS = (("RETRACTED", "retracted"), ("WITHDRAWN", "withdrawn"))
```

```python
def _judge(title: str, notices: Iterable[str], detail: str) -> Lookup:
    """Fail on a retraction or withdrawal notice, or a title marked RETRACTED or WITHDRAWN."""
    marks = [FAILING_NOTICES[n] for n in notices if n in FAILING_NOTICES]
    marks += [status for mark, status in TITLE_MARKS if title.lstrip().upper().startswith(mark)]
    return Lookup(not marks, marks[0] if marks else "ok", detail)
```

A correction or an expression of concern is shown, but it does not fail the build: those papers still stand, and a reader can judge them. The title check is a backstop for publishers that rename a retracted article "RETRACTED: …" without a structured notice.

Here is part of a real run against three references from the project's report: Taylor et al. 1993 in Human Reproduction (doi:10.1093/oxfordjournals.humrep.a137999), Gadêlha et al. 2020 in Science Advances (doi:10.1126/sciadv.aba5168) and Stanyer et al. 2022 in the Journal of Sleep Research (doi:10.1111/jsr.13385):

```text
claim                      source                                     status     detail
bio:HUMAN-CA-OSCILLATIONS  doi:10.1093/oxfordjournals.humrep.a137999  ok         1993 Fertilization and early embryology: Oscillations in intra...
bio:SPERM-STEERING         doi:10.1126/sciadv.aba5168                 retracted  2020 Human sperm uses asymmetric and anisotropic flagellar con...; retraction 10.1126/sciadv.aau9116 (2021-05-01); expression_of_concern 10.1126/sciadv.abe3154 (2020-08-14)
bio:SPERM-STEERING         pmid:32789171                              retracted  2020 RETRACTED: Human sperm uses asymmetric and anisotropic fl...
bio:ACOUSTIC-SLEEP         doi:10.1111/jsr.13385                      retracted  2021 RETRACTED: The impact of acoustic stimulation during slee...; retraction 10.1111/jsr.70111 (2025-06-16)
```

The command exits with status 1. Because the claims check runs weekly as well as on every push, a paper retracted next year will fail the build within a week of Crossref or PubMed recording the notice. The requests use only the standard library, a plain User-Agent that names the tool, a delay between calls and a couple of retries.

## One rulebook for three languages

Each algorithm in the series is written once, in Rust, and compiled to WebAssembly for the browser and to a Python wheel. Shared JSON "golden vectors" keep the bindings honest: each file lists a function, its arguments and the answer, and a small runner in each language checks its binding against the same files. Numbers pass when |got − expected| ≤ max(abs, rel × |expected|); strings, booleans and null must match exactly.

Three runners means three chances to disagree about what "match" means, so I wrote the rules down as data. `conformance/compare-cases.json` has 47 cases, and the Rust, Python and JavaScript test suites all run it. Each case states a verdict that every runner must reach:

```json
{"claim": "evidence:RUNNERS-AGREE", "note": "two decimal forms of the same double are equal (numbers are parsed with correct rounding)", "fn": "verdict", "args": [{"case": {"fn": "f", "args": [], "expected": 1.6041656501881165}, "returns": 1.6041656501881165208800439}], "expected": true}
```

Writing the cases found a disagreement in every runner.

**Rust.** serde_json's default number parser is fast but not always correctly rounded. In a quick test of a few thousand random doubles, about one in eight came back one unit in the last place off, so a correct Rust result could fail an exact vector that Python and JavaScript would pass. One feature flag fixes it:

```toml
# float_roundtrip: read every JSON number as the nearest double, as Python and JavaScript do.
serde_json = { version = "1.0.154", features = ["float_roundtrip"] }
```

**Python.** Python integers are exact, but the JavaScript runner reads JSON numbers as doubles and the Rust runner compares them as doubles, so 2^53 + 1 and 2^53 were different in Python and equal in the other two. Python now compares numbers as doubles too:

```python
    if _number(got) and _number(want):
        g, w = float(got), float(want)  # doubles, as in the Rust and JavaScript runners
        if g == w or abs(g - w) <= max(abs_, rel * abs(w)):
            return None
```

**JavaScript.** An array is an object in JavaScript, so `[1]` matched the expected value `{"0": 1}`. The object branch now rules arrays out on both sides:

```js
  if (got && want && typeof got === "object" && typeof want === "object" && !Array.isArray(got) && !Array.isArray(want)) {
```

None of these would have shown up in a test that each runner wrote for itself. They only appeared when one file had to give the same answer three times.

## What this does not show

- The evidence kernel's own six claims are all level T: tested, not proved.
- `ek lean-links` checks that each P claim's theorem exists in the built Lean project. It cannot check that the theorem says what the English statement says; a person still has to read both.
- Retraction checks are only as good as Crossref's and PubMed's records. A DOI that Crossref does not hold, such as a Zenodo DOI, resolves through the DOI system, but its retraction status cannot be checked, and the table says so.
- A level describes the evidence, not the importance. An R claim with a sound DOI is still one study in one species, and the ledger records which.
- Forty-seven cases pin down the rules, not every possible value.

## Try it

The code, the schemas and the conformance cases are at [github.com/chethandvg/evidence-kernel](https://github.com/chethandvg/evidence-kernel), and the project page is [/frequencies-of-life/repos/evidence-kernel/](/frequencies-of-life/repos/evidence-kernel/). Point `ek validate` and `ek resolve` at any `claims.yaml`; your own reference list is a good place to start.

Next in the series: rhythm units, where period, frequency and beats per minute get the series' first P claims, written as Lean proofs.
