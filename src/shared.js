import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
const $ = (s) => document.querySelector(s);
export { $, Y };
export const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function notice(s) {
  $("#notice").textContent = s;
}
export async function api(path, data) {
  const r = await fetch("/api" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: "Bearer " + session.token } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const body = await r.json();
  if (!r.ok) throw Error(body.error || "Request failed");
  return body;
}
let session = null,
  doc = null,
  provider = null,
  dirty = false,
  version = 0,
  busy = false,
  online = true,
  renderProject = null;
const key = "workspaces:" + location.port;
function saved() {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}
function remember(s) {
  localStorage.setItem(
    key,
    JSON.stringify([s, ...saved().filter((x) => x.id !== s.id)].slice(0, 30)),
  );
}
export const context = () => ({ session, doc, online });
export function bindText(el, text) {
  let remote = false;
  const refresh = () => {
    if (el.value === text.toString()) return;
    remote = true;
    const a = el.selectionStart,
      b = el.selectionEnd;
    el.value = text.toString();
    el.setSelectionRange(
      Math.min(a, el.value.length),
      Math.min(b, el.value.length),
    );
    remote = false;
  };
  text.observe(refresh);
  refresh();
  el.addEventListener("input", () => {
    if (remote) return;
    const old = text.toString(),
      value = el.value;
    let left = 0;
    while (
      left < old.length &&
      left < value.length &&
      old[left] === value[left]
    )
      left++;
    let right = 0;
    while (
      right < old.length - left &&
      right < value.length - left &&
      old[old.length - 1 - right] === value[value.length - 1 - right]
    )
      right++;
    text.doc.transact(() => {
      text.delete(left, old.length - left - right);
      text.insert(left, value.slice(left, value.length - right));
    });
  });
}
function b64(bytes) {
  let s = "";
  for (const n of bytes) s += String.fromCharCode(n);
  return btoa(s);
}
export const decode = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function sync() {
  if (!session || !doc || busy || !navigator.onLine) return;
  busy = true;
  const generation = version;
  try {
    const path = "/rooms/" + session.id;
    const data = dirty
      ? await api(path + "/sync", { state: b64(Y.encodeStateAsUpdate(doc)) })
      : await api(path);
    if (data.state) Y.applyUpdate(doc, decode(data.state), "remote");
    if (generation === version) dirty = false;
    online = true;
    $("#sync").textContent = dirty ? "Saving…" : "All changes synced";
    $("#network").textContent = "● Online";
  } catch (e) {
    online = false;
    $("#sync").textContent = "Saved on this device • sync pending";
    $("#network").textContent = "○ Offline / unavailable";
    if (!/fetch|network/i.test(e.message)) notice(e.message);
  } finally {
    busy = false;
  }
}
async function open() {
  const parts = new URLSearchParams(location.hash.slice(1));
  const id = parts.get("room"),
    token = parts.get("key");
  if (!id || !token) return;
  session = {
    id,
    token,
    name: saved().find((s) => s.id === id)?.name || "Shared workspace",
  };
  try {
    const data = await api("/rooms/" + id);
    session.name = data.name;
  } catch (e) {
    notice("Working from local storage. " + e.message);
  }
  remember(session);
  $("#landing").hidden = true;
  $("#workspace").hidden = false;
  $("#workspace-name").textContent = session.name;
  doc = new Y.Doc();
  provider = new IndexeddbPersistence(id + ":" + token.slice(0, 12), doc);
  await provider.whenSynced;
  doc.on("update", (_, origin) => {
    if (origin !== "remote") {
      dirty = true;
      version++;
      $("#sync").textContent = "Saving…";
    }
  });
  dirty = true;
  await sync();
  renderProject();
}
export async function boot(render) {
  renderProject = render;
  $("#create").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const s = await api("/rooms", { name: $("#name").value });
      remember(s);
      location.hash = new URLSearchParams({
        room: s.id,
        key: s.token,
      }).toString();
      location.reload();
    } catch (e) {
      notice(e.message);
    }
  };
  $("#recent").innerHTML = saved()
    .map(
      (s) =>
        `<a class="recent-link" href="#${new URLSearchParams({ room: s.id, key: s.token })}">${escape(s.name)}</a>`,
    )
    .join("");
  $("#recent").onclick = () => setTimeout(() => location.reload(), 0);
  $("#home").onclick = () => {
    location.hash = "";
    location.reload();
  };
  $("#invite").onclick = async () => {
    if (!session) return notice("Create or open a workspace first.");
    try {
      await navigator.clipboard.writeText(location.href);
      notice("Invite copied. Anyone with this link can edit this workspace.");
    } catch {
      notice("Copy the address bar link to invite a collaborator.");
    }
  };
  $("#rotate").onclick = async () => {
    if (!session) return notice("Open a workspace first.");
    if (
      !confirm(
        "Replace the invite? Existing invite links will stop working. Current members will need the new link.",
      )
    )
      return;
    try {
      const result = await api("/rooms/" + session.id + "/rotate", {});
      session.token = result.token;
      remember(session);
      location.hash = new URLSearchParams({
        room: session.id,
        key: session.token,
      }).toString();
      notice("Invite replaced. Copy and share the new link.");
    } catch (e) {
      notice(e.message);
    }
  };
  $("#export").onclick = () => {
    if (!doc) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            name: session.name,
            exported: new Date().toISOString(),
            data: doc.toJSON(),
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "workspace-export.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  window.addEventListener("online", sync);
  window.addEventListener("offline", () => {
    $("#network").textContent = "○ Offline";
    $("#sync").textContent = "Offline • changes stay on this device";
  });
  setInterval(sync, 1500);
  await open();
}
