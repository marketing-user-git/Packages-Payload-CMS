import { test, expect } from '@playwright/test'

test.describe('Frontend', () => {
  test('shows the easyMarkets internal login shell', async ({ page }) => {
    await page.goto('http://localhost:3000')

    await expect(page).toHaveTitle(/RegFunnelOps · easyMarkets/)
    await expect(page.getByText('Welcome back')).toBeVisible()
    await expect(page.getByLabel('Username')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
  })
})
