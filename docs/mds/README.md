# CPUwiser: Distributed-CPU LLM Lab (planning pack)

Date: 2026-11-10
Owner: Bhautik
Status: Planning only. No code has been written. This pack is meant to be copied into a new repo and built with Claude CLI in VS Code.

## What this project is (please confirm)

CPUwiser is a **hobby lab** that splits one open-weight LLM across several cheap or free CPU machines (one coordinator plus workers) so you can **measure** speed, latency, memory and failure behaviour, and **learn** how distributed inference really works. A **small chat demo** sits on top of the cluster at the end.

Three machine types are in scope, as you chose:

1. **Your laptop with Docker**: containers act as nodes, and a simulated slow network lets you test ideas before touching the cloud.
2. **Oracle Always Free VMs**: real nodes in one private network (up to two Arm VMs and two tiny AMD VMs).
3. **Laptop plus Oracle together** (optional): a realistic internet-latency test.

It is **not** the hosted-API chat gateway from the earlier research. That work is background only (see `RESEARCH.md`, section 9).

### My interpretation of "change based on the cluster and computer selections" (confirm or correct)

You asked that the setup **adapt to whichever cluster and computers you select**. I read that as:

- You describe a cluster in a **profile file** (nodes, cores, RAM, CPU architecture, network speed and delay).
- A **planner** reads the profile and recommends the engine, the model size, the quantization, how to split the layers, the thread counts, and which experiments make sense.
- The same experiments then run unchanged on any profile (laptop simulation, Oracle, or a mix).

If you meant something different (for example a UI to pick machines, or switching engines at runtime), tell Claude CLI before starting milestone M3 (see `TASKS.md`).

## Files in this pack

| File | Purpose | Read when |
|---|---|---|
| `README.md` | This index, kickoff prompts, glossary, open questions | First |
| `CLAUDE.md` | Project rules for Claude CLI (copy to the repo root) | Every session (Claude CLI loads it automatically) |
| `PLAN.md` | Goals, scope, decisions, architecture, milestones, success criteria | Before any work |
| `DESIGN.md` | Profile schema, planner rules, engine adapters, result format, chat demo API, testing | Before coding a component |
| `INFRA.md` | Docker lab, network emulation, Oracle runbook, security, operations | Before touching machines |
| `EXPERIMENTS.md` | Every experiment with hypothesis, setup, metrics, procedure, decision rules | When running experiments |
| `TASKS.md` | Numbered tasks in milestones, each sized for one Claude CLI session | Every session |
| `RESEARCH.md` | Verified facts, numbers, risks, open questions, sources | When a decision needs evidence |

## How to use this pack with Claude CLI

1. Create a new repo (suggested name `cpuwiser`). Put `CLAUDE.md` and `README.md` at the root and the other files in `docs/`.
2. Start Claude CLI in the repo folder. It reads `CLAUDE.md` automatically.
3. Work **one task at a time** from `TASKS.md`. Start each session with a kickoff prompt like the ones below.
4. After each task, have Claude CLI update the task status in `docs/TASKS.md` and add any new facts to `docs/RESEARCH.md` with a confidence tag.
5. Commit after every task that passes its acceptance criteria.

### Kickoff prompts (copy and paste)

**Session 1: bootstrap**
> Read CLAUDE.md and docs/PLAN.md, docs/DESIGN.md and docs/TASKS.md. Do tasks T-001 to T-005 only (repo bootstrap). Do not start other milestones. Follow the acceptance criteria exactly, and tell me what you verified by running it.

**Session for any task**
> Read CLAUDE.md. Then do task T-0xx from docs/TASKS.md. Read the sections of docs/DESIGN.md and docs/INFRA.md that the task references. Before writing code, summarize your plan in 5 lines. Run the tests. When done, update the task status and list what to check manually.

**Before running experiments**
> Read docs/EXPERIMENTS.md experiment A3. Check that the profile, engine build and model files exist. Show me the exact commands you will run and the expected duration. Wait for my approval before running anything that uses cloud machines.

**When something looks wrong**
> Do not guess. Reproduce the problem, show me the logs, list 3 hypotheses with how to test each, then test them in order.

## Confidence tags used in all files

| Tag | Meaning |
|---|---|
| **[V]** | Verified from the project's official source (docs, README or source code read on 2026-11-10) |
| **[S]** | From a third-party source; plausible, not confirmed |
| **[E]** | My estimate or calculation; arithmetic shown so you can check it |
| **[U]** | Unknown; must be measured by an experiment |

## Glossary

- **Shard**: a slice of the model held by one machine.
- **Quantization (Q4_K_M, Q8_0, ...)**: storing weights in fewer bits to save RAM; Q4_K_M is about 4.5 to 5 bits per weight.
- **Pipeline (layer) split**: each machine holds consecutive layers; a token passes through machines in order. Fits big models, does not speed up one request.
- **Tensor split**: every machine computes part of every layer and synchronizes after each layer. Can speed up one request but needs a fast, low-latency network.
- **Prefill (prompt processing)**: reading the prompt; **generation (decode)**: producing tokens one at a time.
- **TTFT**: time to first token. **tg**: token generation speed (tokens per second). **pp**: prompt processing speed.
- **RTT**: network round-trip time. **OCPU**: Oracle CPU unit (1 OCPU is 1 Arm core on Ampere A1).
- **Profile**: YAML description of a cluster (nodes and links). **Planner**: component that turns a profile into a recommended setup.

## Open questions for you (answer when convenient)

1. What is your laptop (OS, CPU architecture, cores, RAM)? Docker on macOS or Windows runs inside a VM, which changes how to read the results. See `INFRA.md` section 2.
2. Do you already have an Oracle Cloud account and which region is your home region?
3. How ambitious should the final model size be: 1B to 4B models (fast iteration) or an 8B model (the realistic limit for two free Arm nodes)?
4. Should the chat demo include simple document Q&A, or be a plain chat page with live cluster metrics? The plan assumes the plain chat page.
5. Do you want a public demo URL, or private use only? The plan assumes private use, because the cluster has no SLA and the worker protocol has no authentication.
6. Is a single laptop Docker simulation acceptable as the "cluster" for milestone M2 if Oracle capacity is not available right away?
7. Which Python version and tooling do you prefer (the plan assumes Python 3.12 with `uv`)?
