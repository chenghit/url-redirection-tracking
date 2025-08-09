describe('Data Export Functionality', () => {
  beforeEach(() => {
    // Mock API responses
    cy.intercept('GET', '/analytics/query*', { fixture: 'analytics-query.json' }).as('getAnalyticsQuery')
    cy.intercept('GET', '/analytics/aggregate*', { fixture: 'analytics-aggregate.json' }).as('getAnalyticsAggregate')
  })

  describe('CSV Export', () => {
    it('should export dashboard data as CSV', () => {
      cy.visit('/')
      cy.waitForDashboard()
      
      // Click CSV export button
      cy.get('[data-testid="export-csv"]').click()
      
      // Verify export process starts
      cy.get('[data-testid="export-loading"]').should('be.visible')
      
      // Wait for export to complete
      cy.get('[data-testid="export-success"]', { timeout: 10000 })
        .should('be.visible')
        .and('contain.text', 'CSV exported successfully')
      
      // Verify export contains expected data
      // Note: In a real scenario, you would verify the downloaded file
      // For this test, we verify the export action was triggered
      cy.get('[data-testid="export-filename"]').should('contain.text', 'analytics-data')
    })

    it('should export filtered analytics data as CSV', () => {
      cy.visit('/')
      cy.navigateToPage('analytics')
      
      // Apply filters
      cy.get('[data-testid="filter-panel-toggle"]').click()
      cy.get('[data-testid="source-filter"]').type('google.com')
      cy.get('[data-testid="apply-filters"]').click()
      
      // Wait for filtered data
      cy.wait('@getAnalyticsQuery')
      
      // Export filtered data
      cy.get('[data-testid="export-csv"]').click()
      
      // Verify export includes filter information
      cy.get('[data-testid="export-success"]').should('contain.text', 'Filtered data exported')
      cy.get('[data-testid="export-filename"]').should('contain.text', 'filtered-analytics')
    })

    it('should export data table as CSV', () => {
      cy.visit('/')
      cy.navigateToPage('analytics')
      
      // Verify data table is loaded
      cy.get('[data-testid="data-table"]').should('be.visible')
      
      // Export table data
      cy.get('[data-testid="data-table"] [data-testid="export-csv"]').click()
      
      // Verify export success
      cy.get('[data-testid="export-success"]').should('contain.text', 'Table data exported')
    })

    it('should handle CSV export errors gracefully', () => {
      cy.visit('/')
      cy.waitForDashboard()
      
      // Mock export failure
      cy.window().then((win) => {
        cy.stub(win, 'URL').throws(new Error('Export failed'))
      })
      
      // Attempt export
      cy.get('[data-testid="export-csv"]').click()
      
      // Verify error handling
      cy.get('[data-testid="export-error"]')
        .should('be.visible')
        .and('contain.text', 'Failed to export data')
      
      // Verify retry option is available
      cy.get('[data-testid="retry-export"]').should('be.visible')
    })
  })

  describe('Chart PNG Export', () => {
    it('should export line chart as PNG', () => {
      cy.visit('/')
      cy.navigateToPage('analytics')
      
      // Wait for chart to load
      cy.get('[data-testid="line-chart"]').should('be.visible')
      
      // Export chart
      cy.get('[data-testid="line-chart"] [data-testid="export-png"]').click()
      
      // Verify export success
      cy.get('[data-testid="export-success"]').should('contain.text', 'Chart exported as PNG')
    })

    it('should export bar chart as PNG', () => {
      cy.visit('/')
      cy.navigateToPage('analytics')
      
      // Wait for chart to load
      cy.get('[data-testid="bar-chart"]').should('be.visible')
      
      // Export chart
      cy.get('[data-testid="bar-chart"] [data-testid="export-png"]').click()
      
      // Verify export success
      cy.get('[data-testid="export-success"]').should('contain.text', 'Chart exported as PNG')
    })

    it('should export pie chart as PNG', () => {
      cy.visit('/')
      cy.navigateToPage('analytics')
      
      // Wait for chart to load
      cy.get('[data-testid="pie-chart"]').should('be.visible')
      
      // Export chart
      cy.get('[data-testid="pie-chart"] [data-testid="export-png"]').click()
      
      // Verify export success
      cy.get('[data-testid="export-success"]').should('contain.text', 'Chart exported as PNG')
    })

    it('should export all charts at once', () => {
      cy.visit('/')
      cy.navigateToPage('analytics')
      
      // Wait for all charts to load
      cy.get('[data-testid="line-chart"]').should('be.visible')
      cy.get('[data-testid="bar-chart"]').should('be.visible')
      cy.get('[data-testid="pie-chart"]').should('be.visible')
      
      // Export all charts
      cy.get('[data-testid="export-all-charts"]').click()
      
      // Verify export progress
      cy.get('[data-testid="export-progress"]').should('be.visible')
      
      // Verify all exports complete
      cy.get('[data-testid="export-success"]', { timeout: 15000 })
        .should('contain.text', 'All charts exported successfully')
    })

    it('should handle chart export errors', () => {
      cy.visit('/')
      cy.navigateToPage('analytics')
      
      // Wait for chart to load
      cy.get('[data-testid="line-chart"]').should('be.visible')
      
      // Mock canvas toBlob failure
      cy.window().then((win) => {
        const canvas = win.document.querySelector('[data-testid="line-chart"] canvas')
        if (canvas) {
          cy.stub(canvas, 'toBlob').callsArgWith(0, null)
        }
      })
      
      // Attempt export
      cy.get('[data-testid="line-chart"] [data-testid="export-png"]').click()
      
      // Verify error handling
      cy.get('[data-testid="export-error"]')
        .should('be.visible')
        .and('contain.text', 'Failed to export chart')
    })
  })

  describe('Export with Date Ranges', () => {
    it('should include date range in export filename', () => {
      cy.visit('/')
      cy.waitForDashboard()
      
      // Set date range
      const startDate = '2024-01-01'
      const endDate = '2024-01-31'
      cy.setDateRange(startDate, endDate)
      
      // Export data
      cy.get('[data-testid="export-csv"]').click()
      
      // Verify filename includes date range
      cy.get('[data-testid="export-filename"]')
        .should('contain.text', '2024-01-01')
        .and('contain.text', '2024-01-31')
    })

    it('should export data for custom date ranges', () => {
      cy.visit('/')
      cy.navigateToPage('analytics')
      
      // Set custom date range
      cy.setDateRange('2024-01-15', '2024-01-20')
      
      // Wait for filtered data
      cy.wait('@getAnalyticsQuery')
      
      // Export filtered data
      cy.get('[data-testid="export-csv"]').click()
      
      // Verify export success with date range
      cy.get('[data-testid="export-success"]')
        .should('contain.text', 'Data exported for date range')
    })
  })

  describe('Export Accessibility', () => {
    it('should provide accessible export controls', () => {
      cy.visit('/')
      cy.waitForDashboard()
      
      // Verify export buttons have proper ARIA labels
      cy.get('[data-testid="export-csv"]')
        .should('have.attr', 'aria-label', 'Export data as CSV file')
      
      // Test keyboard access
      cy.get('[data-testid="export-csv"]').focus()
      cy.focused().should('have.attr', 'data-testid', 'export-csv')
      
      // Test keyboard activation
      cy.focused().type('{enter}')
      cy.get('[data-testid="export-success"]').should('be.visible')
    })

    it('should announce export status to screen readers', () => {
      cy.visit('/')
      cy.waitForDashboard()
      
      // Export data
      cy.get('[data-testid="export-csv"]').click()
      
      // Verify status is announced via live region
      cy.get('[aria-live="polite"]').should('contain.text', 'Export started')
      
      // Wait for completion
      cy.get('[data-testid="export-success"]').should('be.visible')
      cy.get('[aria-live="polite"]').should('contain.text', 'Export completed successfully')
    })
  })

  describe('Export Performance', () => {
    it('should handle large dataset exports efficiently', () => {
      // Mock large dataset
      cy.intercept('GET', '/analytics/query*', { 
        fixture: 'analytics-large-dataset.json',
        delay: 1000 
      }).as('getLargeDataset')
      
      cy.visit('/')
      cy.navigateToPage('analytics')
      
      // Wait for large dataset to load
      cy.wait('@getLargeDataset')
      
      // Start export
      cy.get('[data-testid="export-csv"]').click()
      
      // Verify progress indicator
      cy.get('[data-testid="export-progress"]').should('be.visible')
      cy.get('[data-testid="export-progress-bar"]').should('be.visible')
      
      // Verify completion within reasonable time
      cy.get('[data-testid="export-success"]', { timeout: 30000 }).should('be.visible')
    })

    it('should allow canceling long-running exports', () => {
      // Mock slow export
      cy.intercept('GET', '/analytics/query*', { 
        fixture: 'analytics-query.json',
        delay: 5000 
      }).as('getSlowData')
      
      cy.visit('/')
      cy.navigateToPage('analytics')
      
      // Start export
      cy.get('[data-testid="export-csv"]').click()
      
      // Verify cancel option appears
      cy.get('[data-testid="cancel-export"]').should('be.visible')
      
      // Cancel export
      cy.get('[data-testid="cancel-export"]').click()
      
      // Verify cancellation
      cy.get('[data-testid="export-cancelled"]').should('be.visible')
      cy.get('[data-testid="export-progress"]').should('not.exist')
    })
  })
})