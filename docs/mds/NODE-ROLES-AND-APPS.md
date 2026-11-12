# NODE-ROLES-AND-APPS.md: what runs on the master and on workers

Date: 2026-11-11
Tags: [V] verified from project docs/source, [E] my judgment, [U] verify on the pinned version. New companion file.

---

## 1. Short answer

You do **not** write two different applications for the model. Master and workers use the **same engine build and the same machine setup script**; the difference is **which program you start** on each machine. Only the master also runs the small chat demo app.

## 2. Roles and programs

| Machine role | Program started | From which build | Listens on | Also needs |
|---|---|---|---|---|
| **Worker** (llama.cpp) | `ggml-rpc-server` [V] | Same llama.cpp build as the master | Private/overlay IP, port 50052 | Engine binary only. No model file needed; it receives its share from the master at load [V] |
| **Master** (llama.cpp) | `llama-server` (API) or `llama-bench` (benchmarks) [V] | Same llama.cpp build | `127.0.0.1:8080` | The model file (GGUF); worker addresses via `--rpc` [V] |
| **Chat demo** (our code) | `cpuwiser-demo` (FastAPI) | Our repo | One chosen port, API key | Talks to the master's `llama-server` on loopback |
| **Runner / planner / CLI** (our code) | `cpuwiser` | Our repo, on **your laptop** | none | SSH access to nodes; never runs on workers |
| **Worker** (distributed-llama, second engine) | `dllama worker` [V] | distributed-llama build | Private IP, port 9999 | Engine binary only |
| **Master** (distributed-llama) | `dllama inference` or `dllama-api` [V] | Same build | API port | Model + tokenizer files [V] |

So per cloud machine you install **one thing in common** (the engine build) and **start a different command** depending on role. A node can change role later by changing which service is enabled (see CLOUD-SELECTIONS.md section 6).

## 3. What goes where (one view)

```
Your laptop:      cpuwiser CLI (plan, run, report) ---- SSH ----> all nodes
Master node:      llama-server (engine)  + cpuwiser-demo (chat app)
Worker node(s):   ggml-rpc-server (engine only)
```

## 4. Node setup is identical for every node (bootstrap script, T-042)
1. OS updates, firewall, SSH hardening, service user.
2. Engine binaries present (built once per CPU architecture).
3. A systemd service **template** per role; the profile decides which one is enabled:
   - `cpuwiser-worker.service` (RPC server) on workers.
   - `cpuwiser-master.service` (llama-server) on the master.
   - `cpuwiser-demo.service` on the master only.

## 5. Architecture rule for mixed machines
Binaries are **per CPU architecture**: Oracle A1 is `aarch64` (Arm); a typical AWS Free Plan node such as `m7i-flex.large` is `x86_64` [E]. Build or download the engine **for each architecture**; never copy an Arm binary to an x86 machine. Whether an Arm + x86 cluster works and gives identical outputs is unknown until experiment B6 [U]; start with same-architecture clusters.

## 6. Can the master also be a worker?
Yes. By default llama.cpp spreads layers across local and remote devices in proportion to memory [V]. Setting `coordinator_computes: false` in the profile keeps layers off the master (the exact flags are found in task T-023) [U]. On two 1-OCPU Oracle VMs, keeping the master computing is usually better, because a 1-core node that computes nothing wastes half the cluster [E].
