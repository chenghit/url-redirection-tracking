import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi } from 'vitest';
import Layout, { useLoading } from '../Layout';

// Mock react-router-dom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useLocation: () => ({ pathname: '/' }),
  };
});

// Test component to test useLoading hook
const TestLoadingComponent: React.FC = () => {
  const {
    isGlobalLoading,
    setGlobalLoading,
    globalLoadingMessage,
    setGlobalLoadingMessage,
    globalProgress,
    setGlobalProgress,
    showProgress,
    setShowProgress,
  } = useLoading();

  return (
    <div>
      <div data-testid="loading-state">{isGlobalLoading ? 'loading' : 'not-loading'}</div>
      <div data-testid="loading-message">{globalLoadingMessage}</div>
      <div data-testid="progress-value">{globalProgress}</div>
      <div data-testid="show-progress">{showProgress ? 'visible' : 'hidden'}</div>
      
      <button onClick={() => setGlobalLoading(true)} data-testid="start-loading">
        Start Loading
      </button>
      <button onClick={() => setGlobalLoading(false)} data-testid="stop-loading">
        Stop Loading
      </button>
      <button onClick={() => setGlobalLoadingMessage('Custom message')} data-testid="set-message">
        Set Message
      </button>
      <button onClick={() => setGlobalProgress(75)} data-testid="set-progress">
        Set Progress
      </button>
      <button onClick={() => setShowProgress(true)} data-testid="show-progress-bar">
        Show Progress
      </button>
    </div>
  );
};

// Test wrapper with router
const LayoutWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <BrowserRouter>
      <Layout>{children}</Layout>
    </BrowserRouter>
  );
};

describe('Layout Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders layout structure correctly', () => {
      render(
        <LayoutWrapper>
          <div data-testid="test-content">Test Content</div>
        </LayoutWrapper>
      );

      // Check header
      expect(screen.getByRole('banner')).toBeInTheDocument();
      expect(screen.getByText('URL Redirection Analytics')).toBeInTheDocument();

      // Check main content
      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.getByTestId('test-content')).toBeInTheDocument();

      // Check footer
      expect(screen.getByRole('contentinfo')).toBeInTheDocument();
      expect(screen.getByText(/© 2025 URL Redirection Analytics Dashboard/)).toBeInTheDocument();
    });

    it('renders navigation component', () => {
      render(
        <LayoutWrapper>
          <div>Test Content</div>
        </LayoutWrapper>
      );

      expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument();
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Analytics')).toBeInTheDocument();
      expect(screen.getByText('Health')).toBeInTheDocument();
    });

    it('renders version information', () => {
      // Mock environment variable
      vi.stubEnv('VITE_APP_VERSION', '2.1.0');
      
      render(
        <LayoutWrapper>
          <div>Test Content</div>
        </LayoutWrapper>
      );

      expect(screen.getByText('v2.1.0')).toBeInTheDocument();
      
      vi.unstubAllEnvs();
    });

    it('renders environment information', () => {
      // Mock environment variable
      vi.stubEnv('VITE_NODE_ENV', 'production');
      
      render(
        <LayoutWrapper>
          <div>Test Content</div>
        </LayoutWrapper>
      );

      expect(screen.getByText('Environment: production')).toBeInTheDocument();
      
      vi.unstubAllEnvs();
    });
  });

  describe('Loading Context', () => {
    it('provides loading context to children', () => {
      render(
        <LayoutWrapper>
          <TestLoadingComponent />
        </LayoutWrapper>
      );

      expect(screen.getByTestId('loading-state')).toHaveTextContent('not-loading');
      expect(screen.getByTestId('loading-message')).toHaveTextContent('Loading...');
      expect(screen.getByTestId('progress-value')).toHaveTextContent('0');
      expect(screen.getByTestId('show-progress')).toHaveTextContent('hidden');
    });

    it('updates global loading state', async () => {
      render(
        <LayoutWrapper>
          <TestLoadingComponent />
        </LayoutWrapper>
      );

      const startButton = screen.getByTestId('start-loading');
      fireEvent.click(startButton);

      await waitFor(() => {
        expect(screen.getByTestId('loading-state')).toHaveTextContent('loading');
      });

      // Check that loading overlay is visible
      expect(screen.getByRole('dialog', { name: /loading/i })).toBeInTheDocument();
    });

    it('updates loading message', async () => {
      render(
        <LayoutWrapper>
          <TestLoadingComponent />
        </LayoutWrapper>
      );

      const setMessageButton = screen.getByTestId('set-message');
      fireEvent.click(setMessageButton);

      await waitFor(() => {
        expect(screen.getByTestId('loading-message')).toHaveTextContent('Custom message');
      });
    });

    it('updates progress value', async () => {
      render(
        <LayoutWrapper>
          <TestLoadingComponent />
        </LayoutWrapper>
      );

      const setProgressButton = screen.getByTestId('set-progress');
      fireEvent.click(setProgressButton);

      await waitFor(() => {
        expect(screen.getByTestId('progress-value')).toHaveTextContent('75');
      });
    });

    it('shows progress bar when enabled', async () => {
      render(
        <LayoutWrapper>
          <TestLoadingComponent />
        </LayoutWrapper>
      );

      // Initially progress bar should not be visible
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();

      const showProgressButton = screen.getByTestId('show-progress-bar');
      fireEvent.click(showProgressButton);

      await waitFor(() => {
        expect(screen.getByTestId('show-progress')).toHaveTextContent('visible');
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
      });
    });

    it('shows loading overlay with custom message', async () => {
      render(
        <LayoutWrapper>
          <TestLoadingComponent />
        </LayoutWrapper>
      );

      // Set custom message first
      fireEvent.click(screen.getByTestId('set-message'));
      
      // Then start loading
      fireEvent.click(screen.getByTestId('start-loading'));

      await waitFor(() => {
        const overlay = screen.getByRole('dialog', { name: /loading/i });
        expect(overlay).toBeInTheDocument();
        // Check for the message in the overlay specifically
        const overlayMessage = overlay.querySelector('p');
        expect(overlayMessage).toHaveTextContent('Custom message');
      });
    });

    it('hides loading overlay when loading stops', async () => {
      render(
        <LayoutWrapper>
          <TestLoadingComponent />
        </LayoutWrapper>
      );

      // Start loading
      fireEvent.click(screen.getByTestId('start-loading'));
      
      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /loading/i })).toBeInTheDocument();
      });

      // Stop loading
      fireEvent.click(screen.getByTestId('stop-loading'));
      
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: /loading/i })).not.toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('has proper semantic structure', () => {
      render(
        <LayoutWrapper>
          <div>Test Content</div>
        </LayoutWrapper>
      );

      expect(screen.getByRole('banner')).toBeInTheDocument(); // header
      expect(screen.getByRole('main')).toBeInTheDocument(); // main
      expect(screen.getByRole('contentinfo')).toBeInTheDocument(); // footer
      expect(screen.getByRole('navigation')).toBeInTheDocument(); // nav
    });

    it('has proper main content identification', () => {
      render(
        <LayoutWrapper>
          <div>Test Content</div>
        </LayoutWrapper>
      );

      const main = screen.getByRole('main');
      expect(main).toHaveAttribute('id', 'main-content');
    });

    it('has accessible logo link', () => {
      render(
        <LayoutWrapper>
          <div>Test Content</div>
        </LayoutWrapper>
      );

      const logoLink = screen.getByRole('link', { name: /url redirection analytics/i });
      expect(logoLink).toBeInTheDocument();
      expect(logoLink).toHaveClass('focus:outline-none', 'focus:ring-2');
    });

    it('has proper ARIA labels for icons', () => {
      render(
        <LayoutWrapper>
          <div>Test Content</div>
        </LayoutWrapper>
      );

      const linkIcon = screen.getByLabelText('Link icon');
      expect(linkIcon).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('throws error when useLoading is used outside Layout', () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      expect(() => {
        render(<TestLoadingComponent />);
      }).toThrow('useLoading must be used within a Layout component');
      
      consoleSpy.mockRestore();
    });
  });

  describe('Responsive Design', () => {
    it('shows mobile menu button on mobile', () => {
      render(
        <LayoutWrapper>
          <div>Test Content</div>
        </LayoutWrapper>
      );

      const menuButton = screen.getByRole('button', { name: /toggle main menu/i });
      expect(menuButton).toBeInTheDocument();
    });

    it('handles mobile menu toggle', async () => {
      render(
        <LayoutWrapper>
          <div>Test Content</div>
        </LayoutWrapper>
      );

      const menuButton = screen.getByRole('button', { name: /toggle main menu/i });
      
      // Initially closed
      expect(menuButton).toHaveAttribute('aria-expanded', 'false');

      // Click to open
      fireEvent.click(menuButton);
      
      await waitFor(() => {
        expect(menuButton).toHaveAttribute('aria-expanded', 'true');
      });
    });
  });

  describe('Integration', () => {
    it('integrates with navigation component properly', () => {
      render(
        <LayoutWrapper>
          <div>Test Content</div>
        </LayoutWrapper>
      );

      // Check that navigation items are rendered by looking for text content
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Analytics')).toBeInTheDocument();
      expect(screen.getByText('Health')).toBeInTheDocument();
      
      // Check navigation structure
      expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument();
    });

    it('renders children content in main area', () => {
      const testContent = 'This is test content for the layout';
      
      render(
        <LayoutWrapper>
          <div data-testid="child-content">{testContent}</div>
        </LayoutWrapper>
      );

      const main = screen.getByRole('main');
      const childContent = screen.getByTestId('child-content');
      
      expect(main).toContainElement(childContent);
      expect(childContent).toHaveTextContent(testContent);
    });
  });
});