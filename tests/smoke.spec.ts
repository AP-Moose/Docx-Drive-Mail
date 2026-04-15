import { test, expect } from "@playwright/test";

test.describe("Smoke — mobile viewport", () => {
  test("PIN gate shows when APP_PIN is set", async ({ page }) => {
    await page.goto("/");
    // If PIN is configured, we see the lock screen. If not, we go straight to home.
    const pinInput = page.getByTestId("input-pin");
    const newProposalBtn = page.getByTestId("button-new-proposal");
    const oneVisible = await Promise.race([
      pinInput.waitFor({ state: "visible", timeout: 5_000 }).then(() => "pin"),
      newProposalBtn.waitFor({ state: "visible", timeout: 5_000 }).then(() => "home"),
    ]).catch(() => "timeout");
    expect(["pin", "home"]).toContain(oneVisible);
  });

  test("home page has primary CTA", async ({ page }) => {
    // Bypass PIN if present — the app might not have APP_PIN set
    await page.goto("/");
    // Wait for either state
    try {
      await page.getByTestId("button-new-proposal").waitFor({ state: "visible", timeout: 5_000 });
    } catch {
      // PIN gate — submit whatever
      const pinInput = page.getByTestId("input-pin");
      if (await pinInput.isVisible()) {
        await pinInput.fill("0000");
        await page.getByTestId("button-pin-submit").click();
        await page.getByTestId("button-new-proposal").waitFor({ state: "visible", timeout: 5_000 });
      }
    }
    await expect(page.getByTestId("button-new-proposal")).toBeVisible();
    await expect(page.getByTestId("button-recent")).toBeVisible();
    await expect(page.getByTestId("button-settings")).toBeVisible();
  });

  test("new proposal flow — info step validates name", async ({ page }) => {
    await page.goto("/");
    try { await page.getByTestId("button-new-proposal").waitFor({ state: "visible", timeout: 5_000 }); } catch {
      const pinInput = page.getByTestId("input-pin");
      if (await pinInput.isVisible()) { await pinInput.fill("0000"); await page.getByTestId("button-pin-submit").click(); await page.getByTestId("button-new-proposal").waitFor({ state: "visible", timeout: 5_000 }); }
    }
    await page.getByTestId("button-new-proposal").click();
    await expect(page.getByTestId("input-customer-name")).toBeVisible();
    // Click Continue without a name — should show toast
    await page.getByTestId("button-next").click();
    // Name field should still be on screen
    await expect(page.getByTestId("input-customer-name")).toBeVisible();
  });

  test("new proposal flow — footer has mic button on guided step", async ({ page }) => {
    await page.goto("/");
    try { await page.getByTestId("button-new-proposal").waitFor({ state: "visible", timeout: 5_000 }); } catch {
      const pinInput = page.getByTestId("input-pin");
      if (await pinInput.isVisible()) { await pinInput.fill("0000"); await page.getByTestId("button-pin-submit").click(); await page.getByTestId("button-new-proposal").waitFor({ state: "visible", timeout: 5_000 }); }
    }
    await page.getByTestId("button-new-proposal").click();

    // Fill required fields for proposal_email mode
    await page.getByTestId("input-customer-name").fill("Test Customer");
    await page.getByTestId("input-customer-email").fill("test@example.com");
    await page.getByTestId("button-add-email").click();
    await page.getByTestId("button-next").click();

    // Should now be on guided or quick step — check for footer mic button
    const guidedMic = page.getByTestId("button-guided-voice-footer");
    const quickMic = page.getByTestId("button-quick-voice-footer");
    const oneVisible = await Promise.race([
      guidedMic.waitFor({ state: "visible", timeout: 5_000 }).then(() => "guided"),
      quickMic.waitFor({ state: "visible", timeout: 5_000 }).then(() => "quick"),
    ]).catch(() => "none");
    expect(["guided", "quick"]).toContain(oneVisible);
  });

  test("settings page loads and shows status sections", async ({ page }) => {
    await page.goto("/settings");
    try {
      await page.getByText("Connected Accounts").waitFor({ state: "visible", timeout: 5_000 });
    } catch {
      // PIN gate
      const pinInput = page.getByTestId("input-pin");
      if (await pinInput.isVisible()) { await pinInput.fill("0000"); await page.getByTestId("button-pin-submit").click(); await page.getByText("Connected Accounts").waitFor({ state: "visible", timeout: 5_000 }); }
    }
    await expect(page.getByText("Connected Accounts")).toBeVisible();
  });
});
