describe('Analytics Page User Journey', () => {
  beforeEach(() => {
    // Mock API responses
    cy.intercept('GET', '/analytics/query*', { fixture: 'analytics-query.json' }).as('getAnalyticsQuery')
    cy.intercept('GET', '/analytics/aggregate*', { fixture: 'analytics-aggregate.json' }).as('getAnalyticsAggregate')
    
    cy.visit('/')
    cy.navigateToPage('analytics')
  })

  it('should display interactive charts with data', () => {
    // Wait for analytics page to load
    cy.get('[data-testid="analytics-container"]').should('be.visible')
    cy.get('[data-testid="loading"]').should('not.exist')
    
    // Verify all chart types are displayed
    cy.get('[data-testid="line-chart"]').should('be.visible')
    cy.get('[data-testid="bar-chart"]').should('be.visible')
    cy.get('[data-testid="pie-chart"]').should('be.visible')
    
    // Verify API calls were made
    cy.wait('@getAnalyticsQuery')
    cy.wait('@getAnalyticsAggregate')
  })

  it('should allow chart interactions', () => {
    cy.get('[data-testid="line-chart"]').should('be.visible')
    
    // Test chart hover interactions
    cy.get('[data-testid="line-chart"] canvas').trigger('mouseover', { x: 100, y: 100 })
    
    // Verify tooltip appears (if implemented)
    cy.get('[data-testid="chart-tooltip"]').should('be.visible')
    
    // Test chart click interactions for bar chart
    cy.get('[data-testid="bar-chart"] canvas').click(150, 200)
    
    // Verify filter is applied (if click-to-filter is implemented)
    cy.get('[data-testid="active-filters"]').should('contain.text', 'Source:')
  })

  it('should export charts as PNG', () => {
    cy.get('[data-testid="line-chart"]').should('be.visible')
    
    // Export line chart
    cy.get('[data-testid="line-chart"]').within(() => {
      cy.exportData('png')
    })
    
    // Export bar chart
    cy.get('[data-testid="bar-chart"]').within(() => {
      cy.exportData('png')
    })
    
    // Export pie chart
    cy.get('[data-testid="pie-chart"]').within(() => {
      cy.exportData('png')
    })
  })

  it('should display data table with pagination', () => {
    // Verify data table is displayed
    cy.get('[data-testid="data-table"]').should('be.visible')
    
    // Verify table headers
    cy.get('[data-testid="table-header"]').within(() => {
      cy.contains('Timestamp').should('be.visible')
      cy.contains('Source Attribution').should('be.visible')
      cy.contains('Destination URL').should('be.visible')
      cy.contains('Client IP').should('be.visible')
    })
    
    // Verify table data rows
    cy.get('[data-testid="table-row"]').should('have.length.at.least', 1)
    
    // Test pagination if more than one page
    cy.get('[data-testid="pagination"]').within(() => {
      cy.get('[data-testid="next-page"]').click()
      cy.wait('@getAnalyticsQuery')
    })
  })

  it('should allow table sorting', () => {
    cy.get('[data-testid="data-table"]').should('be.visible')
    
    // Click on timestamp column header to sort
    cy.get('[data-testid="sort-timestamp"]').click()
    
    // Verify sort indicator appears
    cy.get('[data-testid="sort-timestamp"]').should('have.class', 'sorted-asc')
    
    // Click again to reverse sort
    cy.get('[data-testid="sort-timestamp"]').click()
    cy.get('[data-testid="sort-timestamp"]').should('have.class', 'sorted-desc')
  })

  it('should filter data using filter panel', () => {
    // Open filter panel
    cy.get('[data-testid="filter-panel-toggle"]').click()
    cy.get('[data-testid="filter-panel"]').should('be.visible')
    
    // Set source attribution filter
    cy.get('[data-testid="source-filter"]').type('google.com')
    
    // Set destination URL filter
    cy.get('[data-testid="destination-filter"]').type('example.com')
    
    // Apply filters
    cy.get('[data-testid="apply-filters"]').click()
    
    // Verify API call with filters
    cy.wait('@getAnalyticsQuery').then((interception) => {
      expect(interception.request.url).to.include('source_attribution=google.com')
      expect(interception.request.url).to.include('destination_url=example.com')
    })
    
    // Verify active filters are displayed
    cy.get('[data-testid="active-filters"]').should('contain.text', 'google.com')
    cy.get('[data-testid="active-filters"]').should('contain.text', 'example.com')
  })

  it('should search within table data', () => {
    cy.get('[data-testid="data-table"]').should('be.visible')
    
    // Use search functionality
    cy.get('[data-testid="table-search"]').type('google')
    
    // Verify filtered results
    cy.get('[data-testid="table-row"]').each(($row) => {
      cy.wrap($row).should('contain.text', 'google')
    })
    
    // Clear search
    cy.get('[data-testid="table-search"]').clear()
    cy.get('[data-testid="table-row"]').should('have.length.at.least', 1)
  })
})