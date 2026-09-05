import { test, expect } from '@playwright/test';

test.describe('PWA Critical User Journey (CUJ) - Flight Deck', () => {
  test('CUJ 1: Manifest & Meta Tags validation for PWA installability', async ({ page }) => {
    await page.goto('/');

    // Check link manifest
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveAttribute('href', '/manifest.webmanifest');

    // Check theme-color and apple-mobile-web-app-capable
    const themeColor = page.locator('meta[name="theme-color"]');
    await expect(themeColor).toHaveAttribute('content', '#0a0a0a');

    const appleCapable = page.locator('meta[name="apple-mobile-web-app-capable"]');
    await expect(appleCapable).toHaveAttribute('content', 'yes');

    // Fetch and validate manifest payload directly
    const response = await page.request.get('/manifest.webmanifest');
    expect(response.status()).toBe(200);

    const manifest = await response.json();
    expect(manifest.name).toBe('WhatsApp AI Agent Flight Deck');
    expect(manifest.short_name).toBe('AI Flight Deck');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.background_color).toBe('#0a0a0a');
    expect(manifest.theme_color).toBe('#0a0a0a');
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
  });

  test('CUJ 2: Service Worker static endpoint availability', async ({ page }) => {
    const swResponse = await page.request.get('/service-worker.js');
    expect(swResponse.status()).toBe(200);

    const text = await swResponse.text();
    expect(text).toContain('flightdeck-static');
    expect(text).toContain('supabase.co');
    expect(text).toContain('/api/');
  });

  test('CUJ 3: App Shell renders successfully on initial load', async ({ page }) => {
    await page.goto('/');

    // Verify document title
    await expect(page).toHaveTitle(/Flight Deck/);

    // Verify root html has dark class
    const htmlElement = page.locator('html');
    await expect(htmlElement).toHaveClass(/dark/);

    // Verify main container renders
    const main = page.locator('main');
    await expect(main).toBeVisible();
  });
});
