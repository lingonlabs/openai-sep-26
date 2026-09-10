import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test.beforeEach(async({page,request})=>{
  const health=await request.get('/api/health');expect((await health.json()).mode).toBe('demo');
  await page.goto('/fixture');
  await page.locator('#token').fill((await readFile('.local/relay-token','utf8')).trim());
  await page.getByRole('button',{name:'Connect',exact:true}).click();
  await expect(page.locator('#review')).toHaveAttribute('data-phase','ready');
});
test('a clean entry saves once',async({page})=>{
  await page.locator('#save').click();await expect(page.locator('#journal')).toHaveAttribute('data-save-count','1');
  await expect(page.locator('#review')).toHaveAttribute('data-phase','allow');
});
test('duplicate blocks and shows the source',async({page})=>{
  await page.locator('#scenario').selectOption('D2');await page.locator('#save').click();
  await expect(page.locator('#review')).toHaveAttribute('data-phase','block');
  await expect(page.locator('#journal')).not.toHaveAttribute('data-save-count',/./);
  await page.getByText('JE-1187',{exact:true}).click();await expect(page.locator('.evidence')).toContainText('2026-08-14');
});
test('bank fee is fixed, balanced, and waits for a fresh Save',async({page})=>{
  await page.locator('#scenario').selectOption('D3');await page.locator('#save').click();
  await expect(page.locator('#review')).toHaveAttribute('data-phase','block');
  await page.screenshot({path:'test-results/bank-fee-blocked.png',fullPage:true});
  await page.getByRole('button',{name:'Apply proposed changes'}).click();
  await expect(page.locator('#review')).toHaveAttribute('data-phase','fixed');
  await expect(page.locator('[data-field="postingDate"]')).toHaveValue('2026-08-29');
  await expect(page.locator('[data-field="postingPeriod"]')).toHaveValue('2026-08');
  await expect(page.getByLabel('L1 debit',{exact:true})).toHaveValue('452.00');
  await expect(page.getByLabel('L2 credit',{exact:true})).toHaveValue('452.00');
  await expect(page.locator('#balance-status')).toContainText('Balanced');
  await expect(page.locator('#journal')).not.toHaveAttribute('data-save-count',/./);
  await page.locator('#save').click();await expect(page.locator('#journal')).toHaveAttribute('data-save-count','1');
});
test('relay failure offers explicit unchecked continuation',async({page})=>{
  await page.route('**/api/gate',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Relay unavailable'})}));
  await page.locator('#save').click();await expect(page.locator('#review')).toHaveAttribute('data-phase','error');
  await expect(page.locator('#journal')).not.toHaveAttribute('data-save-count',/./);
  await page.getByRole('button',{name:'Continue without check'}).click();await expect(page.locator('#journal')).toHaveAttribute('data-save-count','1');
});
test('editing while checking invalidates approval',async({page})=>{
  let release!:()=>void;const wait=new Promise<void>(r=>{release=r;});
  await page.route('**/api/gate',async route=>{await wait;await route.continue().catch(()=>{});});
  await page.locator('#save').click();await expect(page.locator('#review')).toHaveAttribute('data-phase','checking');
  await page.locator('[data-field="memo"]').fill('Edited while review was pending');release();
  await expect(page.locator('#journal')).not.toHaveAttribute('data-save-count',/./);
  await expect(page.locator('#review')).not.toHaveAttribute('data-phase','allow');
});
test('memo text renders as text and mobile layout stays within viewport',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.locator('[data-field="memo"]').fill('<img src=x onerror=alert(1)>');
  await page.locator('#save').click();await expect(page.locator('#review')).toHaveAttribute('data-phase','allow');
  const width=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));
  expect(width.scroll).toBeLessThanOrEqual(width.viewport);
});
