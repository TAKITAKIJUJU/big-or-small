import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
test("高画質の影・DPRと操作応答を記録", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      "usotuki.v1",
      JSON.stringify({
        version: 1,
        settings: {
          difficulty: "medium",
          speed: "skip",
          quality: "high",
          reduced: false,
          muted: true,
          tutorialSeen: true,
        },
        session: null,
      }),
    ),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "対戦をはじめる" }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await page.waitForTimeout(900);
  const metrics = await page.evaluate(async () => {
    const canvas = document.querySelector("canvas")!;
    const gl = canvas.getContext("webgl2")!;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const inputSamples: number[] = [];
    for (const n of [6, 7, 8, 9, 7]) {
      const button = document.querySelector<HTMLButtonElement>(
        `.hand-strip button[aria-label="カード${n}を選択"]`,
      )!;
      const start = performance.now();
      button.click();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      inputSamples.push(performance.now() - start);
    }
    const frames: number[] = [];
    let previous = performance.now();
    for (let i = 0; i < 35; i++) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame((now) => {
          frames.push(now - previous);
          previous = now;
          resolve();
        }),
      );
    }
    frames.shift();
    frames.sort((a, b) => a - b);
    return {
      environment: "headless Chromium / software GL; Androidではない",
      viewport: { width: innerWidth, height: innerHeight },
      canvas: { width: canvas.width, height: canvas.height },
      renderer: ext
        ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER),
      clickToNextFrameMs: inputSamples,
      frameMedianMs: frames[Math.floor(frames.length / 2)],
      frameP95Ms: frames[Math.floor(frames.length * 0.95)],
    };
  });
  expect(metrics.canvas.width).toBeLessThanOrEqual(585);
  expect(errors).toEqual([]);
  await expect(
    page.getByRole("button", { name: /7 の札を伏せる/ }),
  ).toBeEnabled();
  mkdirSync("test-results", { recursive: true });
  writeFileSync(
    "test-results/performance.json",
    JSON.stringify(metrics, null, 2),
  );
  await page.screenshot({ path: "test-results/high-quality.png" });
  console.log(JSON.stringify(metrics));
});
test("コンテキスト喪失でも選札と試合を維持", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "対戦をはじめる" }).click();
  await page
    .getByRole("button", { name: "カード9を選択", exact: true })
    .click();
  await page
    .locator("canvas")
    .evaluate((c) =>
      c.dispatchEvent(new Event("webglcontextlost", { cancelable: true })),
    );
  await expect(page.locator(".fallback-table")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /9 の札を伏せる/ }),
  ).toBeEnabled();
  await page.getByRole("button", { name: /9 の札を伏せる/ }).click();
  await expect(page.locator(".round-counter")).toContainText("01");
});

test("自動画質が継続的に遅い描画を低画質へ調整する", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
    localStorage.setItem(
      "usotuki.v1",
      JSON.stringify({
        version: 1,
        settings: { quality: "auto", muted: true, tutorialSeen: true },
        session: null,
      }),
    );
    const original = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      original((time) => setTimeout(() => callback(time), 65));
  });
  await page.goto("/");
  await expect(page.locator('.scene[data-render-quality="low"]')).toBeVisible({
    timeout: 20000,
  });
  await page.getByRole("button", { name: "対戦をはじめる" }).click();
  await expect(page.getByRole("group", { name: "あなたの手札" })).toBeVisible();
});
