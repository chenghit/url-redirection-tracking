describe('Responsive Design and Accessibility', () => {
  beforeEach(() => {
    // Mock API responses
    cy.intercept('GET', '/analytics/query*', { fixture: 'analytics-query.json' }).as('getAnalyticsQuery')
    cy.intercept('GET', '/analytics/aggregate*', { fixture: 'analytics-aggregate.json' }).as('getAnalyticsAggregate')
    cy.intercept('GET', '/health', { fixture: 'health-basic.json' }).as('getHealthBasic')
  })

  describe('Responsive Design', () => {
    it('should display correctly on mobile devices', () => {
      cy.checkResponsive('mobile')
      cy.visit('/')
      
      // Verify mobile layout
      cy.get('[data-testid="mobile-menu-button"]').should('be.visible')
      cy.get('[data-testid="desktop-nav"]').should('not.be.visible')
      
      // Test mobile navigation
      cy.get('[data-testid="mobile-menu-button"]').click()
      cy.get('[data-testid="mobile-nav"]').should('be.visible')
      
      // Navigate to analytics page on mobile
      cy.get('[data-testid="mobile-nav"] [data-testid="nav-analytics"]').click()
      cy.url().should('include', '/analytics')
      
      // Verify charts are responsive on mobile
      cy.get('[data-testid="line-chart"]').should('be.visible')
      cy.get('[data-testid="line-chart"] canvas').should('have.css', 'max-width', '100%')
    })

    it('should display correctly on tablet devices', () => {
      cy.checkResponsive('tablet')
      cy.visit('/')
      
      // Verify tablet layout
      cy.get('[data-testid="desktop-nav"]').should('be.visible')
      cy.get('[data-testid="mobile-menu-button"]').should('not.be.visible')
      
      // Verify KPI cards layout on tablet
      cy.get('[data-testid="kpi-cards"]').within(() => {
        cy.get('[data-testid="kpi-card"]').should('have.length.at.least', 3)
        // Verify cards are arranged in responsive grid
        cy.get('[data-testid="kpi-card"]').first().should('be.visible')
      })
    })

    it('should display correctly on desktop devices', () => {
      cy.checkResponsive('desktop')
      cy.visit('/')
      
      // Verify desktop layout
      cy.get('[data-testid="desktop-nav"]').should('be.visible')
      cy.get('[data-testid="mobile-menu-button"]').should('not.be.visible')
      
      // Verify full desktop layout
      cy.get('[data-testid="sidebar"]').should('be.visible')
      cy.get('[data-testid="main-content"]').should('be.visible')
      
      // Navigate to analytics and verify chart layout
      cy.navigateToPage('analytics')
      cy.get('[data-testid="charts-grid"]').within(() => {
        cy.get('[data-testid="line-chart"]').should('be.visible')
        cy.get('[data-testid="bar-chart"]').should('be.visible')
        cy.get('[data-testid="pie-chart"]').should('be.visible')
      })
    })

    it('should handle viewport changes dynamically', () => {
      // Start with desktop
      cy.checkResponsive('desktop')
      cy.visit('/')
      cy.get('[data-testid="desktop-nav"]').should('be.visible')
      
      // Switch to mobile
      cy.checkResponsive('mobile')
      cy.get('[data-testid="mobile-menu-button"]').should('be.visible')
      cy.get('[data-testid="desktop-nav"]').should('not.be.visible')
      
      // Switch back to desktop
      cy.checkResponsive('desktop')
      cy.get('[data-testid="desktop-nav"]').should('be.visible')
      cy.get('[data-testid="mobile-menu-button"]').should('not.be.visible')
    })
  })

  describe('Accessibility Compliance', () => {
    it('should meet WCAG 2.1 AA standards on dashboard', () => {
      cy.visit('/')
      cy.waitForDashboard()
      
      // Run accessibility checks
      cy.checkA11y()
      
      // Verify semantic HTML structure
      cy.get('main').should('exist')
      cy.get('nav').should('exist')
      cy.get('h1').should('exist').and('be.visible')
      
      // Verify ARIA labels
      cy.get('[data-testid="kpi-card"]').each(($card) => {
        cy.wrap($card).should('have.attr', 'aria-label')
      })
    })

    it('should support keyboard navigation', () => {
      cy.visit('/')
      cy.waitForDashboard()
      
      // Test tab navigation through main elements
      cy.get('body').tab()
      cy.focused().should('have.attr', 'data-testid', 'skip-link')
      
      // Navigate through main navigation
      cy.tab()
      cy.focused().should('have.attr', 'data-testid', 'nav-dashboard')
      
      cy.tab()
      cy.focused().should('have.attr', 'data-testid', 'nav-analytics')
      
      cy.tab()
      cy.focused().should('have.attr', 'data-testid', 'nav-health')
      
      // Test Enter key navigation
      cy.focused().type('{enter}')
      cy.url().should('include', '/health')
    })

    it('should support screen readers with proper ARIA labels', () => {
      cy.visit('/')
      cy.waitForDashboard()
      
      // Verify ARIA landmarks
      cy.get('[role="main"]').should('exist')
      cy.get('[role="navigation"]').should('exist')
      cy.get('[role="banner"]').should('exist')
      
      // Verify ARIA labels for interactive elements
      cy.get('[data-testid="refresh-button"]').should('have.attr', 'aria-label', 'Refresh dashboard data')
      cy.get('[data-testid="date-range-picker"]').should('have.attr', 'aria-label', 'Select date range')
      
      // Verify live regions for dynamic content
      cy.get('[aria-live="polite"]').should('exist')
    })

    it('should have proper color contrast', () => {
      cy.visit('/')
      cy.waitForDashboard()
      
      // Check color contrast using axe-core
      cy.checkA11y(null, {
        rules: {
          'color-contrast': { enabled: true }
        }
      })
      
      // Verify focus indicators are visible
      cy.get('[data-testid="nav-analytics"]').focus()
      cy.get('[data-testid="nav-analytics"]').should('have.css', 'outline-width').and('not.eq', '0px')
    })

    it('should support reduced motion preferences', () => {
      // Mock reduced motion preference
      cy.window().then((win) => {
        Object.defineProperty(win, 'matchMedia', {
          writable: true,
          value: cy.stub().returns({
            matches: true,
            media: '(prefers-reduced-motion: reduce)',
            onchange: null,
            addListener: cy.stub(),
            removeListener: cy.stub(),
            addEventListener: cy.stub(),
            removeEventListener: cy.stub(),
            dispatchEvent: cy.stub(),
          }),
        })
      })
      
      cy.visit('/')
      cy.waitForDashboard()
      
      // Verify animations are disabled or reduced
      cy.get('[data-testid="loading-spinner"]').should('have.css', 'animation-duration', '0s')
    })

    it('should provide alternative text for charts', () => {
      cy.visit('/')
      cy.navigateToPage('analytics')
      
      // Verify charts have proper accessibility attributes
      cy.get('[data-testid="line-chart"]').should('have.attr', 'aria-label')
      cy.get('[data-testid="bar-chart"]').should('have.attr', 'aria-label')
      cy.get('[data-testid="pie-chart"]').should('have.attr', 'aria-label')
      
      // Verify chart data is available in accessible format
      cy.get('[data-testid="chart-data-table"]').should('exist')
      cy.get('[data-testid="chart-data-table"]').should('have.attr', 'aria-label', 'Chart data in tabular format')
    })
  })

  describe('Error Handling Accessibility', () => {
    it('should announce errors to screen readers', () => {
      // Mock API error
      cy.intercept('GET', '/analytics/query*', { statusCode: 500, body: { error: 'Server Error' } }).as('getAnalyticsError')
      
      cy.visit('/')
      cy.wait('@getAnalyticsError')
      
      // Verify error is announced via live region
      cy.get('[aria-live="assertive"]').should('contain.text', 'Failed to load analytics data')
      
      // Verify error message has proper role
      cy.get('[data-testid="error-message"]').should('have.attr', 'role', 'alert')
    })

    it('should provide accessible error recovery options', () => {
      // Mock API error
      cy.intercept('GET', '/analytics/query*', { statusCode: 500, body: { error: 'Server Error' } }).as('getAnalyticsError')
      
      cy.visit('/')
      cy.wait('@getAnalyticsError')
      
      // Verify retry button is accessible
      cy.get('[data-testid="retry-button"]').should('have.attr', 'aria-label', 'Retry loading data')
      
      // Test keyboard access to retry button
      cy.get('[data-testid="retry-button"]').focus()
      cy.focused().should('have.attr', 'data-testid', 'retry-button')
    })
  })
})