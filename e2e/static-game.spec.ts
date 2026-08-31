import { expect, test } from '@playwright/test';

test('starts a game from the local question bank', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /随机玩法/ }).click();
  await expect(page.locator('.question-description')).toBeVisible();
  await expect(page.locator('.image-panel').first()).toBeVisible();
});

test('offers the GitHub issue submission template', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /投稿题目/ }).click();
  await expect(page.getByRole('dialog')).toContainText('制作题目');
  await expect(page.getByRole('link', { name: /GitHub Issue/ })).toHaveAttribute(
    'href',
    /issues\/new\?template=question-submission\.yml/,
  );
  await page.getByRole('link', { name: /打开投稿工具/ }).click();
  await expect(page).toHaveURL(/#\/submit$/);
  await expect(page.getByRole('heading', { name: '题目创作工坊' })).toBeVisible();
  await expect(page.getByRole('button', { name: /新增题目/ })).toBeVisible();

  await page.getByRole('button', { name: /新增题目/ }).click();
  await expect(page.locator('.draft-tab')).toHaveCount(2);
  await page.locator('.draft-tab').first().click();
  await page.locator('input[type="file"]').first().setInputFiles('public/wordmark.png');
  await expect(page.getByRole('dialog', { name: '裁切图片 A' })).toBeVisible();
  await page.getByRole('button', { name: '取消' }).click();
  await expect(page.getByRole('heading', { name: /创建答案选区/ })).toBeVisible();
  await page.locator('.workshop-editor__overlay').click({ position: { x: 100, y: 80 } });
  await expect(page.locator('.workshop-diff-item')).toHaveCount(1);
});
