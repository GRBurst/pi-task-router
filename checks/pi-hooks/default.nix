# pi 1.4's provider hooks on both transports local-first relies on (plan
# LF1.T0, X33, X45; spec §2.5): `pi -p` offline against a fake provider on
# localhost (./probe.mjs serve), once on openai-completions (the llama
# transport, a models.json provider) and once on anthropic-messages (the
# built-in provider, its base URL overridden), with the probe extension
# (./probe.mjs). Per transport: (i) the request reaches the server ≥ 300 ms
# after before_provider_request started (pi awaits the hook), (ii) its body
# has the hook's `x_probe: 1` (the returned payload is sent), (iii)
# after_provider_response saw the status and the quota header, (iv) ctx.signal
# is an AbortSignal inside the hook. A verification check: the router has no
# code here; a failure means a plan fact is wrong (R16). Every transport runs;
# every miss is reported.
{pkgs}:
pkgs.runCommand "pi-hooks" {nativeBuildInputs = [pkgs.pi-coding-agent pkgs.nodejs pkgs.jq pkgs.coreutils];} ''
  export HOME=$PWD/home PI_CODING_AGENT_DIR=$PWD/home/.pi/agent PI_OFFLINE=1
  export PROBE_OUT=$PWD/probe.jsonl SERVER_OUT=$PWD/server.jsonl
  mkdir -p "$PI_CODING_AGENT_DIR"
  misses=0
  miss() {
    echo "pi-hooks: $*" >&2
    misses=$((misses + 1))
  }
  node ${./probe.mjs} serve port & server=$!
  trap 'kill $server 2>/dev/null || true' EXIT
  for _ in $(seq 100); do [ -s port ] && break; sleep 0.1; done
  [ -s port ] || { echo "pi-hooks: the fake provider did not start" >&2; exit 1; }
  port=$(cat port)
  cat >"$PI_CODING_AGENT_DIR/models.json" <<JSON
  {"providers": {
    "probe-openai": {"baseUrl": "http://localhost:$port/v1", "api": "openai-completions", "apiKey": "k", "models": [{"id": "m"}]},
    "anthropic": {"baseUrl": "http://localhost:$port", "apiKey": "k"}
  }}
  JSON
  check() {
    local transport=$1 model=$2
    : >probe.jsonl
    : >server.jsonl
    if ! timeout 120 pi -p x --no-session -e ${./probe.mjs} --model "$model" </dev/null >run.all 2>&1; then
      miss "$transport: pi -p failed: $(cat run.all)"
      return
    fi
    before=$(jq -c 'select(.ev == "before")' probe.jsonl | head -1)
    after=$(jq -c 'select(.ev == "after")' probe.jsonl | head -1)
    request=$(jq -c '{at, url, x_probe: .body.x_probe}' server.jsonl | head -1)
    echo "pi-hooks: $transport: before $before, after $after, request $request"
    if [ -z "$before" ] || [ -z "$after" ] || [ -z "$request" ]; then
      miss "$transport: a hook or the request is missing"
      return
    fi
    jq -e --argjson b "$before" '.at - $b.started >= 300' <<<"$request" >/dev/null \
      || miss "$transport: (i) the request did not wait for the hook"
    jq -e '.x_probe == 1' <<<"$request" >/dev/null || miss "$transport: (ii) the hook's payload was not sent"
    jq -e '.status == 200 and .header == "0.42"' <<<"$after" >/dev/null \
      || miss "$transport: (iii) after_provider_response missed the status or the header"
    jq -e '.signal == true' <<<"$before" >/dev/null || miss "$transport: (iv) ctx.signal is not an AbortSignal"
  }
  check openai-completions probe-openai/m
  check anthropic-messages anthropic/claude-sonnet-4-5
  [ "$misses" = 0 ] || exit 1
  touch $out
''
