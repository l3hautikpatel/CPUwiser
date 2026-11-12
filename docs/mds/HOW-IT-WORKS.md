# HOW-IT-WORKS.md: how the nodes talk to each other and how you use the LLM

Date: 2026-11-11
Tags: [V] verified from official source, [E] estimate, [U] unknown. This is a new companion file; it does not replace PLAN.md or DESIGN.md.

---

## 1. Short answer

Yes: **you only ever talk to the master (coordinator) node.** Workers are never contacted by you or by your app. The master receives your prompt, sends intermediate math to the workers, gets results back, and streams the answer to you.

```
 You / your app / chat demo
          |  HTTP (OpenAI-style: /v1/chat/completions)   <- the ONLY door
          v
 +-------------------------+
 | MASTER (coordinator)    |  llama-server  (or dllama-api)
 | - tokenizer, sampling   |
 | - runs its own layers   |  (optional: 0 layers if coordinator_computes=false)
 +-----+-------------+-----+
       | RPC/TCP     | RPC/TCP      <- private network only, never public
       v             v
 +-----------+  +-----------+
 | WORKER 1  |  | WORKER 2  |   ggml-rpc-server (or dllama worker)
 | layers    |  | layers    |   holds its share of weights + KV cache in RAM
 +-----------+  +-----------+
```

## 2. What happens when you send one prompt (llama.cpp RPC, pipeline split)

1. **Request in:** your client calls the master's HTTP endpoint with the chat messages.
2. **Tokenize:** the master turns text into token IDs and looks up embeddings.
3. **Prefill (reading the prompt):** the master runs its own layers, then sends the hidden-state tensors to worker 1; worker 1 runs its layers and passes onward to worker 2, and the final result returns to the master. This happens in big batches, so it is mostly bandwidth-bound [E].
4. **Decode (writing the answer), one token at a time:** for every new token the activation goes through every node in order and back to the master, which samples the next token. Each token costs at least one network round trip per remote node, so latency dominates (the "k" measured in experiment A3) [E].
5. **Stream out:** each token is sent to you as soon as it is sampled (Server-Sent Events).
6. **Weights:** at model load the master reads the GGUF file and sends each worker its share over the network [V]; workers keep it in RAM. The KV cache for each layer lives on the node that owns that layer [V: default split covers weights and KV cache by memory share].

Only a small tensor (about 16 KiB per token per boundary for a 4096-wide model [E]) crosses the network during decode. The heavy weights never move after load.

## 3. Who listens where (ports and exposure)

| Process | Runs on | Listens on | Reachable by |
|---|---|---|---|
| `llama-server` (master API) | master | `127.0.0.1:8080` (default plan) | The demo on the same machine, or you through an SSH tunnel |
| Chat demo (FastAPI) | master (or laptop) | one chosen port, with API key | You (and anyone you allow) |
| `ggml-rpc-server` (worker) | each worker | private IP, port 50052 | **Master only** (firewall rule) |
| `dllama worker` (second engine) | each worker | private IP, port 9999 | **Master only** |

Rule: worker ports are never public (RPC has no authentication and is described as a fragile proof of concept [V]).

## 4. How you use the LLM day to day

### 4.1 Start order
1. Start workers (they wait for the master).
2. Start the master `llama-server` (it connects to the workers at startup and loads the model).
3. Check `GET /health` on the master or run `cpuwiser doctor`.

### 4.2 Three ways to talk to it

| Way | When | How (conceptual) |
|---|---|---|
| **A. Chat demo UI** (milestone M5) | Normal use | Open the demo page, type, see streamed answer plus live tokens/s |
| **B. HTTP API** | From your own apps/portfolio | `POST /v1/chat` on the demo (with your API key); the demo forwards to the master. Format in DESIGN.md section 11.2 |
| **C. Direct to master (debug/bench)** | Testing | `llama-server` exposes an OpenAI-style endpoint on the master; use it through an SSH tunnel: forward local port 8080 to the master's loopback 8080, then send requests to `http://127.0.0.1:8080` from your laptop [V that llama-server provides an OpenAI-compatible API; confirm path with `--help`/docs on the pinned version] |

### 4.3 Using it from your other projects
- Point your app at the **demo's** endpoint (not at `llama-server`), because the demo adds the API key, rate limit, queue and timeouts.
- Expect **one request at a time** and slow answers: this is a lab cluster, not a production backend. For real chat support in your portfolio sites, keep a hosted API as the main path and treat CPUwiser as an experiment [E; see RESEARCH.md section 2.6].
- Never put the master or worker addresses in front-end code that runs in a browser.

## 5. What each profile changes

| Profile | Where the master is | How you reach it |
|---|---|---|
| `sim-*` (Docker) | container `coord` | `localhost` port published only for the demo |
| `oracle-2xa1` | VM 1 | SSH tunnel or the demo port opened to your IP only |
| `hybrid-wan` | your laptop | local, because the laptop is the master; workers are reached over WireGuard |

## 6. Failure behaviour you should expect [E until A7 runs]
- A worker dies: the master's current request fails or hangs; restart the worker and then the master (units restart automatically; see INFRA.md 3.7).
- Master restarts: the model is reloaded and weights are re-sent to workers (minutes for 8B on slow links).
- Slow link: answers still work but tokens arrive slowly; TTFT grows with prompt length.

## 7. Common questions
- **Can I connect to a worker directly?** No, and you should not; it only speaks the internal protocol.
- **Do all nodes need the model file?** In llama.cpp RPC, the master needs it; workers receive their share at load [V].
- **Can the master be my laptop?** Yes (profile `hybrid-wan`), at the price of WAN latency per token.
- **How many users at once?** One generation at a time; others queue.
