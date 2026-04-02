import { useEffect, useState } from 'react';
import { SignInPageProps } from '@backstage/core-plugin-api';
import {
  SignInPage as BackstageSignInPage,
  ProxiedSignInPage,
} from '@backstage/core-components';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardActions,
  Typography,
  makeStyles,
} from '@material-ui/core';
import { rhAapAuthApiRef } from '../../apis';
import { LocalAdminLoginCard } from './LocalAdminLoginCard';

const useStyles = makeStyles(theme => ({
  dualMode: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: theme.spacing(3),
    marginTop: theme.spacing(8),
    flexWrap: 'wrap',
  },
}));

interface SetupState {
  setupComplete: boolean;
  localAdminEnabled: boolean;
}

/**
 * Simple AAP OAuth card for dual mode — renders a plain button that
 * switches to the standard BackstageSignInPage with AAP provider.
 * Does NOT auto-authenticate via session cookies.
 */
function AAPOAuthCard({
  onSignInSuccess,
}: {
  onSignInSuccess: SignInPageProps['onSignInSuccess'];
}) {
  const [useOAuth, setUseOAuth] = useState(false);

  if (useOAuth) {
    // Render the full Backstage OAuth sign-in flow (with auto redirect)
    return (
      <BackstageSignInPage
        onSignInSuccess={onSignInSuccess}
        align="center"
        title=""
        auto
        providers={[
          {
            id: 'rhaap',
            title: 'Ansible Automation Platform',
            message: 'Sign in using your AAP account',
            apiRef: rhAapAuthApiRef,
          },
        ]}
      />
    );
  }

  return (
    <Card variant="outlined" style={{ minWidth: 260, maxWidth: 360 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Ansible Automation Platform
        </Typography>
        <Typography variant="body2" color="textSecondary">
          Sign in using your AAP account
        </Typography>
      </CardContent>
      <CardActions>
        <Button
          variant="outlined"
          color="primary"
          onClick={() => setUseOAuth(true)}
          fullWidth
        >
          Sign In
        </Button>
      </CardActions>
    </Card>
  );
}

/**
 * Custom sign-in page with three modes:
 *
 * 1. Setup mode (setupComplete=false, localAdminEnabled=true):
 *    Auto-authenticates as admin via ProxiedSignInPage — no password prompt.
 *    This is the first-boot experience for the setup wizard.
 *
 * 2. Dual mode (setupComplete=true, localAdminEnabled=true):
 *    Shows both Local Admin (username/password) and AAP OAuth cards.
 *    Used for emergency recovery when admin re-enables local admin.
 *
 * 3. Normal mode (localAdminEnabled=false):
 *    Shows AAP OAuth only, auto-redirects to AAP.
 */
export function SignInPage(props: SignInPageProps): React.JSX.Element {
  const classes = useStyles();
  const [state, setState] = useState<SetupState | null>(null);

  useEffect(() => {
    const baseUrl =
      window.location.port === '3000'
        ? 'http://localhost:7007'
        : '';
    fetch(`${baseUrl}/api/rhaap-backend/setup/status`)
      .then(res => res.json())
      .then(data => {
        setState({
          setupComplete: data?.data?.setupComplete === true,
          localAdminEnabled: data?.data?.localAdminEnabled === true,
        });
      })
      .catch(() => {
        setState({ setupComplete: false, localAdminEnabled: true });
      });
  }, []);

  if (state === null) {
    return <div />;
  }

  // Mode 1: Setup mode — auto-login for setup wizard
  if (!state.setupComplete && state.localAdminEnabled) {
    return <ProxiedSignInPage {...props} provider="local-admin" />;
  }

  // Mode 2: Dual mode — show both Local Admin and AAP OAuth
  // Uses a plain button for AAP instead of BackstageSignInPage to prevent
  // auto-authentication via session cookies (which makes logout impossible)
  if (state.setupComplete && state.localAdminEnabled) {
    return (
      <Box className={classes.dualMode}>
        <LocalAdminLoginCard onSignInSuccess={props.onSignInSuccess} />
        <AAPOAuthCard onSignInSuccess={props.onSignInSuccess} />
      </Box>
    );
  }

  // Mode 3: Normal mode — AAP OAuth only
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
