describe('Dashboard User Journey', () => {
  beforeEach(() => {
    // Mock API responses for consistent testing
    cy.intercept('GET', '/analytics/query*', { fixture: 'analytics-query.json' }).as('getAnalyticsQuery')
    cy.intercept('GET', '/analytics/aggregate*', { fixture: 'analytics-aggregate.json' }).as('getAnalyticsAggregate')
    cy.intercept('GET', '/health', { fixture: 'health-basic.json' }).as('getHealthBasic')
    
    cy.visit('/')
  })

  it('should load dashboard with KPI cards and data', () => {
    // Wait for dashboard to load
    cy.waitForDashboard()
    
    // Verify KPI cards are displayed
    cy.get('[data-testid="kpi-total-redirections"]').should('be.visible').and('contain.text', 'Total Redirections')
    cy.get('[data-testid="kpi-unique-ips"]').should('be.visible').and('contain.text', 'Unique IPs')
    cy.get('[data-testid="kpi-top-sources"]').should('be.visible').and('contain.text', 'Top Sources')
    
    // Verify API calls were made
    cy.wait('@getAnalyticsQuery')
    cy.wait('@getAnalyticsAggregate')
    
    // Verify data is displayed
    cy.get('[data-testid="kpi-cards"]').within(() => {
      cy.get('[data-testid="kpi-value"]').should('have.length.at.least', 3)
    })
  })

  it('should allow filtering by date range', () => {
    cy.waitForDashboard()
    
    // Set date range filter
    const startDate = '2024-01-01'
    const endDate = '2024-01-31'
    cy.setDateRange(startDate, endDate)
    
    // Verify new API call with date parameters
    cy.wait('@getAnalyticsQuery').then((interception) => {
      expect(interception.request.url).to.include(`start_date=${startDate}`)
      expect(interception.request.url).to.include(`end_date=${endDate}`)
    })
    
    // Verify dashboard updates
    cy.get('[data-testid="date-range-display"]').should('contain.text', startDate)
  })

  it('should allow manual refresh of data', () => {
    cy.waitForDashboard()
    
    // Click refresh button
    cy.get('[data-testid="refresh-button"]').click()
    
    // Verify loading state appears
    cy.get('[data-testid="loading"]').should('be.visible')
    
    // Verify new API calls are made
    cy.wait('@getAnalyticsQuery')
    cy.wait('@getAnalyticsAggregate')
    
    // Verify loading state disappears
    cy.get('[data-testid="loading"]').should('not.exist')
  })

  it('should handle API errors gracefully', () => {
    // Mock API error
    cy.intercept('GET', '/analytics/query*', { statusCode: 500, body: { error: 'Internal Server Error' } }).as('getAnalyticsError')
    
    cy.visit('/')
    
    // Wait for error to appear
    cy.wait('@getAnalyticsError')
    
    // Verify error message is displayed
    cy.get('[data-testid="error-message"]').should('be.visible').and('contain.text', 'Failed to load analytics data')
    
    // Verify retry button is available
    cy.get('[data-testid="retry-button"]').should('be.visible')
  })

  it('should export dashboard data as CSV', () => {
    cy.waitForDashboard()
    
    // Mock successful export
    cy.intercept('GET', '/analytics/query*', { fixture: 'analytics-query.json' }).as('getExportData')
    
    // Click export CSV button
    cy.exportData('csv')
    
    // Verify export success message
    cy.get('[data-testid="export-success"]').should('contain.text', 'CSV exported successfully')
  })
})