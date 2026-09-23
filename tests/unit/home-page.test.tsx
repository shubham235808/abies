import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import HomePage from '@/app/(public)/page';

describe('HomePage', () => {
  it('renders the platform promise with live CTAs for what is real, and an honest label for what is not', () => {
    render(<HomePage />);
    expect(screen.getByRole('heading', { name: /trusted, coordinated ayurveda care/i })).toBeInTheDocument();
    // Sign-in and doctor discovery are real (Phase 1/3) — they link out.
    expect(screen.getByRole('link', { name: /find a doctor/i })).toHaveAttribute('href', '/doctors');
    expect(screen.getByRole('link', { name: /^sign in$/i })).toHaveAttribute('href', '/login');
    // Appointment booking isn't built yet — stays an honest label, not a dead button.
    expect(screen.getByText(/appointment booking.*coming soon/i)).toBeInTheDocument();
  });
});
