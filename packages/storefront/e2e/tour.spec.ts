import { audit, expect, test } from './support.js';

// The tour's own tests are the first visit the others are not.
test.use({ tourSeen: false });

/*
 * The tour on a first visit: it opens itself, each stop leads somewhere,
 * and once finished it stays closed until asked for.
 */

test('opens on a first visit, walks every stop, and stays closed once finished', async ({
    page,
}) => {
    await page.goto('/');
    const tour = page.getByRole('complementary', { name: 'Tour' });
    await expect(tour).toBeVisible();
    await expect(tour).toContainText('Stop 1 of');
    await audit(page);

    // The cache key stop, the fifth, lands on the product only members may see.
    for (let next = 0; next < 4; next += 1) {
        await tour.getByRole('button', { name: 'Next' }).click();
    }
    await expect(tour).toContainText('The cache that forgets who is asking');
    await tour.getByRole('link', { name: 'Try it' }).click();
    await expect(page).toHaveURL(/product=SL-00008/);
    await expect(page.getByText(/There is no product/)).toBeVisible();
    await page.getByRole('combobox', { name: 'Shopping as' }).selectOption('member');
    await expect(page.getByRole('heading', { level: 1 })).not.toContainText('results');
    await expect(tour).toBeVisible();

    let finished = false;
    for (let i = 0; i < 20 && !finished; i += 1) {
        const finish = tour.getByRole('button', { name: 'Finish' });
        if (await finish.isVisible()) {
            await finish.click();
            finished = true;
        } else {
            await tour.getByRole('button', { name: 'Next' }).click();
        }
    }
    expect(finished).toBe(true);
    await expect(tour).toBeHidden();

    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Search the store' })).toBeVisible();
    await expect(tour).toBeHidden();
    await page.getByRole('button', { name: 'Tour' }).click();
    await expect(tour).toBeVisible();
});

test('the tour never covers a card that focus reaches', async ({ page }) => {
    await page.goto('?category=clothing');
    await expect(page.getByRole('complementary', { name: 'Tour' })).toBeVisible();
    await page.locator('.cards > .card a').first().focus();
    for (let step = 0; step < 12; step += 1) {
        await page.keyboard.press('Tab');
        const where = await page.evaluate(() => {
            const focused = document.activeElement?.getBoundingClientRect();
            const tour = document.querySelector('.tour')?.getBoundingClientRect();
            const overlaps =
                focused !== undefined &&
                tour !== undefined &&
                focused.right > tour.left &&
                focused.left < tour.right &&
                focused.bottom > tour.top &&
                focused.top < tour.bottom;
            return {
                onCard: document.activeElement?.matches('.cards > .card a') ?? false,
                overlaps,
            };
        });
        // Still on the cards, and none of it under the tour.
        expect(where.onCard, `focus after ${String(step + 1)} presses`).toBe(true);
        expect(where.overlaps, `focus after ${String(step + 1)} presses`).toBe(false);
    }
});
