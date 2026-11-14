import { comebackFixture } from "./fixtures";
import { test, expect, type Page } from "@playwright/test";
const settings = {
  difficulty: "easy",
  speed: "skip",
  quality: "low",
  reduced: true,
  muted: true,
  volume: 0,
  allIn: false,
  reveal: true,
  tutorialSeen: true,
};
async function setup(page: Page, extra = {}) {
  await page.addInitScript(
    (s) => {
      if (!localStorage.getItem("usotuki.v1"))
        localStorage.setItem(
          "usotuki.v1",
          JSON.stringify({ version: 1, settings: s, session: null }),
        );
    },
    { ...settings, ...extra },
  );
}
async function start(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "対戦をはじめる" }).click();
  await expect(page.getByRole("group", { name: "あなたの手札" })).toBeVisible();
}
async function select(page: Page) {
  await page
    .getByRole("group", { name: "あなたの手札" })
    .getByRole("button")
    .first()
    .click();
  await page.getByRole("button", { name: /の札を伏せる/ }).click();
}
async function finishRound(page: Page) {
  for (let i = 0; i < 12; i++) {
    const next = page.getByRole("button", {
      name: /次のラウンド|対戦の結果へ/,
    });
    if (await next.isVisible()) {
      await next.click();
      await page.waitForTimeout(220);
      return;
    }
    const call = page.getByRole("button", { name: /^コール/ });
    const check = page.getByRole("button", { name: /^チェック/ });
    if (await call.isVisible()) await call.click();
    else if (await check.isVisible()) await check.click();
    await page.waitForTimeout(230);
  }
  throw new Error("ラウンドが終了しません");
}
test("3D描画と全幅のホーム・選札・設定、横溢れがない", async ({ page }) => {
  await setup(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [320, 360, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
    if (width !== 320) await page.evaluate(() => localStorage.clear());
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "USOTUKI" })).toBeVisible();
    await expect(page.locator("canvas")).toBeVisible();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `test-results/home-${width}.png` });
    await page.getByRole("button", { name: "対戦をはじめる" }).click();
    await expect(
      page.getByRole("group", { name: "あなたの手札" }).getByRole("button"),
    ).toHaveCount(13);
    await expect(
      page.getByRole("button", { name: "カード13を選択" }),
    ).toBeAttached();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "カード7を選択" }).click();
    await expect(
      page.getByRole("button", { name: /7 の札を伏せる/ }),
    ).toBeEnabled();
    await page.screenshot({ path: `test-results/select-${width}.png` });
    await page.getByRole("button", { name: "設定", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "閉じる", exact: true }).click();
  }
  expect(errors).toEqual([]);
});
test("実操作で13ラウンド完走し履歴・再戦", async ({ page }) => {
  await setup(page, { tutorialSeen: false });
  await page.addInitScript(() =>
    Object.defineProperty(crypto, "getRandomValues", {
      value: (array: Uint32Array) => {
        array.fill(0);
        return array;
      },
    }),
  );
  await start(page);
  for (let round = 1; round <= 13; round++) {
    await expect(
      page.getByRole("group", { name: "あなたの手札" }),
    ).toBeVisible();
    await select(page);
    await finishRound(page);
  }
  await expect(page.locator(".final-result")).toContainText("13ラウンド終了");
  await page.screenshot({ path: "test-results/result.png" });
  await page.getByRole("button", { name: "対戦を振り返る" }).click();
  await expect(page.locator(".history-row")).toHaveCount(13);
  await expect(
    page.getByRole("region", { name: "NPCの判断記録" }),
  ).toBeVisible();
  await page.getByText("第1回の狙い", { exact: true }).click();
  await expect(page.locator(".npc-analysis")).toContainText("札選び");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: "もう一度対戦する" }).click();
  await expect(
    page.getByRole("group", { name: "あなたの手札" }).getByRole("button"),
  ).toHaveCount(13);
});
test("保存・再読込で再開、ルールとダイアログ中の停止", async ({ page }) => {
  await setup(page, { speed: "normal" });
  await start(page);
  await select(page);
  await page.getByRole("button", { name: "設定", exact: true }).click();
  const before = await page.locator(".mode-badge").textContent();
  await page.waitForTimeout(1600);
  await expect(page.locator(".mode-badge")).toHaveText(before!);
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "対戦を再開" }).click();
  await expect(page.locator(".round-counter")).toContainText("01");
  await expect(
    page.getByRole("group", { name: "あなたの手札" }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "ルールを読む" }).click();
  await expect(page.getByRole("dialog")).toContainText("フォールド");
});
test("WebGLが使えなくても選札から勝負できる", async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type.startsWith("webgl")) return null;
      return original.apply(this, [type, ...args] as Parameters<
        typeof original
      >);
    } as typeof original;
  });
  await start(page);
  await expect(page.locator(".fallback-table")).toBeVisible();
  await select(page);
  await finishRound(page);
  await expect(page.getByRole("group", { name: "あなたの手札" })).toBeVisible();
});
test("フォールドしたNPCの札をDOM履歴へ漏らさない", async ({ page }) => {
  await page.addInitScript(
    (s) => localStorage.setItem("usotuki.v1", JSON.stringify(s)),
    {
      version: 1,
      settings,
      session: {
        allIn: false,
        entries: [
          { command: { type: "select", player: "bot", card: 12 } },
          { command: { type: "select", player: "human", card: 1 } },
          { command: { type: "draw" }, roll: 0.8 },
          {
            command: {
              type: "act",
              player: "human",
              action: { type: "check" },
            },
          },
          {
            command: {
              type: "act",
              player: "bot",
              action: { type: "bet", total: 8 },
            },
          },
        ],
      },
    },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "対戦を再開" }).click();
  await page.getByRole("button", { name: /^降りる/ }).click();
  await expect(page.locator(".round-result")).toContainText("フォールドで決着");
  await page.getByRole("button", { name: "対戦履歴" }).click();
  await expect(page.locator(".history-row")).toContainText("非公開");
  await expect(page.locator(".history-row")).not.toContainText("12");
});

test("3Dの札を直接タップして選べる", async ({ page }) => {
  await setup(page);
  await start(page);
  await expect(page.locator("canvas")).toBeVisible();
  await page.waitForTimeout(900);
  await page.mouse.click(195, 499);
  await expect(
    page.getByRole("button", { name: /7 の札を伏せる/ }),
  ).toBeEnabled();
});
test("短い画面でも確定ボタンが画面内、破損保存から開始できる", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("usotuki.v1", "{broken"));
  for (const height of [568, 640]) {
    await page.setViewportSize({ width: 320, height });
    await page.goto("/");
    await expect(page.getByRole("status")).toContainText(
      "保存データを読み込めません",
    );
    await page.getByRole("button", { name: "対戦をはじめる" }).click();
    const rect = await page
      .getByRole("button", { name: "一枚、選んでください" })
      .boundingBox();
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(height);
    await expect(page.locator(".scene-loading")).toHaveCount(0);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `test-results/short-${height}.png` });
  }
});

test("対戦中のホームから実践チュートリアルを始め直せる", async ({ page }) => {
  await setup(page);
  await start(page);
  await page.getByRole("button", { name: "ホームへ戻る" }).click();
  await page
    .getByRole("button", { name: "実践チュートリアル", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "新しい対戦を始める", exact: true })
    .click();
  await expect(page.locator(".tutorial")).toContainText("数字を選んで");
});

test("縦画面の構成をPCでも維持し、不要な世界観を表示しない", async ({
  page,
}) => {
  await setup(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const size = await page.locator(".app").boundingBox();
  expect(size!.width).toBeLessThanOrEqual(480);
  expect(size!.height).toBeGreaterThan(size!.width);
  await expect(page.locator(".app")).not.toContainText(
    /番人|十三夜|運命|KEEPER|READ THE SILENCE/,
  );
  await page.getByRole("button", { name: "対戦をはじめる" }).click();
  await expect(page.locator(".scoreboard")).toContainText("NPC");
  await page.getByRole("button", { name: "カード7を選択" }).click();
  await expect(
    page.getByRole("button", { name: /7 の札を伏せる/ }),
  ).toBeEnabled();
});
test("スマホ横向きでは縦向きの案内を出し、戻すと再開できる", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await setup(page);
  await start(page);
  await page.getByRole("button", { name: "カード9を選択" }).click();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(
    page.getByRole("heading", { name: "縦向きにしてください" }),
  ).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute("inert", "");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "縦向きにしてください" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: /9 の札を伏せる/ }),
  ).toBeEnabled();
  await context.close();
});

test("参加料が2から4へ増え、次の参加料を確定前に読める", async ({ page }) => {
  await setup(page);
  await page.addInitScript(() =>
    Object.defineProperty(crypto, "getRandomValues", {
      value: (array: Uint32Array) => {
        array.fill(0);
        return array;
      },
    }),
  );
  await start(page);
  await expect(page.locator(".ante-status")).toContainText("参加料 2");
  await expect(page.locator(".ante-status")).toContainText("次 4");
  await select(page);
  await finishRound(page);
  await expect(page.locator(".ante-status")).toContainText("参加料 4");
  await expect(page.locator(".pot")).toContainText("8");
});
test("公開された合法ログから終盤の一勝で逆転する", async ({ page }) => {
  const { session } = comebackFixture();
  await page.addInitScript(
    (s) => localStorage.setItem("usotuki.v1", JSON.stringify(s)),
    { version: 1, settings, session },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "対戦を再開" }).click();
  await expect(page.locator(".ante-status")).toContainText("参加料 40");
  await page.getByRole("button", { name: /^コール/ }).click();
  await expect(page.locator(".comeback-label")).toHaveText("この勝負で逆転");
  await expect(page.locator(".scoreboard")).toContainText("320");
  await expect(page.locator(".scoreboard")).toContainText("280");
  await page.screenshot({ path: "test-results/comeback.png" });
});
test("最大額は選択だけで、賭ける前に勝敗時の増減が読める", async ({ page }) => {
  await setup(page);
  await start(page);
  await select(page);
  await expect(
    page.getByRole("group", { name: "ベット額の候補" }),
  ).toBeVisible();
  const before = await page.locator(".scoreboard").textContent();
  await page.getByRole("button", { name: /^最大/ }).click();
  await expect(page.locator(".stake-risk")).toContainText(
    "勝ち +22 / 負け −22",
  );
  await expect(page.locator(".scoreboard")).toHaveText(before!);
  await page.screenshot({ path: "test-results/stakes-bet.png" });
});

test("全額勝負で0になったら実際の終了ラウンドで結果を出す", async ({
  page,
}) => {
  const { session } = comebackFixture();
  for (const entry of session.entries.slice(-4)) {
    if (entry.command.type === "select")
      entry.command.card = entry.command.player === "human" ? 10 : 13;
  }
  await page.addInitScript(
    (s) => localStorage.setItem("usotuki.v1", JSON.stringify(s)),
    { version: 1, settings, session },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "対戦を再開" }).click();
  await page.getByRole("button", { name: /^コール/ }).click();
  await expect(
    page.getByRole("button", { name: "対戦の結果へ" }),
  ).toBeVisible();
  await page.waitForTimeout(190);
  await page.getByRole("button", { name: "対戦の結果へ" }).click();
  await expect(page.locator(".final-result")).toContainText("10ラウンド終了");
  await expect(page.locator(".round-counter strong")).toContainText("10");
  await expect(page.locator(".ante-status")).not.toContainText("次");
});

test("対戦中はNPCの判断記録を履歴へ出さない", async ({ page }) => {
  await setup(page);
  await start(page);
  await page.getByRole("button", { name: "対戦履歴" }).click();
  await expect(page.locator(".npc-analysis")).toHaveCount(0);
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
});
test("終了後の判断記録は保存・再開でき、開示設定に従う", async ({ page }) => {
  const fixture = comebackFixture();
  for (const entry of fixture.session.entries.slice(-4))
    if (entry.command.type === "select")
      entry.command.card = entry.command.player === "human" ? 10 : 13;
  fixture.session.botDecisions = [
    { round: 10, kind: "card", reason: "use-now" },
    { round: 10, kind: "bet", reason: "value-after-bluff" },
  ];
  await page.addInitScript(
    (s) => {
      if (!localStorage.getItem("usotuki.v1"))
        localStorage.setItem("usotuki.v1", JSON.stringify(s));
    },
    {
      version: 1,
      settings: { ...settings, reveal: false },
      session: fixture.session,
    },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "対戦を再開" }).click();
  await page.getByRole("button", { name: /^コール/ }).click();
  await page.waitForTimeout(190);
  await page.getByRole("button", { name: "対戦の結果へ" }).click();
  await page.getByRole("button", { name: "対戦を振り返る" }).click();
  await expect(page.locator(".npc-analysis")).toHaveCount(0);
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.getByLabel("試合終了後に全カードを開示").check();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: "対戦を振り返る" }).click();
  await expect(page.locator(".npc-analysis")).toBeVisible();
  await page.getByText("第10回の狙い", { exact: true }).click();
  await expect(page.locator(".npc-analysis")).toContainText("今度は強い札");
  await page.screenshot({ path: "test-results/npc-review.png" });
  await page.reload();
  await page.getByRole("button", { name: "前の対戦を振り返る" }).click();
  await expect(page.locator(".npc-analysis")).toBeVisible();
  await page.getByText("第10回の狙い", { exact: true }).click();
  await expect(page.locator(".npc-analysis")).toContainText("今度は強い札");
});
