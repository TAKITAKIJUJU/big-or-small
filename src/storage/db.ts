import { derive, type Match } from "../domain/game";
let connection: Promise<IDBDatabase> | null = null;
export function database() {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("この環境では端末内保存を利用できません"));
      return;
    }
    const request = indexedDB.open("usotuki-handkerchief", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("matches", { keyPath: "id" });
      request.result.createObjectStore("settings");
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => {
      connection = null;
      reject(new Error("端末内保存を開けませんでした"));
    };
    request.onblocked = () => {
      connection = null;
      reject(new Error("別のタブを閉じて保存を再試行してください"));
    };
  });
  return connection;
}
export async function allMatches(): Promise<Match[]> {
  const db = await database();
  const rows = await new Promise<Match[]>((resolve, reject) => {
    const r = db.transaction("matches").objectStore("matches").getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  for (const row of rows) derive(row);
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}
export async function saveMatch(match: Match, expectedRevision?: number) {
  derive(match);
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("matches", "readwrite"),
      store = tx.objectStore("matches"),
      read = store.get(match.id);
    let conflict = false;
    read.onsuccess = () => {
      const previous = read.result as Match | undefined;
      if (
        previous &&
        (previous.revision > match.revision ||
          (expectedRevision !== undefined &&
            previous.revision !== expectedRevision))
      ) {
        conflict = true;
        tx.abort();
      } else store.put(match);
    };
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () =>
      reject(
        new Error(
          conflict
            ? "別のタブで試合が更新されています。再読込して確認してください"
            : "保存できませんでした。JSONを書き出して記録を保管してください",
        ),
      );
  });
}
export async function removeMatch(id: string) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("matches", "readwrite");
    tx.objectStore("matches").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function readSettings(): Promise<unknown> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const r = db
      .transaction("settings")
      .objectStore("settings")
      .get("preferences");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function writeSettings(value: unknown) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("settings", "readwrite");
    tx.objectStore("settings").put(value, "preferences");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export function download(
  name: string,
  text: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportJSON(matches: Match[]) {
  return JSON.stringify(
    { format: "usotuki-handkerchief-export", version: 1, matches },
    null,
    2,
  );
}
export function exportCSV(matches: Match[]) {
  const quote = (value: unknown) => {
    const text = String(value);
    return (
      '"' +
      (/^[=+@\-\t\r]/.test(text) ? "'" : "") +
      text.replaceAll('"', '""') +
      '"'
    );
  };
  const rows: unknown[][] = [
    [
      "match",
      "A",
      "B",
      "turn",
      "startedAt",
      "dropper",
      "checker",
      "dropMs",
      "checkMs",
      "reason",
      "addedMs",
      "penaltyMs",
      "consumedThisTurnMs",
      "A_current",
      "A_consumed",
      "A_penalty",
      "A_total",
      "B_current",
      "B_consumed",
      "B_penalty",
      "B_total",
    ],
  ];
  for (const m of matches)
    for (const t of derive(m).turns)
      rows.push([
        m.id,
        m.names.A,
        m.names.B,
        t.number,
        new Date(t.startedAt).toISOString(),
        t.dropper,
        t.checker,
        t.dropElapsedMs ?? "",
        t.checkElapsedMs ?? "",
        t.reason,
        t.addedMs,
        t.penaltyMs,
        t.consumedThisTurnMs,
        ...(["A", "B"] as const).flatMap((p) => [
          t.after[p].currentAccumulatedMs,
          t.after[p].consumedMs,
          t.after[p].penaltyLifetimeMs,
          t.after[p].consumedMs + t.after[p].currentAccumulatedMs,
        ]),
      ]);
  return "\ufeff" + rows.map((row) => row.map(quote).join(",")).join("\r\n");
}
