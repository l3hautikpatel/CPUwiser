# CLOUD-SELECTIONS.md: exactly what to select on Oracle and AWS, and what you can change later

Date: 2026-11-11
Tags: [V] verified on the vendor's own page on this date, [S] third-party page, [E] my judgment or arithmetic, [U] unknown, verify in the console. Console wording changes: if a screen differs, follow the intent and stop if a price appears. This file is new; it extends ORACLE-SETUP.md and does not replace it.

---

## 1. What "2 or 3 nodes in the free tier" really means

| Source of nodes | Free? | What you get | Limit |
|---|---|---|---|
| **Oracle Always Free: Arm A1** | Always free [V] | In total **2 OCPU and 12 GB**: either **one** VM with 2 OCPU/12 GB, or **up to two** VMs (for example 1 OCPU each) [V] | Cannot exceed the total across all A1 VMs |
| **Oracle Always Free: AMD micro** | Always free [V] | Up to **2** VMs, each 1/8 OCPU, 1 GB, 50 Mbps max internet bandwidth [V] | Too small to hold model layers; helper or jump host only [E] |
| **Oracle storage** | Always free [V] | **200 GB total** boot + block volumes [V] | Each VM's boot volume counts (47 to 50 GB minimum) [V] |
| **AWS Free Plan (new accounts since 2025-07-15)** | **Time- and credit-limited, not always free** [V] | $100 sign-up credit plus up to $100 more for tasks; lasts **6 months or until credits are used**, whichever comes first [V] | Eligible EC2 types: `t3.micro`, `t3.small`, `t4g.micro`, `t4g.small`, `c7i-flex.large`, `m7i-flex.large` [V]; AMI must be marked Free tier eligible; EBS types `standard`, `st1`, `sc1`, `gp2`, `gp3` [V] |
| **Your laptop** | Yours | Any real node you own | Upload speed and uptime |

### 1.1 Practical node sets (pick one; you can change later)

| Set | Nodes | Network | Use |
|---|---|---|---|
| **S1 (recommended start)** | 2 Oracle A1 VMs (1 OCPU / 6 GB each) | Same Oracle private subnet, low latency | The honest free cluster; experiments B1 to B3 |
| **S2** | S1 + your laptop as master (hybrid) | WAN over WireGuard/Tailscale | B4/B5; realistic latency |
| **S3** | S1 + 1 AWS node (for example `m7i-flex.large`) | Cross-provider WAN over overlay | Third real node for a limited time (credits) |
| **S4** | 2 A1 + 2 micro VMs | Oracle private subnet | Tests weak-node handling (B6); micro nodes hold ~no layers |

Important: AWS credits are **spent** by a running instance, so an AWS node is a **temporary guest** for experiments, not a permanent cluster member [E]. Rough arithmetic, with the hourly price an **unverified assumption [U: check the EC2 pricing page]**: if an `m7i-flex.large` cost about $0.08 per hour, $100 would last about 1,250 hours, around 52 days of continuous running (100 / 0.08 = 1250 h). Stop the instance when not running experiments.

---

## 2. Oracle: the exact selections for the 2-node cluster (S1)

Create **two instances, one after the other**, with identical settings except the name. Use the compartment `cpuwiser` and the VCN from ORACLE-SETUP.md section 5.

| Console field | Select / enter | Why |
|---|---|---|
| Name | `cpuwiser-node1` (master), `cpuwiser-node2` (worker) | Clear roles |
| Compartment | `cpuwiser` | Keeps lab resources together |
| Availability domain | Same for both, if you have a choice | Lowest latency [E]. If capacity fails, see GUARDRAILS.md scenario G1 |
| Fault domain | Leave "no preference" | Not needed |
| Image | **Canonical Ubuntu 24.04 (or 22.04), Arm64 / aarch64** (standard, not Minimal) | Tools available; matches Arm shape [E] |
| Shape series | **Ampere** | Arm |
| Shape | **VM.Standard.A1.Flex** | The Always Free Arm shape [V] |
| Number of OCPUs | **1** | Two VMs x 1 = the 2 OCPU total [V] |
| Amount of memory | **6 GB** | Two VMs x 6 = the 12 GB total [V] |
| Look for the label | **"Always Free-eligible"** next to the shape; if no label or any price appears, stop | CLAUDE.md rule 3 |
| Network: VCN / subnet | `cpuwiser-vcn`, the public subnet | Reach SSH and updates |
| Public IPv4 address | **Assign** | Needed for SSH and package downloads (restrict in the security list) |
| Add SSH keys | **Paste public key** (your lab key) | Never upload private keys |
| Boot volume size | **Default (about 47 to 50 GB)** [V] | Two boot volumes ≈ 100 GB of the 200 GB total [V] |
| Boot volume encryption / extras | Defaults | Not needed |
| Cloud-init / advanced | Leave empty | Bootstrap script does setup |
| Any "paid" notice | If a cost line appears, **do not click Create** | Always Free only |

Check afterwards: the **total of OCPUs across all A1 VMs is 2** and **memory 12 GB** [V]. If you must change memory split (for example 4 GB / 8 GB for an imbalance test, experiment A8), keep the totals.

### 2.1 Alternative Oracle layouts

| Layout | Selections | When |
|---|---|---|
| **One big VM (control, for B3)** | A1.Flex, **2 OCPU, 12 GB** | Single-node control; delete the two small VMs first |
| **2 A1 + 2 micro (S4)** | A1: 1 OCPU/6 GB ×2; micro: shape `VM.Standard.E2.1.Micro`, **Always Free-eligible**, 1/8 OCPU / 1 GB [V] | Weak-node tests; micro VMs can only be created in one availability domain in multi-AD regions [V] |
| **Uneven split** | e.g. 1 OCPU/4 GB + 1 OCPU/8 GB | Tests split tuning (A8) |

### 2.2 If you ever see "two instances with 1 OCPU each"
That is the Oracle wording for exactly this layout: "up to two instances with 1 OCPU each" [V]. It is the option to pick for "2 nodes".

---

## 3. Oracle account hygiene (one account only)
- Use only **your one** account; do not create more (ORACLE-SETUP.md section 1).
- Check usage regularly: idle instances can be reclaimed when, over 7 days, CPU p95, network and (for A1) memory are all below 20% [V]. The lab's regular experiments count as real use.
- Boot volumes count against the 200 GB; deleting an instance does not always delete its volume, so check Block Storage afterwards [V that boot volumes count; console behaviour U].

---

## 4. AWS: the exact selections for one guest node (S3)

Do this only when you want the third node. Use the AWS **Free Plan**; confirm the console says free plan accounts will not be charged beyond credits [S] and watch the credit balance.

### 4.1 Before launching
1. **Secure the account**: root user MFA on, create an admin IAM user with MFA, stop using root [S].
2. **Budget alert**: Billing > Budgets, a small zero-spend or low-dollar budget [U: exact options differ].
3. Region: choose **one region and stay in it**. Closest to Toronto is Canada Central (Montreal) `ca-central-1` [E; confirm it is enabled for your account].
4. Verify which instance types are eligible, either in the console (Free tier eligible label) or with the CLI check from AWS's page [V]:
   `aws ec2 describe-instance-types --filters Name=free-tier-eligible,Values=true --query "InstanceTypes[*].[InstanceType]" --output text`

### 4.2 Launch instance: field by field

| Console field | Select | Why |
|---|---|---|
| Name | `cpuwiser-aws1` | Clear |
| AMI | **Ubuntu Server 24.04 LTS** with the **Free tier eligible** label [V that AMIs must be eligible] | Same OS family as Oracle nodes |
| Architecture | **64-bit (x86)** for `m7i-flex.large` or `c7i-flex.large`; **64-bit (Arm)** for `t4g.*` [E] | Matches instance family |
| Instance type | **`m7i-flex.large`** (eligible [V]; about 2 vCPU / 8 GiB [E from AWS specs, verify in console]) | Most RAM among eligible types, useful for a larger share of the model |
| Alternatives | `c7i-flex.large` (about 4 GiB [E]); `t4g.small` (Arm, about 2 GiB [E], too small for 8B); `t3.micro` (1 GiB, too small) | Capacity vs cost |
| Key pair | Create/import a **separate lab key** (ed25519) | No reuse of personal keys |
| Network | Default VPC and public subnet are fine for a lab | Simple |
| Auto-assign public IP | Enable (needed for SSH and the VPN handshake) | Note that AWS charges for public IPv4 addresses [S, U: check whether credits cover it] |
| Security group | **Inbound: SSH (22) from "My IP" only; UDP 51820 (WireGuard) from your Oracle node's public IP/32 only. Nothing else.** | Never open the worker port 50052 publicly |
| Storage | **gp3, 30 GB** (an eligible EBS type [V]) | Engine + OS; the model lives on the master |
| Advanced details | Defaults; no spot, no hibernation | Simplicity |
| Review | Confirm a "free plan"/credit note and no unexpected cost lines | Guardrail |

### 4.3 After launch
1. SSH in with the lab key; run the same bootstrap as for Oracle nodes (NODE-ROLES-AND-APPS.md section 4), building the engine for **x86_64**.
2. Bring up the overlay (WireGuard or Tailscale) and use only overlay addresses in the profile.
3. Run as a **worker** (`ggml-rpc-server` bound to the overlay IP).
4. **Stop the instance** (do not terminate) when idle to save credits; EBS storage still uses credits while stopped [E].
5. Before the 6 months end or credits finish, export results and terminate the instance and its volume [V on the time limit].

### 4.4 Expectations (honest)
- AWS node and Oracle nodes are in different networks: expect **tens of ms RTT** [E, measure with B1-style tests]. Per the cost model in RESEARCH.md section 2.7, every extra WAN hop costs tokens per second; the cluster may be **slower** than the two-Oracle cluster. That is a valid, valuable result.
- Mixed architecture (Arm + x86) is unverified [U] until B6.

---

## 5. Where each setting is stored (so the CLI can use it)

Create `profiles/local/<name>.yaml` (git-ignored) with:
- `provider: oracle` or `provider: aws`, node `address` = **private (Oracle VCN) or overlay address**, `arch`, `cores`, `ram_gb`.
- `access`: user and `key_ref` name only.
Never store keys, OCIDs, account IDs or public IPs in git (CLAUDE.md rule 2).

## 6. Can I change these settings later?

| Setting | Can change later? | How / note |
|---|---|---|
| Oracle A1 OCPU and memory of an existing VM | **Yes, in place, with a reboot** [S: Oracle docs "Changing the Shape of an Instance"; verify on Flex shapes in the console, a community thread reports some limits [U]] | Keep total within 2 OCPU / 12 GB; the engine plan must be re-run (profile numbers change) |
| Oracle image / OS | **No in place**; recreate the VM | Scripts rebuild it quickly |
| Oracle boot volume size | **Increase yes, shrink no** [E, standard cloud behaviour; verify] | Counts toward 200 GB [V] |
| Oracle home region | **No** [S] | Decide carefully; yours is already set |
| Number of nodes (2 vs 1 big VM) | Yes: delete and recreate | Two ways to use the same allowance |
| Node role (master/worker) | **Yes, anytime**: change which service runs; edit the profile | Software only |
| Engine, model, quantization, split, threads | **Yes, anytime**: they are plan/config | `cpuwiser plan` regenerates |
| AWS instance type | Stop the instance, change type, start (within eligible types) [E, standard EC2 behaviour; verify] | Credits keep ticking |
| AWS region | No: create a new instance in the other region | Data and keys are per region |
| Provider mix | Yes: edit profile `provider` and addresses | No code change by design (PLATFORMS-AND-DECISIONS.md) |

## 7. Pre-flight checklist before you click Create (either cloud)
- [ ] I know the exact shape/instance type and its free-eligibility label.
- [ ] Totals stay inside the free allowance (Oracle: 2 OCPU/12 GB, 200 GB storage).
- [ ] Security rules: SSH from my IP only; worker ports private/overlay only.
- [ ] Budget alert exists.
- [ ] SSH public key ready; private key stays out of the repo.
- [ ] I have the rebuild scripts or know that T-042 is next.
