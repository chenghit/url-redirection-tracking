/// <reference types="cypress" />

// Custom commands for the analytics dashboard

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Custom command to wait for the dashboard to load
       */
      waitForDashboard(): Chainable<Element>
      
      /**
       * Custom command to navigate to a specific page
       */
      navigateToPage(page: 'dashboard' | 'analytics' | 'health'): Chainable<Element>
      
      /**
       * Custom command to set date range filter
       */
      setDateRange(startDate: string, endDate: string): Chainable<Element>
      
      /**
       * Custom command to export data and verify download
       */
      exportData(format: 'csv' | 'png'): Chainable<Element>
      
      /**
       * Custom command to check responsive behavior
       */
      checkResponsive(viewport: 'mobile' | 'tablet' | 'desktop'): Chainable<Element>
      
      /**
       * Custom command to run accessibility checks
       */
      checkA11y(): Chainable<Element>
    }
  }
}

// Wait for dashboard to load with data
Cypress.Commands.add('waitForDashboard', () => {
  cy.get('[data-testid="dashboard-container"]').should('be.visible')
  cy.get('[data-testid="loading"]').should('not.exist')
  cy.get('[data-testid="kpi-cards"]').should('be.visible')
})

// Navigate to specific page
Cypress.Commands.add('navigateToPage', (page: 'dashboard' | 'analytics' | 'health') => {
  cy.get(`[data-testid="nav-${page}"]`).click()
  cy.url().should('include', `/${page === 'dashboard' ? '' : page}`)
})

// Set date range filter
Cypress.Commands.add('setDateRange', (startDate: string, endDate: string) => {
  cy.get('[data-testid="date-range-picker"]').within(() => {
    cy.get('[data-testid="start-date"]').clear().type(startDate)
    cy.get('[data-testid="end-date"]').clear().type(endDate)
    cy.get('[data-testid="apply-filter"]').click()
  })
})

// Export data functionality
Cypress.Commands.add('exportData', (format: 'csv' | 'png') => {
  cy.get(`[data-testid="export-${format}"]`).click()
  // Note: Actual file download verification would require additional setup
  // For now, we verify the export action is triggered
  cy.get('[data-testid="export-success"]', { timeout: 10000 }).should('be.visible')
})

// Check responsive behavior
Cypress.Commands.add('checkResponsive', (viewport: 'mobile' | 'tablet' | 'desktop') => {
  const viewports = {
    mobile: [375, 667],
    tablet: [768, 1024],
    desktop: [1280, 720]
  }
  
  const [width, height] = viewports[viewport]
  cy.viewport(width, height)
  
  // Verify responsive elements are visible/hidden appropriately
  if (viewport === 'mobile') {
    cy.get('[data-testid="mobile-menu-button"]').should('be.visible')
    cy.get('[data-testid="desktop-nav"]').should('not.be.visible')
  } else {
    cy.get('[data-testid="desktop-nav"]').should('be.visible')
    cy.get('[data-testid="mobile-menu-button"]').should('not.be.visible')
  }
})

// Accessibility checks
Cypress.Commands.add('checkA11y', () => {
  cy.injectAxe()
  cy.checkA11y(null, {
    rules: {
      'color-contrast': { enabled: true },
      'keyboard-navigation': { enabled: true },
      'focus-management': { enabled: true }
    }
  })
})

// Tab navigation helper
Cypress.Commands.add('tab', () => {
  cy.realPress('Tab')
})