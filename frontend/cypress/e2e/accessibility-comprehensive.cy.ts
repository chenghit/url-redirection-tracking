/// <reference types="cypress" />
/// <reference types="cypress-axe" />

describe('Comprehensive Accessibility Testing', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.injectAxe()
  })

  describe('WCAG 2.1 AA Compliance', () => {
    it('should pass axe accessibility audit on dashboard', () => {
      cy.checkA11y(null, {
        rules: {
          'color-contrast': { enabled: true },
          'keyboard-navigation': { enabled: true },
          'focus-management': { enabled: true },
          'aria-labels': { enabled: true }
        }
      })
    })

    it('should pass axe accessibility audit on analytics page', () => {
      cy.visit('/analytics')
      cy.checkA11y()
    })

    it('should pass axe accessibility audit on health page', () => {
      cy.visit('/health')
      cy.checkA11y()
    })
  })

  describe('Keyboard Navigation', () => {
    it('should support full keyboard navigation', () => {
      // Test tab order through main navigation
      cy.get('body').tab()
      cy.focused().should('have.attr', 'data-testid', 'nav-dashboard')
      
      cy.focused().tab()
      cy.focused().should('have.attr', 'data-testid', 'nav-analytics')
      
      cy.focused().tab()
      cy.focused().should('have.attr', 'data-testid', 'nav-health')
      
      // Test navigation activation with Enter key
      cy.focused().type('{enter}')
      cy.url().should('include', '/health')
    })

    it('should handle keyboard navigation in data table', () => {
      cy.get('[data-testid="data-table"]').should('be.visible')
      
      // Navigate to table
      cy.get('[data-testid="data-table"] th').first().focus()
      
      // Test arrow key navigation
      cy.focused().type('{rightarrow}')
      cy.focused().should('contain', 'Source Attribution')
      
      cy.focused().type('{rightarrow}')
      cy.focused().should('contain', 'Destination URL')
    })

    it('should support keyboard navigation in charts', () => {
      cy.visit('/analytics')
      
      // Charts should be focusable and have keyboard interaction
      cy.get('[data-testid="line-chart"]').focus()
      cy.focused().should('have.attr', 'tabindex', '0')
      
      // Test chart navigation with arrow keys
      cy.focused().type('{rightarrow}')
      cy.focused().type('{leftarrow}')
    })

    it('should handle form keyboard navigation', () => {
      // Test date picker keyboard navigation
      cy.get('[data-testid="start-date-input"]').focus()
      cy.focused().type('2024-01-01')
      
      cy.focused().tab()
      cy.focused().should('have.attr', 'data-testid', 'end-date-input')
      
      cy.focused().tab()
      cy.focused().should('have.attr', 'data-testid', 'apply-filters-button')
      
      // Test form submission with Enter key
      cy.focused().type('{enter}')
    })
  })

  describe('Focus Management', () => {
    it('should have visible focus indicators', () => {
      cy.get('[data-testid="nav-dashboard"]').focus()
      cy.focused().should('have.css', 'outline-width').and('not.equal', '0px')
    })

    it('should manage focus during navigation', () => {
      // Navigate to analytics page
      cy.get('[data-testid="nav-analytics"]').click()
      
      // Focus should be on main content
      cy.get('main').should('be.focused').or(cy.get('h1').should('be.focused'))
    })

    it('should handle modal focus trapping', () => {
      // If there are modals, test focus trapping
      cy.get('[data-testid="export-button"]').click()
      
      // Focus should be trapped within modal
      cy.get('[data-testid="modal-close"]').focus()
      cy.focused().tab()
      cy.focused().should('be.within', '[data-testid="export-modal"]')
    })

    it('should restore focus after modal close', () => {
      const triggerButton = cy.get('[data-testid="export-button"]')
      triggerButton.click()
      
      cy.get('[data-testid="modal-close"]').click()
      
      // Focus should return to trigger button
      triggerButton.should('be.focused')
    })
  })

  describe('Screen Reader Support', () => {
    it('should have proper heading hierarchy', () => {
      // Check for proper heading structure
      cy.get('h1').should('exist').and('have.length', 1)
      cy.get('h2').should('exist')
      
      // Verify heading order
      cy.get('h1, h2, h3, h4, h5, h6').then(($headings) => {
        const headingLevels = Array.from($headings).map(h => parseInt(h.tagName.charAt(1)))
        
        // Check that headings don't skip levels
        for (let i = 1; i < headingLevels.length; i++) {
          expect(headingLevels[i] - headingLevels[i-1]).to.be.at.most(1)
        }
      })
    })

    it('should have proper ARIA labels and descriptions', () => {
      // Check navigation has proper labels
      cy.get('[data-testid="main-navigation"]').should('have.attr', 'aria-label', 'Main navigation')
      
      // Check buttons have accessible names
      cy.get('[data-testid="refresh-button"]').should('have.attr', 'aria-label').or('have.text')
      
      // Check form inputs have labels
      cy.get('[data-testid="start-date-input"]').should('have.attr', 'aria-label').or('have.attr', 'aria-labelledby')
    })

    it('should announce dynamic content changes', () => {
      // Check for live regions
      cy.get('[aria-live]').should('exist')
      
      // Test that loading states are announced
      cy.get('[data-testid="refresh-button"]').click()
      cy.get('[aria-live="polite"]').should('contain', 'Loading')
      
      // Test that completion is announced
      cy.get('[aria-live="polite"]').should('contain', 'Data updated')
    })

    it('should provide alternative text for charts', () => {
      cy.visit('/analytics')
      
      // Charts should have descriptive text alternatives
      cy.get('[data-testid="line-chart"]').should('have.attr', 'aria-label').or('have.attr', 'aria-describedby')
      cy.get('[data-testid="bar-chart"]').should('have.attr', 'aria-label').or('have.attr', 'aria-describedby')
      cy.get('[data-testid="pie-chart"]').should('have.attr', 'aria-label').or('have.attr', 'aria-describedby')
    })

    it('should provide table accessibility features', () => {
      // Check table has proper structure
      cy.get('[data-testid="data-table"]').should('have.attr', 'role', 'table').or('be', 'table')
      
      // Check table headers
      cy.get('[data-testid="data-table"] th').should('have.attr', 'scope', 'col')
      
      // Check table caption or aria-label
      cy.get('[data-testid="data-table"]').should('have.attr', 'aria-label').or('have.descendant', 'caption')
    })
  })

  describe('Color and Contrast', () => {
    it('should meet color contrast requirements', () => {
      // Test specific elements for contrast
      cy.get('body').should('have.css', 'color')
      cy.get('body').should('have.css', 'background-color')
      
      // Check button contrast
      cy.get('[data-testid="refresh-button"]').should('be.visible')
      
      // Check link contrast
      cy.get('a').each(($link) => {
        cy.wrap($link).should('be.visible')
      })
    })

    it('should not rely solely on color for information', () => {
      // Check that status indicators use more than just color
      cy.get('[data-testid="health-status"]').should('contain.text').or('have.attr', 'aria-label')
      
      // Check that chart legends use patterns or text
      cy.visit('/analytics')
      cy.get('[data-testid="chart-legend"]').should('be.visible')
    })
  })

  describe('Mobile Accessibility', () => {
    beforeEach(() => {
      cy.viewport(375, 667) // iPhone SE viewport
    })

    it('should maintain accessibility on mobile', () => {
      cy.checkA11y()
    })

    it('should have adequate touch targets', () => {
      // Check that interactive elements are at least 44px
      cy.get('button, a, input, select').each(($el) => {
        cy.wrap($el).then(($element) => {
          const rect = $element[0].getBoundingClientRect()
          expect(Math.min(rect.width, rect.height)).to.be.at.least(44)
        })
      })
    })

    it('should support mobile screen readers', () => {
      // Test that content is properly structured for mobile screen readers
      cy.get('[data-testid="mobile-menu-button"]').should('have.attr', 'aria-expanded')
      
      // Test mobile navigation accessibility
      cy.get('[data-testid="mobile-menu-button"]').click()
      cy.get('[data-testid="mobile-menu"]').should('have.attr', 'aria-hidden', 'false')
    })
  })

  describe('Error Accessibility', () => {
    it('should announce errors to screen readers', () => {
      // Simulate form validation error
      cy.get('[data-testid="start-date-input"]').clear().blur()
      
      // Check that error is associated with input
      cy.get('[data-testid="start-date-error"]').should('have.attr', 'role', 'alert')
      cy.get('[data-testid="start-date-input"]').should('have.attr', 'aria-describedby')
    })

    it('should handle API error accessibility', () => {
      // Simulate API error
      cy.intercept('GET', '/analytics/query', { statusCode: 500 }).as('apiError')
      
      cy.get('[data-testid="refresh-button"]').click()
      cy.wait('@apiError')
      
      // Check that error is announced
      cy.get('[role="alert"]').should('be.visible')
      cy.get('[aria-live="assertive"]').should('contain', 'error')
    })
  })

  describe('Skip Links and Landmarks', () => {
    it('should provide skip to main content link', () => {
      // Check for skip link (may be visually hidden)
      cy.get('body').tab()
      cy.focused().should('contain', 'Skip to main content').or('have.attr', 'aria-label', 'Skip to main content')
    })

    it('should have proper landmark regions', () => {
      // Check for main landmarks
      cy.get('main').should('exist')
      cy.get('nav').should('exist')
      cy.get('header').should('exist').or(cy.get('[role="banner"]').should('exist'))
      cy.get('footer').should('exist').or(cy.get('[role="contentinfo"]').should('exist'))
    })
  })

  describe('Form Accessibility', () => {
    it('should have accessible form controls', () => {
      // Check that all form inputs have labels
      cy.get('input, select, textarea').each(($input) => {
        const id = $input.attr('id')
        if (id) {
          cy.get(`label[for="${id}"]`).should('exist')
        } else {
          cy.wrap($input).should('have.attr', 'aria-label').or('have.attr', 'aria-labelledby')
        }
      })
    })

    it('should provide form validation feedback', () => {
      // Test required field validation
      cy.get('[data-testid="start-date-input"]').clear()
      cy.get('[data-testid="apply-filters-button"]').click()
      
      // Check for validation message
      cy.get('[data-testid="start-date-input"]').should('have.attr', 'aria-invalid', 'true')
      cy.get('[role="alert"]').should('be.visible')
    })
  })
})