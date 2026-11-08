export function runtimeOptions(config, env = process.env) {
  const host = env.HOST || "127.0.0.1";
  const port = Number(env.PORT || config.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error("PORT must be an integer between 1 and 65535");
  if (!["127.0.0.1", "localhost", "::1"].includes(host) && !env.PUBLIC_ORIGIN)
    throw Error("Set PUBLIC_ORIGIN before listening outside loopback");
  return { host, port };
}

export function listen(service) {
  const { host, port } = runtimeOptions(service.config);
  const server = service.app.listen(port, host, () =>
    console.log(`${service.config.name} listening on ${host}:${port}`),
  );
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    const deadline = setTimeout(() => process.exit(1), 10000);
    deadline.unref();
    server.close(() => {
      clearTimeout(deadline);
      service.db.close();
      process.exit(0);
    });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  return server;
}
