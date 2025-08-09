/// <reference types="cypress" />

describe('Cross-Browser Compatibility Tests', () => {
  beforeEach(() => {
    cy.visit('/')
    // Wait for the application to load
    cy.get('[data-testid="app-container"]', { timeout: 10000 }).should('be.visible')
  })

  describe('Core Functionality', () => {
    it('should load the dashboard page correctly', () => {
      cy.get('h1').should('contain', 'Analytics Dashboard')
      cy.get('[data-testid="kpi-cards"]').should('be.visible')
      cy.get('[data-testid="refresh-button"]').should('be.visible')
    })

    it('should navigate between pages', () => {
      // Test navigation to Analytics page
      cy.get('[data-testid="nav-analytics"]').click()
      cy.url().should('include', '/analytics')
      cy.get('h1').should('contain', 'Analytics')

      // Test navigation to Health page
      cy.get('[data-testid="nav-health"]').click()
      cy.url().should('include', '/health')
      cy.get('h1').should('contain', 'System Health')

      // Test navigation back to Dashboard
      cy.get('[data-testid="nav-dashboard"]').click()
      cy.url().should('not.include', '/analytics')
      cy.url().should('not.include', '/health')
    })

    it('should handle API data loading', () => {
      // Test that data loads without errors
      cy.get('[data-testid="kpi-cards"]').should('be.visible')
      cy.get('[data-testid="loading-spinner"]').should('not.exist')
      
      // Test refresh functionality
      cy.get('[data-testid="refresh-button"]').click()
      cy.get('[data-testid="loading-spinner"]').should('be.visible')
      cy.get('[data-testid="loading-spinner"]').should('not.exist')
    })
  })

  describe('Interactive Elements', () => {
    it('should handle date range picker', () => {
      cy.get('[data-testid="date-range-picker"]').should('be.visible')
      cy.get('[data-testid="start-date-input"]').should('be.enabled')
      cy.get('[data-testid="end-date-input"]').should('be.enabled')
      
      // Test date selection
      cy.get('[data-testid="start-date-input"]').clear().type('2024-01-01')
      cy.get('[data-testid="end-date-input"]').clear().type('2024-01-31')
      cy.get('[data-testid="apply-filters-button"]').click()
    })

    it('should handle filter panel interactions', () => {
      cy.get('[data-testid="filter-panel"]').should('be.visible')
      
      // Test source attribution filter
      cy.get('[data-testid="source-filter"]').select('email')
      cy.get('[data-testid="apply-filters-button"]').click()
      
      // Test destination URL filter
      cy.get('[data-testid="destination-filter"]').type('example.com')
      cy.get('[data-testid="apply-filters-button"]').click()
    })
  })

  describe('Charts and Visualizations', () => {
    beforeEach(() => {
      cy.visit('/analytics')
      cy.get('[data-testid="analytics-container"]').should('be.visible')
    })

    it('should render line chart correctly', () => {
      cy.get('[data-testid="line-chart"]').should('be.visible')
      cy.get('[data-testid="line-chart"] canvas').should('be.visible')
    })

    it('should render bar chart correctly', () => {
      cy.get('[data-testid="bar-chart"]').should('be.visible')
      cy.get('[data-testid="bar-chart"] canvas').should('be.visible')
    })

    it('should render pie chart correctly', () => {
      cy.get('[data-testid="pie-chart"]').should('be.visible')
      cy.get('[data-testid="pie-chart"] canvas').should('be.visible')
    })

    it('should handle chart export functionality', () => {
      cy.get('[data-testid="export-line-chart"]').click()
      // Verify download was triggered (file download testing is limited in Cypress)
      cy.get('[data-testid="export-success-message"]').should('be.visible')
    })
  })

  describe('Data Table Functionality', () => {
    it('should display data table with sorting', () => {
      cy.get('[data-testid="data-table"]').should('be.visible')
      cy.get('[data-testid="table-header-timestamp"]').click()
      cy.get('[data-testid="sort-indicator"]').should('be.visible')
    })

    it('should handle pagination', () => {
      cy.get('[data-testid="pagination-controls"]').should('be.visible')
      cy.get('[data-testid="next-page-button"]').click()
      cy.get('[data-testid="current-page"]').should('contain', '2')
    })

    it('should handle table search', () => {
      cy.get('[data-testid="table-search"]').type('example.com')
      cy.get('[data-testid="search-results"]').should('be.visible')
    })
  })

  describe('Error Handling', () => {
    it('should display error messages gracefully', () => {
      // Simulate network error by intercepting API calls
      cy.intercept('GET', '/analytics/query', { forceNetworkError: true }).as('networkError')
      
      cy.get('[data-testid="refresh-button"]').click()
      cy.wait('@networkError')
      
      cy.get('[data-testid="error-message"]').should('be.visible')
      cy.get('[data-testid="retry-button"]').should('be.visible')
    })

    it('should handle API errors with user-friendly messages', () => {
      cy.intercept('GET', '/analytics/query', { statusCode: 500, body: { error: 'Internal Server Error' } }).as('serverError')
      
      cy.get('[data-testid="refresh-button"]').click()
      cy.wait('@serverError')
      
      cy.get('[data-testid="error-message"]').should('contain', 'Unable to load data')
    })
  })

  describe('Performance', () => {
    it('should load pages within acceptable time limits', () => {
      const startTime = Date.now()
      
      cy.visit('/analytics')
      cy.get('[data-testid="analytics-container"]').should('be.visible')
      
      cy.then(() => {
        const loadTime = Date.now() - startTime
        expect(loadTime).to.be.lessThan(3000) // 3 second requirement
      })
    })

    it('should handle large datasets without performance issues', () => {
      // Mock large dataset response
      cy.intercept('GET', '/analytics/query', { fixture: 'analytics-large-dataset.json' }).as('largeDataset')
      
      cy.visit('/analytics')
      cy.wait('@largeDataset')
      
      cy.get('[data-testid="data-table"]').should('be.visible')
      cy.get('[data-testid="loading-spinner"]').should('not.exist')
    })
  })
})

// Browser-specific tests
describe('Browser-Specific Compatibility', () => {
  describe('Chrome-specific features', () => {
    it('should handle Chrome DevTools integration', () => {
      cy.visit('/')
      // Test console errors
      cy.window().then((win) => {
        cy.stub(win.console, 'error').as('consoleError')
      })
      
      cy.get('[data-testid="refresh-button"]').click()
      cy.get('@consoleError').should('not.have.been.called')
    })
  })

  describe('Firefox-specific features', () => {
    it('should handle Firefox CSS compatibility', () => {
      cy.visit('/')
      
      // Test CSS Grid layout
      cy.get('[data-testid="dashboard-grid"]').should('have.css', 'display', 'grid')
      
      // Test Flexbox layout
      cy.get('[data-testid="kpi-cards"]').should('have.css', 'display', 'flex')
    })
  })

  describe('Safari-specific features', () => {
    it('should handle Safari WebKit features', () => {
      cy.visit('/')
      
      // Test date input compatibility
      cy.get('[data-testid="start-date-input"]').should('have.attr', 'type', 'date')
      
      // Test touch events (simulated)
      cy.get('[data-testid="refresh-button"]').trigger('touchstart')
      cy.get('[data-testid="refresh-button"]').trigger('touchend')
    })
  })
})