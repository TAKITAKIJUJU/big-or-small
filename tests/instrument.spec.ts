import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const voiceIndex: Record<string, { start: number }> = JSON.parse(
  readFileSync("src/audio/voice-index.json", "utf8"),
);
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
const timedPages = new WeakSet<Page>();
async function start(page: Page) {
  await page
    .getByRole("button", { name: /カウント開始|次のターンを開始/ })
    .click();
  if (timedPages.has(page)) {
    await expect(
      page.locator("[aria-label=開始前カウントダウン]"),
    ).toContainText(/準備しました|許可していません|有効にできません|拒否/);
    await page.clock.runFor(3000);
  }
  await expect(page.getByRole("button", { name: /CHECK/ })).toBeVisible();
}
async function fakeClock(page: Page) {
  timedPages.add(page);
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
  const partial = await page.evaluate(async () => {
    const a = await fetch("/time-voice.mp3", {
      headers: { Range: "bytes=100-131" },
    });
    const b = await fetch("/time-voice.mp3", {
      headers: { Range: "bytes=-16" },
    });
    const invalid = await fetch("/time-voice.mp3", {
      headers: { Range: "bytes=999999999-" },
    });
    return {
      status: a.status,
      contentRange: a.headers.get("Content-Range"),
      bytes: Array.from(new Uint8Array(await a.arrayBuffer())),
      suffixStatus: b.status,
      suffix: Array.from(new Uint8Array(await b.arrayBuffer())),
      invalidStatus: invalid.status,
    };
  });
  const voice = readFileSync("public/time-voice.mp3");
  expect(partial).toEqual({
    status: 206,
    contentRange: `bytes 100-131/${voice.length}`,
    bytes: Array.from(voice.subarray(100, 132)),
    suffixStatus: 206,
    suffix: Array.from(voice.subarray(-16)),
    invalidStatus: 416,
  });
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
  await second.clock.runFor(3000);
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
          audiblePlays?: {
            at: number;
            volume: number;
            src: string;
            position: number;
          }[];
          sampleEnded?: boolean;
        };
        target.audiblePlays ??= [];
        target.audiblePlays.push({
          at: Date.now(),
          volume: this.volume,
          src: this.dataset.voiceSource ?? this.src,
          position: this.currentTime,
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
  await page.getByLabel("時報（秒音・10秒ごと）").uncheck();
  await page.getByRole("button", { name: "時報を試聴", exact: true }).click();
  await expect(page.locator(".footnote")).toContainText("再生中");
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as typeof window & { sampleEnded?: boolean }).sampleEnded,
        ),
      { timeout: 20000 },
    )
    .toBe(true);
  await page.getByLabel("時報（秒音・10秒ごと）").check();
  await page.getByRole("button", { name: "戻る", exact: true }).click();
  await page.getByRole("button", { name: /新しい試合/ }).click();
  await page
    .getByRole("button", { name: "準備を終える →", exact: true })
    .click();
  await start(page);
  await page.clock.runFor(11000);
  const plays = await page.evaluate(
    () =>
      (
        window as typeof window & {
          audiblePlays: {
            at: number;
            volume: number;
            src: string;
            position: number;
          }[];
        }
      ).audiblePlays,
  );
  expect(plays.length).toBeGreaterThanOrEqual(2);
  const tones = plays.filter((p) => /\/(tick|pip|chime)\.wav$/.test(p.src));
  expect(
    tones.filter((p) => p.src.endsWith("/pip.wav")).map((p) => p.at % 60000),
  ).toEqual([45000, 46000, 47000]);
  const bells = tones.filter((p) => p.src.endsWith("/chime.wav"));
  expect(bells.map((p) => p.at % 60000)).toEqual([48000, 58000]);
  const bell = bells.at(-1)!;
  expect(bell.volume).toBeGreaterThan(0.4);
  expect(tones.some((p) => p.src.endsWith("/tick.wav"))).toBe(true);
  expect(plays.some((p) => p.src.endsWith("/time-voice.mp3"))).toBe(true);
  const speech = plays.filter((p) => p.src.endsWith("/time-voice.mp3"));
  expect(speech[0].at % 60000).toBe(55000);
  expect(speech).toHaveLength(1);
  for (const [i, key] of ["second-10"].entries())
    expect(speech[i].position).toBeCloseTo(voiceIndex[key].start, 3);
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

test("音声の代替経路でも3ターン連続で10秒ごとの時報と読み上げが続く", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.AudioContext = class {
      constructor() {
        throw new Error("Web Audio unavailable");
      }
    } as unknown as typeof AudioContext;
    const target = window as typeof window & {
      turnAudio: { at: number; src: string }[];
    };
    target.turnAudio = [];
    const original = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      const record = !this.muted
        ? { at: Date.now(), src: this.dataset.voiceSource ?? this.src }
        : null;
      return original.call(this).then(() => {
        if (record) target.turnAudio.push(record);
      });
    };
  });
  await fakeClock(page);
  await prepare(page);
  for (let turn = 1; turn <= 3; turn++) {
    await start(page);
    const began = await page.evaluate(() => Date.now());
    await page.clock.runFor(29000);
    await page.getByRole("button", { name: /DROP/ }).click();
    await page.clock.runFor(2000);
    await page.getByRole("button", { name: /CHECK/ }).click();
    await expect(page.locator(".last-result")).toContainText("C チェック成功");
    await expect(
      page.getByRole("button", { name: /次のターンを開始/ }),
    ).toBeEnabled();
    const played = await page.evaluate(
      (at) =>
        (
          window as typeof window & { turnAudio: { at: number; src: string }[] }
        ).turnAudio.filter((p) => p.at >= at),
      began,
    );
    const bells = played.filter((p) => p.src.endsWith("/chime.wav"));
    expect(bells.length, `${turn}ターン目の長音`).toBeGreaterThanOrEqual(3);
    expect(bells.every((p) => (p.at - began) % 10000 === 0)).toBe(true);
    expect(
      played.filter((p) => p.src.endsWith("/time-voice.mp3")).length,
      `${turn}ターン目の読み上げ`,
    ).toBeGreaterThanOrEqual(2);
  }
});

test("音声機能が閉じられても2ターン目の開始で作り直し、時報を再開する", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    const target = window as typeof window & {
      audioContexts: AudioContext[];
      nativeTones: { context: number; frequency: number; state: string }[];
    };
    target.audioContexts = [];
    target.nativeTones = [];
    window.AudioContext = class extends Native {
      constructor(options?: AudioContextOptions) {
        super(options);
        target.audioContexts.push(this);
      }
      createOscillator() {
        const oscillator = super.createOscillator(),
          start = oscillator.start;
        oscillator.start = (when?: number) => {
          target.nativeTones.push({
            context: target.audioContexts.indexOf(this),
            frequency: oscillator.frequency.value,
            state: this.state,
          });
          start.call(oscillator, when);
        };
        return oscillator;
      }
    };
  });
  await fakeClock(page);
  await prepare(page);
  await start(page);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { audioContexts: AudioContext[] })
            .audioContexts[0]?.state,
      ),
    )
    .toBe("running");
  await page.clock.runFor(5000);
  await page.getByRole("button", { name: /DROP/ }).click();
  await page.clock.runFor(2000);
  await page.getByRole("button", { name: /CHECK/ }).click();
  await expect(
    page.getByRole("button", { name: /次のターンを開始/ }),
  ).toBeEnabled();
  await page.evaluate(async () => {
    await (
      window as typeof window & { audioContexts: AudioContext[] }
    ).audioContexts[0].close();
  });
  await start(page);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { audioContexts: AudioContext[] })
            .audioContexts[1]?.state,
      ),
    )
    .toBe("running");
  await page.clock.runFor(15000);
  const tones = await page.evaluate(() =>
    (
      window as typeof window & {
        nativeTones: { context: number; frequency: number; state: string }[];
      }
    ).nativeTones.filter((p) => p.context === 1),
  );
  expect(tones.some((p) => p.frequency === 1000 && p.state === "running")).toBe(
    true,
  );
  expect(
    tones.filter((p) => p.frequency === 500 && p.state === "running"),
  ).toHaveLength(3);
});

for (const fallback of [false, true]) {
  test(`ホームでは自動再生せず、試聴停止・画面移動・対戦後も静かなまま（${fallback ? "代替音声" : "Web Audio"}）`, async ({
    page,
  }) => {
    await page.addInitScript((fallback) => {
      const audit = {
        media: [] as HTMLAudioElement[],
        plays: 0,
        starts: 0,
        cancels: 0,
      };
      (window as typeof window & { homeAudio: typeof audit }).homeAudio = audit;
      const NativeAudio = window.Audio;
      window.Audio = function (src?: string) {
        const audio = new NativeAudio(src);
        audit.media.push(audio);
        return audio;
      } as unknown as typeof Audio;
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        const audible = !this.muted;
        return play.call(this).then(() => {
          if (audible) audit.plays++;
        });
      };
      const oscillator = OscillatorNode.prototype.start;
      OscillatorNode.prototype.start = function (when?: number) {
        audit.starts++;
        oscillator.call(this, when);
      };
      const voice = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (
        when?: number,
        offset?: number,
        duration?: number,
      ) {
        audit.starts++;
        voice.call(this, when, offset, duration);
      };
      const stop = AudioScheduledSourceNode.prototype.stop;
      AudioScheduledSourceNode.prototype.stop = function (when?: number) {
        if (when === undefined) audit.cancels++;
        stop.call(this, when);
      };
      if (fallback)
        window.AudioContext = class {
          constructor() {
            throw new Error("unavailable");
          }
        } as unknown as typeof AudioContext;
    }, fallback);
    const counts = () =>
      page.evaluate(() => {
        const a = (
          window as typeof window & {
            homeAudio: {
              media: HTMLAudioElement[];
              plays: number;
              starts: number;
              cancels: number;
            };
          }
        ).homeAudio;
        return {
          plays: a.plays,
          starts: a.starts,
          cancels: a.cancels,
          paused: a.media.every((m) => m.paused),
        };
      });
    await fakeClock(page);
    await page.goto("/");
    await page.clock.runFor(65000);
    expect(await counts()).toMatchObject({ plays: 0, starts: 0, paused: true });
    await page.getByRole("button", { name: "音を試す", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "試聴を止める", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "試聴を止める", exact: true })
      .click();
    await expect.poll(async () => (await counts()).paused).toBe(true);
    const stopped = await counts();
    await page.clock.runFor(65000);
    expect(await counts()).toEqual(stopped);
    await page.getByRole("button", { name: "音を試す", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "試聴を止める", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "設定", exact: true }).click();
    await expect.poll(async () => (await counts()).paused).toBe(true);
    const settings = await counts();
    await page.clock.runFor(65000);
    expect(await counts()).toEqual(settings);
    await page.getByRole("button", { name: "戻る", exact: true }).click();
    await page.getByRole("button", { name: /新しい試合/ }).click();
    await page
      .getByRole("button", { name: "準備を終える →", exact: true })
      .click();
    await start(page);
    await page.clock.runFor(7000);
    await page.getByRole("button", { name: /DROP/ }).click();
    await page.clock.runFor(2000);
    await page.getByRole("button", { name: /CHECK/ }).click();
    const match = await counts();
    expect(match.plays + match.starts).toBeGreaterThan(
      settings.plays + settings.starts,
    );
    await page.getByRole("button", { name: "ホーム", exact: true }).click();
    await expect.poll(async () => (await counts()).paused).toBe(true);
    const home = await counts();
    if (!fallback) expect(home.cancels).toBeGreaterThan(match.cancels);
    await page.clock.runFor(65000);
    expect(await counts()).toEqual(home);
    await page.getByRole("button", { name: /試合の続き/ }).click();
    await start(page);
    await page.clock.runFor(11000);
    const resumed = await counts();
    expect(resumed.plays + resumed.starts).toBeGreaterThan(
      home.plays + home.starts,
    );
  });
}

test("実時計を6時間変えても開始10秒で鳴り、早期終了後は鳴らず次ターンは0秒に戻る", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.AudioContext = class {
      constructor() {
        throw new Error("fallback");
      }
    } as unknown as typeof AudioContext;
    const play = HTMLMediaElement.prototype.play;
    (window as typeof window & { elapsedBells: number[] }).elapsedBells = [];
    HTMLMediaElement.prototype.play = function () {
      if (!this.muted && this.src.endsWith("/chime.wav"))
        (
          window as typeof window & { elapsedBells: number[] }
        ).elapsedBells.push(performance.now());
      return play.call(this);
    };
  });
  await fakeClock(page);
  await prepare(page);
  await start(page);
  const began = await page.evaluate(() => performance.now());
  await page.clock.setSystemTime(new Date("2026-11-15T14:08:45Z"));
  await page.clock.runFor(10000);
  let bells = await page.evaluate(
    () => (window as typeof window & { elapsedBells: number[] }).elapsedBells,
  );
  expect(bells).toEqual([began, began + 10000]);
  await page.getByRole("button", { name: /CHECK/ }).click();
  await page.clock.runFor(65000);
  expect(
    await page.evaluate(
      () => (window as typeof window & { elapsedBells: number[] }).elapsedBells,
    ),
  ).toEqual(bells);
  await start(page);
  const next = await page.evaluate(() => performance.now());
  await page.clock.runFor(10000);
  bells = await page.evaluate(
    () => (window as typeof window & { elapsedBells: number[] }).elapsedBells,
  );
  expect(bells.at(-1)).toBe(next + 10000);
});

test("開始前3秒は判定せず、取り消し・非表示で無効化し、3秒後を0秒とする", async ({
  page,
}) => {
  await fakeClock(page);
  await prepare(page);
  const begin = () =>
    page.getByRole("button", { name: /カウント開始|次のターンを開始/ }).click();
  await begin();
  await expect(page.getByRole("timer")).toHaveText("3");
  await page.clock.runFor(1000);
  await expect(page.getByRole("timer")).toHaveText("2");
  await expect(page.getByRole("button", { name: /CHECK/ })).toHaveCount(0);
  await page.getByRole("button", { name: "開始を取り消す" }).click();
  await page.clock.runFor(65000);
  await expect(page.locator(".last-result")).toHaveCount(0);
  await begin();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(5000);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(
    page.getByRole("button", { name: /カウント開始/ }),
  ).toBeVisible();
  await begin();
  await page.clock.runFor(2000);
  await expect(page.getByRole("timer")).toHaveText("1");
  await page.clock.runFor(999);
  await expect(page.getByRole("button", { name: /CHECK/ })).toHaveCount(0);
  await page.clock.runFor(1);
  await expect(page.getByRole("button", { name: /CHECK/ })).toBeVisible();
  await page.clock.runFor(1000);
  await page.getByRole("button", { name: /DROP/ }).click();
  await page.clock.runFor(1000);
  await page.getByRole("button", { name: /CHECK/ }).click();
  await expect(page.locator(".last-result")).toContainText("1.00");
});

test("開始前3・2・1と計測開始を音で知らせ、取消では残りの音を止める", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.AudioContext = class {
      constructor() {
        throw new Error("fallback");
      }
    } as unknown as typeof AudioContext;
    (
      window as typeof window & { startSounds: { at: number; src: string }[] }
    ).startSounds = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      const record =
        !this.muted && /\/(pip|chime)\.wav$/.test(this.src)
          ? { at: performance.now(), src: this.src }
          : null;
      return play.call(this).then(() => {
        if (record)
          (
            window as typeof window & {
              startSounds: { at: number; src: string }[];
            }
          ).startSounds.push(record);
      });
    };
  });
  await fakeClock(page);
  await prepare(page);
  const begin = () =>
    page.getByRole("button", { name: /カウント開始|次のターンを開始/ }).click();
  await begin();
  await expect(page.locator("[aria-label=開始前カウントダウン]")).toContainText(
    "準備しました",
  );
  const began = await page.evaluate(() => performance.now());
  await page.clock.runFor(3000);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { startSounds: unknown[] }).startSounds
            .length,
      ),
    )
    .toBe(4);
  const sounds = await page.evaluate(
    () =>
      (window as typeof window & { startSounds: { at: number; src: string }[] })
        .startSounds,
  );
  expect(sounds.map((s) => s.at - began)).toEqual([0, 1000, 2000, 3000]);
  expect(sounds.map((s) => s.src.endsWith("/pip.wav"))).toEqual([
    true,
    true,
    true,
    false,
  ]);
  await page.getByRole("button", { name: /CHECK/ }).click();
  await expect(
    page.getByRole("button", { name: /次のターンを開始/ }),
  ).toBeEnabled();
  await begin();
  await expect(page.locator("[aria-label=開始前カウントダウン]")).toContainText(
    "準備しました",
  );
  await page.clock.runFor(1000);
  await page.getByRole("button", { name: "開始を取り消す" }).click();
  const stopped = await page.evaluate(
    () =>
      (window as typeof window & { startSounds: unknown[] }).startSounds.length,
  );
  await page.clock.runFor(10000);
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { startSounds: unknown[] }).startSounds
          .length,
    ),
  ).toBe(stopped);
});
