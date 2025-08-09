describe('Navigation Flow', () => {
  beforeEach(() => {
    // Mock API responses for all pages
    cy.intercept('GET', '/analytics/query*', { fixture: 'analytics-query.json' }).as('getAnalyticsQuery')
    cy.intercept('GET', '/analytics/aggregate*', { fixture: 'analytics-aggregate.json' }).as('getAnalyticsAggregate')
    cy.intercept('GET', '/health', { fixture: 'health-basic.json' }).as('getHealthBasic')
    cy.intercept('GET', '/health/deep', { fixture: 'health-deep.json' }).as('getHealthDeep')
  })

  it('should navigate between all pages successfully', () => {
    cy.visit('/')
    
    // Start on dashboard
    cy.url().should('eq', Cypress.config().baseUrl + '/')
    cy.get('[data-testid="dashboard-container"]').should('be.visible')
    cy.get('[data-testid="nav-dashboard"]').should('have.class', 'active')
    
    // Navigate to Analytics
    cy.navigateToPage('analytics')
    cy.get('[data-testid="analytics-container"]').should('be.visible')
    cy.get('[data-testid="nav-analytics"]').should('have.class', 'active')
    cy.get('[data-testid="nav-dashboard"]').should('not.have.class', 'active')
    
    // Navigate to Health
    cy.navigateToPage('health')
    cy.get('[data-testid="health-container"]').should('be.visible')
    cy.get('[data-testid="nav-health"]').should('have.class', 'active')
    cy.get('[data-testid="nav-analytics"]').should('not.have.class', 'active')
    
    // Navigate back to Dashboard
    cy.navigateToPage('dashboard')
    cy.get('[data-testid="dashboard-container"]').should('be.visible')
    cy.get('[data-testid="nav-dashboard"]').should('have.class', 'active')
    cy.get('[data-testid="nav-health"]').should('not.have.class', 'active')
  })

  it('should handle browser back/forward navigation', () => {
    cy.visit('/')
    
    // Navigate to analytics
    cy.navigateToPage('analytics')
    cy.url().should('include', '/analytics')
    
    // Navigate to health
    cy.navigateToPage('health')
    cy.url().should('include', '/health')
    
    // Use browser back button
    cy.go('back')
    cy.url().should('include', '/analytics')
    cy.get('[data-testid="analytics-container"]').should('be.visible')
    cy.get('[data-testid="nav-analytics"]').should('have.class', 'active')
    
    // Use browser forward button
    cy.go('forward')
    cy.url().should('include', '/health')
    cy.get('[data-testid="health-container"]').should('be.visible')
    cy.get('[data-testid="nav-health"]').should('have.class', 'active')
    
    // Go back to dashboard
    cy.go('back')
    cy.go('back')
    cy.url().should('eq', Cypress.config().baseUrl + '/')
    cy.get('[data-testid="dashboard-container"]').should('be.visible')
  })

  it('should maintain state when navigating between pages', () => {
    cy.visit('/')
    cy.waitForDashboard()
    
    // Set a date filter on dashboard
    const startDate = '2024-01-01'
    const endDate = '2024-01-31'
    cy.setDateRange(startDate, endDate)
    
    // Navigate to analytics
    cy.navigateToPage('analytics')
    
    // Navigate back to dashboard
    cy.navigateToPage('dashboard')
    
    // Verify date filter is maintained
    cy.get('[data-testid="date-range-display"]').should('contain.text', startDate)
  })

  it('should handle direct URL access to all pages', () => {
    // Direct access to analytics page
    cy.visit('/analytics')
    cy.get('[data-testid="analytics-container"]').should('be.visible')
    cy.get('[data-testid="nav-analytics"]').should('have.class', 'active')
    
    // Direct access to health page
    cy.visit('/health')
    cy.get('[data-testid="health-container"]').should('be.visible')
    cy.get('[data-testid="nav-health"]').should('have.class', 'active')
    
    // Direct access to dashboard (root)
    cy.visit('/')
    cy.get('[data-testid="dashboard-container"]').should('be.visible')
    cy.get('[data-testid="nav-dashboard"]').should('have.class', 'active')
  })

  it('should handle 404 errors for invalid routes', () => {
    cy.visit('/invalid-route', { failOnStatusCode: false })
    
    // Verify 404 page or redirect to dashboard
    cy.get('[data-testid="not-found"]').should('be.visible')
    cy.contains('Page not found').should('be.visible')
    
    // Verify navigation back to dashboard works
    cy.get('[data-testid="back-to-dashboard"]').click()
    cy.url().should('eq', Cypress.config().baseUrl + '/')
    cy.get('[data-testid="dashboard-container"]').should('be.visible')
  })

  it('should show loading states during navigation', () => {
    cy.visit('/')
    
    // Mock slow API response
    cy.intercept('GET', '/analytics/query*', { 
      fixture: 'analytics-query.json',
      delay: 2000 
    }).as('getAnalyticsQuerySlow')
    
    // Navigate to analytics
    cy.get('[data-testid="nav-analytics"]').click()
    
    // Verify loading state appears
    cy.get('[data-testid="loading"]').should('be.visible')
    
    // Wait for data to load
    cy.wait('@getAnalyticsQuerySlow')
    
    // Verify loading state disappears
    cy.get('[data-testid="loading"]').should('not.exist')
    cy.get('[data-testid="analytics-container"]').should('be.visible')
  })

  it('should maintain responsive navigation on all pages', () => {
    // Test mobile navigation on all pages
    cy.checkResponsive('mobile')
    
    // Dashboard
    cy.visit('/')
    cy.get('[data-testid="mobile-menu-button"]').should('be.visible')
    cy.get('[data-testid="mobile-menu-button"]').click()
    cy.get('[data-testid="mobile-nav"]').should('be.visible')
    
    // Navigate to analytics via mobile menu
    cy.get('[data-testid="mobile-nav"] [data-testid="nav-analytics"]').click()
    cy.get('[data-testid="analytics-container"]').should('be.visible')
    cy.get('[data-testid="mobile-nav"]').should('not.be.visible') // Menu should close after navigation
    
    // Open mobile menu again and navigate to health
    cy.get('[data-testid="mobile-menu-button"]').click()
    cy.get('[data-testid="mobile-nav"] [data-testid="nav-health"]').click()
    cy.get('[data-testid="health-container"]').should('be.visible')
  })

  it('should handle navigation with keyboard shortcuts', () => {
    cy.visit('/')
    
    // Test keyboard navigation
    cy.get('body').type('{alt}1') // Assuming Alt+1 goes to dashboard
    cy.get('[data-testid="dashboard-container"]').should('be.visible')
    
    cy.get('body').type('{alt}2') // Assuming Alt+2 goes to analytics
    cy.get('[data-testid="analytics-container"]').should('be.visible')
    
    cy.get('body').type('{alt}3') // Assuming Alt+3 goes to health
    cy.get('[data-testid="health-container"]').should('be.visible')
  })
})