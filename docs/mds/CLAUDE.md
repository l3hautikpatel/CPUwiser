# CLAUDE.md: rules for working on CPUwiser

Copy this file to the repo root. Claude CLI loads it at the start of every session.

## Project in one paragraph

CPUwiser is a hobby lab that splits one open-weight LLM across several CPU machines (one coordinator, N workers) to measure speed, latency, memory and failure behaviour, and to learn how distributed inference works. Nodes are Docker containers on a laptop or free Oracle Cloud VMs. A **profile** file describes a cluster, a **planner** recommends a setup from it, **engine adapters** run it, and a **runner** records results. A small chat demo comes last. The full plan is in `docs/PLAN.md`; read `docs/DESIGN.md` before changing a component.

## Non-goals (do not build these)

- No production service, no client-facing API, no SLA, no multi-tenant features.
- No hosted-LLM-API fallback router (that is a different project).
- No custom CUDA/GPU work. The lab targets CPUs.
- No training or fine-tuning.
- No orchestration platforms (Kubernetes, Nomad, Ray). Use Docker Compose and SSH.

## Hard rules

1. **Never expose a worker port (RPC or distributed-llama) to the public internet.** The llama.cpp RPC server is documented as a fragile, insecure proof of concept [V]. Bind to private addresses only, and firewall everything else.
2. **Never commit secrets or identifying data:** SSH keys, WireGuard keys, API keys, tenancy OCIDs, public IPs, `.env` files. Use `.env.example` and `profiles/*.example.yaml`. Real profiles go in `profiles/local/` (git-ignored).
3. **Stay inside Oracle Always Free limits.** Never create paid shapes or resources. Before creating anything in Oracle, confirm it shows the Always Free label. If unsure, stop and ask.
4. **Do not invent numbers.** Every performance figure in docs or reports must come from a recorded run (`results/`) or carry a confidence tag [S], [E] or [U]. Never write a measured-looking value you did not measure.
5. **Verify tool flags before using them.** Engine options change between versions. Run `<tool> --help` on the pinned version and use what it prints, not memory.
6. **Pin versions.** Record the git commit of each engine, the model file name and SHA-256, and the OS/kernel in every result record.
7. **Ask before adding a dependency, a new top-level folder, or any cloud resource.** Prefer the standard library and tools already listed in `docs/DESIGN.md`.
8. **Work on one task at a time** from `docs/TASKS.md`. Do not start the next task without being asked.
9. **Long or costly runs need approval:** anything over 10 minutes, anything using Oracle nodes, anything that downloads a model over 2 GB. Show the exact commands and the expected duration first.
10. **If something is unclear, ask.** Do not guess requirements, hardware details, or versions.

## Repo map (target layout)

```
cpuwiser/
  CLAUDE.md                 this file
  README.md                 index and quick start
  docs/                     PLAN, DESIGN, INFRA, EXPERIMENTS, TASKS, RESEARCH
  profiles/                 example cluster profiles (*.example.yaml); real ones in profiles/local/ (ignored)
  experiments/              experiment specs (YAML), one per experiment ID
  src/cpuwiser/
    profile/                profile schema and loading
    planner/                profile -> recommended setup
    engines/                one adapter per engine (llamacpp_rpc, distributed_llama, ...)
    runner/                 experiment runner, collectors, result writer
    report/                 tables and charts from results
    cli.py                  command line entry point
  demo/                     chat demo (API + static UI)
  infra/
    docker/                 Dockerfiles, compose templates, netem scripts
    oracle/                 runbook scripts and systemd unit templates
    bootstrap/              node setup scripts
  results/                  raw run output (git-ignored); summaries committed under results/summaries/
  tests/                    unit and integration tests
```

## Tooling and conventions

- Python 3.12, managed with `uv` (ask if the user prefers another tool).
- Pydantic v2 for schemas, Typer for the CLI, pytest for tests, ruff for lint and format, mypy or pyright in basic mode.
- Type hints on all public functions. No global mutable state. Pure functions for the planner so it is easy to test.
- Shell scripts: `bash` with `set -euo pipefail`, shellcheck clean, idempotent, with a `--dry-run` option where destructive.
- Logs: structured JSON lines with a `run_id`. Never print secrets.
- Every experiment writes one JSON record per run plus raw logs to `results/<experiment>/<run_id>/`.
- Conventional commit messages (`feat:`, `fix:`, `docs:`, `test:`, `chore:`). One task per commit where practical.
- Make targets (create them in task T-004): `make setup`, `make lint`, `make test`, `make sim-up`, `make sim-down`, `make report`.

## Definition of done for any task

- The acceptance criteria in `docs/TASKS.md` are met and **demonstrated by running them** (show the command and result).
- Tests added or updated and passing; lint clean.
- Docs updated (`docs/TASKS.md` status, plus `docs/RESEARCH.md` for any new fact, with a confidence tag).
- No secrets, no large binaries or model files committed.
- A short note listing anything the user must check manually.

## Working style

- Start each task with a 5-line plan, then implement. Keep changes small and reviewable.
- When a measurement surprises you, **investigate before explaining**: reproduce, look at logs, form hypotheses, test them in order.
- Prefer boring, explicit code over clever code.
- When reporting results, state the sample size, the spread (median and p95), the hardware, and what would change the conclusion.
- Tell the user plainly when a result is negative. A measured negative result is a valid, valuable outcome for this lab.

## Reference facts to rely on (details in `docs/RESEARCH.md`)

- llama.cpp worker binary is `ggml-rpc-server` with options `-t`, `-d`, `-H`, `-p`, `-c` [V]. The coordinator uses `--rpc host:port,host:port`; split can be tuned with `--tensor-split` [V]. `llama-bench` accepts `--rpc` [V].
- distributed-llama runs only on 1, 2, 4, 8... nodes (the root counts as one), and needs a fast local network [V/S].
- Oracle Always Free: Arm A1 totals 2 OCPU and 12 GB; up to 2 A1 VMs; plus up to 2 AMD micro VMs (1/8 OCPU, 1 GB each); no SLA; idle instances may be reclaimed [V].
