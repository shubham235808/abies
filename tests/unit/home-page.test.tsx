import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import HomePage from '@/app/(public)/page';

describe('HomePage', () => {
  it('renders the platform promise with live CTAs for what is real', () => {
    render(<HomePage />);
    expect(screen.getByRole('heading', { name: /trusted, coordinated ayurveda care/i })).toBeInTheDocument();
    // Sign-in, doctor discovery, and appointment booking (via the doctor
    // profile page) are all real (Phase 1/3/4) — they link out.
    expect(screen.getByRole('link', { name: /find a doctor/i })).toHaveAttribute('href', '/doctors');
    expect(screen.getByRole('link', { name: /^sign in$/i })).toHaveAttribute('href', '/login');
  });
});
