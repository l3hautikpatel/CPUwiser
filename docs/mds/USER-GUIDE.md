# USER-GUIDE.md: how a person uses CPUwiser, and how to check every node

Date: 2026-11-11
Tags: [V] verified, [E] my design/judgment, [U] decide or verify at build time. New file. It **extends** DESIGN.md (section 2 and 11) with the user-facing commands and screens that were missing. Example outputs below are **illustrations with made-up values**, not measurements.

---

## 1. Vocabulary (the whole team uses these words)

| Word | Meaning |
|---|---|
| **Master** | Same thing as "coordinator" in older files. The one machine you talk to; it runs the model API |
| **Worker** | A machine that holds part of the model and only talks to the master |
| **Node** | Any machine in the cluster (master or worker) |
| **Cluster / profile** | The set of nodes and links described in one YAML file; "selecting a cluster" means choosing a profile |
| **Plan** | The planner's recommended setup for a profile + model |
| **Run** | One execution of an experiment; **session** means a period when the cluster is up for chatting |
| **Overlay** | Private VPN address space joining machines from different providers |

Rule for docs and code: use **master** in user-facing text; the code field stays `coordinator` (DESIGN.md) and the CLI accepts both words.

## 2. Who interacts with the system, and through what

| Person | Wants to | Surface they use |
|---|---|---|
| **You (owner/operator)** | Start/stop the cluster, see node health, chat, run experiments, read reports | The `cpuwiser` CLI on your laptop; the demo's Cluster page |
| **A visitor or one of your other apps** (optional) | Ask the model a question | The demo's chat page or its `POST /v1/chat` API (key required) |
| **The AI developer (Claude CLI) and team** | Build and test the code | Repo, TASKS.md, `make` targets |

Three control surfaces:
1. **CLI on your laptop** (`cpuwiser ...`): the main control panel. It reaches nodes by SSH (or Docker) using the selected profile.
2. **Demo web app** on the master: chat page + Cluster page (read-only status).
3. **Direct access** (debug only): SSH into a node, or an SSH tunnel to the master's API port.

You never connect to a worker's model port yourself (see HOW-IT-WORKS.md section 3).

## 3. The CLI: complete command list (spec for tasks T-110 to T-113)

All commands accept `--profile NAME` (or use the selected profile) and `--json` for machine-readable output. Commands that change anything accept `--dry-run` and print what they would do first.

### 3.1 Choose the cluster and computers

| Command | What it does |
|---|---|
| `cpuwiser profile list` | Lists profiles found in `profiles/` and `profiles/local/` with kind (simulated, real, hybrid), node count, total RAM, and warnings |
| `cpuwiser profile show NAME` | Prints nodes, links, constraints, `source` of each link (emulated/measured/assumed) |
| `cpuwiser profile select NAME` | Stores the selected profile (in a local, git-ignored state file) |
| `cpuwiser profile validate NAME` | Runs the validation rules (DESIGN.md 3.2), including the free-tier guard |
| `cpuwiser plan [--model M]` | Planner output for the selected profile: engine, split, threads, memory per node, warnings |
| `cpuwiser nodes enable/disable ID` | Include or exclude a node for the next start (edits a local override, not the base profile); the plan is recomputed |

This is the "change based on the cluster and computer selections" behaviour: select a profile, enable or disable nodes, re-plan. v1 is **CLI only**; a checkbox UI for nodes in the Cluster page is a later option [U: decision at M5].

### 3.2 Look at the nodes (health and status)

| Command | What it shows |
|---|---|
| `cpuwiser status` | One table, one row per node, plus a one-line cluster summary (section 4) |
| `cpuwiser nodes` | Same as status with hardware details (arch, cores, RAM, provider, address) |
| `cpuwiser check NODE` | Deep check of one node: SSH, disk, memory, CPU load, engine version, service state, last log lines, firewall exposure test |
| `cpuwiser check --all` | Runs `check` on every node and prints a pass/fail list |
| `cpuwiser links` | Measured ping and (optionally) iperf3 between nodes; updates link `source` to `measured` after approval |
| `cpuwiser logs NODE [--follow]` | Tail the engine service log of that node |
| `cpuwiser doctor` | Local environment report (OS, Docker, tools, versions) |
| `cpuwiser guard` | Free-tier and safety checks: A1 totals, storage total, eligible AWS types, no public worker ports |

### 3.3 Run the cluster and use the model

| Command | What it does |
|---|---|
| `cpuwiser up` | Starts workers, waits until reachable, starts the master, waits until the model is loaded, prints the endpoint |
| `cpuwiser down` | Stops the master, workers and (in simulation) removes emulation settings |
| `cpuwiser restart [NODE]` | Restarts one node's service or the whole cluster |
| `cpuwiser models list` | Models in the manifest and which are present on the master (size, quant, SHA-256 status) |
| `cpuwiser models use NAME` | Switches the model for the next `up` (re-plans; warns if it does not fit) |
| `cpuwiser ask "question"` | Sends one prompt through the demo/master API and prints the streamed answer with TTFT and tokens per second |
| `cpuwiser chat` | Interactive chat in the terminal |
| `cpuwiser tunnel` | Opens an SSH tunnel so `http://127.0.0.1:8080` on your laptop reaches the master API |

### 3.4 Experiments and results
`cpuwiser run EXPERIMENT_ID`, `cpuwiser report`, `cpuwiser results list` (see EXPERIMENTS.md). Anything long, on cloud nodes, or over 2 GB of download prints the exact plan and waits for approval (GUARDRAILS.md A3, A5).

## 4. Node status: what the table means

### 4.1 Example (illustration only, fake numbers)

```
Profile: oracle-2xa1   Engine: llamacpp_rpc   Model: qwen3-1.7b-q4_k_m   Cluster: DEGRADED

NODE   ROLE    PROVIDER  ADDRESS(priv)  STATE        CPU   MEM USED/TOTAL  LAYERS  LATENCY(from master)  LAST SEEN
node1  master  oracle    10.0.0.11      SERVING      41%   3.1/6.0 GB      0-13    -                     2s ago
node2  worker  oracle    10.0.0.12      UNREACHABLE  -     -               14-27   timeout               3m ago
```

### 4.2 Node states (the same words everywhere: CLI, API, UI)

| State | Meaning | How it is detected [E] |
|---|---|---|
| `UNKNOWN` | Never checked | No data yet |
| `UNREACHABLE` | Cannot SSH or connect | SSH or TCP connect fails after timeout |
| `REACHABLE` | Machine is up, engine service not running | SSH ok, service inactive |
| `WORKER_UP` | Worker process listening | Service active and TCP connect to its worker port from the master succeeds |
| `LOADING` | Master is loading the model and sending weights | Master log shows load in progress |
| `SERVING` | Master ready; model loaded across all enabled nodes | Master `/health` ok and test token generated |
| `DEGRADED` | Some node is down or slow but master still answers | Any node not `WORKER_UP`/`SERVING`, or latency beyond threshold |
| `FAILED` | Service crashed or out of memory | Service failed state or OOM in kernel log |

### 4.3 Cluster states
`DOWN` (nothing running) → `STARTING` → `READY` (all enabled nodes good) → `DEGRADED` (at least one problem) → `FAILED` (cannot serve). `cpuwiser status` exits with code 0 for READY, 1 for DEGRADED, 2 for DOWN/FAILED, so scripts can use it.

### 4.4 What `check NODE` verifies (in order, stop at first hard failure)
1. SSH connects with the lab key.
2. OS, kernel, arch match the profile.
3. Free memory and disk above thresholds (memory ≥ 200 MB free [E]).
4. Engine binary present; version/commit equals the pinned one.
5. Service state (worker or master) and last 20 log lines.
6. Listening address is the private/overlay IP, **not** `0.0.0.0` (guardrail).
7. From the **outside** (your laptop): the worker port is **not** reachable on the public IP.
8. For workers: the master can open a TCP connection to the worker port.
9. Round-trip time master to node.

## 5. The demo web app

### 5.1 Chat page
Message box, streamed answer, and a side strip showing profile, engine, model, TTFT, tokens per second, queue position. A banner says it is an experimental hobby cluster.

### 5.2 Cluster page (read-only status, spec for T-114)
- Header: cluster state, profile, engine, model, uptime.
- Node table with the columns from section 4.1 and a colored state badge.
- Per node detail (click): CPU and memory sparkline for the last 15 minutes, last 20 log lines (no prompts), engine version, link RTT.
- Recent requests table: time, prompt tokens, generated tokens, TTFT, tokens per second, status.
- No buttons that start, stop or delete anything in v1 (control stays in the CLI) [E, safety].

### 5.3 API (extends DESIGN.md 11.2)

| Endpoint | Purpose |
|---|---|
| `GET /cluster` | Cluster state, profile, engine, model, uptime |
| `GET /nodes` | List of nodes with the fields in section 4.1 |
| `GET /nodes/{id}` | One node's detail including recent samples |
| `GET /metrics/recent` | Last N requests |
| `POST /v1/chat` | Chat (key required) |

The master collects node status every 5 to 10 seconds [E] using the same checks as `cpuwiser status`, but **never exposes IP addresses or keys** to the public page: only node IDs, roles, states, and metrics unless you are logged in with the owner key [E].

## 6. Day-to-day scenarios (step by step)

### 6.1 First time (after VMs exist)
1. `cpuwiser profile validate oracle-2xa1`
2. `cpuwiser profile select oracle-2xa1`
3. `cpuwiser check --all` → fix anything red (guardrail G16 if SSH fails).
4. `cpuwiser links` → measured RTT/bandwidth stored.
5. `cpuwiser plan --model qwen3-1.7b` → read the plan and warnings.
6. `cpuwiser up` → wait for `SERVING`.
7. `cpuwiser ask "Hello"` → see answer and speed.
8. `cpuwiser down` when finished (saves power and avoids idle confusion; the soak test is the planned long-running use).

### 6.2 Daily use
`cpuwiser up` → `cpuwiser status` → chat via the demo or `cpuwiser chat` → `cpuwiser down`. For an always-on demo, services stay enabled and you only run `status`.

### 6.3 "Is every node working?"
`cpuwiser status`; for detail `cpuwiser check --all`; for one node `cpuwiser logs node2 --follow`. Open the Cluster page for the same view in a browser.

### 6.4 A node died
1. `cpuwiser status` shows `UNREACHABLE` or `FAILED`.
2. `cpuwiser check node2` for the cause (reclaimed VM, out of memory, crashed service).
3. `cpuwiser restart node2`; then `cpuwiser restart master` (the master must reload).
4. If the VM is gone: GUARDRAILS.md G2; rebuild from scripts; update the profile.

### 6.5 Switch the model
`cpuwiser models list` → `cpuwiser models use qwen3-0.6b` → `cpuwiser plan` (check fit) → `cpuwiser restart`. Loading time grows with model size (weights are sent from the master to workers at load [V]).

### 6.6 Switch the cluster
`cpuwiser down` → `cpuwiser profile select sim-wan-3` (or `hybrid-wan`) → `cpuwiser plan` → `cpuwiser up`.

### 6.7 Add or remove a node
Add: create the machine (CLOUD-SELECTIONS.md), run bootstrap, add the node to `profiles/local/*.yaml`, `cpuwiser profile validate`, `cpuwiser check NODE`, `cpuwiser plan`, `cpuwiser restart`.
Remove: `cpuwiser nodes disable node3` (temporary) or delete from the profile; re-plan.

### 6.8 Use it from another project
Call the demo's `POST /v1/chat` with the API key from your server-side code (for example a Vercel function), never from browser code. Expect single-request speed and queueing (HOW-IT-WORKS.md 4.3).

### 6.9 Run an experiment
`cpuwiser run A3` → prints the plan and duration → approve → results appear under `results/` → `cpuwiser report`.

## 7. What you can and cannot do

| You can | You cannot (by design) |
|---|---|
| See state, CPU, memory, links, logs of every node | Connect to a worker's model port from the internet |
| Switch profile, model, engine, node set, thread counts | Run two requests at the same time (single-request cluster) |
| Start/stop/restart from the CLI | Start/stop from the public web page (v1) |
| Read stored results and reports | Exceed the free-tier guard silently: the guard blocks plans that break limits |

## 8. Tasks to add (append to TASKS.md)

| ID | Task | Depends | Effort | Status |
|---|---|---|---|---|
| T-110 | CLI skeleton for `profile list/show/select/validate` and `nodes enable/disable` with local state file | T-030 | M | todo |
| T-111 | Node status collector (states in section 4.2) for Docker and SSH nodes; `cpuwiser status`, `nodes`, `check`, `check --all`, `logs` | T-091 or T-021, T-110 | L | todo |
| T-112 | `up`, `down`, `restart` orchestration with readiness waits and clear errors | T-022, T-111 | L | todo |
| T-113 | `models list/use`, `ask`, `chat`, `tunnel` | T-112, T-050 | M | todo |
| T-114 | Demo Cluster page and `GET /nodes`, `GET /nodes/{id}` (read-only, no secrets) | T-111, T-052 | M | todo |
| T-115 | `guard` command and exit codes for scripts | T-101 | S | todo |
| T-116 | Walkthrough test: scripted run of scenarios 6.1, 6.3 and 6.4 against the Docker lab | T-112, T-114 | M | todo |

## 9. Open decisions for you
1. Do you want node enable/disable checkboxes on the Cluster page later (v2), or CLI only? Default: CLI only.
2. Should the Cluster page be visible to visitors (without addresses) or owner-only? Default: owner-only until you decide.
3. Always-on demo (services enabled at boot) or start only when you need it? Default: start when needed.
