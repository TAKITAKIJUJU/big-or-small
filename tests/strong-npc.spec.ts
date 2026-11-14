import { test, expect, type Page } from "@playwright/test";

async function setup(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("usotuki.v1", JSON.stringify({ version: 1, settings: {
      difficulty: "hard", speed: "skip", quality: "low", reduced: true, muted: true,
      volume: 0, allIn: false, reveal: true, tutorialSeen: true,
    }, session: null }));
    const ActualWorker = window.Worker;
    window.Worker = class extends ActualWorker {
      postMessage(message: unknown, options?: StructuredSerializeOptions | Transferable[]) {
        const target = window as typeof window & { botRequests?: unknown[]; botResponses?: unknown[] };
        target.botRequests ??= [];
        target.botRequests.push(structuredClone(message));
        this.addEventListener("message", event => {
          target.botResponses ??= [];
          target.botResponses.push(structuredClone(event.data));
        }, { once: true });
        Reflect.apply(ActualWorker.prototype.postMessage, this, [message, options]);
      }
    };
  });
}
async function start(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "対戦をはじめる" }).click();
  await page.getByRole("button", { name: "カード8を選択", exact: true }).click();
  await page.getByRole("button", { name: /の札を伏せる/ }).click();
  const check = page.getByRole("button", { name: /^チェック/ });
  await expect(check).toBeVisible();
  await check.click();
}
test("上級は実際のWorkerで計算し、人間の伏せ札を送らずに応答する", async ({ page }) => {
  await setup(page);
  let workers = 0;
  page.on("worker", () => workers++);
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await start(page);
  await expect.poll(() => page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("usotuki.v1")!);
    return s.session?.botDecisions?.filter((d: {kind: string}) => d.kind === "bet").length ?? 0;
  })).toBeGreaterThan(0);
  const request = await page.evaluate(() => (window as typeof window & {botRequests: {view: Record<string, unknown>}[]}).botRequests[0]);
  expect(workers).toBeGreaterThan(0);
  const response = await page.evaluate(() => (window as typeof window & {botResponses: {decision: unknown}[]}).botResponses[0]);
  expect(response.decision).toBeTruthy();
  expect(request.view.viewer).toBe("bot");
  expect(request.view).not.toHaveProperty("selected");
  expect(request.view).not.toHaveProperty("hands");
  expect(request.view.revealed).toEqual({ human: null, bot: null });
  expect(request.view).not.toHaveProperty("humanCard");
  expect(errors).toEqual([]);
});

test("Workerを起動できない環境でも上級が合法な応答で続行する", async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => {
    window.Worker = class { constructor() { throw new Error("Worker unavailable in test"); } } as unknown as typeof Worker;
  });
  await start(page);
  await expect.poll(() => page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("usotuki.v1")!);
    return s.session?.botDecisions?.some((d: {kind: string}) => d.kind === "bet");
  })).toBe(true);
  await expect(page.locator(".toast")).toHaveCount(0);
});

test("上級の計算中に再戦しても、前の試合の返答が混ざらない", async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => {
    const ActualWorker = window.Worker;
    window.Worker = class extends ActualWorker {
      postMessage(message: unknown, options?: StructuredSerializeOptions | Transferable[]) {
        (window as typeof window & { workerStarted: boolean }).workerStarted = true;
        setTimeout(() => Reflect.apply(ActualWorker.prototype.postMessage, this, [message, options]), 3000);
      }
    };
  });
  await start(page);
  await expect.poll(() => page.evaluate(() => (window as typeof window & {workerStarted: boolean}).workerStarted)).toBe(true);
  await page.getByRole("button", { name: "ホームへ戻る" }).click();
  await page.getByRole("button", { name: "新しい対戦", exact: false }).click();
  await page.getByRole("button", { name: "新しい対戦を始める", exact: true }).click();
  await expect(page.getByRole("group", { name: "あなたの手札" }).getByRole("button")).toHaveCount(13);
  await page.waitForTimeout(3500);
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem("usotuki.v1")!).session);
  expect(session.entries).toHaveLength(2);
  expect(session.entries[0].command.type).toBe("draw");
  expect(session.entries[1].command.type).toBe("select");
  expect(session.botDecisions).toHaveLength(1);
});
