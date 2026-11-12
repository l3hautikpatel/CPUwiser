# PLATFORMS-AND-DECISIONS.md: pluggable providers (Oracle, Vercel, others) and the answers to the open questions

Date: 2026-11-11
Tags: [V] verified from the vendor, [S] third-party page read on this date, [E] estimate or my judgment, [U] unknown. New companion file; it extends DESIGN.md (profiles) and INFRA.md, and replaces nothing.

---

## Part 1. Decisions (clear answers)

| # | Question | Decision | Why |
|---|---|---|---|
| 1 | License | **MIT** | Hobby and portfolio project; simplest permissive license; the engines it drives (llama.cpp, distributed-llama) are MIT-licensed [V for distributed-llama README; llama.cpp is MIT per its repository, confirm in T-001]. AGPL would force network-service source disclosure and adds nothing here. Apache 2.0 is also fine if you want an explicit patent grant. |
| 2 | Default test model | **Qwen3 0.6B instruct (Q4_K_M for llama.cpp; Q40 for distributed-llama)**, then **Qwen3 1.7B** for the main runs, **Llama 3.2 1B** as a second family | distributed-llama supports Qwen 3 0.6B, 1.7B and 8B and Llama 3.2 1B/3B [V from its README], so the **same model family runs on both engines** for experiment A9. Qwen2.5-0.5B and SmolLM2-360M are not in distributed-llama's supported list [V], so they would block that comparison. Qwen3 0.6B is about 0.4 GB in Q4_K_M [E] and downloads quickly. Confirm exact file names, licences and SHA-256 in T-011. |
| 3 | Oracle at the start | **Start 100 percent on the Docker lab (M0 to M3); begin Oracle signup in parallel (T-040)** | Capacity for Arm VMs can take days [S]; the Docker lab needs no account. How many Oracle nodes you really get depends on your answer to the question at the end of this file. |
| 4 | Python tooling | Python 3.12 with `uv` | As in CLAUDE.md |
| 5 | Demo | Plain chat page with live metrics, private (not public) | As in README.md |

### The Oracle "2 to 3" point (needs one clarification from you)
- **One Oracle account** (yours) gives at most 2 Arm VMs (2 OCPU / 12 GB total) plus 2 tiny AMD VMs (1/8 OCPU, 1 GB each) [V]. That is enough for "2 real nodes plus 1 tiny helper", not 3 real nodes.
- **Three real nodes** need another person's own account (friend or family, with consent) or your laptop as the third node. Creating more accounts yourself is not allowed by Oracle's terms [V, see ORACLE-SETUP.md section 1].
- Please tell me which you meant: 2 to 3 **nodes**, or 2 to 3 **accounts** (and whose). See the question at the end.

---

## Part 2. Can I plug in Oracle, Vercel and other services? Yes, with one design rule

### 2.1 What each service is good for

A worker node must be an **always-on machine** that holds a slice of the model in RAM and keeps a TCP connection open to the master. That rules out many popular "free" platforms.

| Platform | Can it be a worker? | Role in CPUwiser | Evidence |
|---|---|---|---|
| **Oracle Always Free VMs** | **Yes (best free option)** | Master and workers | 2 Arm OCPU / 12 GB total plus 2 micro VMs; allowance halved on 2026-06-15 [S]; idle reclaim and capacity limits [V/S] |
| **Your own machines** (laptop, desktop, old PC, Raspberry Pi) | **Yes (best overall)** | Master or workers over WireGuard/Tailscale | No quota; real RAM; only your electricity and upload speed |
| **Docker on your laptop** | **Yes** | Simulation of any node count | Free |
| **Google Cloud e2-micro (Always Free)** | **Barely** | Tiny helper or jump host at most | One shared-core e2-micro, free only in Oregon, Iowa, South Carolina, and only 1 GB per month of outbound data from North America [S]; the cluster sends far more than that (see arithmetic below), and the RAM is about 1 GB [E] |
| **AWS Free Plan, Azure free services** | **Short experiments only** | Burst tests while credits last | AWS: 6-month plan with credits; Azure: 12-month VM allowance and a 30-day $200 credit [S]; a card is required for both |
| **Render free** | **No** | Possibly the chat frontend only | Free web services spin down after 15 minutes idle; 512 MB RAM; no SSH [S] |
| **Koyeb, Railway, Back4App, SnapDeploy, Fly.io** | **No** for workers | Not recommended | Tiny CPU/RAM (for example 0.1 vCPU / 512 MB on Koyeb), sleep or credit limits, Fly.io has no free tier since 2024 [S] |
| **Vercel** | **No for workers; yes for a web front-end** | Hosts the chat page and a thin proxy to the master | Vercel runs short-lived serverless functions and cannot hold model shards in RAM or keep worker sockets open [E, general platform design]; Hobby plan is non-commercial [S from earlier research, re-check terms] |
| **Cloudflare Workers/Pages** | **No for workers; yes for static front-end** | Same as Vercel | Same reasoning [E] |

Arithmetic for the GCP egress point [E]: one 512-token prompt moves about 16 KiB x 512 = 8 MiB per boundary during prefill, and each generated token about 16 KiB, so 200 generated tokens add about 3 MiB; a few hundred answers per month already pass 1 GB of outbound traffic. (Figures assume a 4096-wide model; smaller models send less.)

**Bottom line:** the only free services that can really act as nodes are Oracle VMs and machines you own. Vercel and similar platforms plug in at the **edge** (front-end and proxy), not as compute nodes.

### 2.2 The design rule: the lab talks to "node access" and "provider", never to a vendor

DESIGN.md profiles already say how to reach a node (`access.type`: `docker` or `ssh`). Extend profiles with a `provider` tag and treat every machine the same once it is reachable by SSH (or Docker) on a private or overlay address.

**Provider kinds**

| Kind | Meaning | Examples |
|---|---|---|
| `docker-local` | Containers on this computer | Laptop simulation |
| `ssh-host` | Any machine reachable by SSH on a private/overlay address | Oracle VM, GCP VM, home PC, Raspberry Pi, a friend's node |
| `edge` | Not a node; hosts the front-end/proxy | Vercel, Cloudflare Pages, Render |

**Profile additions (shape only)**

```yaml
nodes:
  - {id: n1, role: coordinator, provider: oracle, access: {type: ssh, user: ubuntu, key_ref: oracle_lab}, address: 10.0.0.11, ...}
  - {id: n2, role: worker, provider: home-pc, access: {type: ssh, user: me, key_ref: home}, address: 100.64.0.5, ...}   # overlay address
  - {id: n3, role: worker, provider: friend-oracle, access: {type: ssh, user: ubuntu, key_ref: friend1}, address: 100.64.0.9, ...}
edge:
  - {provider: vercel, role: frontend, upstream: https://<your-demo-host>}
```

- `provider` is a free-text label used for reporting and for per-provider notes (cost, limits); the runner does not need vendor APIs.
- **Never** treat `provider` as a reason to open public ports. Cross-provider traffic goes through the overlay (WireGuard or Tailscale) only.
- Per-provider notes live in `docs/providers/<name>.md` (limits, signup steps, gotchas), one file each.

**Optional provisioning plugins (later, not v1)**

Interface (conceptual): `list_nodes()`, `create_node(spec)`, `destroy_node(id)`, `describe_limits()`. v1 ships only `manual` (you create machines and paste addresses) and `docker`. An `oracle` plugin using Oracle's CLI could be added later; it must refuse any non-Always-Free shape (CLAUDE.md rule 3) and require approval before creating anything.

### 2.3 Overlay network (the glue between providers)
- Use WireGuard (self-managed) or Tailscale (easiest) so that nodes on different providers share private addresses [S for Tailscale free personal tier, check current terms].
- Workers bind **only** to the overlay or private address. Public firewall: allow only the overlay UDP port and SSH from your IP.
- Mixed-provider clusters are WAN clusters: expect per-hop RTT of tens of milliseconds [E], which experiments A3/B4 will price in tokens per second.

### 2.4 Where Vercel fits
```
Browser -> Vercel (static chat page + thin /api proxy, API key kept server-side)
        -> HTTPS -> master's demo endpoint (rate-limited, key required)
        -> private RPC -> workers
```
- Vercel serverless functions have execution time limits; streaming long answers may need the streaming/edge options [U, check current limits on the plan you use].
- Keep the master's demo port reachable only from what you allow (for example by an access token and rate limit); do not expose `llama-server` or workers.
- This is the same pattern as your other chatbot projects, so you can reuse that front-end work.

---

## Part 3. New tasks to append to TASKS.md (copy the rows in)

| ID | Task | Depends | Effort | Status |
|---|---|---|---|---|
| T-090 | Add `provider` and `edge` fields to the profile schema and validation (unknown provider allowed as free text; `edge` nodes cannot hold the worker role) | T-030 | S | todo |
| T-091 | Generic `ssh-host` access layer used by every real node (no vendor APIs); tests with a mock SSH target | T-022 | M | todo |
| T-092 | `docs/providers/` notes for oracle, home-pc, friend-node, gcp-micro (limits, setup, gotchas); each fact tagged | T-040 | M | todo |
| T-093 | Overlay setup guide and script for WireGuard/Tailscale; test worker bind address stays on the overlay | T-085 | M | todo |
| T-094 | Vercel front-end proxy example for the chat demo (key kept server-side) | T-053 | M | todo |
| T-095 | Optional: `oracle` provisioning plugin (list/create/destroy) restricted to Always Free shapes, approval required | T-091 | L | todo |

## Part 4. Sources read on 2026-11-11 (third-party, [S])
- [5 Best Free VPS Tiers in 2026](https://www.mrplanb.com/datacenter/free-vps-tiers): Oracle, Google Cloud, Azure, AWS, Render free-tier details; Oracle Arm allowance halved on 2026-06-15.
- [7 Free Docker Hosting Platforms Tested (March 2026)](https://snapdeploy.dev/blog/free-docker-hosting-2026-platforms-compared): Render, Railway, Fly.io, Koyeb, Cloud Run, Back4App limits.
- Oracle Free Tier FAQ (oracle.com): one free account per person; idle accounts may be deemed abandoned.
- distributed-llama README (github.com/b4rtaz/distributed-llama): supported models and limits.

These pages change often; re-check a platform's current terms before relying on it.
