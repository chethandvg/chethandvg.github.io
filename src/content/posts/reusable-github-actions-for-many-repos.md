---
title: "Write CI once: reusable GitHub Actions for a family of repos"
description: "One repo holds every workflow, the site address and a registry; a template stamps out new repos. How Frequencies of Life keeps CI in one place."
pubDate: 2026-11-13
tags: [githubactions, devops, opensource, rust]
repo: .github
series: "Frequencies of Life"
draft: true
---

Frequencies of Life will grow to more than twenty repositories, mixing Rust, Python, WebAssembly, Lean 4 proofs and a static site. If each repository carried its own copy of every CI job, a single fix would mean twenty pull requests, and the copies would drift apart within a month. So the project keeps CI, settings and conventions in exactly one place.

## Reusable workflows: one copy of each job

GitHub Actions lets a workflow declare `on: workflow_call`, so other repositories can call it like a function. All the shared workflows live in [chethandvg/.github](https://github.com/chethandvg/.github). A Rust + Lean repository's whole CI file is three calls:

```yaml
jobs:
  rust:
    uses: chethandvg/.github/.github/workflows/rust-ci.yml@v1
  python:
    uses: chethandvg/.github/.github/workflows/py-bindings-ci.yml@v1
  wasm:
    uses: chethandvg/.github/.github/workflows/wasm-ci.yml@v1
```

The shared Rust job formats, lints and tests on Linux and Windows:

```yaml
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]
    steps:
      - uses: actions/checkout@v7
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy, rustfmt
      - uses: Swatinem/rust-cache@v2
      - run: cargo fmt --all --check
      - run: cargo clippy --all-targets -- -D warnings
      - run: cargo test --all-targets
```

Callers pin `@v1`, a tag that moves with compatible releases. A breaking change gets `v2`, and each repository moves over when it's ready.

These are the shared jobs:

| Workflow | What it does |
|---|---|
| `rust-ci` | fmt, clippy and tests on two operating systems |
| `py-bindings-ci` | builds the PyO3 bindings with maturin and runs the golden vectors |
| `wasm-ci` | builds the WebAssembly bindings and runs the golden vectors in Node |
| `lean-check` | builds the Lean proofs, rejects `sorry` and non-standard axioms |
| `claims-verify` | validates `claims.yaml`, resolves every DOI and fails on retractions |
| `license-check` | permissive dependency licences only; no GPL or AGPL |
| `site-url-check` | fails on links to an old site address |
| `release` | checks every version field against the tag, then publishes |

## Small details that save real time

**The WebAssembly job reads its tool version from the code.** The `wasm-bindgen` command-line tool must match the `wasm-bindgen` crate exactly. So the crate pins an exact version, and the workflow reads that pin instead of hard-coding a second copy:

```yaml
      - name: Read the pinned wasm-bindgen version
        id: wb
        run: |
          version=$(sed -n 's/^wasm-bindgen = "=\([0-9.]*\)".*/\1/p' Cargo.toml)
          test -n "$version" || { echo "::error::Pin wasm-bindgen exactly (wasm-bindgen = \"=x.y.z\") in $PWD/Cargo.toml"; exit 1; }
          echo "version=$version" >> "$GITHUB_OUTPUT"
```

When Renovate bumps the crate, the CI tool follows automatically.

**Releases refuse to ship mismatched versions.** Before creating a release, the workflow checks that `CITATION.cff`, `CHANGELOG.md`, `Cargo.toml`, `pyproject.toml` and `package.json` all agree with the tag:

```bash
check() { [ -f "$1" ] || return 0; grep -Eq "$2" "$1" || { echo "::error file=$1::version is not $v"; status=1; }; }
check CITATION.cff "^version: \"?$v\"?$"
check CHANGELOG.md "^## \[$v\]"
check Cargo.toml "^version = \"$v\""
```

Once Zenodo is switched on for a repository, every GitHub release is archived and given a DOI. The workflow also asks Software Heritage to archive the source, so each version can be cited and stays findable.

**The site address lives in one file.** `site.json` holds `site_url`. Builds read it, and a check fails if any file still links to an old address. Moving to a custom domain later means changing one value, not searching twenty repositories.

## A template that refuses to half-finish

New repositories come from [repo-template](https://github.com/chethandvg/repo-template). Its script copies the common files and one "kind" (Rust + Lean, Python, or site), fills every `{{PLACEHOLDER}}` in file contents *and* file names, adds the licence texts, and runs `git init`. It fails loudly if anything is left unfilled:

```python
left = [str(p.relative_to(dest)) for p in dest.rglob("*") if p.is_file() and PLACEHOLDER.search(p.read_text(encoding="utf-8", errors="ignore"))]
if left:
    sys.exit(f"unfilled placeholders in: {', '.join(left)}")
```

Every new repository therefore starts with the same licences, a `CITATION.cff`, an issue form for reporting a wrong claim, and working CI.

## Two things I learned building it

1. **Cargo's `[patch]` doesn't let you build offline against a GitHub dependency that doesn't exist yet.** Cargo still tries to fetch the original source first. During local development the repositories use path dependencies, and they switch to tagged GitHub dependencies at release.
2. **`wasm-bindgen --target nodejs` produces CommonJS.** A `"type": "module"` line in the bindings' `package.json` makes Node refuse to load it. The tests are `.mjs` files, so removing that one line was the whole fix.

## Try it

The shared workflows are at [github.com/chethandvg/.github](https://github.com/chethandvg/.github), and the template is at [github.com/chethandvg/repo-template](https://github.com/chethandvg/repo-template). Both are Apache-2.0, so you're welcome to adapt them for your own family of repositories.

Next in the series: the second sprint, starting with the leaky integrators that let an egg count its calcium spikes.
