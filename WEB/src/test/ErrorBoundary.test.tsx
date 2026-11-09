import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../components/ErrorBoundary';

const FaultyComponent = () => {
  throw new Error('Test crash in child component');
};

describe('ErrorBoundary component', () => {
  it('catches runtime errors and renders accessible error fallback UI', () => {
    // Suppress console.error in test output for intentional error throw
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <FaultyComponent />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText(/test crash in child component/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload application/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset cache & reload/i })).toBeInTheDocument();

    spy.mockRestore();
  });
});
