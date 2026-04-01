import { Common } from '../utils/common';

/** Max wait for PAH/catalog sync — fetches can take 1–5+ minutes in some environments. */
const CATALOG_LOAD_TIMEOUT_MS = 300000;

function waitForCatalogDataOrEmptyState() {
  cy.get('body', { timeout: CATALOG_LOAD_TIMEOUT_MS }).should($body => {
    const text = $body.text();
    const empty =
      text.includes('No Collections Found') ||
      text.includes('No content sources configured');
    const hasCards = $body.find('main .MuiCard-root').length >= 1;
    expect(
      empty || hasCards,
      'catalog shows collection cards or empty/unconfigured message',
    ).to.be.true;
  });
}

function navigateToCollectionsPage() {
  cy.visit('/');
  cy.get('main', { timeout: 30000 }).should('be.visible');
  cy.wait(1000);

  cy.get('body').then($body => {
    const $candidates = $body.find('a[href*="/self-service/collections"]');
    const $indexLink = $candidates.filter((_, el) => {
      const href = el.getAttribute('href') || '';
      return /\/self-service\/collections\/?(\?.*)?$/.test(href);
    });
    if ($indexLink.length > 0) {
      cy.wrap($indexLink.first()).scrollIntoView().click({ force: true });
    } else {
      cy.log('Sidebar Collections index link not found — using direct URL');
      cy.visit('/self-service/collections');
    }
  });

  cy.url({ timeout: 20000 }).should('include', '/self-service/collections');
  cy.url().should('match', /\/self-service\/collections\/?(\?.*)?$/);
  cy.get('main', { timeout: 30000 }).should('be.visible');
}

function navigateToCollectionsIndexViaSidebar() {
  cy.get('body').then($body => {
    const $nav = $body.find('a[href*="/self-service/collections"]');
    const $indexLink = $nav.filter((_, el) => {
      const href = el.getAttribute('href') || '';
      return /\/self-service\/collections\/?(\?.*)?$/.test(href);
    });
    if ($indexLink.length) {
      cy.wrap($indexLink.first()).scrollIntoView().click({ force: true });
    } else {
      cy.visit('/self-service/collections');
    }
  });
  cy.url({ timeout: 20000 }).should('match', /\/self-service\/collections\/?(\?.*)?$/);
  cy.get('main', { timeout: 30000 }).should('be.visible');
}

describe('self-service Login', () => {
  it('Sign In to self-service', { retries: 2 }, () => {
    Common.LogintoAAP();
  });
});

describe('Collections Detail Page', () => {
  beforeEach(() => {
    navigateToCollectionsPage();
    waitForCatalogDataOrEmptyState();
    cy.wait(500);
  });

  it('Detail view: sidebar → card → View Source, About, Resources, sidebar to catalog', () => {
    cy.get('body').then($body => {
      const text = $body.text();
      if (
        text.includes('No Collections Found') ||
        text.includes('No content sources configured')
      ) {
        cy.log('Skipping detail flow — empty or unconfigured catalog');
        return;
      }
      if ($body.find('main .MuiCard-root').length === 0) {
        cy.log('Skipping detail flow — no collection cards');
        return;
      }

      // 1) Open first collection (left click avoids star)
      cy.get('main .MuiCard-root', { timeout: 30000 })
        .first()
        .click('left', { force: true });
      cy.url({ timeout: 60000 }).should(
        'match',
        /\/self-service\/collections\/.+/,
      );
      cy.contains('About', { timeout: 120000 }).should('be.visible');

      // 2) View Source (header) — uses window.open; main tab stays on detail
      cy.get('body').then($b => {
        const hasViewSource = [...$b.find('button')].some(btn =>
          (btn.textContent || '').includes('View Source'),
        );
        if (hasViewSource) {
          cy.contains('button', 'View Source').click({ force: true });
          cy.wait(500);
          cy.url().should('match', /\/self-service\/collections\/.+/);
        } else {
          cy.log(
            'View Source not shown — skipping (no source URL on entity)',
          );
        }
      });

      // 3) About: refresh (re-fetches entity; low-risk smoke)
      cy.contains('About')
        .parents('.MuiCard-root')
        .first()
        .within(() => {
          cy.get('button').first().click({ force: true });
        });
      cy.wait(1200);
      cy.url().should('match', /\/self-service\/collections\/.+/);

      // 4) About: Source row link — same handler as View Source; main tab unchanged
      cy.contains('About')
        .parents('.MuiCard-root')
        .first()
        .within(() => {
          cy.get('a[href^="http"]').then($links => {
            if ($links.length > 0) {
              cy.wrap($links.first()).click({ force: true });
              cy.wait(500);
              cy.url().should('match', /\/self-service\/collections\/.+/);
            } else {
              cy.log('No Source link in About — skipped');
            }
          });
        });

      // 5) Resources: titles come from catalog (Repository, Documentation, README, …)
      cy.get('body').then($b => {
        if (!$b.text().includes('Resources')) {
          cy.log(
            'No Resources card — skipping (entity has no metadata.links / readme)',
          );
          return;
        }
        cy.contains('Resources')
          .parents('.MuiCard-root')
          .first()
          .find('a[href^="http"]')
          .each($a => {
            cy.wrap($a)
              .invoke('removeAttr', 'target')
              .click({ force: true });
            cy.wait(1000);
            cy.url().then(url => {
              if (!url.includes('/self-service/collections/')) {
                cy.go('back');
              }
            });
            cy.url({ timeout: 20000 }).should(
              'match',
              /\/self-service\/collections\/.+/,
            );
          });
      });

      // 6) Sidebar: Collections → catalog index
      navigateToCollectionsIndexViaSidebar();
      cy.contains(/Ansible Collections|Collections/, { timeout: 20000 }).should(
        'exist',
      );
    });
  });
});

describe('Collections Detail Page — edge routes', () => {
  it('Loads collection detail route for unknown slug (breadcrumbs / empty state)', () => {
    cy.visit('/self-service/collections/e2e-nonexistent-collection-slug');
    cy.wait(2000);

    cy.url({ timeout: 15000 }).should(
      'include',
      '/self-service/collections/e2e-nonexistent-collection-slug',
    );
    cy.get('main', { timeout: 15000 }).should('be.visible');

    cy.contains('Collections').should('exist');
    cy.get('body').then($body => {
      const text = $body.text();
      if (text.includes('No Collections Found')) {
        cy.contains('No Collections Found').should('exist');
      } else if (text.includes('Loading')) {
        cy.log('Detail page still loading entity — soft check only');
      }
    });
  });
});
