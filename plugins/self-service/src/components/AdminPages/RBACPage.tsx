import { Header, Page, Content } from '@backstage/core-components';
import { RbacPage } from '@backstage-community/plugin-rbac';

/**
 * RBAC & User Groups page.
 * Wraps the existing RHDH RBAC plugin's RbacPage component
 * within the portal admin page layout.
 */
export const RBACPage = () => {
  return (
    <Page themeId="tool">
      <Header
        title="RBAC & User Groups"
        subtitle="Manage portal permissions for groups synced from external identity providers."
      />
      <Content>
        <RbacPage useHeader={false} />
      </Content>
    </Page>
  );
};
