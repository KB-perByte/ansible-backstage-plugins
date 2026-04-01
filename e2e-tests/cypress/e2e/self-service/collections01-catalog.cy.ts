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

describe('self-service Login', () => {
  it('Sign In to self-service', { retries: 2 }, () => {
    Common.LogintoAAP();
  });
});

describe('Collections Catalog — catalog page', () => {
  beforeEach(() => {
    navigateToCollectionsPage();
    waitForCatalogDataOrEmptyState();
    cy.wait(500);
  });

  it('Sidebar: reaches Collections; filters, sync, cards, detail, and return via sidebar', () => {
    cy.url({ timeout: 15000 }).should('include', '/self-service/collections');
    cy.get('main', { timeout: 15000 }).should('be.visible');
    cy.contains(/Ansible Collections|Collections/, { timeout: 20000 }).should(
      'exist',
    );

    cy.get('body').then($body => {
      const text = $body.text();
      if (
        text.includes('No Collections Found') ||
        text.includes('No content sources configured')
      ) {
        cy.log('Collections empty or unconfigured — skipping interactive flow');
        return;
      }

      // --- 1) Source Type & Tags (MUI Autocomplete): open and dismiss ---
      const $srcInput = $body.find('input[placeholder="Search sources..."]');
      if ($srcInput.length > 0) {
        cy.get('input[placeholder="Search sources..."]')
          .first()
          .click({ force: true });
        cy.wait(400);
        cy.get('body').type('{esc}');
        cy.log('Source Type autocomplete opened and closed');
      }

      const $tagInput = $body.find('input[placeholder="Search tags..."]');
      if ($tagInput.length > 0) {
        cy.get('input[placeholder="Search tags..."]')
          .first()
          .click({ force: true });
        cy.wait(400);
        cy.get('body').type('{esc}');
        cy.log('Tags autocomplete opened and closed');
      }

      // --- "Show latest version only" checkbox (below Tags) ---
      cy.get('body').then($b2 => {
        if ($b2.text().includes('Show latest version only')) {
          cy.contains('Show latest version only', { timeout: 10000 })
            .parent()
            .find('input[type="checkbox"]')
            .first()
            .check({ force: true });
          cy.wait(500);
          cy.contains('Show latest version only')
            .parent()
            .find('input[type="checkbox"]')
            .first()
            .uncheck({ force: true });
          cy.wait(300);
          cy.log('Show latest version only toggled');
        }
      });

      // --- 2) Sync Now (header, top right) ---
      cy.get('body').then($b3 => {
        if ($b3.text().includes('Sync Now')) {
          cy.contains('button', 'Sync Now').then($btn => {
            if ($btn.is(':disabled')) {
              cy.log('Sync Now disabled — skipping click');
            } else {
              cy.contains('button', 'Sync Now').click({ force: true });
              cy.wait(1000);
              cy.get('body').then($after => {
                if (
                  $after.find('[role="dialog"]').length > 0 ||
                  $after.text().includes('Sync')
                ) {
                  cy.log(
                    'Sync action triggered (dialog or sync UI may be visible)',
                  );
                }
              });
            }
          });
        }
      });

      // --- 3) Collection cards: star, source link, then title → detail; sidebar → list ---
      // Cards already waited for in beforeEach; keep a modest timeout for re-renders.
      cy.get('main .MuiCard-root', { timeout: 30000 })
        .should('have.length.at.least', 1)
        .first()
        .as('firstCard');

      // Star (favorite)
      cy.get('@firstCard').within(() => {
        cy.get('button[aria-label*="favorite" i]', { timeout: 10000 })
          .first()
          .click({ force: true });
      });
      cy.wait(800);
      cy.get('@firstCard').within(() => {
        cy.get('button[aria-label*="favorite" i]')
          .first()
          .click({ force: true });
      });
      cy.wait(500);
      cy.log('Star toggle exercised on first card');

      // Source link (external): assert href; open in same tab for back navigation
      cy.get('@firstCard').within(() => {
        cy.get('a[href^="http"]', { timeout: 10000 }).then($links => {
          if ($links.length > 0) {
            cy.wrap($links.first())
              .should('have.attr', 'href')
              .and('match', /^https?:\/\//);
            cy.wrap($links.first()).invoke('removeAttr', 'target').click({
              force: true,
            });
          } else {
            cy.log(
              'No external source link on first card — skipping link navigation',
            );
          }
        });
      });
      cy.wait(1500);
      cy.url().then(url => {
        if (!url.includes('/self-service/collections')) {
          cy.go('back');
        }
      });
      cy.url({ timeout: 15000 }).should('include', '/self-service/collections');

      // Card click (left side avoids star) → detail view .../collections/:name
      cy.get('main .MuiCard-root', { timeout: 30000 })
        .first()
        .click('left', { force: true });
      cy.wait(2000);
      cy.url({ timeout: 15000 }).should(
        'match',
        /\/self-service\/collections\/.+/,
      );

      // Sidebar: Collections → back to catalog list (index)
      cy.get('body').then($b4 => {
        const $nav = $b4.find('a[href*="/self-service/collections"]');
        const $indexLink = $nav.filter((_, el) => {
          const href = el.getAttribute('href') || '';
          return /\/self-service\/collections\/?(\?.*)?$/.test(href);
        });
        if ($indexLink.length) {
          cy.wrap($indexLink.first()).click({ force: true });
        } else {
          cy.visit('/self-service/collections');
        }
      });
      cy.wait(1500);
      cy.url({ timeout: 15000 }).should(
        'match',
        /\/self-service\/collections\/?(\?.*)?$/,
      );
      cy.get('main', { timeout: 15000 }).should('be.visible');
      cy.contains('Ansible Collections', { timeout: 15000 }).should('exist');
    });
  });

  it('Validates search input when the catalog list is shown', () => {
    cy.get('body').then($body => {
      const text = $body.text();
      if (
        text.includes('No Collections Found') ||
        text.includes('No content sources configured')
      ) {
        cy.log('Skipping search — empty or unconfigured');
        return;
      }
      const $search = $body.find('input[placeholder="Search"]');
      if ($search.length === 0) return;
      cy.get('input[placeholder="Search"]')
        .first()
        .type('e2e', { force: true });
      cy.wait(400);
      cy.get('input[placeholder="Search"]').first().clear({ force: true });
    });
  });

  it('Validates All / Starred user filter when user picker is visible', () => {
    cy.get('body').then($body => {
      const $container = $body
        .find('[data-testid="user-picker-container"]')
        .first();
      if ($container.length === 0) return;
      const $buttons = $container.find('button, [role="button"]');
      const starredButton = $buttons.filter((_, btn) => {
        const t = (btn.textContent || '').toLowerCase();
        const a = (btn.getAttribute('aria-label') || '').toLowerCase();
        return t.includes('starred') || a.includes('starred');
      });
      if (starredButton.length > 0) {
        cy.wrap(starredButton.first()).click({ force: true });
        cy.wait(800);
        const allButton = $buttons.filter((_, btn) => {
          const t = (btn.textContent || '').toLowerCase();
          const a = (btn.getAttribute('aria-label') || '').toLowerCase();
          return t.includes('all') || a.includes('all');
        });
        if (allButton.length > 0) {
          cy.wrap(allButton.first()).click({ force: true });
        }
      }
    });
  });

  it('Pagination: next and previous when multiple pages exist', () => {
    cy.get('body').then($body => {
      const text = $body.text();
      if (
        text.includes('No Collections Found') ||
        text.includes('No content sources configured')
      ) {
        cy.log('Skipping pagination — empty or unconfigured');
        return;
      }

      const $next = $body.find('[aria-label="Next page"]');
      if ($next.length === 0) {
        cy.log(
          'Skipping pagination — footer not shown (catalog fits one page)',
        );
        return;
      }
      if ($next.first().is(':disabled')) {
        cy.log('Skipping pagination — Next page is disabled');
        return;
      }

      cy.contains(/Page 1 of \d+/).should('exist');

      cy.get('[aria-label="Next page"]')
        .first()
        .scrollIntoView()
        .should('be.visible')
        .should('not.be.disabled');

      cy.get('[aria-label="Next page"]').first().click({ force: true });
      cy.wait(600);

      cy.contains(/Page 2 of \d+/).should('exist');
      cy.contains(/Showing \d+-\d+ of \d+ collections/).should('exist');

      cy.get('[aria-label="Previous page"]')
        .first()
        .should('be.visible')
        .should('not.be.disabled')
        .click({ force: true });
      cy.wait(600);

      cy.contains(/Page 1 of \d+/).should('exist');
      cy.contains(/Showing 1-\d+ of \d+ collections/).should('exist');
    });
  });
});
