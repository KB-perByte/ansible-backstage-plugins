import { useCallback, useEffect, useState } from 'react';
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
  Snackbar,
  CircularProgress,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import SyncIcon from '@material-ui/icons/Sync';
import { Header, Page, Content } from '@backstage/core-components';
import { usePermission } from '@backstage/plugin-permission-react';
import { portalAdminWritePermission } from '../../hooks/adminPermissions';
import type {
  ConnectionsResponse,
  AAPConfig,
  RegistriesConfig,
  SCMConfig,
} from '@ansible/backstage-rhaap-common';
import { usePortalAdminApi } from '../../hooks/usePortalAdminApi';
import { EditAAPModal } from './EditAAPModal';
import { EditRegistriesModal } from './EditRegistriesModal';
import { ConnectSCMModal } from '../SetupWizard/ConnectSCMModal';
import { scmProviders } from '../../providers/scmRegistry';

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

function getPahStatusText(registries: {
  pahEnabled: boolean;
  pahInheritAap: boolean;
}) {
  if (!registries.pahEnabled) return 'Disabled';
  if (registries.pahInheritAap) return 'Host: Credentials inherited from AAP';
  return 'Host: Standalone';
}

type EditModal =
  | { type: 'aap' }
  | { type: 'registries' }
  | { type: 'scm'; provider: string };

type SnackbarState = {
  open: boolean;
  message: string;
  severity: 'success' | 'error' | 'info';
};

export const ConnectionsPage = () => {
  const classes = useStyles();
  const api = usePortalAdminApi();
  const { allowed: canWrite } = usePermission({
    permission: portalAdminWritePermission,
  });
  const [connections, setConnections] = useState<ConnectionsResponse | null>(
    null,
  );
  const [editModal, setEditModal] = useState<EditModal | null>(null);
  const [syncingType, setSyncingType] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<SnackbarState>({
    open: false,
    message: '',
    severity: 'info',
  });

  const showSnackbar = (message: string, severity: SnackbarState['severity']) => {
    setSnackbar({ open: true, message, severity });
  };

  const loadConnections = useCallback(() => {
    api
      .getConnections()
      .then(setConnections)
      .catch(() => {});
  }, [api]);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  const handleSync = async (type: string) => {
    setSyncingType(type);
    try {
      await api.triggerSync(type);
      showSnackbar(`Sync triggered for ${type}`, 'success');
    } catch (err: any) {
      showSnackbar(`Sync failed for ${type}: ${err.message}`, 'error');
    } finally {
      setSyncingType(null);
    }
  };

  const handleSaveAAP = async (config: Partial<AAPConfig>) => {
    await api.updateAAPConnection(config as AAPConfig);
    showSnackbar('AAP connection updated', 'success');
    loadConnections();
  };

  const handleSaveRegistries = async (config: Partial<RegistriesConfig>) => {
    await api.updateRegistries(config as RegistriesConfig);
    showSnackbar('Registries updated', 'success');
    loadConnections();
  };

  const handleSaveSCM = async (
    provider: string,
    config: Partial<SCMConfig>,
  ) => {
    await api.updateSCMConnection(provider, config as SCMConfig);
    showSnackbar(`${provider} connection updated`, 'success');
    loadConnections();
  };

  const handleRegistryToggle = async (
    field: keyof RegistriesConfig,
    value: boolean,
  ) => {
    if (!connections) return;
    const updated = { ...connections.registries, [field]: value };
    await api.updateRegistries(updated as RegistriesConfig);
    loadConnections();
  };

  if (!connections)
    return (
      <Page themeId="tool">
        <Header title="Connections" />
        <Content>
          <Typography>Loading...</Typography>
        </Content>
      </Page>
    );

  const activeScmProvider = editModal?.type === 'scm'
    ? scmProviders.find(p => p.id === editModal.provider)
    : undefined;

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
                    <Button
                      size="small"
                      onClick={() => setEditModal({ type: 'aap' })}
                    >
                      Edit
                    </Button>
                    <Button
                      size="small"
                      startIcon={
                        syncingType === 'aap' ? (
                          <CircularProgress size={16} />
                        ) : (
                          <SyncIcon />
                        )
                      }
                      onClick={() => handleSync('aap')}
                      disabled={syncingType === 'aap'}
                    >
                      {syncingType === 'aap' ? 'Syncing...' : 'Sync now'}
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
                    <Button
                      size="small"
                      onClick={() => setEditModal({ type: 'registries' })}
                    >
                      Edit
                    </Button>
                    <Button
                      size="small"
                      startIcon={
                        syncingType === 'pah' ? (
                          <CircularProgress size={16} />
                        ) : (
                          <SyncIcon />
                        )
                      }
                      onClick={() => handleSync('pah')}
                      disabled={syncingType === 'pah'}
                    >
                      {syncingType === 'pah' ? 'Syncing...' : 'Sync now'}
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
                        onChange={(_e, val) =>
                          handleRegistryToggle('certifiedContent', val)
                        }
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
                        onChange={(_e, val) =>
                          handleRegistryToggle('validatedContent', val)
                        }
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
                        onChange={(_e, val) =>
                          handleRegistryToggle('galaxyEnabled', val)
                        }
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
                      <Button
                        size="small"
                        onClick={() =>
                          setEditModal({ type: 'scm', provider })
                        }
                      >
                        {info.configured ? 'Edit' : 'Connect'}
                      </Button>
                      {info.configured && (
                        <Button
                          size="small"
                          startIcon={
                            syncingType === provider ? (
                              <CircularProgress size={16} />
                            ) : (
                              <SyncIcon />
                            )
                          }
                          onClick={() => handleSync(provider)}
                          disabled={syncingType === provider}
                        >
                          {syncingType === provider
                            ? 'Syncing...'
                            : 'Sync now'}
                        </Button>
                      )}
                    </>
                  )}
                </CardActions>
              </Card>
            ))}
          </Box>
        </Box>

        {/* Edit AAP Modal */}
        {editModal?.type === 'aap' && (
          <EditAAPModal
            open
            initialConfig={{
              controllerUrl: connections.aap.controllerUrl,
              clientId: connections.aap.clientId,
              checkSSL: connections.aap.checkSSL,
            }}
            onSave={handleSaveAAP}
            onClose={() => setEditModal(null)}
          />
        )}

        {/* Edit Registries Modal */}
        {editModal?.type === 'registries' && (
          <EditRegistriesModal
            open
            initialConfig={{
              pahEnabled: connections.registries.pahEnabled,
              pahInheritAap: connections.registries.pahInheritAap,
              pahUrl: connections.registries.pahUrl,
              certifiedContent: connections.registries.certifiedContent,
              validatedContent: connections.registries.validatedContent,
              galaxyEnabled: connections.registries.galaxyEnabled,
            }}
            onSave={handleSaveRegistries}
            onClose={() => setEditModal(null)}
          />
        )}

        {/* Edit/Connect SCM Modal */}
        {editModal?.type === 'scm' && activeScmProvider && (
          <ConnectSCMModal
            open
            provider={activeScmProvider}
            initialConfig={
              connections.scm[editModal.provider]?.configured
                ? {
                    providerUrl:
                      connections.scm[editModal.provider].providerUrl,
                    targetOrgs:
                      connections.scm[editModal.provider].targetOrgs,
                    eeFilename:
                      connections.scm[editModal.provider].eeFilename,
                    branches:
                      connections.scm[editModal.provider].branches,
                    maxDepth:
                      connections.scm[editModal.provider].maxDepth,
                  }
                : undefined
            }
            onSave={config =>
              handleSaveSCM(editModal.provider, config)
            }
            onClose={() => setEditModal(null)}
          />
        )}

        {/* Feedback snackbar */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={4000}
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
            severity={snackbar.severity}
            variant="filled"
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Content>
    </Page>
  );
};
