import { useEffect, useState } from 'react';
import {
  Typography,
  Box,
  Card,
  CardContent,
  CardActions,
  Button,
  Switch,
  FormControlLabel,
  makeStyles,
  Chip,
} from '@material-ui/core';
import SyncIcon from '@material-ui/icons/Sync';
import { Header, Page, Content } from '@backstage/core-components';
import { usePermission } from '@backstage/plugin-permission-react';
import { portalAdminWritePermission } from '../../hooks/adminPermissions';
import type { ConnectionsResponse } from '@ansible/backstage-rhaap-common';
import { usePortalAdminApi } from '../../hooks/usePortalAdminApi';

const useStyles = makeStyles(theme => ({
  section: {
    marginBottom: theme.spacing(4),
  },
  cardGrid: {
    display: 'flex',
    gap: theme.spacing(2),
    flexWrap: 'wrap',
  },
  card: {
    width: 300,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  statusChip: {
    marginTop: theme.spacing(0.5),
  },
}));

const StatusBadge = ({
  label,
  status,
}: {
  label: string;
  status: 'active' | 'inactive' | undefined;
}) => (
  <Box display="flex" alignItems="center" gridGap={4} mb={0.5}>
    <Chip
      size="small"
      label={status === 'active' ? 'Active' : 'Inactive'}
      color={status === 'active' ? 'primary' : 'default'}
      variant="outlined"
    />
    <Typography variant="body2">{label}</Typography>
  </Box>
);

function getPahStatusText(registries: { pahEnabled: boolean; pahInheritAap: boolean }) {
  if (!registries.pahEnabled) return 'Disabled';
  if (registries.pahInheritAap) return 'Host: Credentials inherited from AAP';
  return 'Host: Standalone';
}

export const ConnectionsPage = () => {
  const classes = useStyles();
  const api = usePortalAdminApi();
  const { allowed: canWrite } = usePermission({
    permission: portalAdminWritePermission,
  });
  const [connections, setConnections] = useState<ConnectionsResponse | null>(
    null,
  );

  useEffect(() => {
    api.getConnections().then(setConnections).catch(() => {});
  }, [api]);

  const handleSync = async (type: string) => {
    await api.triggerSync(type);
  };

  if (!connections) return <Page themeId="tool"><Header title="Connections" /><Content><Typography>Loading...</Typography></Content></Page>;

  return (
    <Page themeId="tool">
      <Header
        title="Connections"
        subtitle="Manage integrations with external platforms for content discovery and user authentication (SSO)."
      />
      <Content>
        <Box className={classes.section}>
          <Typography variant="h6" gutterBottom>
            Automation &amp; Content Platforms
          </Typography>
          <Box className={classes.cardGrid}>
            {/* AAP Card */}
            <Card variant="outlined" className={classes.card}>
              <CardContent>
                <Typography variant="h6">
                  Ansible Automation Platform (AAP)
                </Typography>
                <Box mt={1}>
                  <StatusBadge
                    label="Content discovery"
                    status={connections.aap.status.contentDiscovery}
                  />
                  <StatusBadge
                    label="Login (SSO)"
                    status={connections.aap.status.sso}
                  />
                </Box>
                <Box mt={1}>
                  <Typography variant="body2" color="textSecondary">
                    Host: {connections.aap.controllerUrl || 'Not configured'}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    Auth: Client Credentials &amp; OAuth
                  </Typography>
                </Box>
              </CardContent>
              <CardActions>
                {canWrite && (
                  <>
                    <Button size="small">Edit</Button>
                    <Button
                      size="small"
                      startIcon={<SyncIcon />}
                      onClick={() => handleSync('aap')}
                    >
                      Sync now
                    </Button>
                  </>
                )}
              </CardActions>
            </Card>

            {/* PAH Card */}
            <Card variant="outlined" className={classes.card}>
              <CardContent>
                <Typography variant="h6">
                  Private Automation Hub (PAH)
                </Typography>
                <Box mt={1}>
                  <Typography variant="body2" color="textSecondary">
                    {getPahStatusText(connections.registries)}
                  </Typography>
                </Box>
              </CardContent>
              <CardActions>
                {canWrite && (
                  <>
                    <Button size="small">Edit</Button>
                    <Button
                      size="small"
                      startIcon={<SyncIcon />}
                      onClick={() => handleSync('pah')}
                    >
                      Sync now
                    </Button>
                  </>
                )}
              </CardActions>
            </Card>

            {/* Public Registers Card */}
            <Card variant="outlined" className={classes.card}>
              <CardContent>
                <Typography variant="h6">
                  Public Registers (internet required)
                </Typography>
                <Box mt={1}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={connections.registries.certifiedContent}
                        color="primary"
                        size="small"
                        disabled={!canWrite}
                      />
                    }
                    label={
                      <Typography variant="body2">
                        Red Hat Certified Content
                      </Typography>
                    }
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={connections.registries.validatedContent}
                        color="primary"
                        size="small"
                        disabled={!canWrite}
                      />
                    }
                    label={
                      <Typography variant="body2">
                        Red Hat Validated Content
                      </Typography>
                    }
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={connections.registries.galaxyEnabled}
                        color="primary"
                        size="small"
                        disabled={!canWrite}
                      />
                    }
                    label={
                      <Typography variant="body2">Ansible Galaxy</Typography>
                    }
                  />
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Box>

        <Box className={classes.section}>
          <Typography variant="h6" gutterBottom>
            Source control providers
          </Typography>
          <Box className={classes.cardGrid}>
            {Object.entries(connections.scm).map(([provider, info]) => (
              <Card
                key={provider}
                variant="outlined"
                className={classes.card}
              >
                <CardContent>
                  <Typography variant="h6">
                    {provider.charAt(0).toUpperCase() + provider.slice(1)}
                  </Typography>
                  {info.configured ? (
                    <Box mt={1}>
                      <StatusBadge
                        label="Content discovery"
                        status={info.status.contentDiscovery}
                      />
                      <StatusBadge
                        label="Login (SSO)"
                        status={info.status.sso}
                      />
                      <Typography
                        variant="body2"
                        color="textSecondary"
                        style={{ marginTop: 4 }}
                      >
                        Host: {info.providerUrl}
                      </Typography>
                    </Box>
                  ) : (
                    <Typography
                      variant="body2"
                      color="textSecondary"
                      style={{ marginTop: 8 }}
                    >
                      Not configured
                    </Typography>
                  )}
                </CardContent>
                <CardActions>
                  {canWrite && (
                    <>
                      <Button size="small">
                        {info.configured ? 'Edit' : 'Connect'}
                      </Button>
                      {info.configured && (
                        <Button
                          size="small"
                          startIcon={<SyncIcon />}
                          onClick={() => handleSync(provider)}
                        >
                          Sync now
                        </Button>
                      )}
                    </>
                  )}
                </CardActions>
              </Card>
            ))}
          </Box>
        </Box>
      </Content>
    </Page>
  );
};
