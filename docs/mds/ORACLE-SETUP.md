# ORACLE-SETUP.md: creating Oracle Cloud nodes, step by step (and the multi-account question)

Date: 2026-11-11
Tags: [V] verified from Oracle's own FAQ/docs on this date, [S] third-party or commonly reported, [E] estimate, [U] check in the console. This is a new companion file; INFRA.md section 3 stays as the short runbook. **Oracle's console wording changes, so follow what you see and stop if a price appears.**

---

## 1. The multiple-accounts question (read first)

Oracle's Free Tier FAQ states that each person may have only one Free Trial or Always Free account, and that "creating or attempting to create multiple free accounts is prohibited" [V, oracle.com Free Tier FAQ]. So I will not give steps for making several accounts yourself to collect more free VMs: it breaks the terms, risks all your accounts being terminated, and the VMs vanish with them.

**Legitimate ways to get more nodes:**

| Option | Nodes | Notes |
|---|---|---|
| One account (yours) | up to 2 Arm A1 (2 OCPU / 12 GB total) + 2 AMD micro [V] | The base lab |
| Friends or family create **their own** accounts and **they** run a node for you | +2 A1 VMs per consenting person | Each person owns their account and their own risk and cost; you get access only to a node they configure; never share their login |
| Your laptop and other machines you own | any | Hybrid profile (WireGuard) |
| Docker simulation | any N | For node-count experiments (A4) |
| Other providers' free tiers | varies | Check each provider's terms; not covered here |

Cross-account nodes cannot share a private VCN network. They talk over the internet, so use an encrypted overlay (WireGuard or Tailscale) and the `hybrid-wan` profile; worker ports stay bound to the overlay address only. Expect real WAN latency (tens of ms [E]), which the lab's experiments A3 and B4 will show is costly per token.

## 2. Before you start (checklist)

- [ ] Valid email, phone, and a credit or debit card for identity verification (card details are used for setup and verification [V]); a small temporary authorization may appear [S].
- [ ] Decide the **home region** (cannot be changed, and Always Free resources work only there [V]). Pick one near you; Toronto (ca-toronto-1) is a candidate, but Arm capacity there is unknown [U].
- [ ] A dedicated SSH key pair for the lab.
- [ ] Read the Always Free resources page in the console before creating anything.

## 3. Create the account (one time, by you)

1. Go to oracle.com/cloud/free and choose to start for free.
2. Enter name, email, country, verify email, set the cloud account name, choose the **home region**.
3. Add the verification card; complete the identity check.
4. Wait for the account to be provisioned (minutes to hours [S]).
5. Sign in to the console. Check the **Free trial credits banner**: trial accounts get a time-limited credit period plus Always Free resources [S]; read what applies to your account.
6. **Idle accounts:** accounts left idle 30 days or more may be deemed abandoned and suspended or terminated [V], so log in and use the account regularly.
7. **Trial end / upgrade warning:** if you have more A1 resources than Always Free allows when the trial ends, all existing A1 instances are disabled and deleted after 30 days [V]. Stay within 2 OCPU / 12 GB total from the first day.
8. Do **not** upgrade to Pay As You Go unless you deliberately choose to; with a paid upgrade, anything beyond Always Free is billed.

## 4. Safety setup (before creating VMs)

1. Create a **compartment** `cpuwiser` (Identity > Compartments).
2. Create a **budget** with an alert at a very small amount (Billing > Budgets) so you hear about any charge [U: console minimum].
3. Optionally create a second admin user with MFA; enable MFA on your own login.
4. Generate the SSH key on your laptop (do this once; keep the private key out of the repo):
   - Use an ed25519 key with a lab-specific filename and a passphrase.
   - Upload only the **public** key when creating VMs.

## 5. Create the network (VCN)

1. Networking > Virtual Cloud Networks > **Start VCN Wizard** (VCN with internet connectivity), compartment `cpuwiser`, name `cpuwiser-vcn`, CIDR e.g. `10.0.0.0/16`.
2. The wizard creates a public subnet (e.g. `10.0.0.0/24`), an internet gateway, route table and default security list.
3. Edit the security list of the subnet:
   - **Ingress:** TCP 22 from **your current public IP/32 only**; all TCP/UDP from the subnet CIDR (`10.0.0.0/24`) between lab VMs (or only ports 50052 and 9999 plus ICMP and iperf3 5201 for tests).
   - Remove any rule allowing `0.0.0.0/0` except what you intentionally keep (none for lab ports).
   - **Egress:** allow all (for updates).
4. If your home IP changes, update the SSH rule (or use a tunnel/Tailscale instead of public SSH).

## 6. Create the VMs

### 6.1 Cluster mode (profile `oracle-2xa1`): two small Arm VMs
For each of `node1` (master) and `node2` (worker):
1. Compute > Instances > **Create instance**, compartment `cpuwiser`.
2. Name: `cpuwiser-node1`, `cpuwiser-node2`.
3. Placement: leave the default availability domain (if "out of capacity" appears, see section 8).
4. Image: **Canonical Ubuntu 22.04 or 24.04 (aarch64)** [E choice; any current Ubuntu LTS Arm image].
5. Shape: Change shape > **Ampere** > **VM.Standard.A1.Flex**, **1 OCPU, 6 GB** memory. Confirm the **Always Free-eligible** label is shown next to the shape [V that Oracle labels eligible shapes; verify in the console].
6. Networking: select `cpuwiser-vcn` and the public subnet; **assign a public IPv4** (needed for SSH and package downloads).
7. SSH keys: paste your **public** key.
8. Boot volume: keep the default (about 47-50 GB); do not enlarge beyond the Always Free storage total (200 GB total across volumes [V, re-check]).
9. Create. Note the **private IP** (e.g. `10.0.0.x`) and public IP. Put real IPs only in `profiles/local/`, never in git.

### 6.2 Control mode (for experiment B3): one 2 OCPU / 12 GB VM
Cluster mode and control mode share the same 2 OCPU / 12 GB allowance, so **delete the two small VMs first**, then create one `VM.Standard.A1.Flex` with 2 OCPU and 12 GB. Do not run both at once.

### 6.3 Optional: AMD micro VMs (mixed profile)
Shape `VM.Standard.E2.1.Micro` (1/8 OCPU, 1 GB), Always Free-eligible, up to 2 [V]. Too small for the model itself; useful as tiny extra workers or a jump host. Experiment B6 tests this.

## 7. First login and hardening (each VM)

1. SSH in: `ssh -i <your-private-key> ubuntu@<public-ip>`.
2. Update packages and enable unattended security updates.
3. Disable SSH password login and root login (`PasswordAuthentication no`, `PermitRootLogin no`).
4. **Host firewall (important on Oracle Ubuntu images):** these images ship with default iptables rules that can block traffic even when the VCN allows it [S]. Add explicit allows for the subnet CIDR on ports 50052 (and 9999), 5201 for iperf3, ICMP; persist the rules (for example with `netfilter-persistent`). Keep default-deny for everything else.
5. Create the service user `cpuwiser` (no sudo).
6. Install `iperf3 htop sysstat chrony git build-essential cmake`.
7. Verify connectivity **between** the VMs with ping and a TCP connect to the worker port once the worker runs.
8. Install the engine and units per INFRA.md sections 3.6 and 3.7 (task T-043).

## 8. If "Out of host capacity" appears (common for Arm) [S]
- Retry at different times; try each availability domain in your region if several exist.
- Try creating the smaller shape first (1 OCPU / 6 GB), as it is easier to place than 2 OCPU / 12 GB [S].
- Do **not** hammer the API with fast loops. If you want an automated retry script (OCI CLI with a long delay between attempts), ask first; the task list requires approval before automating (CLAUDE.md rule 9).
- Meanwhile, continue on the Docker lab (M0 to M3).

## 9. Keep the account healthy
- Log in at least every few weeks (idle account rule above [V]).
- The soak test (B7) keeps the VMs genuinely busy; avoid fake load scripts [E].
- Check Billing > Cost Analysis weekly; expect $0.
- Tag all resources `project=cpuwiser`.
- Keep scripts so a lost VM is rebuilt in under an hour (T-042).
- Copy `results/` off the VMs regularly.

## 10. If friends or family run extra nodes (the legitimate multi-person setup)
1. Each person creates their **own** account and VMs following sections 2 to 7 (you may share this file).
2. Each node joins a WireGuard or Tailscale overlay; you receive only that node's **overlay address** (never their console login, keys or billing details).
3. Their firewall allows the worker port only from your master's overlay address.
4. Agree in writing what it is for (hobby experiment), how long it runs, and how to stop it.
5. Write a profile with the real measured RTT (`source: measured`) and use experiment B4/B5 methods.
6. Warn them: model weights are streamed to their VM at load, and the RPC worker has no authentication [V], so the overlay is the only protection.

## 11. Mapping to the task list
- T-040: sections 2 to 4 (manual).
- T-041: sections 5 and 6 (manual + approval).
- T-042: section 7 (bootstrap script).
- T-043: INFRA.md 3.6 and 3.7.
- T-044: B1 network baseline.
- T-085: WireGuard hybrid (also section 10).

## 12. Quick reference: what to write down (keep outside git)

| Item | Where to store |
|---|---|
| Home region, tenancy name | Password manager |
| Compartment name | `profiles/local/` |
| VM private and public IPs | `profiles/local/` |
| SSH key path | Local config (`key_ref`) |
| Budget alert email | Console only |
