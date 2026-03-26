import { useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardActions,
  TextField,
  Typography,
  CircularProgress,
  makeStyles,
} from '@material-ui/core';
import type { SignInPageProps } from '@backstage/core-plugin-api';

const useStyles = makeStyles(theme => ({
  card: {
    minWidth: 260,
    maxWidth: 360,
  },
  error: {
    color: theme.palette.error.main,
    marginTop: theme.spacing(1),
    fontSize: '0.85rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1.5),
  },
}));

interface LocalAdminLoginCardProps {
  onSignInSuccess: SignInPageProps['onSignInSuccess'];
}

export function LocalAdminLoginCard({
  onSignInSuccess,
}: LocalAdminLoginCardProps) {
  const classes = useStyles();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Resolve backend URL — in local dev (port 3000), the webpack proxy
      // doesn't forward custom auth module routes, so we call backend directly.
      // In production (RHDH), same-origin works.
      const baseUrl =
        window.location.port === '3000'
          ? `http://localhost:7007`
          : '';
      const response = await fetch(`${baseUrl}/api/auth/local-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? 'Login failed');
        setLoading(false);
        return;
      }

      if (data.backstageIdentity) {
        // Create a minimal identity API that Backstage expects
        const identityApi = {
          getBackstageIdentity: async () => data.backstageIdentity.identity,
          getCredentials: async () => ({
            token: data.backstageIdentity.token,
          }),
          getProfileInfo: async () => ({
            displayName: 'Admin',
            email: 'admin@portal.local',
          }),
          signOut: async () => {
            window.location.href = '/';
          },
        };

        onSignInSuccess(identityApi as any);
      } else {
        setError('Unexpected response from server');
        setLoading(false);
      }
    } catch (err) {
      setError('Failed to connect to server');
      setLoading(false);
    }
  };

  return (
    <Card variant="outlined" className={classes.card}>
      <form onSubmit={handleSubmit}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Local Admin
          </Typography>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            Sign in with temporary admin credentials for initial setup or
            emergency recovery.
          </Typography>
          <div className={classes.form}>
            <TextField
              variant="outlined"
              size="small"
              label="Username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              disabled={loading}
              fullWidth
            />
            <TextField
              variant="outlined"
              size="small"
              label="Password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={loading}
              fullWidth
            />
          </div>
          {error && (
            <Typography className={classes.error}>{error}</Typography>
          )}
        </CardContent>
        <CardActions>
          <Button
            type="submit"
            variant="outlined"
            color="primary"
            disabled={loading || !password}
            fullWidth
          >
            {loading ? <CircularProgress size={20} /> : 'Sign In'}
          </Button>
        </CardActions>
      </form>
    </Card>
  );
}
