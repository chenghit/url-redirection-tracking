import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

interface NavigationItem {
  name: string;
  href: string;
  icon: string;
}

interface NavigationProps {
  className?: string;
  onMobileMenuToggle?: (isOpen: boolean) => void;
}

const Navigation: React.FC<NavigationProps> = ({ className = '', onMobileMenuToggle }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  const navigation: NavigationItem[] = [
    { name: 'Dashboard', href: '/', icon: '📊' },
    { name: 'Analytics', href: '/analytics', icon: '📈' },
    { name: 'Health', href: '/health', icon: '🏥' },
  ];

  const isActive = (href: string): boolean => {
    if (href === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(href);
  };

  const handleMobileMenuToggle = () => {
    const newState = !isMobileMenuOpen;
    setIsMobileMenuOpen(newState);
    onMobileMenuToggle?.(newState);
  };

  const handleMobileMenuClose = () => {
    setIsMobileMenuOpen(false);
    onMobileMenuToggle?.(false);
  };

  return (
    <nav className={`${className}`} role="navigation" aria-label="Main navigation">
      {/* Desktop Navigation */}
      <div className="hidden md:flex space-x-8">
        {navigation.map((item, index) => (
          <Link
            key={item.name}
            to={item.href}
            className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              isActive(item.href)
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
            aria-current={isActive(item.href) ? 'page' : undefined}
            aria-describedby={`desktop-nav-desc-${index}`}
          >
            <span className="mr-2" role="img" aria-label={`${item.name} icon`}>
              {item.icon}
            </span>
            {item.name}
            <span id={`desktop-nav-desc-${index}`} className="sr-only">
              Navigate to {item.name} page
            </span>
          </Link>
        ))}
      </div>

      {/* Mobile menu button */}
      <div className="md:hidden">
        <button
          onClick={handleMobileMenuToggle}
          className="inline-flex items-center justify-center p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
          aria-expanded={isMobileMenuOpen}
          aria-controls="mobile-menu"
          aria-label="Toggle main menu"
          tabIndex={0}
        >
          <span className="sr-only">
            {isMobileMenuOpen ? 'Close main menu' : 'Open main menu'}
          </span>
          {isMobileMenuOpen ? (
            <svg 
              className="block h-6 w-6" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg 
              className="block h-6 w-6" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile Navigation Menu */}
      {isMobileMenuOpen && (
        <div 
          className="absolute top-full left-0 right-0 md:hidden bg-white border-t border-gray-200 shadow-lg z-50" 
          id="mobile-menu"
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="mobile-menu-button"
        >
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            {navigation.map((item, index) => (
              <Link
                key={item.name}
                to={item.href}
                onClick={handleMobileMenuClose}
                className={`flex items-center px-3 py-3 rounded-md text-base font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  isActive(item.href)
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
                role="menuitem"
                tabIndex={0}
                aria-current={isActive(item.href) ? 'page' : undefined}
                aria-describedby={`nav-desc-${index}`}
              >
                <span className="mr-3 text-lg" role="img" aria-label={`${item.name} icon`}>
                  {item.icon}
                </span>
                {item.name}
                <span id={`nav-desc-${index}`} className="sr-only">
                  Navigate to {item.name} page
                </span>
              </Link>
            ))}
            <div className="px-3 py-2 text-sm text-gray-500 border-t border-gray-100 mt-2" role="menuitem">
              <span aria-label="Application version">
                Version {import.meta.env.VITE_APP_VERSION || '1.0.0'}
              </span>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navigation;