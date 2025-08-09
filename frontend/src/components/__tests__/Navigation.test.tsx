import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import Navigation from '../Navigation';

// Test wrapper with router
const NavigationWrapper: React.FC<{ children: React.ReactNode; pathname?: string }> = ({ 
  children, 
  pathname = '/' 
}) => {
  return (
    <MemoryRouter initialEntries={[pathname]}>
      {children}
    </MemoryRouter>
  );
};

describe('Navigation Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Desktop Navigation', () => {
    it('renders all navigation items', () => {
      render(
        <NavigationWrapper>
          <Navigation />
        </NavigationWrapper>
      );

      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Analytics')).toBeInTheDocument();
      expect(screen.getByText('Health')).toBeInTheDocument();
    });

    it('shows correct icons for navigation items', () => {
      render(
        <NavigationWrapper>
          <Navigation />
        </NavigationWrapper>
      );

      // Check that icons are present (using aria-hidden attribute)
      const icons = screen.getAllByRole('img', { hidden: true });
      expect(icons).toHaveLength(3); // 3 navigation items
    });

    it('applies active state to current page', () => {
      render(
        <NavigationWrapper pathname="/">
          <Navigation />
        </NavigationWrapper>
      );

      const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
      expect(dashboardLink).toHaveAttribute('aria-current', 'page');
      expect(dashboardLink).toHaveClass('bg-blue-100', 'text-blue-700');
    });

    it('applies active state to analytics page', () => {
      render(
        <NavigationWrapper pathname="/analytics">
          <Navigation />
        </NavigationWrapper>
      );

      const analyticsLink = screen.getByRole('link', { name: /analytics/i });
      expect(analyticsLink).toHaveAttribute('aria-current', 'page');
    });

    it('applies active state to health page', () => {
      render(
        <NavigationWrapper pathname="/health">
          <Navigation />
        </NavigationWrapper>
      );

      const healthLink = screen.getByRole('link', { name: /health/i });
      expect(healthLink).toHaveAttribute('aria-current', 'page');
    });

    it('handles sub-paths correctly', () => {
      render(
        <NavigationWrapper pathname="/analytics/detailed">
          <Navigation />
        </NavigationWrapper>
      );

      const analyticsLink = screen.getByRole('link', { name: /analytics/i });
      expect(analyticsLink).toHaveAttribute('aria-current', 'page');
    });
  });

  describe('Mobile Navigation', () => {
    it('shows mobile menu button on mobile', () => {
      render(
        <NavigationWrapper>
          <Navigation />
        </NavigationWrapper>
      );

      const menuButton = screen.getByRole('button', { name: /toggle main menu/i });
      expect(menuButton).toBeInTheDocument();
      expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    });

    it('toggles mobile menu when button is clicked', async () => {
      render(
        <NavigationWrapper>
          <Navigation />
        </NavigationWrapper>
      );

      const menuButton = screen.getByRole('button', { name: /toggle main menu/i });
      
      // Initially closed
      expect(menuButton).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();

      // Click to open
      fireEvent.click(menuButton);
      
      await waitFor(() => {
        expect(menuButton).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('menu')).toBeInTheDocument();
      });

      // Click to close
      fireEvent.click(menuButton);
      
      await waitFor(() => {
        expect(menuButton).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      });
    });

    it('shows mobile navigation items when menu is open', async () => {
      render(
        <NavigationWrapper>
          <Navigation />
        </NavigationWrapper>
      );

      const menuButton = screen.getByRole('button', { name: /toggle main menu/i });
      fireEvent.click(menuButton);

      await waitFor(() => {
        const mobileMenu = screen.getByRole('menu');
        expect(mobileMenu).toBeInTheDocument();
        
        // Check mobile menu items
        const menuItems = screen.getAllByRole('menuitem');
        expect(menuItems).toHaveLength(4); // 3 nav items + version info
        
        expect(screen.getByRole('menuitem', { name: /dashboard/i })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: /analytics/i })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: /health/i })).toBeInTheDocument();
      });
    });

    it('closes mobile menu when navigation item is clicked', async () => {
      render(
        <NavigationWrapper>
          <Navigation />
        </NavigationWrapper>
      );

      const menuButton = screen.getByRole('button', { name: /toggle main menu/i });
      fireEvent.click(menuButton);

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument();
      });

      const dashboardLink = screen.getByRole('menuitem', { name: /dashboard/i });
      fireEvent.click(dashboardLink);

      await waitFor(() => {
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(menuButton).toHaveAttribute('aria-expanded', 'false');
      });
    });

    it('shows version information in mobile menu', async () => {
      // Mock environment variable
      vi.stubEnv('VITE_APP_VERSION', '2.0.0');
      
      render(
        <NavigationWrapper>
          <Navigation />
        </NavigationWrapper>
      );

      const menuButton = screen.getByRole('button', { name: /toggle main menu/i });
      fireEvent.click(menuButton);

      await waitFor(() => {
        expect(screen.getByText('Version 2.0.0')).toBeInTheDocument();
      });

      vi.unstubAllEnvs();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels and roles', () => {
      render(
        <NavigationWrapper>
          <Navigation />
        </NavigationWrapper>
      );

      const nav = screen.getByRole('navigation', { name: /main navigation/i });
      expect(nav).toBeInTheDocument();

      const menuButton = screen.getByRole('button', { name: /toggle main menu/i });
      expect(menuButton).toHaveAttribute('aria-expanded');
      expect(menuButton).toHaveAttribute('aria-controls');
    });

    it('supports keyboard navigation', () => {
      render(
        <NavigationWrapper>
          <Navigation />
        </NavigationWrapper>
      );

      const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
      dashboardLink.focus();
      expect(dashboardLink).toHaveFocus();

      // Test focus ring classes
      expect(dashboardLink).toHaveClass('focus:outline-none', 'focus:ring-2', 'focus:ring-blue-500');
    });

    it('has proper screen reader support', async () => {
      render(
        <NavigationWrapper>
          <Navigation />
        </NavigationWrapper>
      );

      const menuButton = screen.getByRole('button', { name: /toggle main menu/i });
      
      // Check screen reader text
      expect(screen.getByText('Open main menu')).toBeInTheDocument();
      
      fireEvent.click(menuButton);
      
      await waitFor(() => {
        expect(screen.getByText('Close main menu')).toBeInTheDocument();
      });
    });
  });

  describe('Callbacks', () => {
    it('calls onMobileMenuToggle callback when provided', async () => {
      const mockCallback = vi.fn();
      
      render(
        <NavigationWrapper>
          <Navigation onMobileMenuToggle={mockCallback} />
        </NavigationWrapper>
      );

      const menuButton = screen.getByRole('button', { name: /toggle main menu/i });
      
      fireEvent.click(menuButton);
      expect(mockCallback).toHaveBeenCalledWith(true);
      
      fireEvent.click(menuButton);
      expect(mockCallback).toHaveBeenCalledWith(false);
    });

    it('calls onMobileMenuToggle when menu item is clicked', async () => {
      const mockCallback = vi.fn();
      
      render(
        <NavigationWrapper>
          <Navigation onMobileMenuToggle={mockCallback} />
        </NavigationWrapper>
      );

      const menuButton = screen.getByRole('button', { name: /toggle main menu/i });
      fireEvent.click(menuButton);
      
      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument();
      });

      const dashboardLink = screen.getByRole('menuitem', { name: /dashboard/i });
      fireEvent.click(dashboardLink);
      
      expect(mockCallback).toHaveBeenCalledWith(false);
    });
  });

  describe('Custom Props', () => {
    it('applies custom className', () => {
      render(
        <NavigationWrapper>
          <Navigation className="custom-nav-class" />
        </NavigationWrapper>
      );

      const nav = screen.getByRole('navigation');
      expect(nav).toHaveClass('custom-nav-class');
    });
  });
});