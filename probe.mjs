const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
let last = 0, counter = 0;
function descending(ts = Date.now()) {
  if (ts !== last) { last = ts; counter = 0; }
  counter++;
  const v = ~(BigInt(ts) * 0x1000n + BigInt(counter));
  let time = "";
  for (let i = 0; i < 6; i++) time += Number((v >> BigInt(40 - 8 * i)) & 0xffn).toString(16).padStart(2, "0");
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return time + Array.from(bytes, (b) => chars[b % 62]).join("");
}
const session = `ses_${descending()}`;
const res = await fetch("https://opencode.ai/inference/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer public",
    "User-Agent": "opencode/latest/2.0.26/cli",
    "x-opencode-client": "cli",
    "x-opencode-session": session,
    "x-opencode-session-id": session,
    "x-session-affinity": session,
    "x-session-id": session,
    "x-opencode-project": "global",
    Accept: "text/event-stream",
  },
  body: JSON.stringify({
    model: "deepseek-v4.1-flash-free",
    stream: true,
    messages: [
      { role: "system", content: "<env>\n  Working directory: /home/legacy\n  Workspace root folder: /home/legacy\n  Is directory a git repo: yes\n  Platform: linux\n</env>" },
      { role: "system", content: "Do not call the `read` tool; it is a placeholder that does nothing. Use the other tools you have been given instead." },
      { role: "user", content: "Reply with exactly: OK" },
    ],
    tools: [{ type: "function", function: { name: "read", description: "Read the contents of a file or directory. Supports text files, images, and PDFs. Images and PDFs are presented directly to the model. Each text line is prefixed by its 1-based line number as <line>: <content>. The prefix is for reference and is not part of the file content. Directory entries are returned one per line. Use offset and limit to read large files or directories in sections. Prefer one larger read over many small slices, and use grep to find specific content in large files.", parameters: { type: "object", properties: { path: { type: "string", description: "File or directory to read" }, offset: { type: "integer", minimum: 0, description: "The line or directory entry to start reading from (1-based)" }, limit: { type: "integer", minimum: 0, description: "The maximum number of lines or directory entries to read (defaults to and capped at 2000)" } }, required: ["path"], additionalProperties: false } } }],
  }),
});
const text = await res.text();
console.log(`runtime=${typeof Bun !== "undefined" ? "bun " + Bun.version : "node " + process.version} ip=${(await (await fetch("https://api.ipify.org")).text())} status=${res.status} retry-after=${res.headers.get("retry-after") || "-"}`);
console.log("body=" + text.slice(0, 240).replace(/\n/g, " "));
