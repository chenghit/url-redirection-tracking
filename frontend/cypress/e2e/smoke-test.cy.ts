describe('Smoke Test', () => {
  it('should load the application', () => {
    cy.visit('/')
    cy.get('body').should('be.visible')
    cy.title().should('not.be.empty')
  })
})