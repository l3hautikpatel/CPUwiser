# PLAN.md: goals, scope, decisions, architecture, milestones

Date: 2026-11-10
Confidence tags: [V] verified, [S] third-party, [E] estimate, [U] unknown (see README.md).

---

## 1. Purpose

Build a hobby lab to answer one question with evidence:

> **How well can a handful of cheap or free CPU machines act as one LLM, and what limits them?**

Outcomes (in order of importance):

1. **Learn**: understand pipeline vs tensor splitting, prefill vs decode, memory vs bandwidth vs network limits, by measuring them.
2. **Measure**: produce a reproducible dataset (speed, latency, memory, failure behaviour) across cluster profiles.
3. **Demonstrate**: a small chat demo running on the cluster, with live metrics, for your portfolio.
4. **Decide**: a written conclusion on when pooling CPUs is worth it (probably rarely) and when it is not.

A negative result ("it is slower than one machine") is a successful outcome.

## 2. Scope

### In scope
- Distributed inference of open-weight LLMs on CPUs using existing engines (llama.cpp RPC first; distributed-llama second; others optional).
- Cluster **profiles** (laptop Docker simulation, Oracle Always Free VMs, laptop plus Oracle).
- A **planner** that recommends engine, model, quantization, split and thread settings from a profile.
- An **experiment runner** and **report generator**.
- A **small chat demo** (streaming chat page plus a live cluster status panel).
- Runbooks for Docker and Oracle, and a security checklist.

### Out of scope (non-goals)
- Production use, client traffic, SLAs, multi-tenancy.
- A hosted-API fallback router or RAG pipeline (separate project).
- GPU work, training, fine-tuning.
- Orchestration platforms (Kubernetes etc.).
- Writing our own inference kernels. The optional custom Python pipeline (stretch) is for learning only.

## 3. Why this is worth doing despite likely modest speed

- The reasoning "10 free machines give a heavy model for free" does not hold up: Oracle Always Free offers at most 4 VMs and 14 GB RAM in total [V]; a model that small already fits on one machine. The lab exists to **test and quantify** this rather than assume it.
- The measurements (round trips per token, bytes per token, imbalance effects, failure recovery) are exactly what distributed-systems and applied-AI interviews ask about.

## 4. Key decisions

| ID | Decision | Reason | Revisit if |
|---|---|---|---|
| D1 | **Main engine: llama.cpp with its RPC backend** | Splits layers across any number of machines, works on x86 and Arm, uses the GGUF ecosystem, has an OpenAI-style server, actively maintained [V]. Its RPC server is a proof of concept with no authentication, so private networks only [V] | RPC proves too unstable in tests |
| D2 | **Second engine: distributed-llama** (tensor parallel) | Shows the opposite design: fast on a LAN, restricted to 2^n nodes, Q40 models only [V]. Good comparison | It cannot run on the chosen profiles |
| D3 | **prima.cpp is optional** | Research engine for heterogeneous low-RAM devices; repo is on Gitee; its headline results used machines with GPUs [V]. Try only if time allows | Maintainers publish CPU-only guidance |
| D4 | **Custom Python master/worker is a stretch goal** | Your original architecture; valuable for learning, not for performance | You want to deepen the learning side |
| D5 | **Profile-driven design** | You asked for the setup to adapt to the selected cluster and computers | You define a different meaning (see README interpretation) |
| D6 | **Simulate first, then cloud** | Docker simulation with controlled delay is cheap and repeatable; Oracle capacity can be slow to obtain [V] | Never; always simulate first |
| D7 | **Measure everything, store raw results** | Confidence comes from data, not from reading specs | Never |
| D8 | **Start with small models (0.6B to 3B), scale to 8B** | Fast iteration; 8B Q4 weights (about 5 GB [E]) is the realistic ceiling for two free Arm nodes with 6 GB each | Oracle allowance changes |
| D9 | **Python 3.12 + Typer + Pydantic + pytest; Bash + Docker Compose + SSH for infra** | Matches your skills; minimal moving parts | Tooling pain |
| D10 | **Chat demo is private and small** | RPC has no auth; free tiers have no SLA [V] | You decide to expose it (then add auth, rate limits) |

## 5. Architecture overview

```
                       +-----------------------------+
                       |  Profile (YAML)             |
                       |  nodes + links + constraints|
                       +--------------+--------------+
                                      |
                          +-----------v-----------+
                          |  Planner              |
                          |  engine / model /     |
                          |  quant / split /      |
                          |  threads / experiments|
                          +-----------+-----------+
                                      |  Plan (YAML/JSON)
          +---------------------------v---------------------------+
          |  Experiment Runner                                    |
          |  - prepares nodes (Docker or SSH)                     |
          |  - starts workers and coordinator via Engine Adapter  |
          |  - applies network emulation (if simulated)           |
          |  - collects metrics (engine output + node samplers)   |
          |  - writes result records + raw logs                   |
          +------+------------------+-------------------+---------+
                 |                  |                   |
        +--------v------+  +--------v--------+  +-------v--------+
        | Adapter:      |  | Adapter:        |  | Adapter:       |
        | llama.cpp RPC |  | distributed-    |  | (optional)     |
        | (main)        |  | llama           |  | prima / custom |
        +--------+------+  +--------+--------+  +-------+--------+
                 |                  |                   |
        +--------v------------------v-------------------v--------+
        |  Cluster: Docker containers  |  Oracle VMs  |  Mixed   |
        +----------------------------------------------------------+
                                      |
                        +-------------v-------------+
                        |  Results (JSONL + logs)   |
                        |  Report generator         |
                        +-------------+-------------+
                                      |
                        +-------------v-------------+
                        |  Chat demo (FastAPI + UI) |
                        |  talks to the coordinator |
                        +---------------------------+
```

Roles in every engine: **coordinator** (receives the prompt, holds embeddings and sampling, orchestrates) and **workers** (hold layers or slices and compute). In llama.cpp RPC, by default weights and KV cache are spread over all devices, local and remote, in proportion to each device's available memory, and `--tensor-split` overrides the proportions [V].

## 6. Cluster profiles to support

| Profile | Machines | Network | Purpose |
|---|---|---|---|
| `sim-lan` | N containers on the laptop | Emulated 0.2 ms RTT, 1 Gbps | Baseline and overhead tests |
| `sim-wan` | N containers on the laptop | Emulated 20 to 100 ms RTT, 50 Mbps | Test how latency and bandwidth hurt |
| `sim-hetero` | N containers with different CPU/RAM limits | Emulated | Test imbalance and split tuning |
| `oracle-2xa1` | 2 Arm A1 VMs (1 OCPU, 6 GB each), one private network | Real VCN | The honest free-tier cluster |
| `oracle-mixed` | 2 A1 plus 1 to 2 AMD micro VMs | Real VCN | Mixed architecture and weak-node tests |
| `hybrid-wan` | Laptop coordinator plus Oracle workers over WireGuard | Real internet | Realistic scattered-node test |

Notes:
- Oracle allows at most two A1 instances (total 2 OCPU and 12 GB) plus two AMD micro VMs [V]. So 10 free machines in one network is **not possible** on Oracle alone. Larger clusters are explored only by simulation.
- Containers on one laptop share its CPU cores, so simulation validates **communication overhead and behaviour**, not compute scaling. Use CPU and memory limits per container to imitate weak nodes, and read the results as relative [E].

## 7. Milestones

| Milestone | Goal | Exit criteria (summary) | Est. effort |
|---|---|---|---|
| **M0 Bootstrap** | Repo, tooling, docs, empty skeleton | `make setup lint test` pass; docs in place | 0.5 day |
| **M1 Single-node baseline** | Build engine, fetch model, run `llama-bench`, store results, first report | Reproducible baseline table for 2 models x 2 quants | 1 to 2 days |
| **M2 Docker simulation** | N-node containers, network emulation, RPC runs | Experiments A1 to A6 produce valid data | 2 to 3 days |
| **M3 Profile and planner** | Profile schema, planner v1, `cpuwiser plan` | Planner outputs a valid plan for all example profiles; tests pass | 1 to 2 days |
| **M4 Oracle cluster** | Provision, harden, bootstrap, run B1 to B3 | Experiments B1 to B3 recorded on real VMs | 2 to 4 days (capacity may delay) |
| **M5 Chat demo** | Streaming chat page plus cluster status | Demo answers prompts through the real cluster and shows live tok/s | 1 to 2 days |
| **M6 Second engine and extras** | distributed-llama adapter; optional prima.cpp and custom pipeline | A9 and B8 recorded | 2 to 4 days |
| **M7 Hardening and write-up** | Soak test, security review, final report | Final report with conclusions and decision rules | 1 to 2 days |

Total: roughly 2 to 4 weeks of part-time evenings [E]. M4 timing depends on Oracle capacity.

## 8. Success criteria

The project is successful if:

1. Every experiment in `EXPERIMENTS.md` marked "core" has recorded data with at least 5 repetitions.
2. The report states, with numbers, how speed changes with RTT, bandwidth, node count, and node imbalance.
3. The planner produces sensible plans (verified by tests and by two real runs where the predicted split matches the best measured split within a reasonable margin).
4. The chat demo works end to end on at least one profile.
5. The final write-up gives a clear, evidence-based answer to the purpose question in section 1.

## 9. Risks (short list; full register in RESEARCH.md)

| Risk | Mitigation |
|---|---|
| Oracle A1 capacity unavailable in your region | Build and test fully in Docker first; retry provisioning over days; keep the laptop-only path viable |
| Oracle changes or reclaims free resources (it cut the Arm allowance in 2026 [V]) | Keep everything scripted so nodes can be rebuilt in under an hour; keep results on your own machine |
| RPC engine unstable or slow | That is a finding; also test distributed-llama; document honestly |
| Simulation results misleading | Label them as relative; confirm key results on Oracle |
| Time sink | Milestones have clear exits; skip M6 extras if needed |
| Accidentally exposing worker ports | Hard rule 1 in CLAUDE.md; automated port-exposure check in T-060 |

## 10. What the earlier research already settled

- Free hosting facts and limits (Oracle, Cloudflare, others) are in `RESEARCH.md`.
- Estimated CPU speed for small models on 2 Arm cores (a small model of about 1.7B parameters reads prompts at roughly 27 tokens/s and generates at about 8 tokens/s [E]) comes from one third-party benchmark. **Experiment B2 replaces it with your own measurement.**
