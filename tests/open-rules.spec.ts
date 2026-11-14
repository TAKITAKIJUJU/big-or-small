import { test, expect } from "@playwright/test";
import { openCarryFixture } from "./fixtures";
const settings = { difficulty: "hard", speed: "skip", quality: "low", reduced: true,
  muted: true, volume: 0, allIn: false, reveal: true, tutorialSeen: true };

test("選札前に条件が公開され、初回から298まで賭けられる", async ({ page }) => {
  await page.addInitScript(s => localStorage.setItem("usotuki.v1", JSON.stringify({ version: 1, settings: s, session: null })), settings);
  await page.goto("/");
  await page.getByRole("button", { name: "対戦をはじめる" }).click();
  await expect(page.getByRole("group", { name: "あなたの手札" })).toBeVisible();
  await expect(page.locator(".mode-badge")).toContainText(/BIG|SMALL/);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("usotuki.v1")!).session);
  expect(before.ruleset).toBe("open");
  expect(before.entries.map((e: {command: {type: string}}) => e.command.type)).toEqual(["draw", "select"]);
  await page.getByRole("button", { name: "カード7を選択", exact: true }).click();
  await page.getByRole("button", { name: /の札を伏せる/ }).click();
  await page.getByRole("button", { name: /^最大/ }).click();
  await expect(page.locator(".stake-risk")).toContainText("勝ち +300 / 負け −300");
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("usotuki.v1")!).session);
  expect(after.entries.filter((e: {command: {type: string}}) => e.command.type === "draw")).toHaveLength(1);
  await page.screenshot({ path: "test-results/open-selection.png" });
});

test("全額同数は298ずつ返還して4持越、次回12と条件を再読込後も維持する", async ({ page }) => {
  const { session } = openCarryFixture();
  await page.addInitScript(data => {
    if (!localStorage.getItem("usotuki.v1")) localStorage.setItem("usotuki.v1", JSON.stringify(data));
  }, { version: 1, settings, session });
  await page.goto("/");
  await page.getByRole("button", { name: "対戦を再開" }).click();
  await expect(page.locator(".round-result")).toContainText("持ち越し 4");
  await expect(page.locator(".round-result")).toContainText("298を返還");
  await expect(page.locator(".scoreboard")).toContainText("298");
  await page.getByRole("button", { name: /次のラウンド/ }).click();
  await expect(page.getByRole("group", { name: "あなたの手札" }).getByRole("button")).toHaveCount(12);
  await expect(page.locator(".pot")).toContainText("12");
  await expect(page.locator(".ante-status")).toContainText("持越 4");
  const mode = await page.locator(".mode-badge").textContent();
  await page.reload();
  await page.getByRole("button", { name: "対戦を再開" }).click();
  await expect(page.locator(".pot")).toContainText("12");
  await expect(page.locator(".mode-badge")).toHaveText(mode!);
  await page.screenshot({ path: "test-results/open-carry.png" });
});
