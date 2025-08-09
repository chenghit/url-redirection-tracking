import React, { useState, createContext, useContext } from 'react';
import { Link } from 'react-router-dom';
import Navigation from './Navigation';
import { LoadingOverlay, ProgressBar } from './Loading';

interface LayoutProps {
  children: React.ReactNode;
}

interface LoadingContextType {
  isGlobalLoading: boolean;
  setGlobalLoading: (loading: boolean) => void;
  globalLoadingMessage: string;
  setGlobalLoadingMessage: (message: string) => void;
  globalProgress: number;
  setGlobalProgress: (progress: number) => void;
  showProgress: boolean;
  setShowProgress: (show: boolean) => void;
}

// Create loading context for global loading states
const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export const useLoading = () => {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error('useLoading must be used within a Layout component');
  }
  return context;
};

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [, setIsMobileMenuOpen] = useState(false); // Mobile menu functionality to be implemented
  const [isGlobalLoading, setGlobalLoading] = useState(false);
  const [globalLoadingMessage, setGlobalLoadingMessage] = useState('Loading...');
  const [globalProgress, setGlobalProgress] = useState(0);
  const [showProgress, setShowProgress] = useState(false);

  const handleMobileMenuToggle = (isOpen: boolean) => {
    setIsMobileMenuOpen(isOpen);
  };

  const loadingContextValue: LoadingContextType = {
    isGlobalLoading,
    setGlobalLoading,
    globalLoadingMessage,
    setGlobalLoadingMessage,
    globalProgress,
    setGlobalProgress,
    showProgress,
    setShowProgress,
  };

  return (
    <LoadingContext.Provider value={loadingContextValue}>
      <div className="min-h-screen bg-gray-50">
        {/* Global Loading Overlay */}
        <LoadingOverlay isVisible={isGlobalLoading} message={globalLoadingMessage} />

        {/* Navigation Header */}
        <header className="bg-white shadow-sm border-b border-gray-200" role="banner">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-3 sm:py-4">
              {/* Logo and Title */}
              <div className="flex items-center min-w-0 flex-1 sm:flex-none">
                <Link 
                  to="/" 
                  className="flex items-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-md p-1"
                  aria-label="Go to dashboard home page"
                >
                  <div className="text-xl sm:text-2xl mr-2 sm:mr-3" role="img" aria-label="Link icon">🔗</div>
                  <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">
                    <span className="hidden sm:inline">URL Redirection Analytics</span>
                    <span className="sm:hidden">Analytics</span>
                  </h1>
                </Link>
              </div>

              {/* Navigation */}
              <Navigation onMobileMenuToggle={handleMobileMenuToggle} />

              {/* Version Info */}
              <div className="hidden lg:flex items-center space-x-4" aria-label="Application version">
                <span className="text-sm text-gray-500">
                  v{import.meta.env.VITE_APP_VERSION || '1.0.0'}
                </span>
              </div>
            </div>

            {/* Global Progress Bar */}
            {showProgress && (
              <div className="pb-2" role="progressbar" aria-label="Loading progress">
                <ProgressBar 
                  progress={globalProgress} 
                  className="max-w-md mx-auto"
                  showPercentage={false}
                />
              </div>
            )}
          </div>
        </header>

        {/* Main Content */}
        <main 
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8"
          role="main"
          id="main-content"
        >
          {children}
        </main>

        {/* Footer */}
        <footer className="bg-white border-t border-gray-200 mt-auto" role="contentinfo">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-0">
              <p className="text-xs sm:text-sm text-gray-500 text-center sm:text-left">
                © 2025 URL Redirection Analytics Dashboard
              </p>
              <div className="flex items-center space-x-2 sm:space-x-4">
                <span className="text-xs sm:text-sm text-gray-500">
                  Environment: {import.meta.env.VITE_NODE_ENV || 'development'}
                </span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </LoadingContext.Provider>
  );
};

export default Layout;