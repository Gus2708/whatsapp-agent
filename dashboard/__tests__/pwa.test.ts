import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import fs from 'fs';
import path from 'path';

describe('PWA Manifest & Assets', () => {
  const publicDir = path.resolve(__dirname, '../public');
  const manifestPath = path.join(publicDir, 'manifest.webmanifest');

  it('1.1.b [RED] should have a valid manifest.webmanifest file', () => {
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifestContent = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifestContent.name).toBe('WhatsApp AI Agent Flight Deck');
    expect(manifestContent.short_name).toBe('AI Flight Deck');
    expect(manifestContent.start_url).toBe('/');
    expect(manifestContent.display).toBe('standalone');
  });

  it('1.1.d [TRIANGULATE] should specify theme colors, orientation, and standard icons', () => {
    const manifestContent = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifestContent.theme_color).toBe('#0a0a0a');
    expect(manifestContent.background_color).toBe('#0a0a0a');
    expect(manifestContent.orientation).toBe('any');

    const icons = manifestContent.icons;
    expect(Array.isArray(icons)).toBe(true);
    expect(icons.length).toBeGreaterThanOrEqual(3);

    const has192 = icons.some((i: { sizes: string }) => i.sizes === '192x192');
    const has512 = icons.some((i: { sizes: string }) => i.sizes === '512x512');
    const hasMaskable = icons.some((i: { purpose?: string }) => i.purpose === 'maskable');

    expect(has192).toBe(true);
    expect(has512).toBe(true);
    expect(hasMaskable).toBe(true);

    // Verify actual icon files exist in public directory
    for (const icon of icons) {
      const iconFilePath = path.join(publicDir, icon.src.replace(/^\//, ''));
      expect(fs.existsSync(iconFilePath)).toBe(true);
    }
  });

  it('1.1.d [TRIANGULATE] should include narrow and wide screenshots for rich install prompts', () => {
    const manifestContent = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const screenshots = manifestContent.screenshots;
    expect(Array.isArray(screenshots)).toBe(true);

    const narrow = screenshots.find((s: { form_factor?: string }) => s.form_factor === 'narrow');
    const wide = screenshots.find((s: { form_factor?: string }) => s.form_factor === 'wide');

    expect(narrow).toBeDefined();
    expect(wide).toBeDefined();
  });
});

describe('PWA Service Worker', () => {
  const publicDir = path.resolve(__dirname, '../public');
  const swPath = path.join(publicDir, 'service-worker.js');

  it('2.1.b [RED] should have service-worker.js in public root', () => {
    expect(fs.existsSync(swPath)).toBe(true);
  });

  it('2.1.d [TRIANGULATE] should implement API and Supabase bypass', () => {
    const swContent = fs.readFileSync(swPath, 'utf-8');

    // Must bypass /api/ and Supabase to protect flight deck telemetry & streaming
    expect(swContent).toMatch(/supabase\.co/);
    expect(swContent).toMatch(/\/api\//);

    // Must handle Network-First navigation
    expect(swContent).toMatch(/navigate/);

    // Must handle install and activate cache cleanup
    expect(swContent).toMatch(/addEventListener\(['"]install['"]/);
    expect(swContent).toMatch(/addEventListener\(['"]activate['"]/);
    expect(swContent).toMatch(/addEventListener\(['"]fetch['"]/);
  });
});

describe('PwaRegister Component', () => {
  it('3.1.b [RED] should render null and register service worker on mount', async () => {
    // Dynamic import to test before and after file creation
    const { PwaRegister } = await import('@/components/pwa/PwaRegister');
    expect(PwaRegister).toBeDefined();

    const registerMock = vi.fn().mockResolvedValue({ scope: '/' });
    Object.defineProperty(global.navigator, 'serviceWorker', {
      value: { register: registerMock },
      configurable: true,
      writable: true,
    });

    const { render } = await import('@testing-library/react');
    const { container } = render(React.createElement(PwaRegister));
    expect(container.firstChild).toBeNull();
    expect(registerMock).toHaveBeenCalledWith('/service-worker.js', { scope: '/' });
  });
});
