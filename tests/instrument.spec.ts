import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
async function prepare(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /新しい試合/, exact: false }).click();
  await page.getByLabel("プレイヤーAの名前").fill("葵");
  await page.getByLabel("プレイヤーBの名前").fill("蓮");
  await page
    .getByRole("button", { name: "準備を終える →", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /カウント開始/ }),
  ).toBeEnabled();
}
async function start(page: Page) {
  await page
    .getByRole("button", { name: /カウント開始|次のターンを開始/ })
    .click();
  await expect(page.getByRole("button", { name: /CHECK/ })).toBeVisible();
}
async function fakeClock(page: Page) {
  await page.clock.install({ time: new Date("2026-11-15T08:08:00Z") });
  await page.clock.pauseAt(new Date("2026-11-15T08:08:45Z"));
}

test("12.40→19.80は7.40秒、連打防止・役割交代・保存と履歴", async ({
  page,
}) => {
  await fakeClock(page);
  await prepare(page);
  await start(page);
  await expect(
    page.getByRole("button", { name: "設定", exact: true }),
  ).toBeDisabled();
  await page.clock.fastForward(12400);
  await page.getByRole("button", { name: /DROP/ }).click();
  await expect(page.getByRole("button", { name: /DROP/ })).toBeDisabled();
  await page.clock.fastForward(7400);
  await page.getByRole("button", { name: /CHECK/ }).click();
  await expect(page.locator(".last-result")).toContainText("7.40");
  await expect(
    page.locator(".score-card").nth(1).locator(".score-total"),
  ).toContainText("7.40");
  await expect(page.locator(".role-band")).toContainText("D 蓮");
  await page.clock.fastForward(100000);
  await expect(
    page.getByRole("button", { name: /次のターンを開始/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "全履歴・推移", exact: true }).click();
  await expect(page.locator(".log-row")).toHaveCount(1);
  await page.locator(".log-row summary").click();
  await expect(page.locator(".turn-detail")).toContainText(
    "19800 − 12400 = 7400",
  );
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON書き出し", exact: true }).click();
  const file = await downloaded;
  const json = JSON.parse(readFileSync((await file.path())!, "utf8"));
  expect(
    json.matches[0].events.filter((e: { kind: string }) => e.kind === "turn"),
  ).toHaveLength(1);
  await page.reload();
  await page.getByRole("button", { name: /試合の続き/ }).click();
  await expect(
    page.locator(".score-card").nth(1).locator(".score-total"),
  ).toContainText("7.40");
  await page.screenshot({
    path: "test-results/instrument-result.png",
    fullPage: true,
  });
});

test("先チェックと未落下時間切れで300秒、結果・訂正の監査・過去試合", async ({
  page,
}) => {
  await fakeClock(page);
  await prepare(page);
  for (let i = 0; i < 5; i++) {
    await start(page);
    if (i % 2 === 0) await page.getByRole("button", { name: /CHECK/ }).click();
    else await page.clock.fastForward(60000);
    await expect(page.locator(".last-result")).toBeVisible();
  }
  await expect(page.locator(".winner")).toContainText("葵 の勝利");
  await expect(
    page.locator(".score-card").nth(1).locator(".score-total"),
  ).toContainText("300.00");
  await page
    .getByRole("button", { name: "直前ターンを無効化・再プレイ" })
    .click();
  await page.getByLabel("訂正理由").fill("両者合意：誤タップ");
  await page.getByLabel("両者で無効化に合意しました").check();
  await page
    .getByRole("button", { name: "無効化してやり直す", exact: true })
    .click();
  await expect(page.locator(".winner")).toHaveCount(0);
  await expect(
    page.locator(".score-card").nth(1).locator(".score-total"),
  ).toContainText("240.00");
  await page.getByRole("button", { name: "全履歴・推移", exact: true }).click();
  await page.locator(".audit summary").click();
  await expect(page.locator(".audit")).toContainText("両者合意：誤タップ");
  await expect(page.locator(".log-row")).toHaveCount(4);
  await page.getByRole("button", { name: "戻る", exact: true }).click();
  await page.getByRole("button", { name: "ホーム", exact: true }).click();
  await page.getByRole("button", { name: /過去の試合/ }).click();
  await expect(page.locator(".archive-row")).toHaveCount(1);
});

test("計測中のリロードは中断、偽のペナルティや消化を作らない", async ({
  page,
}) => {
  await fakeClock(page);
  await prepare(page);
  await start(page);
  await page.clock.fastForward(5000);
  await page.getByRole("button", { name: /DROP/ }).click();
  await expect(page.locator(".save-status")).toContainText("保存済み");
  page.on("dialog", (d) => d.accept());
  await page.reload();
  await page.getByRole("button", { name: /試合の続き/ }).click();
  await expect(
    page.getByText(
      "中断したターンは無効です。役割・累計を変えずにやり直します。",
    ),
  ).toBeVisible();
  await expect(page.locator(".last-result")).toHaveCount(0);
  await expect(page.locator(".score-total").nth(0)).toContainText("0.00");
  await expect(page.locator(".score-total").nth(1)).toContainText("0.00");
});

test("画面非表示は無効化、復帰後に時間切れを追加しない", async ({ page }) => {
  await fakeClock(page);
  await prepare(page);
  await start(page);
  await page.clock.fastForward(1000);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.fastForward(70000);
  await expect(page.locator(".last-result")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /カウント開始/ }),
  ).toBeVisible();
  await expect(page.locator(".score-total").nth(0)).toContainText("0.00");
});

test("320〜430px・左手でも記録ボタンが見切れず、旧ゲームの表示がない", async ({
  page,
}) => {
  await prepare(page);
  for (const width of [320, 360, 390, 430]) {
    const height = width === 320 ? 568 : width === 360 ? 640 : 844;
    await page.setViewportSize({ width, height });
    await page.getByRole("button", { name: "設定", exact: true }).click();
    await page.getByRole("button", { name: "左手", exact: true }).click();
    await page.getByRole("button", { name: "戻る", exact: true }).click();
    await page.getByRole("button", { name: /試合の続き/ }).click();
    await start(page);
    const drop = page.getByRole("button", { name: /DROP/ }),
      check = page.getByRole("button", { name: /CHECK/ });
    const db = await drop.boundingBox(),
      cb = await check.boundingBox();
    expect(db!.width).toBeGreaterThan(110);
    expect(cb!.height).toBeGreaterThan(90);
    expect(cb!.x).toBeLessThan(db!.x);
    expect(db!.x + db!.width).toBeLessThanOrEqual(width);
    expect(cb!.y + cb!.height).toBeLessThanOrEqual(height);
    await page.screenshot({ path: `test-results/running-${width}.png` });
    await check.click();
  }
  expect(await page.locator("canvas").count()).toBe(0);
  await expect(page.locator("body")).not.toContainText("BIG or SMALL");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("PWAキャッシュ後は通信遮断でも起動・記録・時報設定・履歴が使える", async ({
  page,
  context,
}) => {
  await fakeClock(page);
  await prepare(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("button", { name: /試合の続き/ }).click();
  await start(page);
  await page.getByRole("button", { name: /CHECK/ }).click();
  await expect(page.locator(".last-result")).toContainText(
    "C 落下前にチェック",
  );
  await page.getByRole("button", { name: "全履歴・推移", exact: true }).click();
  await expect(page.locator(".log-row")).toHaveCount(1);
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.getByRole("button", { name: "時報を試聴", exact: true }).click();
  await expect(
    page.getByText("オフライン準備完了", { exact: true }),
  ).toBeVisible();
});

test("音声がブロックされても計時・判定は進む", async ({ page }) => {
  await page.addInitScript(() => {
    window.AudioContext = class {
      constructor() {
        throw new Error("blocked in test");
      }
    } as unknown as typeof AudioContext;
    HTMLMediaElement.prototype.play = () =>
      Promise.reject(new Error("blocked in test"));
  });
  await fakeClock(page);
  await prepare(page);
  await start(page);
  await page.getByRole("button", { name: /CHECK/ }).click();
  await expect(page.locator(".last-result")).toContainText("60.00");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await expect(page.locator(".footnote")).toContainText(
    "このブラウザが音声再生を許可していません",
  );
});

test("削除には確認が必要で、新しい試合を作っても過去記録を上書きしない", async ({
  page,
}) => {
  await prepare(page);
  await page.getByRole("button", { name: "ホーム", exact: true }).click();
  await page.getByRole("button", { name: /新しい試合/, exact: false }).click();
  await page.getByLabel("プレイヤーAの名前").fill("新規A");
  await page
    .getByRole("button", { name: "準備を終える →", exact: true })
    .click();
  await page.getByRole("button", { name: "ホーム", exact: true }).click();
  await page.getByRole("button", { name: /過去の試合/ }).click();
  await expect(page.locator(".archive-row")).toHaveCount(2);
  await page.locator(".archive-row").first().click();
  await page
    .getByRole("button", { name: "この試合を削除", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "削除する", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("記録の削除を確認しました").check();
  await page.getByRole("button", { name: "削除する", exact: true }).click();
  await expect(page.locator(".archive-row")).toHaveCount(1);
});

test("IndexedDBを利用できない場合は保存不能を表示して開始を止める", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: undefined,
    }),
  );
  await page.goto("/");
  await expect(page.locator(".notice.error")).toContainText(
    "端末内保存を利用できません",
  );
  await expect(
    page.getByRole("button", { name: /新しい試合/, exact: false }),
  ).toBeDisabled();
});

test("書込失敗を保存済みと表示せず、JSONに保管して再試行できる", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /新しい試合/, exact: false }).click();
  await page.evaluate(() => {
    const actual = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (
      ...args: Parameters<IDBDatabase["transaction"]>
    ) {
      if (args[1] === "readwrite")
        throw new DOMException("full", "QuotaExceededError");
      return Reflect.apply(actual, this, args);
    };
  });
  await page
    .getByRole("button", { name: "準備を終える →", exact: true })
    .click();
  await expect(page.locator(".notice.error")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /カウント開始/ }),
  ).toBeDisabled();
  await expect(page.locator(".save-status")).toContainText("未保存");
  await page.getByRole("button", { name: "全履歴・推移", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON書き出し", exact: true }).click();
  const file = await downloaded;
  expect(
    JSON.parse(readFileSync((await file.path())!, "utf8")).matches,
  ).toHaveLength(1);
});

test("別タブの同時開始は上書きを拒否し、先に確定した記録を保つ", async ({
  page,
  context,
}) => {
  await fakeClock(page);
  await prepare(page);
  const second = await context.newPage();
  await fakeClock(second);
  await second.goto("/");
  await second.getByRole("button", { name: /試合の続き/ }).click();
  await start(page);
  await expect(page.locator(".save-status")).toContainText("保存済み");
  await second
    .getByRole("button", { name: /カウント開始|次のターンを開始/ })
    .click();
  await expect(second.locator(".notice.error")).toContainText("別のタブ");
  await page.getByRole("button", { name: /CHECK/ }).click();
  await expect(page.locator(".save-status")).toContainText("保存済み");
  await second.reload();
  await second.getByRole("button", { name: /試合の続き/ }).click();
  await expect(second.locator(".last-result")).toContainText("60.00");
  await expect(second.locator(".score-total").nth(1)).toContainText("60.00");
});

test("時報OFFでも試聴は最後まで再生し、WebAudio不可でも毎分00秒に音源を再生する", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.AudioContext = class {
      constructor() {
        throw new Error("WebAudio unavailable");
      }
    } as unknown as typeof AudioContext;
    const original = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (!this.muted) {
        const target = window as typeof window & {
          audiblePlays?: { at: number; volume: number; src: string }[];
          sampleEnded?: boolean;
        };
        target.audiblePlays ??= [];
        target.audiblePlays.push({
          at: Date.now(),
          volume: this.volume,
          src: this.src,
        });
        this.addEventListener(
          "ended",
          () => {
            target.sampleEnded = true;
          },
          { once: true },
        );
      }
      return original.call(this);
    };
  });
  await fakeClock(page);
  await page.goto("/");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.getByLabel("毎分00秒のチャイム").uncheck();
  await page.getByRole("button", { name: "時報を試聴", exact: true }).click();
  await expect(page.locator(".footnote")).toContainText("再生中");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as typeof window & { sampleEnded?: boolean }).sampleEnded,
      ),
    )
    .toBe(true);
  await page.getByLabel("毎分00秒のチャイム").check();
  await page.clock.fastForward(14000);
  await page.clock.fastForward(1000);
  const plays = await page.evaluate(
    () =>
      (
        window as typeof window & {
          audiblePlays: { at: number; volume: number; src: string }[];
        }
      ).audiblePlays,
  );
  expect(plays.length).toBeGreaterThanOrEqual(2);
  expect(plays.at(-1)!.at % 60000).toBe(0);
  expect(plays.at(-1)!.volume).toBeGreaterThan(0.4);
  expect(plays.at(-1)!.src).toContain("/chime.wav");
});

test("主要な文字・タイマー・操作ボタンのコントラストと結果の位置", async ({
  page,
}) => {
  await prepare(page);
  const contrast = await page.evaluate(() => {
    function rgb(color: string) {
      return color
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number)
        .map((x) => {
          const c = x / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
    }
    function ratio(a: string, b: string) {
      const lum = (s: string) => {
        const c = rgb(s);
        return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
      };
      const x = lum(a),
        y = lum(b);
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    }
    const body = getComputedStyle(
      document.querySelector(".instrument")!,
    ).backgroundColor;
    return [
      ".match-heading h1",
      ".footnote",
      ".score-total strong",
      ".metrics dt",
      ".primary",
    ].map((selector) => {
      const e = document.querySelector(selector)!,
        s = getComputedStyle(e);
      return {
        selector,
        ratio: ratio(
          s.color,
          selector === ".primary" ? s.backgroundColor : body,
        ),
      };
    });
  });
  for (const c of contrast)
    expect(c.ratio, c.selector).toBeGreaterThanOrEqual(4.5);
  await start(page);
  await page.getByRole("button", { name: /CHECK/ }).click();
  const result = await page.locator(".last-result").boundingBox(),
    next = await page
      .getByRole("button", { name: /次のターンを開始/ })
      .boundingBox();
  expect(result!.y).toBeLessThan(next!.y);
  await page.screenshot({
    path: "test-results/readable-result.png",
    fullPage: true,
  });
});
