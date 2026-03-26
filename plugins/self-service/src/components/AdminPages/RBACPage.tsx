import { Typography } from '@material-ui/core';
import { Header, Page, Content } from '@backstage/core-components';

/**
 * RBAC & User Groups page.
 * Wraps the existing RHDH RBAC plugin APIs to display groups
 * synced from external identity providers.
 *
 * Full implementation in Phase 4 (T4.4).
 */
export const RBACPage = () => {
  return (
    <Page themeId="tool">
      <Header
        title="RBAC & User Groups"
        subtitle="Manage portal permissions for groups synced from external identity providers."
      />
      <Content>
        <Typography variant="body1">
          RBAC page — full implementation coming in Phase 4.
        </Typography>
      </Content>
    </Page>
  );
};
