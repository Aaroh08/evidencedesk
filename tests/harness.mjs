import { application } from "../src/server.mjs";
async function harness(fn) {
  const service = application({ file: ":memory:" });
  const server = service.app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const root = "http://127.0.0.1:" + server.address().port;
  const call = async (path, data, token, extra = {}) => {
    const r = await fetch(root + "/api" + path, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...extra,
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    return { status: r.status, body: await r.json() };
  };
  try {
    await fn(call);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    service.db.close();
  }
}
export { harness };
