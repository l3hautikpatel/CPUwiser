# CLI-START-HERE.md: read this first, then feed the files to Claude CLI

Date: 2026-11-11
New file. It records the decisions made after the first pack, lists every file in the order the CLI should read them, and gives the prompts to paste. **Where this file conflicts with an older file, this file wins.**

---

## 1. Decisions now in force

| Topic | Decision | Source |
|---|---|---|
| License (T-001) | **MIT** | PLATFORMS-AND-DECISIONS.md part 1 |
| Default test model | **Qwen3 0.6B** (quick runs), **Qwen3 1.7B** (main runs), **Llama 3.2 1B** (second family) | same; verify names, licences, SHA-256 in T-011 |
| Python | 3.12 with `uv` | CLAUDE.md |
| Chat demo | plain chat page + live metrics, private | README.md |
| Oracle | **One account (yours), already ready; you will create the VMs.** Start with **2 x A1 (1 OCPU / 6 GB each)** | CLOUD-SELECTIONS.md section 2 |
| Extra nodes | AWS Free Plan guest node (temporary, credit-limited), laptop, or a friend's own account; never extra accounts of your own | CLOUD-SELECTIONS.md sections 1 and 4 |
| Master vs worker | Same engine build and same bootstrap; different service started | NODE-ROLES-AND-APPS.md |
| Platforms | `provider` tag + generic SSH nodes; Vercel only as front-end | PLATFORMS-AND-DECISIONS.md part 2 |
| Guardrails | GUARDRAILS.md applies in every session | GUARDRAILS.md |
| Order of work | Docker lab first (M0 to M3); create Oracle VMs in parallel; AWS node later and optional | TASKS.md + below |

## 2. Reading order for the CLI

1. `CLI-START-HERE.md` (this file)
2. `CLAUDE.md` and `GUARDRAILS.md`
3. `PLAN.md`
4. `NODE-ROLES-AND-APPS.md`
5. `DESIGN.md`
6. `TASKS.md` plus the new tasks in section 4 below
7. Only when needed: `INFRA.md`, `ORACLE-SETUP.md`, `CLOUD-SELECTIONS.md`, `EXPERIMENTS.md`, `PLATFORMS-AND-DECISIONS.md`, `HOW-IT-WORKS.md`, `RESEARCH.md`

Repo placement: `CLAUDE.md`, `README.md` at the root; everything else in `docs/`. Add this line to the root `CLAUDE.md`: "Also read docs/GUARDRAILS.md and docs/CLI-START-HERE.md at session start."

## 3. Prompts to paste

**First session (bootstrap)**
> Read CLAUDE.md, docs/GUARDRAILS.md, docs/CLI-START-HERE.md, docs/PLAN.md and docs/TASKS.md. Do tasks T-001 to T-005 only. License is MIT. Follow the acceptance criteria and show me what you ran and what it printed.

**Any later task**
> Read CLAUDE.md and docs/GUARDRAILS.md. Do task T-xxx from docs/TASKS.md (new tasks are in docs/CLI-START-HERE.md section 4). Summarize your plan in 5 lines first. If you hit a blocker, follow the "no dead end" rule: show the error, the cause, at least two alternatives, and a recommendation.

**Before creating anything in the cloud**
> Read docs/CLOUD-SELECTIONS.md. List the exact settings you will use for [Oracle node / AWS node] in a table, check the free-tier totals, and wait for my approval. Do not click or create anything yourself; give me the checklist.

**When the plan seems impossible**
> Read docs/GUARDRAILS.md part A2 and part B. Find the matching scenario or write a new one, and give me at least two alternatives with cost and effort.

## 4. New tasks to append to TASKS.md (in addition to T-090 to T-095 in PLATFORMS-AND-DECISIONS.md)

| ID | Task | Depends | Effort | Status |
|---|---|---|---|---|
| T-100 | **[manual]** Create the two Oracle A1 VMs using CLOUD-SELECTIONS.md section 2 exactly; record private IPs in `profiles/local/oracle-2xa1.yaml` | T-040 (account exists: mark done) | M | todo |
| T-101 | Free-tier guard in the profile validator (Oracle totals, storage, AWS eligible type list) with unit tests | T-030 | M | todo |
| T-102 | `NODE-ROLES` systemd templates: `cpuwiser-worker`, `cpuwiser-master`, `cpuwiser-demo`; test that enabling the wrong role is rejected by the profile | T-043 | M | todo |
| T-103 | **[manual, optional]** AWS account hardening and one guest node using CLOUD-SELECTIONS.md section 4; engine built for x86_64 | T-043, T-093 | M | todo |
| T-104 | `make check-safety` (GUARDRAILS.md part C) wired into CI | T-060 | M | todo |
| T-105 | Scenario drills: simulate G3 (model too big), G4 (worker killed) and G5 (no netem) in Docker and confirm the documented ladder works | T-029 | M | todo |

Status updates to make now: T-001 license decision = MIT; T-040 = done (account ready); T-011 default model = Qwen3 0.6B.

## 5. Open items still needing your answer
1. Which AWS region do you want (suggested: Canada Central), and do you want the AWS node at all in the first phase?
2. Which Oracle home region is your account in, and is it Toronto?
3. What are your laptop's OS, CPU and RAM (affects Docker limits and whether it can be a node)?
4. Do you want a third node from AWS, from your laptop, or neither at first?

Until you answer, the CLI assumes: no AWS node in phase 1; two Oracle A1 VMs; Docker lab first.
