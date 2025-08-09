/// <reference types="cypress" />

describe('Mobile Responsiveness Testing', () => {
  const viewports = [
    { name: 'iPhone SE', width: 375, height: 667 },
    { name: 'iPhone 12', width: 390, height: 844 },
    { name: 'iPad', width: 768, height: 1024 },
    { name: 'iPad Pro', width: 1024, height: 1366 },
    { name: 'Samsung Galaxy S21', width: 360, height: 800 },
    { name: 'Pixel 5', width: 393, height: 851 }
  ]

  viewports.forEach(viewport => {
    describe(`${viewport.name} (${viewport.width}x${viewport.height})`, () => {
      beforeEach(() => {
        cy.viewport(viewport.width, viewport.height)
        cy.visit('/')
      })

      it('should display mobile navigation correctly', () => {
        if (viewport.width < 768) {
          // Mobile: hamburger menu should be visible
          cy.get('[data-testid="mobile-menu-button"]').should('be.visible')
          cy.get('[data-testid="desktop-navigation"]').should('not.be.visible')
          
          // Test mobile menu functionality
          cy.get('[data-testid="mobile-menu-button"]').click()
          cy.get('[data-testid="mobile-menu"]').should('be.visible')
          
          // Test navigation items in mobile menu
          cy.get('[data-testid="mobile-nav-dashboard"]').should('be.visible')
          cy.get('[data-testid="mobile-nav-analytics"]').should('be.visible')
          cy.get('[data-testid="mobile-nav-health"]').should('be.visible')
        } else {
          // Tablet/Desktop: regular navigation should be visible
          cy.get('[data-testid="desktop-navigation"]').should('be.visible')
          cy.get('[data-testid="mobile-menu-button"]').should('not.be.visible')
        }
      })

      it('should display KPI cards responsively', () => {
        cy.get('[data-testid="kpi-cards"]').should('be.visible')
        
        if (viewport.width < 768) {
          // Mobile: cards should stack vertically
          cy.get('[data-testid="kpi-card"]').should('have.length.at.least', 1)
          cy.get('[data-testid="kpi-cards"]').should('have.css', 'flex-direction', 'column')
        } else {
          // Tablet/Desktop: cards should be in a row or grid
          cy.get('[data-testid="kpi-cards"]').should('have.css', 'display').and('match', /(flex|grid)/)
        }
      })

      it('should handle date picker on mobile', () => {
        cy.get('[data-testid="date-range-picker"]').should('be.visible')
        
        if (viewport.width < 768) {
          // Mobile: date inputs should be touch-friendly
          cy.get('[data-testid="start-date-input"]').should('have.css', 'min-height').and('match', /44px|3rem|48px/)
          cy.get('[data-testid="end-date-input"]').should('have.css', 'min-height').and('match', /44px|3rem|48px/)
          
          // Test touch interaction
          cy.get('[data-testid="start-date-input"]').click()
          cy.get('[data-testid="start-date-input"]').should('be.focused')
        }
      })

      it('should display charts responsively', () => {
        cy.visit('/analytics')
        cy.get('[data-testid="analytics-container"]').should('be.visible')
        
        // Charts should be visible and responsive
        cy.get('[data-testid="line-chart"]').should('be.visible')
        cy.get('[data-testid="bar-chart"]').should('be.visible')
        cy.get('[data-testid="pie-chart"]').should('be.visible')
        
        if (viewport.width < 768) {
          // Mobile: charts should stack vertically
          cy.get('[data-testid="charts-container"]').should('have.css', 'flex-direction', 'column')
        } else {
          // Tablet/Desktop: charts can be in grid layout
          cy.get('[data-testid="charts-container"]').should('have.css', 'display').and('match', /(flex|grid)/)
        }
        
        // Charts should fit within viewport
        cy.get('[data-testid="line-chart"] canvas').then($canvas => {
          const canvasWidth = $canvas[0].getBoundingClientRect().width
          expect(canvasWidth).to.be.at.most(viewport.width - 32) // Account for padding
        })
      })

      it('should handle data table on mobile', () => {
        cy.get('[data-testid="data-table"]').should('be.visible')
        
        if (viewport.width < 768) {
          // Mobile: table should be horizontally scrollable
          cy.get('[data-testid="table-container"]').should('have.css', 'overflow-x', 'auto')
          
          // Test horizontal scrolling
          cy.get('[data-testid="data-table"]').scrollTo('right')
          cy.get('[data-testid="data-table"]').scrollTo('left')
        }
        
        // Pagination should be touch-friendly
        cy.get('[data-testid="pagination-controls"]').should('be.visible')
        cy.get('[data-testid="pagination-button"]').should('have.css', 'min-height').and('match', /44px|3rem|48px/)
      })

      it('should handle filter panel on mobile', () => {
        cy.get('[data-testid="filter-panel"]').should('be.visible')
        
        if (viewport.width < 768) {
          // Mobile: filters might be collapsible
          cy.get('[data-testid="filter-toggle"]').should('be.visible')
          cy.get('[data-testid="filter-toggle"]').click()
          cy.get('[data-testid="filter-content"]').should('be.visible')
        }
        
        // Filter inputs should be touch-friendly
        cy.get('[data-testid="source-filter"]').should('have.css', 'min-height').and('match', /44px|3rem|48px/)
        cy.get('[data-testid="apply-filters-button"]').should('have.css', 'min-height').and('match', /44px|3rem|48px/)
      })

      it('should maintain readability on mobile', () => {
        // Text should be readable without zooming
        cy.get('body').should('have.css', 'font-size').and('match', /(14px|16px|1rem|1.125rem)/)
        
        // Headings should be appropriately sized
        cy.get('h1').should('have.css', 'font-size').and('match', /(24px|28px|32px|1.5rem|1.75rem|2rem)/)
        
        // Line height should be adequate for readability
        cy.get('p, div').should('have.css', 'line-height').and('match', /(1.4|1.5|1.6)/)
      })

      it('should handle touch interactions', () => {
        // Test touch events on interactive elements
        cy.get('[data-testid="refresh-button"]').trigger('touchstart')
        cy.get('[data-testid="refresh-button"]').trigger('touchend')
        
        // Test swipe gestures on charts (if implemented)
        cy.visit('/analytics')
        cy.get('[data-testid="line-chart"]').trigger('touchstart', { touches: [{ clientX: 100, clientY: 100 }] })
        cy.get('[data-testid="line-chart"]').trigger('touchmove', { touches: [{ clientX: 200, clientY: 100 }] })
        cy.get('[data-testid="line-chart"]').trigger('touchend')
      })

      it('should handle orientation changes', () => {
        if (viewport.width < viewport.height) {
          // Test landscape orientation
          cy.viewport(viewport.height, viewport.width)
          cy.get('[data-testid="app-container"]').should('be.visible')
          cy.get('[data-testid="kpi-cards"]').should('be.visible')
          
          // Switch back to portrait
          cy.viewport(viewport.width, viewport.height)
          cy.get('[data-testid="app-container"]').should('be.visible')
        }
      })

      it('should maintain performance on mobile', () => {
        const startTime = Date.now()
        
        cy.visit('/analytics')
        cy.get('[data-testid="analytics-container"]').should('be.visible')
        
        cy.then(() => {
          const loadTime = Date.now() - startTime
          // Mobile should still load within 3 seconds
          expect(loadTime).to.be.lessThan(3000)
        })
      })
    })
  })

  describe('Cross-Device Consistency', () => {
    it('should maintain consistent functionality across devices', () => {
      viewports.forEach(viewport => {
        cy.viewport(viewport.width, viewport.height)
        cy.visit('/')
        
        // Core functionality should work on all devices
        cy.get('[data-testid="refresh-button"]').should('be.visible')
        cy.get('[data-testid="kpi-cards"]').should('be.visible')
        
        // Navigation should work
        if (viewport.width < 768) {
          cy.get('[data-testid="mobile-menu-button"]').click()
          cy.get('[data-testid="mobile-nav-analytics"]').click()
        } else {
          cy.get('[data-testid="nav-analytics"]').click()
        }
        
        cy.url().should('include', '/analytics')
        cy.get('[data-testid="analytics-container"]').should('be.visible')
      })
    })
  })

  describe('iOS Safari Specific Tests', () => {
    beforeEach(() => {
      cy.viewport(375, 667) // iPhone SE
      // Simulate iOS Safari user agent
      cy.visit('/', {
        onBeforeLoad: (win) => {
          Object.defineProperty(win.navigator, 'userAgent', {
            value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
          })
        }
      })
    })

    it('should handle iOS Safari specific behaviors', () => {
      // Test date input behavior on iOS
      cy.get('[data-testid="start-date-input"]').should('have.attr', 'type', 'date')
      cy.get('[data-testid="start-date-input"]').click()
      
      // Test viewport height handling (iOS Safari address bar)
      cy.get('[data-testid="app-container"]').should('have.css', 'min-height')
      
      // Test touch scrolling
      cy.get('[data-testid="data-table"]').scrollTo('bottom')
      cy.get('[data-testid="data-table"]').scrollTo('top')
    })

    it('should handle iOS Safari form validation', () => {
      // Test form validation styling
      cy.get('[data-testid="start-date-input"]').clear()
      cy.get('[data-testid="apply-filters-button"]').click()
      
      cy.get('[data-testid="start-date-input"]').should('have.attr', 'aria-invalid', 'true')
    })
  })

  describe('Chrome Mobile Specific Tests', () => {
    beforeEach(() => {
      cy.viewport(360, 800) // Typical Android viewport
      // Simulate Chrome Mobile user agent
      cy.visit('/', {
        onBeforeLoad: (win) => {
          Object.defineProperty(win.navigator, 'userAgent', {
            value: 'Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.210 Mobile Safari/537.36'
          })
        }
      })
    })

    it('should handle Chrome Mobile specific behaviors', () => {
      // Test Chrome Mobile features
      cy.get('[data-testid="app-container"]').should('be.visible')
      
      // Test pull-to-refresh prevention
      cy.get('body').should('have.css', 'overscroll-behavior-y', 'contain')
      
      // Test Chrome Mobile form handling
      cy.get('[data-testid="start-date-input"]').should('be.visible')
      cy.get('[data-testid="start-date-input"]').click()
    })

    it('should handle Android keyboard interactions', () => {
      // Test input focus behavior
      cy.get('[data-testid="table-search"]').click()
      cy.get('[data-testid="table-search"]').should('be.focused')
      
      // Test keyboard appearance handling
      cy.get('[data-testid="table-search"]').type('test')
      cy.get('[data-testid="app-container"]').should('be.visible')
    })
  })
})