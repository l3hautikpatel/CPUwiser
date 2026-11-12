# DOC-AUDIT.md: what was unclear, inconsistent or missing in the pack, and the fixes

Date: 2026-11-11
New file. Based on re-reading the files and searching them for conflicts (commands, task IDs, terms). **Rule: when two files disagree, the newer file wins; the table in section 2 lists the known conflicts.** Tags: [V] verified, [S] third-party, [E] my judgment, [U] unverified.

---

## 1. Complete file index (replaces the index in README.md, which predates the new files)

| File | Purpose | Status |
|---|---|---|
| `CLI-START-HERE.md` | Decisions in force, reading order, prompts | Read first |
| `CLAUDE.md` | Core rules for Claude CLI | Always loaded |
| `GUARDRAILS.md` | AI rules and failure scenarios with fallbacks | Always read |
| `README.md` | Overview, glossary, original open questions | Index is outdated; use this table |
| `PLAN.md` | Goals, scope, architecture, milestones | Current |
| `HOW-IT-WORKS.md` | How nodes talk, how the model is used | Current |
| `NODE-ROLES-AND-APPS.md` | What runs on master vs workers | Current |
| `USER-GUIDE.md` | Commands, node status, screens, walkthroughs | New, fills a gap |
| `DESIGN.md` | Schemas, planner, adapters, results, demo API | Current, extended by USER-GUIDE and PLATFORMS |
| `INFRA.md` | Docker lab, Oracle runbook, security, operations | Current |
| `ORACLE-SETUP.md` | Account/VM creation walkthrough and multi-account policy | Current |
| `CLOUD-SELECTIONS.md` | Exact Oracle and AWS settings, change-later table | Current |
| `PLATFORMS-AND-DECISIONS.md` | Providers, edge hosting, decisions | Current |
| `EXPERIMENTS.md` | Experiment definitions and decision rules | Current |
| `TASKS.md` | Original task list | Extended by new task tables (see section 3) |
| `RESEARCH.md` | Facts, risks, sources | Current; additions listed in section 5 |

## 2. Conflicts and unclear points found (and the ruling)

| # | Where | Problem | Ruling |
|---|---|---|---|
| C1 | All files | Two words for the same machine: "master" (61 mentions) and "coordinator" (67) | They mean the same. Use **master** in user text, `coordinator` in code and profile fields (USER-GUIDE.md section 1) |
| C2 | TASKS.md T-041 vs CLI-START-HERE.md T-100 | Both create the Oracle VMs; T-042 depends on T-041 | **T-100 replaces T-041** (exact settings in CLOUD-SELECTIONS.md). Treat T-041 as done-by-T-100 and make T-042 depend on T-100. T-040 is done (account exists) |
| C3 | TASKS.md T-043 vs CLI-START-HERE.md T-102 | Overlap on systemd units | T-043 builds and copies engines; T-102 adds role templates and the wrong-role check. Do T-043 first, then T-102 |
| C4 | README.md | Says "Python tooling question open" and lists 8 files | Answered (3.12 + `uv`); use the index in section 1 |
| C5 | README.md open question list | Several are now answered | See CLI-START-HERE.md section 1; remaining open items are in section 4 below |
| C6 | EXPERIMENTS.md section 2 | Starting model set and A3 text name a 1.7B model while the default is now Qwen3 0.6B | Use **Qwen3 0.6B for quick runs and tests, Qwen3 1.7B for the main A-series and B-series runs**; both are in the set |
| C7 | DESIGN.md section 2 CLI line | Lists `plan, up, down, run, report, doctor` only | The full list is USER-GUIDE.md section 3 (adds status, check, nodes, logs, links, models, ask, chat, tunnel, guard, profile) |
| C8 | DESIGN.md 11.2 | `/cluster` only; no per-node endpoints | Extended by USER-GUIDE.md section 5.3 |
| C9 | PLAN.md profile table | `oracle-mixed`, `hybrid-wan` named, but no AWS or friend-node profile | Add profile examples `oracle-plus-aws` and `oracle-plus-laptop` in T-030 (CLOUD-SELECTIONS.md section 1.1 sets S1 to S4) |
| C10 | TASKS.md header | M-order and ID ranges look out of order (T-08x before T-06x) | Intentional; IDs are labels. New ranges: T-09x platforms, T-10x cloud/guardrails, T-11x user guide |
| C11 | HOW-IT-WORKS.md vs DESIGN.md | Both describe the master API port; one says loopback, the other mentions a demo port | Master engine API on loopback; demo app is the only thing users reach (HOW-IT-WORKS.md section 3) |
| C12 | INFRA.md 3.4 vs CLOUD-SELECTIONS.md 2 | INFRA mentions "about 50 GB" boot volumes; Oracle's own page gives 47 GB in one place and 50 GB in another [V, inconsistent] | Use the console default and keep the total under 200 GB |

| C13 | DESIGN.md `key_ref`, INFRA.md 3.2, CLOUD-SELECTIONS.md 5 | Profiles point to `key_ref`, but no file defines where key names are mapped to key paths | Defined in section 8 below (local config file) |
| C14 | PLAN.md risk table, INFRA.md 3.1 | Say Oracle's 2026 Arm cut is [V]; only the 2 OCPU / 12 GB total is verified on Oracle's page, the date of the cut is [S] | Treat the date as [S]; the totals in CLOUD-SELECTIONS.md are the reference |
| C15 | PLATFORMS-AND-DECISIONS.md 2.4 (Vercel calls the master over HTTPS) vs INFRA.md and HOW-IT-WORKS.md (demo private) | A Vercel front-end needs a reachable HTTPS endpoint, which is not private | **Default stays private** (SSH tunnel or overlay). Making the demo reachable from Vercel is a separate decision (Q8) and needs: API key, rate limit, HTTPS, approval, and GUARDRAILS.md A3 review |
| C16 | CLAUDE.md repo map | Lacks `models/`, `docs/providers/`, local state and config locations used by later files | Added in section 8 below |

## 3. Gaps that made things unclear, now covered

| Gap | Covered by |
|---|---|
| How the user checks every node, and what the states mean | USER-GUIDE.md sections 3.2, 4, 5 |
| How to choose the cluster/computers and re-plan | USER-GUIDE.md section 3.1 |
| Which program runs where | NODE-ROLES-AND-APPS.md |
| How to create the cloud machines with exact options | CLOUD-SELECTIONS.md |
| What to do when something is "not possible" | GUARDRAILS.md |
| Day-to-day workflows | USER-GUIDE.md section 6 |

Task tables to append to TASKS.md: PLATFORMS-AND-DECISIONS.md (T-090 to T-095), CLI-START-HERE.md (T-100 to T-105), USER-GUIDE.md (T-110 to T-116).

## 4. Still unclear because only you can decide (the CLI must ask, not guess)

| # | Question | Default if you do not answer (stated, not silent) |
|---|---|---|
| Q1 | Oracle home region (Toronto?) | Unknown: the CLI asks at T-100 |
| Q2 | AWS node in phase 1? Which region? | No AWS node in phase 1 |
| Q3 | Laptop OS, CPU, RAM | Unknown: `cpuwiser doctor` will record it, and the CLI must ask before sizing Docker limits |
| Q4 | Third node: AWS, laptop, or none | None in phase 1 |
| Q5 | Cluster page visible to visitors or owner-only | Owner-only |
| Q6 | Always-on demo or start on demand | Start on demand |
| Q7 | Node toggle UI or CLI-only | CLI-only |
| Q8 | Whether the demo should ever be public | Private |

## 5. Facts that are not fully verified (do not treat as certain)

| Item | Why unverified | How to resolve |
|---|---|---|
| `m7i-flex.large` specs (about 2 vCPU / 8 GiB) and hourly price | Eligible type list verified on AWS docs [V]; specs and price came from memory [U] | Check the EC2 console/pricing page at launch |
| AWS charge for public IPv4 addresses under the Free Plan | Common report [S], not checked on AWS's page | Check Billing after launch; stop at any charge (GUARDRAILS.md G12) |
| Oracle in-place resize of A1.Flex | Docs page exists [S]; a community thread reports limits | Test on one VM before relying on it |
| AWS Free Plan end-of-term behaviour | Eligibility and 6-month/credit limit verified [V]; consequences at expiry not checked | Read the billing page at signup |
| Oracle's June 2026 allowance change | Reported by a third party and consistent with the 2 OCPU / 12 GB total on Oracle's own page [V total, S for the date] | None needed |
| Whether `llama-server` options and device names match the pack | Written from earlier source reading, not run | Run `--help` on the pinned build (CLAUDE.md rule 5) |
| Mixed Arm and x86 clusters | Not tested | Experiment B6 |
| Sandbox experiments from the planning session | Never validated end to end | Ignore; all speed figures come from the lab |
| llama.cpp license is MIT | Stated from memory; distributed-llama's MIT license was read [V] | Confirm in T-001 |

## 6. What a team member needs before touching the repo (checklist)
1. Read CLI-START-HERE.md, then GUARDRAILS.md.
2. Know the three safety rules: no public worker ports, no secrets in git, free tier only.
3. Know the vocabulary (USER-GUIDE.md section 1).
4. Pick one task from TASKS.md or the new tables; do only that.
5. Report blockers using the no-dead-end format.

## 7. Suggested next step
Answer section 4 (even partially). Then the CLI can start T-001 to T-005 with nothing assumed.

## 8. Local config and state (missing from the first pack)

All of this stays **outside git**.

| Item | Location (default) | Content |
|---|---|---|
| Key map | `~/.config/cpuwiser/keys.yaml` | `key_ref` name to private key file path (for example `oracle_lab: ~/.ssh/cpuwiser_oracle`). The profile holds only the name |
| Selected profile and node overrides | `.cpuwiser/state.yaml` in the repo (git-ignored) | Selected profile, disabled nodes, selected model |
| Real profiles | `profiles/local/*.yaml` (git-ignored) | Real addresses, users, key names |
| Demo secrets | `.env` on the master (git-ignored); `.env.example` in git | API key, allowed origins |
| Models | `models/` on the laptop (downloads) and on the master (git-ignored) | GGUF files plus `models/manifest.yaml` (committed, no files) |
| Provider notes | `docs/providers/*.md` | Limits and gotchas per provider |

Add `models/`, `.cpuwiser/` and `docs/providers/` to the repo map in task T-001, and create the key map file format in task T-110.
