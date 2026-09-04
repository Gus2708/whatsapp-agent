import { test, expect } from '@playwright/test';

test.describe('CUJ: RAG Studio & n8n Visualizer with Real Data', () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate into Demo Mode automatically
    await page.addInitScript(() => {
      localStorage.setItem('perucho_demo_mode', 'true');
    });
    await page.goto('/');
  });

  test('CUJ: RAG Studio executes real retrieval pipeline with verifiable metrics', async ({ page }) => {
    // Navigate to RAG Studio via tab or keyboard
    const ragTab = page.getByRole('tab', { name: /RAG Studio/i });
    await expect(ragTab).toBeVisible();
    await ragTab.click();

    // Verify RAG Studio header
    const heading = page.getByRole('heading', { name: /Pruebas de Búsqueda Híbrida & SNR/i });
    await expect(heading).toBeVisible();

    // Set up request interceptor for /api/rag
    const ragResponsePromise = page.waitForResponse((res) =>
      res.url().includes('/api/rag') && res.request().method() === 'POST'
    );

    // Click sample query chip for AST Parser (Tornillo drywall 1/2 x 100u)
    const sampleChip = page.getByRole('button', { name: /Tornillo drywall 1\/2 x 100u/i });
    await expect(sampleChip).toBeVisible();
    await sampleChip.click();

    // Wait for the real API response
    const response = await ragResponsePromise;
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('hitLayer');
    expect(data.hitLayer).toBeGreaterThanOrEqual(1);
    expect(data.hitLayer).toBeLessThanOrEqual(5);
    expect(data).toHaveProperty('productName');
    expect(typeof data.productName).toBe('string');
    expect(data.productName.length).toBeGreaterThan(0);
    expect(data).toHaveProperty('latencyMs');
    expect(typeof data.latencyMs).toBe('number');

    // Verify History item appeared in Terminal Console
    const terminalHistory = page.locator('div', { hasText: 'perucho@rag:~$ Tornillo drywall 1/2 x 100u' });
    await expect(terminalHistory.first()).toBeVisible({ timeout: 10000 });

    // Verify custom query via input field
    const secondResponsePromise = page.waitForResponse((res) =>
      res.url().includes('/api/rag') && res.request().method() === 'POST'
    );

    const input = page.getByPlaceholder(/Escribir consulta técnica/i);
    await input.fill('Pega loca super bonder');
    const evaluateBtn = page.getByRole('button', { name: /Evaluar/i });
    await evaluateBtn.click();

    const secondResponse = await secondResponsePromise;
    expect(secondResponse.status()).toBe(200);

    const secondData = await secondResponse.json();
    expect(secondData.hitLayer).toBeGreaterThanOrEqual(1);
    expect(secondData.hitLayer).toBeLessThanOrEqual(5);
    expect(secondData.productName.length).toBeGreaterThan(0);

    // Verify history displays the second prompt
    const secondTerminalHistory = page.locator('div', { hasText: 'perucho@rag:~$ Pega loca super bonder' });
    await expect(secondTerminalHistory.first()).toBeVisible({ timeout: 10000 });
  });

  test('CUJ: n8n Visualizer loads real workflow topology and executes pulse simulation', async ({ page }) => {
    // Navigate to n8n Visualizer tab
    const n8nTab = page.getByRole('tab', { name: /33-Node n8n/i });
    await expect(n8nTab).toBeVisible();
    await n8nTab.click();

    // Verify n8n Visualizer heading
    const heading = page.getByRole('heading', { name: /Topología de 33 Nodos/i });
    await expect(heading).toBeVisible();

    // Verify all 4 architectural zones exist
    await expect(page.getByText(/ZONA 01: INGESTA & DEDUPLICACIÓN/i)).toBeVisible();
    await expect(page.getByText(/ZONA 02: PRE-PROCESAMIENTO & AUDIO/i)).toBeVisible();
    await expect(page.getByText(/ZONA 03: ENRUTAMIENTO & RAG HÍBRIDO/i)).toBeVisible();
    await expect(page.getByText(/ZONA 04: STRUCTURED DISPATCH & CRM/i)).toBeVisible();

    // Verify real canonical workflow data is displayed (whatsapp agent / ID ugHOTQv3Vb6cuTct)
    const workflowItem = page.getByText(/whatsapp agent/i);
    await expect(workflowItem.first()).toBeVisible({ timeout: 10000 });

    const workflowId = page.getByText(/ugHOTQv3Vb6cuTct/i);
    await expect(workflowId.first()).toBeVisible();

    // Trigger pulse simulation on the 33-node pipeline
    const pulseBtn = page.getByRole('button', { name: /Simular Pulso/i });
    await expect(pulseBtn).toBeVisible();
    await pulseBtn.click();

    // Verify button state during simulation
    const simulatingBtn = page.getByRole('button', { name: /Simulando Pulso\.\.\./i });
    await expect(simulatingBtn).toBeVisible();

    // Verify animation completes and button returns to idle state
    await expect(page.getByRole('button', { name: /Simular Pulso/i })).toBeVisible({ timeout: 15000 });
  });
});
