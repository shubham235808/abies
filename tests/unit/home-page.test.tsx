import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import HomePage from '../../apps/client-web/src/app/(public)/page';

// HomePage is an async Server Component (it fetches the PUBLIC_HOME_HERO
// promotion, ENTERPRISE-13) — RTL can't render async components directly,
// so the component function is awaited first and its resolved JSX is what
// gets rendered. The promotions lookup itself is mocked out: this is a
// presentational test of the always-static parts of the page, not a check
// of promotion-serving logic (that's covered in the promotions module's own
// tests), and mocking it keeps this test independent of live DB state.
vi.mock('@abies/domain/modules/promotions/promotions.service', () => ({
  activePromotionsForPlacement: vi.fn(async () => []),
}));
// The CMS-content language comes from a request cookie, which doesn't exist
// outside a request.
vi.mock('@/lib/content-language', () => ({
  currentContentLanguage: vi.fn(async () => 'en'),
}));

describe('HomePage', () => {
  it('renders the platform promise with live CTAs for what is real', async () => {
    render(await HomePage());
    expect(screen.getByRole('heading', { name: /ayurveda care journey/i })).toBeInTheDocument();
    // Sign-in, doctor discovery, and appointment booking (via the doctor
    // profile page) are all real (Phase 1/3/4) — they link out.
    expect(screen.getByRole('link', { name: /find a verified doctor/i })).toHaveAttribute('href', '/doctors');
    expect(screen.getByRole('link', { name: /explore panchakarma/i })).toHaveAttribute('href', '/panchakarma');
  });
});
