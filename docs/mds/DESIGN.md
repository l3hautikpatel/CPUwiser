# DESIGN.md: components, schemas and interfaces

Date: 2026-11-10
Tags: [V] verified, [S] third-party, [E] estimate, [U] unknown. This file specifies **what to build**; it contains configuration examples but no application code.

---

## 1. Design principles

1. **Profile in, plan out, results recorded.** Every run is described by data (profile, plan, experiment spec) and produces a self-contained result record.
2. **One engine adapter per engine**, all behind the same interface, so experiments do not care which engine runs.
3. **Pure core, thin shell.** Profile loading, planning and command building are pure functions (easy to test). Process control, SSH and Docker live in small, replaceable modules.
4. **Reproducible by construction.** Pin engine commit, model hash, versions; record the environment in every result.
5. **Safe by default.** Private addresses only, resource limits on every container, no public worker ports.

## 2. Module overview

| Module | Responsibility | Depends on |
|---|---|---|
| `profile` | Load, validate and normalize cluster profiles (YAML to typed objects) | none |
| `planner` | Turn a profile and a model choice into a plan (engine, split, threads, context, warnings, suggested experiments) | `profile`, model metadata |
| `engines` | Adapters that build commands, start and stop workers and coordinator, and parse engine output | `profile`, `planner` |
| `runner` | Execute an experiment spec: prepare nodes, apply network emulation, run engine, collect metrics, write records | `engines`, `infra` |
| `infra` | Node access (local Docker, SSH), network emulation controller, node samplers | none |
| `report` | Aggregate results into tables and charts, compute fits (for example RTT slope) | results |
| `demo` | Chat API and static UI talking to the coordinator's server | engine server endpoint |
| `cli` | `cpuwiser` command: `plan`, `up`, `down`, `run`, `report`, `doctor` | all |

## 3. Cluster profile schema (YAML)

A profile describes machines and the links between them. Real profiles with addresses and key paths live in `profiles/local/` (ignored by git); the repo carries `*.example.yaml` files.

### 3.1 Fields

| Field | Type | Notes |
|---|---|---|
| `schema_version` | int | Starts at 1 |
| `name` | string | Unique, used in result records |
| `kind` | `simulated` / `real` / `hybrid` | Simulated profiles apply network emulation |
| `nodes[]` | list | At least a coordinator |
| `nodes[].id` | string | Unique, for example `coord`, `w1` |
| `nodes[].role` | `coordinator` / `worker` | Exactly one coordinator |
| `nodes[].coordinator_computes` | bool | Default true. If false, the coordinator keeps no model layers (see section 5.4) |
| `nodes[].address` | string | **Private** address or container name; the validator rejects public ranges unless `allow_public: true` is set explicitly |
| `nodes[].arch` | `x86_64` / `aarch64` | |
| `nodes[].cores` | number | Physical cores available to the lab (fractions allowed for containers) |
| `nodes[].ram_gb` | number | RAM available to the node |
| `nodes[].os_reserve_gb` | number | Default 1.0 for VMs, 0.3 for containers [E] |
| `nodes[].relative_speed` | number | Optional; filled from experiment B2/A1 results; default 1.0 |
| `nodes[].access` | object | `docker` (service name) or `ssh` (user, port, `key_ref` pointing to a local config entry, never a key itself) |
| `nodes[].paths` | object | Engine binary and model directory on the node |
| `links[]` | list | One entry per node pair |
| `links[].a`, `links[].b` | node ids | |
| `links[].rtt_ms` | number | Round-trip time |
| `links[].bw_mbps` | number | Bandwidth, 0 means unlimited |
| `links[].loss_pct` | number | Default 0 |
| `links[].source` | `emulated` / `measured` / `assumed` | `assumed` links trigger a warning in the planner |
| `constraints.allowed_engines` | list | For example `[llamacpp_rpc, distributed_llama]` |
| `constraints.max_public_ports` | int | Must be 0 |
| `notes` | string | Free text |

### 3.2 Validation rules (all must be unit-tested)

- Exactly one coordinator; node ids unique; every link references existing nodes.
- No negative values; `ram_gb > os_reserve_gb`.
- Public addresses rejected unless explicitly allowed; `max_public_ports` must be 0.
- A `real` profile needs `access.type: ssh` for every node; a `simulated` profile needs `access.type: docker`.
- Links must be symmetric (the schema stores one entry per pair).
- Warn (do not fail) if a link has `source: assumed`.

### 3.3 Example profiles (shapes, not real values)

**`sim-wan` (laptop containers with emulated internet link)**

```yaml
schema_version: 1
name: sim-wan-3
kind: simulated
nodes:
  - {id: coord, role: coordinator, coordinator_computes: false, address: coord, arch: aarch64, cores: 1, ram_gb: 2, access: {type: docker, service: coord}}
  - {id: w1, role: worker, address: w1, arch: aarch64, cores: 1, ram_gb: 6, access: {type: docker, service: w1}}
  - {id: w2, role: worker, address: w2, arch: aarch64, cores: 1, ram_gb: 6, access: {type: docker, service: w2}}
links:
  - {a: coord, b: w1, rtt_ms: 40, bw_mbps: 50, source: emulated}
  - {a: coord, b: w2, rtt_ms: 40, bw_mbps: 50, source: emulated}
  - {a: w1, b: w2, rtt_ms: 40, bw_mbps: 50, source: emulated}
constraints: {allowed_engines: [llamacpp_rpc], max_public_ports: 0}
```

**`oracle-2xa1` (two Arm VMs in one private network)**

```yaml
schema_version: 1
name: oracle-2xa1
kind: real
nodes:
  - {id: coord, role: coordinator, coordinator_computes: true, address: 10.0.0.11, arch: aarch64, cores: 1, ram_gb: 6, os_reserve_gb: 1.0, access: {type: ssh, user: ubuntu, key_ref: oracle_lab}}
  - {id: w1, role: worker, address: 10.0.0.12, arch: aarch64, cores: 1, ram_gb: 6, os_reserve_gb: 1.0, access: {type: ssh, user: ubuntu, key_ref: oracle_lab}}
links:
  - {a: coord, b: w1, rtt_ms: 0.5, bw_mbps: 1000, source: assumed}   # replace with measured values from experiment B1
constraints: {allowed_engines: [llamacpp_rpc, distributed_llama], max_public_ports: 0}
```

**`hybrid-wan` (laptop coordinator over WireGuard to Oracle workers)**

```yaml
schema_version: 1
name: hybrid-wan
kind: hybrid
nodes:
  - {id: laptop, role: coordinator, coordinator_computes: false, address: 10.8.0.2, arch: x86_64, cores: 4, ram_gb: 8, access: {type: ssh, user: me, key_ref: local}}
  - {id: w1, role: worker, address: 10.8.0.11, arch: aarch64, cores: 1, ram_gb: 6, access: {type: ssh, user: ubuntu, key_ref: oracle_lab}}
  - {id: w2, role: worker, address: 10.8.0.12, arch: aarch64, cores: 1, ram_gb: 6, access: {type: ssh, user: ubuntu, key_ref: oracle_lab}}
links:
  - {a: laptop, b: w1, rtt_ms: 25, bw_mbps: 100, source: assumed}
  - {a: laptop, b: w2, rtt_ms: 25, bw_mbps: 100, source: assumed}
  - {a: w1, b: w2, rtt_ms: 0.5, bw_mbps: 1000, source: assumed}
```

## 4. Model metadata

The planner needs per-model numbers. It **reads them from the GGUF file header** (layer count, embedding size, head counts, context length) rather than hard-coding them. A small `model-info` command prints them. Fall back to a hand-written table only for models not yet downloaded.

Memory formulas (all [E], validated by experiments A1 and B2):

- **Weights** (bytes) is approximately parameters x bits_per_weight / 8. Q4_K_M is about 0.6 bytes per parameter (an 8B model is about 4.8 GB); Q8_0 about 1.06 bytes per parameter (an 8B model is about 8.5 GB).
- **KV cache per token** = 2 x n_layer x n_kv_heads x head_dim x bytes_per_element (2 for f16). Example for a Llama-3.1-8B-shaped model (32 layers, 8 KV heads, head dimension 128): 2 x 32 x 8 x 128 x 2 = 131,072 bytes = 128 KiB per token, so a 4,096-token context needs about 512 MiB.
- **Compute and scratch buffers**: reserve 0.3 to 0.6 GB per node [E].
- **Activation size crossing a node boundary** per token is about n_embd x 4 bytes (hidden state in F32) [E]. For n_embd 4096 that is 16 KiB per token per boundary, so a 1,500-token prompt moves about 24 MB per boundary. Experiments A5 and A6 verify this with byte counters.

## 5. Planner

### 5.1 Inputs and outputs

- **Input**: profile, model candidates (GGUF metadata), desired context length, experiment goals (optional).
- **Output (`plan.yaml`)**: chosen engine, model and quantization, per-node assignments (threads, memory share), `tensor_split` values, context length, expected memory use per node, **predicted token time with the formula and its confidence tag**, warnings, and the list of applicable experiments.

### 5.2 Rules (applied in order)

| Rule | Logic | Output |
|---|---|---|
| R1 Usable memory | usable(node) = ram_gb minus os_reserve_gb | Per-node budget |
| R2 Model fit | weights + KV(ctx) + buffers x node_count must be at most 0.9 x sum of usable memory | Largest fitting model and quantization, or "does not fit" with the shortfall |
| R3 Control run | If the model fits on the strongest single node, always add a **single-node control** to the plan | Control experiment |
| R4 Engine choice | If any link RTT exceeds 5 ms [E threshold, revisit after A9], exclude tensor-parallel engines. distributed-llama requires node count in {2, 4, 8, ...}, at most n_kv_heads, and a Q40 model [V]. Otherwise default to `llamacpp_rpc` | Engine, with reasons |
| R5 Split | Start from memory-proportional split (the llama.cpp default [V]); if `relative_speed` values exist, weight by speed but cap by memory fit; round to 2 decimals | `tensor_split` |
| R6 Threads | threads = floor(cores) per node (minimum 1); for simulated profiles ensure the sum of threads is at most the host core count | Thread counts |
| R7 Context | Default 2048; reduce until the plan fits; never above the model's trained context | `n_ctx` |
| R8 Viability | Predict token time = single_node_time_estimate + sum over remote hops of (k x rtt) + transfer time. k is the measured round trips per token from experiment A3 (default range 1 to 3 [U]). Warn if predicted speed is below 1 token per second | Warnings |
| R9 Safety | Reject plans that would bind workers to all interfaces on a public network | Error |
| R10 Experiments | Suggest experiment IDs applicable to this profile | List |

### 5.3 Worked example

Profile `oracle-2xa1`: two nodes of 6 GB, 1 OCPU each, os_reserve 1.0 GB. Usable memory 5 GB each, 10 GB total. Model candidate: an 8B model at Q4_K_M (about 4.8 GB weights) with 2,048 context (KV about 256 MiB). Buffers 0.5 GB x 2 = 1 GB. Total about 6.05 GB, at most 9 GB (0.9 x 10), so it **fits**. The single-node control (6 GB, 5 GB usable) does **not** fit the 8B model on one 1-OCPU node, so R3 instead suggests the control on a 2-OCPU, 12 GB single VM, which uses the whole Always Free Arm allowance (a separate run, never at the same time as the cluster). The split is about 50/50 by memory. Predicted speed is shown with its uncertainty and a warning that two 1-core nodes cannot beat one 2-core node on raw compute [E].

### 5.4 Coordinator participation

By default llama.cpp spreads weights and KV cache across all devices, local and remote, in proportion to memory [V]. To make a coordinator hold no layers (for example a laptop that should only orchestrate), the plan sets `coordinator_computes: false`, and the adapter must restrict the device list so only RPC devices receive layers (the `--device` option exists [V]; the exact device names are discovered with the engine's device listing command, **[U] verify on the pinned version**) or set `--tensor-split` with a zero share for the local device.

## 6. Engine adapter interface

All adapters implement the same operations.

| Operation | Meaning |
|---|---|
| `capabilities()` | Static facts (table in section 6.2) |
| `build_plan(plan)` | Return the exact commands (as data) for workers and coordinator; used for golden-file tests |
| `prepare(profile)` | Ensure binaries and models exist on each node (build, copy, download) |
| `start_workers()` / `stop_workers()` | Start or stop worker processes; wait until reachable |
| `start_coordinator(mode)` | Mode is `bench` or `server` |
| `bench(params)` | Run a controlled benchmark; return metrics |
| `serve()` | Start an OpenAI-style HTTP server for the chat demo |
| `health()` | Per-node status |
| `collect_logs()` | Copy logs to the results folder |

### 6.1 Command building (conceptual; verify flags with `--help` on the pinned version)

- **llama.cpp RPC worker**: `ggml-rpc-server` with host (`-H`), port (`-p`), threads (`-t`), local cache (`-c`) [V].
- **llama.cpp coordinator**: `llama-server` or `llama-bench` or `llama-cli` with model path, `-ngl 99` to offload everything to the available devices, `--rpc host:port,host:port`, optional `--tensor-split` and `--device` [V]. `llama-bench` also takes `-p` (prompt tokens), `-n` (generated tokens), `-r` (repetitions), `-t` (threads) [S; confirm with `--help`].
- **distributed-llama**: `dllama worker --port P --nthreads N` on workers; on the root `dllama inference` or `dllama-api` with `--model`, `--tokenizer`, `--buffer-float-type q80`, `--nthreads`, `--workers ip:port ...`, `--max-seq-len` [V]. The model is downloaded on the root only; the root counts as one of the 2^n nodes [V].
- Debug aids: `GGML_RPC_DEBUG` (0 to 3) on server and client, with `-lv 5` on the client to print engine debug records; level 3 includes per-command timings and transport byte counts [V].

### 6.2 Capability matrix

| Capability | llama.cpp RPC | distributed-llama | prima.cpp (optional) | Custom Python (stretch) |
|---|---|---|---|---|
| Split style | Layers (pipeline) across devices; weights by memory share [V] | Tensor split of every layer [V] | Pipelined ring, layer windows [V] | You choose (pipeline) |
| Node count | Any | 1, 2, 4, 8... up to the KV head count [V] | Any (paper tested 4) [V] | Any |
| Mixed architectures | Likely (RPC ships tensors; each worker uses its own CPU backend) **[U]** | Arm and x86 AVX2 supported, mixed use **[U]** | Linux, macOS, Android, mixed [V] | Depends |
| Model format | GGUF (many quantizations) [V] | Its own format; Q40 weights with Q80 sync buffers [V] | GGUF | Hugging Face weights |
| OpenAI-style server | `llama-server` [V that it accepts `--rpc`] | `dllama-api` [V] | Not assessed | Yours |
| Network demand | Moderate (hidden state per token per boundary) [E] | High, per layer | Designed for slow links [V] | Moderate |
| Maturity | Proof of concept, insecure [V] | Active hobby/research project [S] | Research code, repo on Gitee [V] | Yours |

## 7. Experiment spec schema

An experiment spec is a YAML file in `experiments/`.

| Field | Meaning |
|---|---|
| `id` | For example `A3` (matches `EXPERIMENTS.md`) |
| `title`, `hypothesis` | Human-readable |
| `profile` | Name of a profile, or `{base: sim-wan-3, overrides: {...}}` |
| `engine` | Adapter name |
| `model` | Model name, quantization and expected SHA-256 |
| `variables` | Sweep definition, for example `link.rtt_ms: [0, 1, 5, 10, 25, 50]` |
| `fixed` | Parameters held constant (threads, prompt tokens, generated tokens, context) |
| `repetitions` | At least 5 for core experiments |
| `warmup_runs` | At least 1, discarded |
| `metrics` | Which metrics to collect |
| `order` | `randomized` (default) to avoid drift effects |
| `abort_if` | Safety checks (for example free memory below a threshold) |

## 8. Result record schema (one JSON line per run)

| Field | Content |
|---|---|
| `run_id`, `experiment_id`, `started_at`, `finished_at`, `status` (`ok`, `failed`, `aborted`) | Identity and outcome |
| `profile_name`, `profile_hash`, `plan_hash` | What was run |
| `engine`, `engine_commit`, `build_flags` | Engine version |
| `model`, `quant`, `model_sha256`, `n_ctx` | Model version |
| `variables` | The point in the sweep (for example `{rtt_ms: 25}`) |
| `host` | Per-node CPU model, cores, RAM, kernel, OS, container limits |
| `metrics` | See section 9 |
| `logs` | Paths to raw logs |
| `notes` | Anomalies (for example "other process active") |

## 9. Metrics (precise definitions)

| Metric | Definition | Source |
|---|---|---|
| `pp_tps` | Prompt tokens processed per second during prefill | `llama-bench` output |
| `tg_tps` | Generated tokens divided by generation time | `llama-bench` output |
| `ttft_ms` | Time from request sent to first token received (end to end) | Demo or client timing |
| `token_latency_ms` (p50, p95) | Inter-arrival time of streamed tokens | Client timing |
| `load_time_s` | Time to load the model onto all nodes (includes weight transfer to workers [V]) | Engine log |
| `bytes_c2w`, `bytes_w2c` | Bytes sent coordinator to worker and back during the timed phase | Proxy counters or `/proc/net/dev` deltas |
| `round_trips_per_token` | Request/response turnarounds per generated token | Proxy turn counter, or `GGML_RPC_DEBUG=3` logs |
| `cpu_pct`, `rss_mb` per node | Sampled once per second | Node sampler |
| `net_rx_bytes`, `net_tx_bytes` per node | Deltas over the timed phase | Node sampler |
| `failure_recovery_s` | Time from killing a worker to a working generation again (or "never") | Runner |

### Node sampler
A tiny script started on each node by the runner writes a CSV once per second (timestamp, CPU percent, resident memory of the engine process, network byte counters from `/proc/net/dev`). It is stopped by the runner and copied to the results folder.

## 10. Network emulation controller

Interface: `set_link(a, b, rtt_ms, bw_mbps, loss_pct)` and `clear()`.

Implementations (details in `INFRA.md`):
1. **`tc netem` inside containers**: delay on both ends (half the RTT each way), rate limit with the bandwidth parameter; requires `NET_ADMIN` and iproute2 in the image.
2. **Userspace delay proxy** (optional, T-026): a small TCP proxy between coordinator and worker that adds one-way delay and a bandwidth cap, and counts bytes and turnarounds. Needed when you want exact round-trip counts, or when `tc` is unavailable.

**Always validate** emulation before an experiment: measure ping and iperf3 between the nodes and compare with the target (accept within 10 percent) [E]. Refuse to start if validation fails.

## 11. Chat demo

### 11.1 Behaviour
- Single-page UI: message box, streamed answer, a side panel with live TTFT, tokens per second, selected profile and engine, and per-node status (reachable, CPU, memory).
- Backend (FastAPI) forwards requests to the coordinator's OpenAI-style server and re-streams tokens.
- One generation at a time (the cluster handles a single request at a time [E]); extra requests wait in a short queue or are rejected with a clear message.

### 11.2 API contract

| Endpoint | Purpose |
|---|---|
| `POST /v1/chat` | Body: messages, max_tokens, temperature. Response: Server-Sent Events |
| `GET /health` | Demo and engine reachable |
| `GET /cluster` | Profile name, engine, model, per-node status |
| `GET /metrics/recent` | Last N requests: TTFT, tokens per second, token counts |

SSE events: `token` (text), `stats` (running tokens per second), `done` (final TTFT, total tokens, tokens per second), `error` (code, message).

### 11.3 Limits and safety
- API key header required (key kept in `.env`); maximum prompt and output length; request timeout; rate limit per IP; CORS restricted to the demo origin.
- The RPC and worker ports are never exposed; only the demo port is reachable (and only from your allowed addresses unless you choose otherwise).
- The demo shows a banner: "Experimental hobby cluster, answers may be slow."

## 12. Error handling and recovery

| Failure | Detection | Response |
|---|---|---|
| Worker unreachable at start | Port check with timeout | Abort run, mark `failed`, save logs |
| Worker dies mid-run | Coordinator error or timeout | Runner records failure and time; restarts workers and coordinator; marks run `failed` |
| Out of memory | Exit code or kernel log | Mark failed; planner note to reduce context or quantization |
| Emulation validation fails | Ping/iperf3 mismatch | Refuse to run |
| Model hash mismatch | SHA-256 check | Abort |
| Runner interrupted | Signal | Clean up containers and processes (trap), keep partial results |

## 13. Testing strategy

| Level | What | Where |
|---|---|---|
| Unit | Profile validation (valid, invalid, public address, duplicate ids); planner rules with fixture profiles and expected outputs; command-line building as golden files per adapter; result record writer and reader | Run in CI |
| Integration (slow) | Compose cluster with a tiny model (0.6B or smaller) and 2 workers: start, bench, stop, record | Run locally, marked `slow` |
| End to end | Chat demo against a simulated cluster; stream tokens; check stats event | Run locally |
| Safety | Test that profiles with public addresses are rejected; test that compose files do not publish worker ports to the host network | Run in CI |

CI (GitHub Actions) runs lint, type check, and unit tests only. Heavy tests need real models and run on your machines.

## 14. Reproducibility and environment snapshot

`cpuwiser doctor` prints and stores: OS and kernel, CPU model and flags, RAM, Docker version, engine commits, model hashes, Python and package versions. Every result record embeds a hash of this snapshot.

## 15. Open design questions (decide when you reach the task)

1. Should the runner use SSH through a library or shell out to `ssh`? (Default: shell out to `ssh` and `rsync`; fewer dependencies.)
2. Where do models live on Oracle nodes (boot volume) and how is the coordinator's copy synchronized? (Default: download on coordinator only; workers receive weights over the network at load [V].)
3. Do we need the userspace delay proxy, or is `tc netem` sufficient? (Decide after task T-025.)
4. How to determine device names for the coordinator-no-compute mode? [U] Resolve in task T-023.
