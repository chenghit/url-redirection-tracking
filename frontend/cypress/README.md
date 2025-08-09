# End-to-End Tests

This directory contains Cypress end-to-end tests for the Analytics Web Dashboard.

## Test Structure

### Test Files

- **dashboard-journey.cy.ts**: Tests complete dashboard user workflows including KPI display, filtering, and data refresh
- **analytics-journey.cy.ts**: Tests analytics page functionality including charts, data table, and interactions
- **health-monitoring.cy.ts**: Tests health monitoring page with system status and component health checks
- **navigation-flow.cy.ts**: Tests navigation between pages, browser history, and responsive navigation
- **responsive-accessibility.cy.ts**: Tests responsive design and WCAG 2.1 AA accessibility compliance
- **data-export.cy.ts**: Tests CSV and PNG export functionality with error handling and performance

### Fixtures

- **analytics-query.json**: Mock data for analytics query API responses
- **analytics-aggregate.json**: Mock data for analytics aggregate API responses
- **health-basic.json**: Mock data for basic health check responses
- **health-deep.json**: Mock data for deep health check responses
- **analytics-large-dataset.json**: Mock data for testing large dataset handling

### Custom Commands

The tests use custom Cypress commands defined in `support/commands.ts`:

- `cy.waitForDashboard()`: Waits for dashboard to load with data
- `cy.navigateToPage(page)`: Navigates to specific page
- `cy.setDateRange(start, end)`: Sets date range filter
- `cy.exportData(format)`: Exports data in specified format
- `cy.checkResponsive(viewport)`: Tests responsive behavior
- `cy.checkA11y()`: Runs accessibility checks

## Running Tests

### Prerequisites

1. Ensure the development server is running on `http://localhost:5173`
2. Install dependencies: `npm install`

### Commands

```bash
# Open Cypress Test Runner (interactive mode)
npm run cypress:open

# Run all tests headlessly
npm run cypress:run

# Run tests with dev server (recommended)
npm run e2e

# Open Cypress with dev server running
npm run e2e:open
```

### Individual Test Execution

```bash
# Run specific test file
npx cypress run --spec "cypress/e2e/dashboard-journey.cy.ts"

# Run tests matching pattern
npx cypress run --spec "cypress/e2e/*journey*.cy.ts"
```

## Test Coverage

The E2E tests cover the following critical user workflows:

### Dashboard Workflows
- ✅ Loading dashboard with KPI cards
- ✅ Filtering data by date range
- ✅ Manual data refresh
- ✅ Error handling and recovery
- ✅ CSV data export

### Analytics Workflows
- ✅ Interactive chart display (line, bar, pie)
- ✅ Chart interactions and tooltips
- ✅ Data table with pagination and sorting
- ✅ Advanced filtering and search
- ✅ Chart PNG export

### Health Monitoring Workflows
- ✅ System health overview
- ✅ Component status monitoring
- ✅ Performance metrics display
- ✅ Auto-refresh functionality
- ✅ Error state handling

### Navigation Workflows
- ✅ Page-to-page navigation
- ✅ Browser back/forward navigation
- ✅ Direct URL access
- ✅ 404 error handling
- ✅ Mobile responsive navigation

### Accessibility & Responsive Design
- ✅ WCAG 2.1 AA compliance
- ✅ Keyboard navigation
- ✅ Screen reader support
- ✅ Mobile/tablet/desktop layouts
- ✅ Color contrast validation
- ✅ Focus management

### Data Export
- ✅ CSV export with filtering
- ✅ PNG chart export
- ✅ Export error handling
- ✅ Large dataset performance
- ✅ Export accessibility

## Configuration

### Cypress Configuration

The tests are configured in `cypress.config.ts` with:

- Base URL: `http://localhost:5173`
- Viewport: 1280x720 (desktop default)
- Timeouts: 10 seconds for commands and requests
- Video recording: Disabled (for faster execution)
- Screenshots: Enabled on failure

### API Mocking

Tests use Cypress intercepts to mock API responses:

```typescript
cy.intercept('GET', '/analytics/query*', { fixture: 'analytics-query.json' }).as('getAnalyticsQuery')
cy.intercept('GET', '/health', { fixture: 'health-basic.json' }).as('getHealthBasic')
```

### Responsive Testing

Tests include responsive behavior validation:

```typescript
cy.checkResponsive('mobile')   // 375x667
cy.checkResponsive('tablet')   // 768x1024
cy.checkResponsive('desktop')  // 1280x720
```

### Accessibility Testing

Tests include automated accessibility checks using cypress-axe:

```typescript
cy.checkA11y() // Runs axe-core accessibility audit
```

## Best Practices

### Test Data Management
- Use fixtures for consistent mock data
- Include edge cases and error scenarios
- Test with realistic data volumes

### Test Reliability
- Wait for elements to be visible before interaction
- Use data-testid attributes for stable selectors
- Mock API responses for consistent behavior

### Performance Testing
- Test with large datasets
- Verify loading states and progress indicators
- Include timeout handling

### Accessibility Testing
- Test keyboard navigation paths
- Verify ARIA labels and roles
- Check color contrast and focus indicators
- Test with screen reader announcements

## Troubleshooting

### Common Issues

1. **Tests failing due to timing**: Increase timeouts or add proper waits
2. **API mocking not working**: Check intercept patterns match actual requests
3. **Element not found**: Verify data-testid attributes exist in components
4. **Accessibility failures**: Check ARIA labels and semantic HTML structure

### Debug Mode

Run tests in debug mode for troubleshooting:

```bash
# Open Cypress with debug logging
DEBUG=cypress:* npm run cypress:open

# Run specific test with video recording
npx cypress run --spec "cypress/e2e/dashboard-journey.cy.ts" --record
```

### Test Data Verification

Verify mock data matches actual API responses:

```bash
# Check API endpoints manually
curl -H "x-api-key: YOUR_API_KEY" "https://your-api-gateway.amazonaws.com/analytics/query"
```

## Continuous Integration

For CI/CD pipelines, use headless mode:

```bash
# CI-friendly command
npm run cypress:run --browser chrome --headless
```

Include test results in CI reports:

```bash
# Generate JUnit XML reports
npx cypress run --reporter junit --reporter-options mochaFile=results/test-results.xml
```