import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import HomePage from '@/app/page';

describe('HomePage', () => {
  it('renders the platform promise without any live call-to-action', () => {
    render(<HomePage />);
    expect(screen.getByRole('heading', { name: /trusted, coordinated ayurveda care/i })).toBeInTheDocument();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });
});
