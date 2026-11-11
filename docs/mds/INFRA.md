# INFRA.md: Docker lab, network emulation, Oracle runbook, security, operations

Date: 2026-11-10
Tags: [V] verified, [S] third-party, [E] estimate, [U] unknown. Commands here are **templates**: Claude CLI must confirm every flag with `--help` on the pinned versions (CLAUDE.md rule 5). Never put real IPs, keys or OCIDs in the repo.

---

## 1. Environments at a glance

| Environment | Used for | Realism | Cost |
|---|---|---|---|
| Laptop Docker (`sim-*` profiles) | Fast iteration, communication-overhead experiments (A1 to A9) | Network emulated; CPU shared with the host | $0 |
| Oracle Always Free VMs (`oracle-*`) | Honest free-tier measurements (B1 to B8) | Real network and CPU | $0 if limits respected [V] |
| Laptop plus Oracle (`hybrid-wan`) | Real internet latency (B4, B5) | Real | $0 |

## 2. Laptop Docker lab

### 2.1 Check the host first (task T-010)
Record in `results/environment.json`: OS, CPU model and flags, physical cores, RAM, Docker version, whether Docker runs natively (Linux) or inside a VM (macOS, Windows with WSL2 or Hyper-V).

**Caveats to read results correctly:**
- Docker Desktop on macOS and Windows runs containers inside a Linux VM with its own CPU and RAM allocation. Raise it in Docker Desktop settings, and record the value [V that the VM has configurable limits; exact UI differs by version, **[U]** check].
- On Apple Silicon the containers are `aarch64`, which matches Oracle A1 instruction sets; on Intel/AMD they are `x86_64`. Do not run emulated (cross-architecture) images for timing; they are far slower and meaningless [E].
- All containers share the same physical cores. Simulation tells you about **communication overhead and behaviour**, not compute scaling. Read it as relative [E].
- Close heavy apps during runs; plug the laptop in; disable power saving; note thermal throttling in `notes`.

### 2.2 Container design
- One image `cpuwiser-node` (base: a slim Debian or Ubuntu LTS) containing: build tools only at build time (multi-stage), the engine binaries, `iproute2`, `iperf3`, `procps`, and the node sampler script.
- Engine binaries are built **once** in a builder stage or on the host, then copied; do not compile inside every container.
- Services in `docker-compose.yml`: `coord`, `w1` ... `wN`, generated from the profile (a template, not hand-edited).
- Network: a dedicated bridge network, internal only. **No `ports:` entries for worker services.** The demo is the only service that may publish a port (and only to `127.0.0.1` unless chosen otherwise).
- Resource limits from the profile: `cpus` (fractional allowed), `mem_limit`, `memswap_limit` equal to `mem_limit` (no swap), `pids_limit`. Pin threads so `-t` never exceeds the container CPU limit.
- Capabilities: add `NET_ADMIN` only to nodes where `tc` runs (the coordinator and workers in emulated profiles). Never use `privileged`.
- Models are mounted **read-only** from a host folder (`models/`), shared by all containers, so only the coordinator reads the file and workers receive weights over RPC [V that workers receive weights from the coordinator at load time for llama.cpp RPC; the optional `-c` local cache avoids re-sending **[V option exists, behaviour to confirm]**].
- Healthchecks: TCP check on the worker port from the coordinator container.

### 2.3 Network emulation with `tc netem`
Goal: model each link by RTT, bandwidth and loss.

Procedure per container (template):
1. Identify the container's interface (usually `eth0`); confirm with `ip link`.
2. Apply a delay of RTT/2 on **egress** of each side so that the round trip equals the target. Add a rate limit using a token-bucket or the `rate` option of netem, plus a small burst. Optional loss.
3. Because delay is per egress, **both ends must be configured**; configuring one side applies the delay in one direction only.
4. Different RTTs per peer (star topologies) need `tc` filters and classes per destination address; for v1 limit profiles to **uniform RTT per container**, and use the userspace proxy (section 2.4) for per-link differences.
5. Validate (mandatory, see DESIGN.md section 10): ping 30 times and iperf3 for 10 seconds between each pair; compare with the target within 10 percent [E]; store the validation output with the run.
6. Cleanup: `tc qdisc del dev eth0 root`.

Known pitfalls [E, verify]: netem on a Docker bridge may require the kernel module `sch_netem` on the host (on Docker Desktop the VM kernel decides; if missing, use the proxy approach); very large rate limits with small burst values cause drops; `ping` measures ICMP, while the engine uses TCP, so also check with a TCP connect timing.

### 2.4 Userspace delay proxy (fallback and instrument)
A small TCP proxy placed between coordinator and each worker address. Functions: add one-way delay, cap bandwidth, count bytes each direction and the number of **direction changes** (a proxy for request/response turnarounds), log them. It answers the central question "how many round trips per token" exactly, and works without `NET_ADMIN`. Build it only if `tc` is unavailable or the counters are needed (task T-026). The proxy does not parse the RPC protocol; it only counts.

### 2.5 Container life cycle
`make sim-up PROFILE=sim-wan-3` generates compose from the profile, starts containers, applies emulation, validates. `make sim-down` removes everything including qdiscs. A `trap` handler guarantees cleanup if a run is interrupted.

## 3. Oracle Cloud Always Free runbook

> Do **not** create anything until you have read section 3.1. Claude CLI must not create cloud resources without explicit approval (CLAUDE.md rules 3, 7, 9).

### 3.1 Facts to rely on (verified 2026-11-10 unless tagged)
- Arm A1 Flex: **totals 2 OCPU and 12 GB RAM** across at most 2 instances; plus up to 2 AMD micro VMs (1/8 OCPU, 1 GB each) [V]. Always Free has **no SLA** [V].
- Idle reclaim: instances can be reclaimed if over 7 days the CPU 95th percentile is below 20 percent **and** network and memory utilisation are also low [V as stated in the policy, details **[U]**: re-read the current text at signup]. The lab's soak test (B7) doubles as keep-alive; do not rely on fake load.
- Always Free resources only work in your **home region**; capacity for A1 can be exhausted, requiring retries over hours or days [V that shortages occur].
- The 2026 allowance change was found in earlier research [V]; **re-check the current limits in the console when creating the account**, because this file may be stale.
- Billing: a card is required at signup [S]; stay on the Always Free label for every resource. Consider a budget alert at the smallest value the console allows **[U]**.

### 3.2 Account and region (manual, by you)
1. Create the account; pick the home region carefully (it cannot be changed) and prefer one with known A1 availability **[U]**; Toronto is close to you but capacity is unknown.
2. Create a **compartment** `cpuwiser` and set a budget alert.
3. Generate a dedicated SSH key pair for the lab (never reuse a personal key); store the private key outside the repo and reference it by `key_ref`.

### 3.3 Network (VCN)
- One VCN with a private subnet CIDR (for example `10.0.0.0/24`) and a public subnet only if VMs need inbound SSH. Prefer: **all lab VMs in one subnet**, SSH allowed only from your own IP (security list or network security group), **no other ingress**.
- Worker and RPC ports are reachable **only between lab VMs** (ingress rule with source = the subnet CIDR, destination ports 50052 for llama.cpp RPC and 9999 for distributed-llama, or whichever ports the profile defines).
- Outbound open (for package downloads) is fine.
- Oracle's Ubuntu images ship with restrictive default host firewall rules (iptables) that can block traffic even after VCN rules are opened [S]; add explicit allow rules for the subnet on the lab ports and persist them. Verify with `ss -ltn` plus a connect test from the other VM.

### 3.4 Creating the VMs (A1)
- Shape VM.Standard.A1.Flex, image Ubuntu LTS (aarch64). Two options for the cluster:
  - **Cluster mode:** 2 instances of 1 OCPU and 6 GB each (profile `oracle-2xa1`).
  - **Control mode:** 1 instance of 2 OCPU and 12 GB (single-node control for experiment B3). Both modes use the same total allowance, so **only one mode exists at a time**; terminate and recreate (boot volumes count against the 200 GB Always Free block storage allowance **[V total, check]**).
- If creation fails with an "out of capacity" error, retry later (try different availability domains in the home region if there are several). Retry by hand, or with a small script using the OCI CLI with a back-off; do not spam the API. **Ask the user before automating retries** (rule 9).
- Boot volume: the minimum (about 50 GB) is enough for small models; remember that models plus build artifacts must fit.
- Tag every resource `project=cpuwiser`.

### 3.5 Hardening (per VM)
1. Update packages; enable unattended security updates.
2. SSH: key only, no root login, no password auth.
3. Host firewall: default deny incoming; allow SSH from your IP; allow lab ports from the subnet only.
4. Create a non-login service user `cpuwiser` for engine processes; no sudo.
5. Time sync enabled (chrony or systemd-timesyncd) for log alignment.
6. Install `iperf3`, `htop`, `sysstat`.

### 3.6 Build the engine (once)
- Build on **one** Arm VM (or in an Arm container on an Arm laptop), then copy binaries to the others **only if** the CPU feature sets match (both are A1, so they match [E]). Otherwise build on each.
- llama.cpp: configure with CMake with the RPC backend enabled (the option is `GGML_RPC=ON` [V]) and a Release build; build the targets `llama-server`, `llama-bench`, `llama-cli` and `ggml-rpc-server` (note: the worker target is `ggml-rpc-server`, found while testing; confirm with `cmake --build <dir> --target help`). Build with `-j` equal to core count; a 1-OCPU VM compiles slowly (expect tens of minutes [E]); watch memory (add temporary swap only if the build is killed, and remove it afterwards because swap hurts measurements).
- distributed-llama: `make dllama` and `make dllama-api` [V]; needs a C++ compiler; model download and conversion done on the root node via `launch.py` for the supported model list [V].
- Record `git rev-parse HEAD` of each engine and the CMake flags in the result record.

### 3.7 Run as services (systemd templates)

**Worker unit (llama.cpp RPC), template:**
- `ExecStart`: `ggml-rpc-server -H <private-ip> -p 50052 -t <threads> -c` (host binds to the **private** address only; `-c` enables the local weight cache [V that options exist; confirm]).
- `User=cpuwiser`, `Restart=on-failure`, `RestartSec=3`, `MemoryMax` slightly below RAM minus OS reserve, `NoNewPrivileges=true`, `ProtectSystem=strict`, `ProtectHome=true`, `PrivateTmp=true`, a writable cache directory only.
- Never bind to `0.0.0.0` on a VM that has a public interface; bind to the private address.

**Coordinator (llama.cpp), template:**
- `llama-server -m <model.gguf> -ngl 99 --rpc <w1>:50052,<w2>:50052 -c <ctx> -t <threads> --host 127.0.0.1 --port 8080` plus optional `--tensor-split` and device options from the plan [V that these flags exist].
- The server listens on loopback; the demo process on the same VM (or an SSH tunnel) is the only client.
- Order of start: workers first, wait until reachable, then coordinator. A coordinator that cannot reach a worker at startup fails; the runner must handle that (see DESIGN.md section 12).

**distributed-llama:**
- Workers: `dllama worker --port 9999 --nthreads <n> --host <private-ip>` [V].
- Root: `dllama inference` for benchmarks or `dllama-api` for serving, with `--model`, `--tokenizer`, `--buffer-float-type q80`, `--workers <ip:port> ...`, `--max-seq-len`, `--nthreads` [V]. Remember: node count (root included) must be 1, 2, 4, 8... and at most the number of KV heads [V]; so `oracle-2xa1` gives exactly 2 nodes, which is valid, while 3 nodes would be rejected.

### 3.8 Network baseline (experiment B1, do first on any real cluster)
Run `ping` (100 samples) and `iperf3` (TCP, both directions, 30 seconds, plus a small-message test if possible) between every pair. Save the numbers into the profile as `source: measured` links, so the planner stops using assumptions.

## 4. Hybrid: laptop plus Oracle (optional, WireGuard)
- Purpose: a realistic WAN, without opening worker ports to the internet.
- Use WireGuard (or Tailscale, the easiest; free personal tier exists [S], check current terms) to create a private overlay. Worker processes bind **only** to the overlay address.
- Only UDP for WireGuard is exposed on the VMs; everything else stays closed.
- Expected added RTT equals your real latency to the Oracle region (measure; do not assume) [U].
- Keys: generated per device; never committed (rule 2).
- Caveat: your home upload bandwidth limits the weight transfer at model load [E]; for an 8B Q4 file of about 5 GB, load time at 10 MB/s upload would be about 8 minutes [E arithmetic: 5000 MB / 10 MB/s = 500 s]. The `-c` cache or pre-copying the model to each node avoids repeating this.

## 5. Security checklist (review before M5 and M7)

| Check | Pass condition |
|---|---|
| Worker ports | Not reachable from outside the lab network (test from your laptop's public side and from a scan of the VM public IP: only SSH, and WireGuard if used) |
| Port-exposure test | Automated check in T-060 fails the build if any compose file publishes a worker port or any unit binds `0.0.0.0` |
| SSH | Key only, restricted source, no root |
| Secrets | None in git history (run a secret scan in CI, for example gitleaks or an equivalent **[ask before adding the dependency]**) |
| Demo | API key required, rate limit, request size limits, CORS restricted, HTTPS if exposed beyond loopback |
| Model licences | Record the licence of each model file in `RESEARCH.md`; hobby use is usually fine, but read each one |
| Logs | Contain no prompts from other people; the demo stores no prompts unless you enable it |
| Backups | `results/` copied to another place regularly (VMs can vanish) |

## 6. Operations

| Topic | Practice |
|---|---|
| Rebuild time | Everything scripted so a lost VM is rebuilt in under an hour [E target]; keep the bootstrap script idempotent |
| Monitoring | Node sampler CSV during runs; `systemctl status`; journald logs; a simple `cpuwiser doctor` check |
| Cost control | Budget alert; weekly check that no non-free resource exists; tag everything |
| Idle reclaim | Plan a periodic real workload (soak test) instead of fake load; if an instance is reclaimed, rebuild from scripts |
| Capacity loss | Keep the Docker lab path working at all times; it is the fallback |
| Model storage | Keep models on the coordinator only; delete unused models to save disk |
| Upgrades | Pin engine commits; upgrade deliberately, rerun the baseline experiment (A1/B2) to detect regressions |

## 7. Troubleshooting guide (symptom, first checks)

| Symptom | First checks |
|---|---|
| Coordinator cannot connect to worker | Is the process running (`ss -ltn`)? Bound to the right address? VCN rule, host firewall, container network? Try a plain TCP connect from the coordinator |
| Very slow tokens on a small RTT | Compare with the single-node control; count round trips (proxy or `GGML_RPC_DEBUG=3` with `-lv 5` [V]); check threads versus cores; check CPU steal time |
| Out of memory kill | Check `dmesg`; reduce context; reduce quantization; check the plan's memory estimate against actuals and record the error |
| Numbers vary wildly | Thermal throttling, background load, noisy neighbours on shared cloud VMs [E]; rerun with more repetitions and record `notes` |
| Emulation validation fails | Check the `tc` qdisc on both ends; check for double application; confirm interface name |
| Oracle "out of capacity" | Retry later; try another availability domain; ask the user before automating |
| Worker crashes mid-run | Capture logs; this is a known risk of the RPC server being a proof of concept [V]; record it as a finding and test recovery |

## 8. Resource budget table (for planning only; all [E] until measured)

| Item | Estimate | Basis |
|---|---|---|
| 8B Q4_K_M weights | about 4.8 GB | 8e9 x 0.6 B per parameter |
| KV cache, 2,048 context, 8B-class model | about 256 MiB | 128 KiB per token x 2,048 |
| Per-node scratch buffers | 0.3 to 0.6 GB | engine overhead guess |
| OS and services per VM | about 1 GB | Ubuntu minimal plus sshd |
| Usable memory per 6 GB VM | about 5 GB | 6 minus 1 |
| Cluster memory for 8B across 2 VMs | about 6.1 GB needed of 10 GB usable | fits with margin |
