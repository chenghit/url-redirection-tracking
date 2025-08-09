describe('Health Monitoring User Journey', () => {
  beforeEach(() => {
    // Mock health API responses
    cy.intercept('GET', '/health', { fixture: 'health-basic.json' }).as('getHealthBasic')
    cy.intercept('GET', '/health/deep', { fixture: 'health-deep.json' }).as('getHealthDeep')
    
    cy.visit('/')
    cy.navigateToPage('health')
  })

  it('should display system health overview', () => {
    // Wait for health page to load
    cy.get('[data-testid="health-container"]').should('be.visible')
    cy.get('[data-testid="loading"]').should('not.exist')
    
    // Verify overall health status card
    cy.get('[data-testid="health-status-card"]').should('be.visible')
    cy.get('[data-testid="overall-status"]').should('contain.text', 'Healthy')
    
    // Verify API calls were made
    cy.wait('@getHealthBasic')
    cy.wait('@getHealthDeep')
  })

  it('should display individual component statuses', () => {
    cy.get('[data-testid="health-container"]').should('be.visible')
    
    // Verify component status cards
    cy.get('[data-testid="component-status-dynamodb"]').should('be.visible')
    cy.get('[data-testid="component-status-lambda"]').should('be.visible')
    cy.get('[data-testid="component-status-api-gateway"]').should('be.visible')
    
    // Verify status indicators
    cy.get('[data-testid="status-indicator"]').each(($indicator) => {
      cy.wrap($indicator).should('have.class', 'status-healthy')
    })
  })

  it('should display performance metrics', () => {
    cy.get('[data-testid="health-container"]').should('be.visible')
    
    // Verify performance metrics are displayed
    cy.get('[data-testid="response-time-metric"]').should('be.visible').and('contain.text', 'ms')
    cy.get('[data-testid="memory-usage-metric"]').should('be.visible').and('contain.text', 'MB')
    cy.get('[data-testid="uptime-metric"]').should('be.visible')
  })

  it('should auto-refresh health data', () => {
    cy.get('[data-testid="health-container"]').should('be.visible')
    
    // Verify auto-refresh is enabled
    cy.get('[data-testid="auto-refresh-indicator"]').should('be.visible').and('contain.text', 'Auto-refresh: ON')
    
    // Wait for auto-refresh to trigger (assuming 30-second interval)
    cy.wait(31000)
    
    // Verify new API calls were made
    cy.wait('@getHealthBasic')
    cy.wait('@getHealthDeep')
  })

  it('should handle unhealthy system status', () => {
    // Mock unhealthy responses
    cy.intercept('GET', '/health', { 
      statusCode: 200,
      body: { status: 'unhealthy', timestamp: '2024-01-01T00:00:00Z', service: 'analytics-api' }
    }).as('getHealthUnhealthy')
    
    cy.intercept('GET', '/health/deep', { 
      statusCode: 500,
      body: { error: 'DynamoDB connection failed' }
    }).as('getHealthDeepError')
    
    cy.visit('/health')
    
    // Wait for API calls
    cy.wait('@getHealthUnhealthy')
    cy.wait('@getHealthDeepError')
    
    // Verify unhealthy status is displayed
    cy.get('[data-testid="overall-status"]').should('contain.text', 'Unhealthy')
    cy.get('[data-testid="health-status-card"]').should('have.class', 'status-unhealthy')
    
    // Verify error message is displayed
    cy.get('[data-testid="health-error"]').should('be.visible').and('contain.text', 'DynamoDB connection failed')
  })

  it('should allow manual refresh of health data', () => {
    cy.get('[data-testid="health-container"]').should('be.visible')
    
    // Click manual refresh button
    cy.get('[data-testid="refresh-health"]').click()
    
    // Verify loading state appears
    cy.get('[data-testid="loading"]').should('be.visible')
    
    // Verify new API calls are made
    cy.wait('@getHealthBasic')
    cy.wait('@getHealthDeep')
    
    // Verify loading state disappears
    cy.get('[data-testid="loading"]').should('not.exist')
  })

  it('should toggle auto-refresh functionality', () => {
    cy.get('[data-testid="health-container"]').should('be.visible')
    
    // Toggle auto-refresh off
    cy.get('[data-testid="auto-refresh-toggle"]').click()
    cy.get('[data-testid="auto-refresh-indicator"]').should('contain.text', 'Auto-refresh: OFF')
    
    // Toggle auto-refresh back on
    cy.get('[data-testid="auto-refresh-toggle"]').click()
    cy.get('[data-testid="auto-refresh-indicator"]').should('contain.text', 'Auto-refresh: ON')
  })
})