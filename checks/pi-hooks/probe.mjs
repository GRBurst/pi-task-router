// pi-hooks probe (plan LF1.T0, X33, X45): one file, two roles.
// As pi's extension (`pi -e probe.mjs`): before_provider_request holds the
// request HOLD_MS, then returns the payload with `x_probe: 1`, recording when
// it started and whether ctx.signal is an AbortSignal; after_provider_response
// records the status and the quota fixture header. Lines go to $PROBE_OUT.
// As a program (`node probe.mjs serve <port file>`): a fake provider on
// localhost answering both transports with one streamed "ok"; it records each
// request's arrival time and body in $SERVER_OUT.
import { appendFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const HOLD_MS = 300;
const HEADER = "anthropic-ratelimit-unified-5h-utilization";
const record = (file, line) => appendFileSync(file, JSON.stringify(line) + "\n");

export default function probe(pi) {
  pi.on("before_provider_request", async (event, ctx) => {
    const started = Date.now();
    const signal = ctx.signal instanceof AbortSignal;
    await new Promise((r) => setTimeout(r, HOLD_MS));
    record(process.env.PROBE_OUT, { ev: "before", started, signal });
    return { ...event.payload, x_probe: 1 };
  });
  pi.on("after_provider_response", (event) => {
    record(process.env.PROBE_OUT, { ev: "after", status: event.status, header: event.headers[HEADER] ?? null });
  });
}

const sse = (events) => events.map(([e, d]) => (e ? `event: ${e}\n` : "") + `data: ${typeof d === "string" ? d : JSON.stringify(d)}\n\n`).join("");
const OPENAI = sse([
  [null, { id: "c", object: "chat.completion.chunk", created: 0, model: "m", choices: [{ index: 0, delta: { role: "assistant", content: "ok" }, finish_reason: null }] }],
  [null, { id: "c", object: "chat.completion.chunk", created: 0, model: "m", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }],
  [null, "[DONE]"],
]);
const ANTHROPIC = sse([
  ["message_start", { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "m", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } }],
  ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
  ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } }],
  ["content_block_stop", { type: "content_block_stop", index: 0 }],
  ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } }],
  ["message_stop", { type: "message_stop" }],
]);

if (process.argv[2] === "serve" && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createServer((req, res) => {
    const at = Date.now();
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let json = null;
      try { json = JSON.parse(body); } catch {}
      record(process.env.SERVER_OUT, { at, url: req.url, body: json });
      const anthropic = req.url.includes("/messages");
      res.writeHead(200, { "content-type": "text/event-stream", [HEADER]: "0.42" });
      res.end(anthropic ? ANTHROPIC : OPENAI);
    });
  });
  server.listen(0, "localhost", () => writeFileSync(process.argv[3], String(server.address().port)));
}
