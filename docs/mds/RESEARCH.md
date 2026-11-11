# RESEARCH.md: facts, numbers, risks, open questions, sources

Date: 2026-11-10
Tags: [V] verified from an official source read on this date, [S] third-party, [E] estimate or arithmetic, [U] unknown. Add new facts here with a tag whenever a task discovers one (CLAUDE.md definition of done). Facts about vendors and open-source projects change; re-check before relying on them for decisions.

---

## 1. Verdict on the original idea

| Claim in the original pitch | Finding | Tag |
|---|---|---|
| Merge 10 weak free machines into one AI brain | Oracle Always Free allows at most 2 Arm A1 VMs (2 OCPU and 12 GB in total) plus 2 tiny AMD VMs; there is no free pool of 10 machines in one network | [V] |
| Run heavy models without GPUs | Possible only for models that already fit in a few GB of RAM; CPU speed (especially prompt processing) is the limit, not memory | [E] |
| Expect 1 to 5 tokens per second | Plausible for small models on a fast LAN; unverified for this hardware. Experiment B2 and B3 decide | [U] |
| Zero dollars | True only if every resource stays on the Always Free label; no SLA | [V] |
| Sequential workers compute the model | This is a pipeline split; it fits larger models but does not speed up a single request | [V as general design, [E] for numbers] |
| All machines share a high-speed VPC | Needed for tensor-parallel engines; pipeline splitting tolerates more latency but pays per hop | [E] |

Conclusion: as a production system it is not worthwhile; as a **learning and measurement lab** it is valuable. The plan therefore treats a negative result as success.

## 2. Verified facts by topic

### 2.1 llama.cpp RPC backend [V, from the project's RPC documentation and source read earlier in this project]
- Worker binary is `ggml-rpc-server` (the CMake target and binary names were confirmed from `tools/rpc/CMakeLists.txt`); an older name `rpc-server` no longer builds as a target.
- Worker options include threads (`-t`), device (`-d`), host (`-H`), port (`-p`) and a local file cache (`-c`).
- Build with the RPC option on (`GGML_RPC=ON`).
- The coordinator passes `--rpc host:port,host:port`. By default, model weights and KV cache are spread across local and remote devices in proportion to available memory; `--tensor-split` overrides the proportions; `-ngl` controls offload; `--device` selects devices.
- `llama-bench` accepts `--rpc`.
- Debug: `GGML_RPC_DEBUG` levels 1 to 3 on server and client; client log verbosity `-lv 5`.
- The documentation calls the RPC server a **fragile, insecure proof of concept without authentication**; do not expose it to an open network.
- Open points: [U] exact behaviour of the `-c` cache across restarts; [U] device names for keeping layers off the coordinator; [U] whether mixed-architecture clusters give identical outputs.

### 2.2 distributed-llama [V, README read on 2026-11-10]
- Described as connecting home devices into a cluster to accelerate inference using tensor parallelism and high-speed synchronization over Ethernet; supports Linux, macOS, Windows; optimized for ARM and x86_64 AVX2 CPUs.
- Runs only on 1, 2, 4, ... 2^n nodes; the root node counts and also computes; the maximum node count equals the number of KV heads of the model.
- Supported quantization: `q40` model with `q80` buffer type, or `f32` with `f32`.
- Commands: `dllama inference`, `dllama chat`, `dllama worker`, `dllama-api`.
- Arguments: `--model`, `--tokenizer`, `--buffer-float-type`, `--workers ip:port ...`, `--max-seq-len`, `--nthreads`, `--host`, `--port`, and for inference `--prompt`, `--steps`.
- Model launcher `python launch.py <name>` downloads and converts models. Listed sizes include Qwen 3 0.6B 0.9 GB, Qwen 3 1.7B 2.2 GB, Qwen 3 8B 6.7 GB, Llama 3.2 1B 1.7 GB, Llama 3.2 3B 3.4 GB, Llama 3.1 8B 6.32 GB.
- Published measurements live in its GitHub discussions; none were evaluated for Arm free-tier VMs [U].

### 2.3 prima.cpp [V for location and claims, [U] for CPU-only suitability]
- Research engine (accepted at ICLR 2026 per its paper) for heterogeneous, low-resource home clusters; code repository is on Gitee (`gitee.com/zonghang-li/prima.cpp`).
- The paper's test cluster included machines with GPUs; its 70B result of about 674 ms per token should not be read as a CPU-only number.
- Treat as optional (D3).

### 2.4 Oracle Cloud Always Free [V from Oracle documentation read earlier; re-check at signup]
- Ampere A1 Flex: 2 OCPU and 12 GB in total across at most 2 instances (the 2026 allowance change was captured in earlier research).
- AMD micro: up to 2 VMs, each 1/8 OCPU and 1 GB.
- Block storage allowance exists (about 200 GB total [V, re-check]).
- No SLA; Always Free resources only in the home region; A1 capacity can be short.
- Idle-reclaim rule: reclaimed when, over 7 days, CPU 95th percentile below 20 percent and network and memory utilization also below 20 percent.
- Reference page: Oracle Cloud Infrastructure documentation, "Always Free Resources" (docs.oracle.com, Free Tier section).

### 2.5 Memory and size arithmetic [E, all arithmetic shown]
| Quantity | Calculation | Result |
|---|---|---|
| 8B Q4_K_M weights | 8e9 params x about 0.6 bytes | about 4.8 GB |
| KV per token (Llama-3.1-8B shape) | 2 x 32 layers x 8 KV heads x 128 dim x 2 bytes | 131,072 B = 128 KiB |
| KV at 2,048 context | 128 KiB x 2,048 | 256 MiB |
| KV at 4,096 context | 128 KiB x 4,096 | 512 MiB |
| Activations per boundary per token | n_embd 4096 x 4 B | 16 KiB |
| Prefill transfer, 1,500 tokens, one boundary | 16 KiB x 1,500 | about 24 MB |
| Cluster need, 8B on 2 nodes | 4.8 + 0.25 + 2 x 0.5 (buffers) | about 6.05 GB |
| Usable memory, 2 x 6 GB VMs | 2 x (6 - 1) | 10 GB |
| Load time over 10 MB/s upload, 5 GB | 5000 MB / 10 MB/s | 500 s (about 8 min) |

### 2.6 Single-core Arm speed [S, one third-party benchmark; replaced by B2]
- On a 4-vCPU Neoverse-N1 machine: Qwen3 1.7B Q4_K_M about 55 prompt tokens/s and about 14 generated tokens/s; Qwen3 0.6B about 147 and about 38 [S].
- Scaled linearly to 2 cores: about 27 and about 8 for 1.7B [E, scaling assumption]. Linear scaling is optimistic for generation, which is memory-bandwidth-bound [E].
- Consequence [E]: a 1,000-token RAG prompt on 2 Arm cores needs about 37 seconds just for prefill at 27 tokens/s (1000 / 27 = 37 s). RAG with local inference is therefore not interactive on this hardware; this supports using the lab as a learning exercise rather than a production RAG backend.

### 2.7 Network cost model [E, to be calibrated by A3]
token_time = compute_time + k x RTT x remote_hops (+ transfer time). k is the number of network round trips per generated token and per hop; unknown until A3 [U]. Example for illustration only: with compute 100 ms, k = 1, one hop and RTT 25 ms, token time is 125 ms, about 8 tokens/s; with RTT 100 ms it is 200 ms, about 5 tokens/s. These are not predictions of real speed.

## 3. Risk register

| ID | Risk | Likelihood | Impact | Mitigation | Owner task |
|---|---|---|---|---|---|
| R1 | Oracle A1 capacity unavailable | Medium [S] | Delays M4 | Docker lab complete first; retry; different availability domain | T-041 |
| R2 | Oracle reclaims or changes free resources | Low to medium | Lose VMs | Scripted rebuild; results stored locally; soak as natural load | T-042, T-061 |
| R3 | llama.cpp RPC crashes or changes flags | Medium [V "fragile"] | Broken runs | Pin commit; adapter tests; record crashes as findings | T-022 |
| R4 | Simulation misleads (shared host cores, Docker Desktop VM) | High | Wrong conclusions | Label relative; confirm on Oracle (B3) | T-027 |
| R5 | Emulation inaccurate | Medium | Bad k estimate | Validate with ping and iperf3 each run; proxy fallback | T-025, T-026 |
| R6 | Accidental public exposure of workers | Low if rules followed | Security incident | Hard rule 1; T-060 and T-047 checks | T-060 |
| R7 | Secrets committed | Low to medium | Credential leak | .gitignore, secret scan, review | T-003, T-062 |
| R8 | Model licence issues | Low | Legal | Record licence per model; hobby use; read terms | T-011 |
| R9 | Time sink | High | Never finishes | Milestone exits; skip M6 extras; one task per session | all |
| R10 | Numbers from other sources treated as fact | Medium | Wrong decisions | Confidence tags; CLAUDE.md rule 4 | all |
| R11 | Thermal throttling or noisy neighbours | Medium | Noisy data | Repetitions, randomization, notes | T-014 |
| R12 | Mixed-architecture numerical differences | Low to medium [U] | Divergent outputs | Compare greedy outputs in B6 | T-086 |
| R13 | Idle VMs reclaimed during long gaps | Medium | Rebuild time | Keep rebuild under one hour | T-042 |

## 4. Open questions (research level)

| # | Question | Resolved by |
|---|---|---|
| Q1 | How many network round trips per token does llama.cpp RPC use for k? | A3, proxy counters, `GGML_RPC_DEBUG=3` |
| Q2 | Can the coordinator hold zero layers, and by which flags on the pinned version? | T-023 |
| Q3 | Do cross-architecture clusters (x86 plus Arm) work and match outputs? | B6 |
| Q4 | What is the real RTT and bandwidth between two A1 VMs in one subnet? | B1 |
| Q5 | At what RTT does tensor-parallel (distributed-llama) lose to pipeline splitting? | A9 |
| Q6 | Is a 2 x 1 OCPU cluster ever better than one 2-OCPU VM? | B3 |
| Q7 | Does the RPC weight cache (`-c`) avoid re-sending weights at restart? | A-series or T-022 side test |
| Q8 | Can distributed-llama run an 8B Q40 model (6.7 GB [V]) on two 6 GB VMs? | B8 (likely no [E]) |
| Q9 | What is the practical prompt length limit for acceptable TTFT? | A6, B3 |
| Q10 | Which exact model files and licences should be used? | T-011 |

## 5. Not verified in this pack (treat as unknown until checked)

- Exact current Oracle Always Free numbers in the signup console (verify at account creation).
- Any claim about `tc netem` working inside Docker Desktop's VM on a given laptop.
- Whether the Oracle Ubuntu image's default iptables rules block lab ports (common report [S]; check at setup).
- All speed estimates except B2/A1 measurements once they exist.
- The availability and current terms of Tailscale's free plan.
- Licence terms of each chosen model.
- Whether `llama-bench` options are exactly `-p`, `-n`, `-r`, `-t` on the pinned commit.
- The sandbox experiments from the planning session (synthetic model, delay proxy) were **not validated end to end** and are not evidence for anything in this pack.

## 6. Decision log

| Date | Decision | Reason |
|---|---|---|
| 2026-11-10 | Project is the distributed-CPU lab, not the hosted-API gateway | User clarified |
| 2026-11-10 | Scope: lab plus small chat demo | User choice |
| 2026-11-10 | Machines: laptop Docker and Oracle free VMs | User choice |
| 2026-11-10 | Design adapts to cluster and computer selection through profiles and a planner | User request; **interpretation to confirm** |
| 2026-11-10 | Plans only in this session; building later with Claude CLI | User request |
| 2026-11-10 | Several small Markdown files | User choice |

## 7. Glossary additions

- **RPC tax:** extra time per token caused by serializing and sending tensors even at zero latency.
- **Hop:** a boundary between two nodes that activations cross.
- **Control run:** the single-node run every distributed result is compared with.
- **Round trip per token (k):** network request/response turnarounds needed to produce one token.

## 8. Sources

- llama.cpp repository, RPC tool documentation and `tools/rpc` source: github.com/ggml-org/llama.cpp [V, read earlier in this project; re-check on the pinned commit].
- distributed-llama repository README: github.com/b4rtaz/distributed-llama [V, read 2026-11-10].
- prima.cpp: paper (ICLR 2026) and repository at gitee.com/zonghang-li/prima.cpp [V for location].
- Oracle Cloud Infrastructure documentation, Always Free Resources, and the idle-instance reclaim notes [V, re-check at signup].
- Third-party Arm CPU benchmark for Qwen3 models on a 4-vCPU Neoverse-N1 machine [S; the specific page was found during earlier research and is not re-verified here].
- Earlier hosted-API research: see section 9.

## 9. Background: hosted-API gateway research (not part of this project)

An earlier draft of the plan addressed a different question, a chat gateway in front of free hosted LLM APIs for portfolio sites. That work is **not** the CPUwiser lab, but its findings may help the user's other projects:

- Free hosted tiers (for example Groq, Cloudflare Workers AI, Cerebras) have request or token quotas that change often [S, earlier research; re-check].
- Gemini's unpaid tier may allow Google to use submitted content for product improvement [S]; avoid sending client data there.
- Vercel's Hobby plan is for non-commercial use [S, earlier research; re-check current terms before using it for client work].
- Hugging Face Spaces with Docker are not free for always-on compute beyond basic CPU [S].
- For RAG over client documents, a hosted API for generation plus a small embedding step is far faster than CPU-only local inference [E, see section 2.6].

These bullets are background only; if the user wants to continue that project, it needs its own plan.
