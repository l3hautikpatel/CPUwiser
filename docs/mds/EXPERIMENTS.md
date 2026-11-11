# EXPERIMENTS.md: what to measure, how, and how to decide

Date: 2026-11-10
Tags: [V] verified, [S] third-party, [E] estimate, [U] unknown. Hypotheses are guesses until a run confirms them. Metric definitions are in `DESIGN.md` section 9; result format in section 8.

---

## 1. Rules for every experiment

1. **Control first.** Each experiment states its control (usually a single node with the same model and thread count).
2. **Repetitions:** at least 5 measured runs per point, plus 1 discarded warm-up. Report median and p95; report the min and max too.
3. **Randomize order** of sweep points to avoid drift (thermal, noisy neighbours) [E].
4. **Fixed prompt set:** a short prompt (about 32 tokens), a medium one (about 512), a long one (about 2,000 if the context allows). Store them in `experiments/prompts/` so runs are comparable.
5. **Greedy sampling** (temperature 0) for benchmarks, so output length and content are repeatable.
6. **Record the environment** (DESIGN.md section 14) in every run.
7. **Abort rules:** stop if free memory on a node drops below 200 MB [E], or a node reports thermal or steal anomalies; mark the run `aborted`.
8. **Approval:** any run over 10 minutes, any run on Oracle, and any model download over 2 GB needs the user's approval (CLAUDE.md rule 9).
9. **No claim without data:** a conclusion must cite the run IDs; negative results are reported as plainly as positive ones.
10. **Statistics:** compare conditions with medians and the interquartile range; call a difference real only if the ranges do not overlap, or the change is larger than 10 percent and consistent in all repetitions [E rule of thumb]. Do not run significance tests on 5 samples.

## 2. Models and quantizations (starting set)

| Role | Model class | Quant | Approx. file size | Why |
|---|---|---|---|---|
| Tiny, fast iteration | 0.6B instruct | Q4_K_M | about 0.4 GB [E] | Quick runs, tests |
| Small | 1.7B instruct | Q4_K_M | about 1.1 GB [E] | Direct comparison with the third-party benchmark [S] |
| Medium | 3B to 4B instruct | Q4_K_M | about 2 to 2.5 GB [E] | Fits one 6 GB VM; shows cluster effect later |
| Large | 8B instruct | Q4_K_M | about 4.8 GB [E] | Needs two nodes; the real purpose of pooling |
| Precision check | One small model | Q8_0 | about 1.8 GB for 1.7B [E] | Memory versus speed trade |

Choose exact model names and verify licences and SHA-256 in task T-011 (do not guess file names). For distributed-llama, only its supported list and the Q40 format apply [V], for example Qwen 3 0.6B (0.9 GB), 1.7B (2.2 GB), 8B (6.7 GB) and Llama 3.2 1B/3B in the Q40 format [V from its README].

## 3. Tier A: laptop simulation (Docker)

### A1. Single-node baseline
- **Question:** what does one container (and the bare host) deliver for each model, quant and thread count?
- **Hypothesis:** speed rises with threads up to the physical core count and plateaus; the container with limits matches the host scaled by its CPU share [E].
- **Setup:** one node, `llama-bench`, threads in {1, 2, 4, host cores}, prompt tokens {32, 512}, generated tokens {64}, 5 repetitions.
- **Metrics:** `pp_tps`, `tg_tps`, `rss_mb`.
- **Procedure:** run on the host (no container) and in a container with matching limits; compare.
- **Decision rule:** if the container differs from the host by more than 10 percent at equal resources, investigate before using container numbers as relative evidence [E].
- **Output:** the table that all later results are compared against; stored as the baseline in `results/summaries/`.

### A2. RPC overhead (no network cost)
- **Question:** what does the RPC path cost on its own?
- **Hypothesis:** one local worker via RPC is slower than running locally because activations are serialized and sent over TCP; the gap is largest for decode (small compute per token) [E].
- **Setup:** coordinator plus one worker container on the same bridge, emulation off; the worker holds all layers (coordinator computes nothing, if the engine allows) versus the local-only control.
- **Metrics:** `pp_tps`, `tg_tps`, `bytes_c2w`, `bytes_w2c`.
- **Decision rule:** the overhead percentage becomes the "RPC tax" input for the planner (R8).

### A3. Latency sweep (core experiment)
- **Question:** how does token speed fall as RTT rises, and how many round trips does a token cost?
- **Hypothesis:** generation time per token is approximately compute time plus k x RTT x number of remote hops, with k between 1 and 3 [U]; prompt processing is much less affected because it sends big batches [E].
- **Setup:** 1 coordinator + 1 worker (then 2 workers in A4); RTT in {0, 1, 5, 10, 25, 50, 100} ms; bandwidth unlimited (1 Gbps) so only delay varies; model 1.7B Q4_K_M; prompt 32 and 512 tokens; generated 64.
- **Metrics:** `tg_tps`, `pp_tps`, `ttft_ms`, `round_trips_per_token`.
- **Analysis:** linear fit of token time versus RTT; slope divided by hops gives k. Plot tokens per second versus RTT with the control line.
- **Decision rule:** the fitted k and compute time are written back into planner rule R8; if the fit's R-squared is below 0.9, state the model is poor and show the residuals [E].
- **Validation of the formula:** predict A4's results from A3's fit before running A4; report prediction error.

### A4. Hop count (node count)
- **Question:** how does adding nodes change speed at fixed per-link RTT?
- **Hypothesis:** each added remote hop adds about k x RTT per token, so tokens per second fall roughly with node count when compute is shared poorly [E]; with identical nodes sharing the same host cores, compute does not improve at all in simulation, so this isolates the communication cost.
- **Setup:** N workers in {1, 2, 3, 4, 6, 8} (RAM permitting; use the tiny model for large N); RTT fixed at {1, 25} ms; per-container CPU limit set so total CPU use stays within the host's cores.
- **Metrics:** `tg_tps`, `ttft_ms`, `round_trips_per_token`.
- **Decision rule:** the formula from A3 predicts the points; report the error. Large deviations indicate hidden costs such as synchronization or CPU contention.
- **Caveat:** the answer to the original "10 machines" idea comes from this experiment; label results "simulation" [E].

### A5. Bandwidth sweep
- **Question:** when does bandwidth, not latency, dominate?
- **Hypothesis:** decode is latency-bound (about 16 KiB per boundary per token for n_embd 4096 [E]); prefill is bandwidth-bound (about 24 MB per boundary for 1,500 tokens [E]). Slow links (for example 10 Mbps) hurt prefill and TTFT most [E].
- **Setup:** bandwidth in {1000, 100, 50, 20, 10, 5} Mbps; RTT fixed at 1 ms and at 25 ms; prompt lengths 32, 512, 2,000.
- **Metrics:** `pp_tps`, `ttft_ms`, `bytes_c2w`, `bytes_w2c`.
- **Analysis:** compare measured bytes with the formula n_embd x 4 B x tokens; report the ratio (a mismatch means the formula or the engine behaves differently from my assumption).
- **Decision rule:** the minimum bandwidth for TTFT under 20 seconds on a 512-token prompt is recorded in the planner as a viability threshold [E target, to be set from data].

### A6. Prompt length and TTFT
- **Question:** how does prompt length affect time to first token across profiles?
- **Hypothesis:** TTFT grows about linearly with prompt length and is dominated by prefill speed; this is the critical limit for any RAG-style use because RAG prompts are long [E].
- **Setup:** prompt tokens {32, 128, 512, 1,024, 2,000}; profiles `sim-lan` and `sim-wan`; control single node.
- **Metrics:** `ttft_ms`, `pp_tps`.
- **Decision rule:** record the largest prompt that gives TTFT under 10 seconds, per profile [E target]; this feeds the demo's input limit.

### A7. Failure injection
- **Question:** what happens when a worker dies or the link breaks?
- **Hypothesis:** the coordinator stops generation with an error or hangs; no automatic recovery [E, the RPC server is a fragile proof of concept [V]].
- **Setup:** during generation, (a) kill the worker process, (b) stop the container, (c) drop all packets for 10 seconds, (d) add 100 percent loss then restore. Repeat 5 times each.
- **Metrics:** time to error, whether the coordinator hangs, `failure_recovery_s`, whether a restart restores service without manual steps.
- **Decision rule:** define the demo's recovery behaviour (timeout values, auto-restart, error message) from these results.

### A8. Heterogeneity and tensor-split tuning
- **Question:** does a speed-aware split beat the default memory-proportional split when nodes differ?
- **Hypothesis:** the default split (by memory [V]) is not optimal when CPU speeds differ, because the slowest node limits each token in a pipeline; weighting by speed improves throughput until memory limits bind [E].
- **Setup:** three workers with CPU limits {1.0, 0.5, 0.25} cores and equal memory; compare (a) default split, (b) split proportional to CPU share, (c) a grid of 5 to 8 manual `--tensor-split` values around (b).
- **Metrics:** `tg_tps`, `pp_tps`, per-node CPU utilization.
- **Decision rule:** if (b) is within 5 percent of the best grid point, the planner's rule R5 stays simple; otherwise record a correction factor [E].

### A9. distributed-llama versus llama.cpp RPC
- **Question:** how do tensor-parallel and pipeline splitting compare as latency grows?
- **Hypothesis:** distributed-llama is competitive or faster at sub-millisecond latency but degrades much faster with RTT, because it synchronizes after every layer [E; its README describes "high-speed synchronization over Ethernet" [V]].
- **Setup:** 2 nodes (the valid count for both); RTT in {0, 0.5, 1, 5, 10}; model from its supported list (Qwen 3 1.7B Q40 [V]) versus the same family in GGUF for llama.cpp; same thread counts.
- **Metrics:** `tg_tps`, `pp_tps`, bytes, round trips.
- **Decision rule:** the RTT at which RPC overtakes distributed-llama becomes planner rule R4's threshold (replaces the 5 ms placeholder).
- **Fairness note:** the quantization formats differ (Q40/Q80 versus Q4_K_M), so compare trends, not absolute values [E].

## 4. Tier B: Oracle Always Free (real network)

All Tier B runs need explicit user approval (CLAUDE.md rule 9). Remember: cluster mode (2 x 1 OCPU) and control mode (1 x 2 OCPU) cannot exist at the same time (INFRA.md section 3.4).

### B1. Network baseline
- **Question:** what are the real RTT and bandwidth inside the VCN?
- **Setup:** `ping` and `iperf3` between the two A1 VMs (and the AMD micro VMs, if used); also from the laptop to a VM for the hybrid case.
- **Output:** measured links stored in the profile (`source: measured`); compare with the emulated values used in Tier A.
- **Decision rule:** if the real RTT is below 1 ms [E], Tier A's `sim-lan` results are the relevant comparison.

### B2. Single A1 baseline (replaces the third-party estimate)
- **Question:** what do 1 and 2 Arm cores really deliver?
- **Setup:** `llama-bench` for 0.6B, 1.7B, 3B/4B and (control mode) 8B Q4_K_M, threads {1, 2}, prompt {32, 512}, 5 repetitions. Run in cluster mode with 1 OCPU (threads 1) and in control mode with 2 OCPU (threads 2).
- **Metrics:** `pp_tps`, `tg_tps`, `rss_mb`.
- **Decision rule:** compare with the third-party figures (1.7B Q4_K_M at about 55 prompt tokens/s and 14 tokens/s generation on 4 Neoverse-N1 vCPUs [S]); my extrapolation to 2 cores (about 27 and 8) is [E]. Replace those numbers everywhere with the measured ones.

### B3. Two nodes versus one double-size node
- **Question:** is the 2 x 1 OCPU RPC cluster better, equal or worse than one 2-OCPU VM?
- **Hypothesis:** the single 2-OCPU VM wins on speed for any model that fits in 12 GB, because both approaches have the same total compute and the cluster adds network cost [E]; the cluster only wins when a model needs more memory than one node has (not true here, since the single VM has all 12 GB).
- **Setup:** (1) cluster mode, 8B Q4_K_M split across 2 VMs; (2) control mode, 8B Q4_K_M on one VM with 2 threads. Prompts {32, 512}, generated 64, 5 repetitions, randomized order across separate sessions.
- **Metrics:** `tg_tps`, `pp_tps`, `ttft_ms`, `load_time_s`, bytes.
- **Decision rule:** the result is the honest headline of the whole lab. Report it whichever way it goes.

### B4. Hybrid WAN: laptop coordinator, Oracle workers
- **Question:** how bad is the real internet?
- **Setup:** profile `hybrid-wan` (WireGuard overlay); same model as B3; coordinator on the laptop holds no layers.
- **Metrics:** as in A3 plus measured RTT variability (jitter).
- **Decision rule:** compare with the Tier A prediction for the measured RTT; report the error.

### B5. Hybrid with jitter and loss
- **Question:** does a normal home connection cause stalls?
- **Setup:** run B4 for 30 minutes during different times of day (morning, evening); log per-token latency spikes.
- **Metrics:** `token_latency_ms` p50, p95, p99; stalls longer than 2 seconds.
- **Decision rule:** if p99 exceeds 5 seconds [E threshold], the hybrid profile is flagged "not demo-grade".

### B6. Mixed architecture
- **Question:** does an x86 node (AMD micro, or the laptop) cooperate with Arm nodes, and does the weak node drag the pipeline down?
- **Hypothesis:** it works in principle because only tensors cross the network [E, **U** until tested]; a 1/8 OCPU, 1 GB node holds almost no layers and mostly slows tokens [E].
- **Setup:** (a) laptop (x86_64 or arm64) as a compute worker plus one A1; (b) add an AMD micro VM with a very small share by `--tensor-split`; compare with the A1-only cluster.
- **Metrics:** `tg_tps`, correctness (identical greedy output tokens compared with the single-node control, to detect numerical divergence across architectures [E]).
- **Decision rule:** record whether outputs match exactly, nearly (same first N tokens), or differ.

### B7. Soak test
- **Question:** is the cluster stable for hours, and does it avoid the idle reclaim rule?
- **Setup:** one request every 30 to 60 seconds for 6 hours, then, if good, 24 hours (needs approval); log errors and memory growth.
- **Metrics:** error rate, memory leak slope (RSS versus time), CPU p95, tokens per second drift.
- **Decision rule:** an error rate above 1 percent [E] or memory growth that would exhaust RAM within a day means the demo needs scheduled restarts.

### B8. distributed-llama on 2 x A1
- **Question:** does the tensor-parallel engine work on the free Arm nodes and how does it compare with B3?
- **Setup:** two nodes (valid count [V]); model: the largest supported Q40 model that fits (Qwen 3 1.7B Q40 first; 8B Q40 needs 6.7 GB [V] and is probably too big at about 6 GB per VM with OS overhead [E]; verify). Compare with RPC on the same size.
- **Decision rule:** feeds the final engine comparison table.

## 5. Tier C: stretch experiments

### C1. prima.cpp (optional)
- **Question:** does a research engine built for low-memory, slow-link devices give better results on the CPU-only profiles?
- **Preconditions:** build instructions read from the repository on Gitee [V location]; its reported headline results used machines with GPUs [V], so expectations must be modest.
- **Decision rule:** attempt only if M6 time remains; stop after one failed build attempt per session and report.

### C2. Custom Python pipeline
- **Question:** what does the simplest possible pipeline split (your original architecture) cost versus llama.cpp?
- **Scope:** learning only (two or three stages, small model, plain TCP, activations as raw bytes). Compare per-token overhead with A2/A3 numbers.
- **Decision rule:** if the custom version is not within 3x of llama.cpp for the tiny model, report the reasons (kernels, serialization, batching) rather than optimizing.

## 6. Chat-demo experiments (after M5)

| ID | Test | Success criterion |
|---|---|---|
| D1 | One user, 20 prompts of increasing length | TTFT and tokens per second shown correctly; no errors |
| D2 | Two users at once | Second request queued or rejected cleanly (no crash) |
| D3 | Worker killed mid-answer | Clear error in the UI; service restored by the documented recovery |
| D4 | 6-hour idle then request | First request after idle works; time recorded |

## 7. Order of execution and dependencies

1. A1, then A2, A3 (these give the formula).
2. A4 to A6 (validate and extend the formula).
3. A7, A8.
4. B1, B2, B3 (first Oracle session; one block of work).
5. B4, B5 only if the hybrid profile is wanted.
6. A9 and B8 (second engine).
7. B6, B7.
8. C1, C2 as time allows.

## 8. Experiment record template (copy for each experiment)

```
Experiment ID:
Date and operator:
Profile (name, hash):
Engine and commit:
Model, quant, SHA-256:
Hypothesis (before running):
Prediction from the formula (if any):
Variables and points:
Repetitions / warm-up / order:
Results table (median, p95, min, max):
Prediction error:
Anomalies / notes:
Conclusion (one sentence, cite run IDs):
Planner rule changed? (which, to what):
What would change this conclusion:
```

## 9. Final report outline (task T-072)

1. Question and set-up (profiles, models, engines, versions).
2. Baselines (A1, B2).
3. Cost of distribution (A2, A3, A4, A5, A6, B3).
4. Behaviour under stress (A7, B5, B7).
5. Tuning (A8) and planner validation.
6. Engine comparison (A9, B8, optional C).
7. Direct answer: when does pooling CPUs make sense, and when not?
8. Limits of the study, and what to do next.
