import { useEffect, useState } from 'react';
import { SignInPageProps } from '@backstage/core-plugin-api';
import {
  SignInPage as BackstageSignInPage,
  ProxiedSignInPage,
} from '@backstage/core-components';
import { rhAapAuthApiRef } from '../../apis';

/**
 * Custom sign-in page with two modes:
 *
 * Setup mode (localAdminEnabled=true):
 *   Uses ProxiedSignInPage with local-admin provider.
 *   Auto-authenticates as user:default/admin with full RBAC permissions.
 *   The password is validated at the provider level (PORTAL_ADMIN_PASSWORD env var).
 *
 * Normal mode (localAdminEnabled=false):
 *   Uses standard OAuth SignInPage with AAP provider.
 *   Auto-redirects to AAP for authentication.
 */
export function SignInPage(props: SignInPageProps): React.JSX.Element {
  const [localAdminEnabled, setLocalAdminEnabled] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    const baseUrl =
      window.location.port === '3000'
        ? 'http://localhost:7007'
        : '';
    fetch(`${baseUrl}/api/rhaap-backend/setup/status`)
      .then(res => res.json())
      .then(data => {
        setLocalAdminEnabled(data?.data?.localAdminEnabled === true);
      })
      .catch(() => {
        setLocalAdminEnabled(true);
      });
  }, []);

  if (localAdminEnabled === null) {
    return <div />;
  }

  // Setup mode — auto-login as admin via ProxiedSignInPage
  if (localAdminEnabled) {
    return <ProxiedSignInPage {...props} provider="local-admin" />;
  }

  // Normal mode — AAP OAuth only
  return (
    <BackstageSignInPage
      {...props}
      align="center"
      title="Ansible Automation Portal"
      auto
      providers={[
        {
          id: 'rhaap',
          title: 'Ansible Automation Platform',
          message: 'Sign in using Ansible Automation Platform',
          apiRef: rhAapAuthApiRef,
        },
      ]}
    />
  );
}
