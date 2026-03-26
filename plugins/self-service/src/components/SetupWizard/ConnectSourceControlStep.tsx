import { useState } from 'react';
import {
  Typography,
  Button,
  Box,
  Card,
  CardContent,
  CardActions,
  makeStyles,
} from '@material-ui/core';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import type { SCMConfig } from '@ansible/backstage-rhaap-common';
import { scmProviders } from '../../providers/scmRegistry';
import { ConnectSCMModal } from './ConnectSCMModal';

const useStyles = makeStyles(theme => ({
  cardGrid: {
    display: 'flex',
    gap: theme.spacing(2),
    flexWrap: 'wrap',
  },
  card: {
    width: 280,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  connectedBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    color: theme.palette.success.main,
  },
}));

interface ConnectSourceControlStepProps {
  scmConfigs: Record<string, Partial<SCMConfig>>;
  onSave: (provider: string, config: Partial<SCMConfig>) => Promise<void>;
  onRemove: (provider: string) => Promise<void>;
  onNext: () => void;
  onBack: () => void;
}

export const ConnectSourceControlStep = ({
  scmConfigs,
  onSave,
  onRemove: _onRemove,
  onNext,
  onBack,
}: ConnectSourceControlStepProps) => {
  const classes = useStyles();
  const [modalProvider, setModalProvider] = useState<string | null>(null);

  const activeProvider = scmProviders.find(p => p.id === modalProvider);

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Connect Source Control (Recommended)
      </Typography>
      <Typography variant="body1" paragraph>
        Connect to your source control provider to enable Single Sign-On (SSO),
        sync team memberships, discover existing automation, and create new
        projects or contribute to existing ones.
      </Typography>

      <Typography variant="h6" gutterBottom>
        Configure providers
      </Typography>

      <Box className={classes.cardGrid}>
        {scmProviders.map(provider => {
          const isConnected = !!scmConfigs[provider.id]?.token;

          return (
            <Card key={provider.id} variant="outlined" className={classes.card}>
              <CardContent>
                <Typography variant="h6">{provider.name}</Typography>
                {isConnected ? (
                  <Box className={classes.connectedBadge} mt={1}>
                    <CheckCircleIcon fontSize="small" />
                    <Typography variant="body2">Connected</Typography>
                  </Box>
                ) : (
                  <Typography variant="body2" color="textSecondary">
                    {provider.description}
                  </Typography>
                )}
              </CardContent>
              <CardActions>
                <Button
                  variant={isConnected ? 'outlined' : 'contained'}
                  color="primary"
                  size="small"
                  onClick={() => setModalProvider(provider.id)}
                >
                  {isConnected ? 'Edit' : 'Connect'}
                </Button>
              </CardActions>
            </Card>
          );
        })}
      </Box>

      {activeProvider && (
        <ConnectSCMModal
          open
          provider={activeProvider}
          initialConfig={scmConfigs[activeProvider.id]}
          onSave={config => onSave(activeProvider.id, config)}
          onClose={() => setModalProvider(null)}
        />
      )}

      <Box mt={4} display="flex" gridGap={8}>
        <Button variant="outlined" onClick={onBack}>
          Back
        </Button>
        <Button variant="contained" color="primary" onClick={onNext}>
          Next
        </Button>
      </Box>
    </Box>
  );
};
