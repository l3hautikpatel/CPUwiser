# TASKS.md: numbered tasks, one Claude CLI session each

Date: 2026-11-10
Status values: `todo`, `doing`, `done`, `blocked`. Update the Status column after each task (CLAUDE.md, definition of done).
Effort: S is under 1 hour, M is 1 to 3 hours, L is 3 to 6 hours [E]. Task IDs are stable labels, not strict order: M6 uses the T-08x range and M7 uses T-06x/T-07x.

## How to run a task

1. Start Claude CLI in the repo. Paste the "Session for any task" prompt from `README.md` with the task ID.
2. Claude summarizes its plan in 5 lines, implements, runs the acceptance commands, and shows the output.
3. You review, commit (conventional message), and mark the task `done`.
4. Tasks marked **[needs approval]** use cloud machines, long runs or large downloads: Claude shows the commands first (CLAUDE.md rule 9).
5. Tasks marked **[manual]** have steps only you can do (account creation, console actions).

---

## M0. Bootstrap

| ID | Task | Depends | Effort | Status |
|---|---|---|---|---|
| T-001 | Create repo skeleton per CLAUDE.md map: folders, `.gitignore` (results, profiles/local, .env, models, keys), `LICENSE` placeholder (ask which), docs copied to `docs/` | none | S | todo |
| T-002 | Python project: `pyproject.toml` (Python 3.12, uv), package `cpuwiser` with `__init__.py` and `cli.py` stub (`cpuwiser --version`), ruff, type checker, pytest config | T-001 | S | todo |
| T-003 | CI: GitHub Actions running lint, type check, unit tests; no secrets; add secret scanning only after asking (dependency rule) | T-002 | S | todo |
| T-004 | Makefile with targets `setup`, `lint`, `test`, `sim-up`, `sim-down`, `report` (the last three may print "not implemented yet") | T-002 | S | todo |
| T-005 | `.env.example`, `profiles/*.example.yaml` placeholders, `docs/STATUS.md` (empty log of decisions), pre-commit hook for lint | T-004 | S | todo |

**Acceptance for T-001 to T-005:** `make setup lint test` passes on a clean clone; `cpuwiser --version` prints a version; `git status` shows no ignored paths tracked; CI is green.

## M1. Single-node baseline

| ID | Task | Depends | Effort | Status |
|---|---|---|---|---|
| T-010 | `cpuwiser doctor`: record OS, kernel, CPU model and flags, cores, RAM, Docker version, VM-or-native note, to `results/environment.json` | T-002 | M | todo |
| T-011 | Model manifest: `models/manifest.yaml` listing chosen models, quant, source URL, licence, expected SHA-256 (fill after download); download script with hash check **[needs approval for files over 2 GB]** | T-005 | M | todo |
| T-012 | Engine build script for llama.cpp (pinned commit, RPC enabled, targets `llama-bench`, `llama-server`, `ggml-rpc-server`); records commit and flags; verify target names with `--target help` and flags with `--help` | T-010 | M | todo |
| T-013 | Result writer and reader: Pydantic model for the result record (DESIGN.md section 8), JSONL append, raw-log folder layout, `run_id` generation | T-002 | M | todo |
| T-014 | Experiment A1 on the host: `llama-bench` wrapper that parses output into result records; node sampler script | T-012, T-013, T-011 | L | todo |
| T-015 | Report v0: `make report` produces a Markdown table of baselines with median/p95 from `results/` | T-014 | M | todo |

**Acceptance for M1:** baseline table for at least two models and two quants with 5 repetitions each; every number traces to a run ID; `cpuwiser doctor` output stored.

## M2. Docker simulation

| ID | Task | Depends | Effort | Status |
|---|---|---|---|---|
| T-020 | Node image (multi-stage build, non-root user, iproute2, iperf3, sampler); engine binaries copied from the build | T-012 | M | todo |
| T-021 | Compose generator: from a profile (simple YAML for now) generate `docker-compose.yml` with cpus, memory limits, no published worker ports, internal network, read-only model mount | T-020 | L | todo |
| T-022 | llama.cpp RPC adapter v1: `build_plan`, `start_workers`, `start_coordinator(bench)`, `bench`, `stop`; golden-file tests for command lines | T-021, T-013 | L | todo |
| T-023 | Coordinator-without-layers mode: discover the engine's device listing on the pinned version, determine how to keep layers off the local device (device selection or zero tensor-split); document in `docs/RESEARCH.md` with tag | T-022 | M | todo |
| T-024 | Runner v1: execute an experiment spec (sweep, repetitions, warm-up, random order, abort rules, cleanup trap), write result records | T-022, T-013 | L | todo |
| T-025 | Network emulation with `tc netem` (egress delay on both ends, rate, loss), validation step (ping and iperf3 within 10 percent) that blocks runs on failure | T-021 | L | todo |
| T-026 | **Optional** userspace delay proxy with byte and turnaround counters; used if `tc` is unavailable or exact round-trip counts are needed | T-021 | L | todo |
| T-027 | Run experiments A2 and A3; fit token time versus RTT; write `docs/` notes with k and RPC tax **[needs approval if over 10 minutes]** | T-024, T-025 | L | todo |
| T-028 | Run A4, A5, A6; compare predictions from A3 with results | T-027 | L | todo |
| T-029 | Run A7 (failure injection) and A8 (heterogeneity, split grid) | T-028 | L | todo |

**Acceptance for M2:** A1 to A8 have recorded data with at least 5 repetitions; emulation validation output stored with each sweep; report shows the A3 plot and the fitted constants; a README section "how to rerun" works from a clean checkout.

## M3. Profile and planner

| ID | Task | Depends | Effort | Status |
|---|---|---|---|---|
| T-030 | Profile schema (Pydantic) and loader per DESIGN.md section 3, including all validation rules; example profiles for the six cluster types | T-002 | M | todo |
| T-031 | Unit tests for every validation rule (valid, invalid, public address, duplicate IDs, asymmetric links, `assumed` link warning) | T-030 | M | todo |
| T-032 | GGUF metadata reader (layer count, embedding size, head counts, context length) and `model-info` command; verify against a real file | T-011 | M | todo |
| T-033 | Planner v1: rules R1 to R7 and R9 (memory, fit, control, engine, split, threads, context, safety) as pure functions with fixture-based tests | T-030, T-032 | L | todo |
| T-034 | Planner R8: token-time prediction using constants from A3 (RPC tax, k) stored in a versioned `planner/constants.yaml` with source run IDs; warnings for slow plans | T-033, T-027 | M | todo |
| T-035 | `cpuwiser plan --profile X --model Y` prints a human-readable plan and writes `plan.yaml`; includes suggested experiment IDs (R10) | T-034 | M | todo |
| T-036 | Compose generator and runner consume the profile and plan (replace the simple YAML from T-021) | T-035, T-024 | L | todo |

**Acceptance for M3:** planner output for every example profile is valid and explained; tests pass; running `cpuwiser plan` then `cpuwiser run` on `sim-lan` works without manual edits. **Before starting, confirm the interpretation in README.md ("change based on the cluster and computer selections") with the user.**

## M4. Oracle cluster

| ID | Task | Depends | Effort | Status |
|---|---|---|---|---|
| T-040 | **[manual]** Create the Oracle account, set the home region, compartment, budget alert, dedicated SSH key (INFRA.md 3.2) | none | M | todo |
| T-041 | **[manual + needs approval]** VCN, subnet, security rules, and A1 instances in cluster mode (INFRA.md 3.3 and 3.4); record real IPs only in `profiles/local/` | T-040 | M | todo |
| T-042 | Bootstrap script (idempotent, `--dry-run`): updates, hardening, user, firewall rules, tools (INFRA.md 3.5) | T-041 | L | todo |
| T-043 | Engine build and copy to both VMs; systemd unit templates for workers (private bind) and coordinator (loopback) (INFRA.md 3.6 and 3.7) | T-042, T-012 | L | todo |
| T-044 | Experiment B1 (network baseline); update the `oracle-2xa1` profile with measured links **[needs approval]** | T-043 | S | todo |
| T-045 | Experiment B2 (single A1 baseline); replace third-party estimates in docs **[needs approval]** | T-043, T-014 | M | todo |
| T-046 | Experiment B3 (cluster versus control mode); includes the recreate-as-2-OCPU step **[needs approval, manual console step]** | T-044, T-045 | L | todo |
| T-047 | Port-exposure verification from outside (scan the VM public IPs: only SSH and nothing else) | T-043 | S | todo |

**Acceptance for M4:** B1 to B3 recorded; no worker port reachable from the internet (T-047 evidence); VMs rebuildable from scripts in under an hour (timed once).

## M5. Chat demo

| ID | Task | Depends | Effort | Status |
|---|---|---|---|---|
| T-050 | Demo backend: FastAPI app with `/v1/chat` (SSE), `/health`, `/cluster`, `/metrics/recent` per DESIGN.md section 11; talks to the engine's OpenAI-style server; API key, limits, CORS | T-022 | L | todo |
| T-051 | Request queue with single concurrency, timeout, clean rejection when busy | T-050 | M | todo |
| T-052 | Static UI: chat box, streamed answer, live TTFT and tokens per second, per-node status panel (plain HTML and JavaScript, no framework unless asked) | T-050 | L | todo |
| T-053 | Tests: SSE stream shape, error events, limits, API key; end-to-end against `sim-lan` with the tiny model | T-051 | M | todo |
| T-054 | Deploy the demo to the coordinator (loopback engine, demo on a private or SSH-tunneled port) **[needs approval]** | T-043, T-053 | M | todo |
| T-055 | Run chat-demo tests D1 to D4 and record results | T-054 | M | todo |

**Acceptance for M5:** a prompt typed in the UI streams an answer produced by the cluster; the side panel shows live numbers that match the logged ones within rounding; D1 to D3 pass.

## M6. Second engine and extras (T-08x)

| ID | Task | Depends | Effort | Status |
|---|---|---|---|---|
| T-080 | distributed-llama build and adapter (`dllama worker`, `inference`, `dllama-api`), supported-model download, node-count validation (1, 2, 4, 8 and at most KV heads) | T-022 | L | todo |
| T-081 | Run A9 (laptop simulation, 2 nodes, RTT sweep) | T-080, T-025 | L | todo |
| T-082 | Run B8 (2 x A1) **[needs approval]** | T-080, T-043 | M | todo |
| T-083 | **Optional** prima.cpp build attempt and one run (stop after one failed attempt per session) | T-012 | L | todo |
| T-084 | **Optional** custom Python pipeline (2 to 3 stages, tiny model) and compare with llama.cpp RPC | T-027 | L | todo |
| T-085 | Hybrid WAN setup with WireGuard or Tailscale and runs B4 and B5 **[needs approval, manual key steps]** | T-046 | L | todo |
| T-086 | Mixed architecture run B6 **[needs approval]** | T-046 | M | todo |

## M7. Hardening and write-up (T-06x and T-07x)

| ID | Task | Depends | Effort | Status |
|---|---|---|---|---|
| T-060 | Automated port-exposure check: fails if any compose file publishes a worker port, any unit file or script binds `0.0.0.0` for worker ports, or a profile contains a public address without `allow_public`; runs in CI | T-021 | M | todo |
| T-061 | Soak test B7 for 6 hours, then optionally 24 hours **[needs approval]** | T-054 | M | todo |
| T-062 | Security review using the checklist in INFRA.md section 5; fix findings | T-061, T-047 | M | todo |
| T-063 | Recovery behaviour in the demo from A7 results: timeouts, auto-restart units, user-facing messages | T-029, T-054 | M | todo |
| T-070 | Planner validation: for two real profiles compare predicted split and speed with the best measured; record the error | T-046, T-034 | M | todo |
| T-071 | Repo README for public viewing: what it is, results highlights, how to reproduce, limitations; scrub for secrets | T-070 | M | todo |
| T-072 | Final report (outline in EXPERIMENTS.md section 9) with the direct answer to the purpose question | T-070, T-061 | L | todo |

**Acceptance for M7:** CI includes T-060; soak result documented; the final report cites run IDs for every number; the repo contains no secrets (verified by a scan).

---

## Task detail cards (read when starting the task)

### T-014: A1 host baseline
- **Inputs:** a built `llama-bench`, one small GGUF model with a recorded SHA-256.
- **Steps:** build the parameter grid from the spec; for each point run one warm-up and 5 measured runs in random order; parse the tool's output into result records; run the node sampler alongside; save raw output.
- **Verify:** reruns on the same machine agree within about 5 to 10 percent [E]; records validate against the Pydantic model; the report table renders.
- **Watch for:** thermal throttling (record CPU frequency if available), background apps, power mode.

### T-022: llama.cpp RPC adapter v1
- **Inputs:** DESIGN.md sections 6 and 12; INFRA.md section 3.7 templates; pinned engine build.
- **Steps:** implement `build_plan` first (pure, with golden tests), then process control through the Docker or SSH layer; wait until the worker accepts connections; run `llama-bench` with `--rpc` against the workers; parse output; stop workers on exit.
- **Verify:** `--help` output of the pinned binaries was consulted and flags match; a run with one worker completes; killing the runner leaves no stray processes.
- **Watch for:** the coordinator failing at start if a worker is down; ports hard-coded; the worker target name `ggml-rpc-server`.

### T-025: network emulation
- **Steps:** apply delay on both ends; add rate; add loss; implement `clear()`; implement the validation (ping x 30, iperf3 x 10 s); store the output.
- **Verify:** for targets of 1, 10 and 50 ms RTT the measured values are within 10 percent; `clear()` restores near-zero delay; the runner refuses to start when validation fails.
- **Fallback:** if the host kernel lacks netem support, stop and ask the user whether to build the proxy (T-026).

### T-033: planner v1
- **Steps:** implement each rule as its own function with a docstring that cites the rule ID and formula; build fixture profiles (fits, does not fit, high RTT, heterogeneous); test expected outputs including warnings.
- **Verify:** the worked example in DESIGN.md section 5.3 is reproduced by a test.
- **Watch for:** hidden assumptions (for example the OS reserve) must be profile fields, not constants.

### T-041: Oracle instances **[manual + approval]**
- **Rules:** only Always Free labelled shapes; before clicking create, confirm the console shows the Always Free label; stop if a price appears. Claude CLI gives the checklist and verifies by CLI or console screenshots the user provides; it does not create resources on its own.

### T-050: demo backend
- **Verify:** the SSE stream emits `token`, `stats`, `done` and `error` events as specified; with the engine stopped, `/health` reports unhealthy and `/v1/chat` returns an `error` event quickly; the API key is required; no prompt content is logged by default.

## Dependency overview

```
M0 -> M1 -> M2 -> M3 -> M4 -> M5 -> M7
                \          \-> M6 (needs M2 for simulation; M4 for Oracle runs)
                 \-> experiments A1..A8 feed planner constants (T-034)
```

## Suggested first session order

1. Session 1: T-001 to T-005.
2. Session 2: T-010, T-011.
3. Session 3: T-012, T-013.
4. Session 4: T-014, T-015 (first numbers).
5. Then continue by milestone. Do T-040 (Oracle signup) early in parallel, because capacity may need days of retries.
