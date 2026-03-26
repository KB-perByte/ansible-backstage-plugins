import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
  Box,
  IconButton,
  makeStyles,
} from '@material-ui/core';
import CloseIcon from '@material-ui/icons/Close';
import SettingsIcon from '@material-ui/icons/Settings';
import type { SCMConfig } from '@ansible/backstage-rhaap-common';
import type { SCMProviderUI } from '../../providers/scmRegistry';

const useStyles = makeStyles(theme => ({
  title: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  section: {
    marginTop: theme.spacing(3),
  },
  row: {
    display: 'flex',
    gap: theme.spacing(2),
  },
}));

interface ConnectSCMModalProps {
  open: boolean;
  provider: SCMProviderUI;
  initialConfig?: Partial<SCMConfig>;
  onSave: (config: Partial<SCMConfig>) => void;
  onClose: () => void;
}

export const ConnectSCMModal = ({
  open,
  provider,
  initialConfig,
  onSave,
  onClose,
}: ConnectSCMModalProps) => {
  const classes = useStyles();
  const [config, setConfig] = useState<Partial<SCMConfig>>(
    initialConfig ?? { providerUrl: provider.defaultHost },
  );

  const update = (field: keyof SCMConfig, value: string | number) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const isValid = !!config.providerUrl?.trim() && !!config.token?.trim();

  const handleSave = () => {
    if (isValid) {
      onSave(config);
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle disableTypography className={classes.title}>
        <Box display="flex" alignItems="center" gridGap={8}>
          <SettingsIcon />
          <Typography variant="h6">Connect {provider.name}</Typography>
        </Box>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="h6" gutterBottom>
          Service Access (Discovery &amp; Creation)
        </Typography>
        <Typography variant="body2" paragraph>
          Provide a Personal Access Token (PAT) to allow the portal to discover
          automation content, sync team data, and create or push changes to
          projects on behalf of the system.
        </Typography>

        <TextField
          fullWidth
          required
          variant="outlined"
          label="Provider URL"
          placeholder={`e.g., ${provider.defaultHost}`}
          value={config.providerUrl ?? ''}
          onChange={e => update('providerUrl', e.target.value)}
          margin="normal"
        />
        <TextField
          fullWidth
          required
          variant="outlined"
          type="password"
          label="Personal Access Token (PAT)"
          placeholder="Enter PAT"
          value={config.token ?? ''}
          onChange={e => update('token', e.target.value)}
          margin="normal"
        />

        <Box className={classes.section}>
          <Typography variant="h6" gutterBottom>
            Discovery Scope
          </Typography>
          <Typography variant="body2" paragraph>
            Define which organizations the portal should scan. This portal will
            only import repositories containing galaxy.yml (collections) or
            Execution Environment definitions.
          </Typography>

          <TextField
            fullWidth
            variant="outlined"
            label="Target Organization"
            placeholder="e.g., my-company, ansible-team-a"
            helperText="Comma-separated list of organizations to scan."
            value={config.targetOrgs ?? ''}
            onChange={e => update('targetOrgs', e.target.value)}
            margin="normal"
          />
          <TextField
            fullWidth
            variant="outlined"
            label="EE Definition Filename"
            placeholder="execution-environment.yml"
            helperText="This filename is used to identify Execution Environment projects within your repositories."
            value={config.eeFilename ?? 'execution-environment.yml'}
            onChange={e => update('eeFilename', e.target.value)}
            margin="normal"
          />

          <Box className={classes.row}>
            <TextField
              variant="outlined"
              label="Source Branches"
              placeholder="Main"
              helperText="Comma-separated list of branches or tags to scan. Defaults to main."
              value={config.branches ?? 'main'}
              onChange={e => update('branches', e.target.value)}
              margin="normal"
              style={{ flex: 1 }}
            />
            <TextField
              variant="outlined"
              label="Max Folder Depth"
              placeholder="5"
              helperText="Limit how deep the system crawls nested directories to find content."
              type="number"
              value={config.maxDepth ?? 5}
              onChange={e => update('maxDepth', Number(e.target.value))}
              margin="normal"
              style={{ flex: 1 }}
            />
          </Box>
        </Box>

        <Box className={classes.section}>
          <Typography variant="h6" gutterBottom>
            User Sign-in (SSO)
          </Typography>
          <Typography variant="body2" paragraph>
            Configure OAuth credentials so users can push scaffolded
            repositories using their own {provider.name} identity.
          </Typography>

          <TextField
            fullWidth
            variant="outlined"
            label="Client ID"
            placeholder="Enter Client ID"
            value={config.oauthClientId ?? ''}
            onChange={e => update('oauthClientId', e.target.value)}
            margin="normal"
          />
          <TextField
            fullWidth
            variant="outlined"
            type="password"
            label="Client Secret"
            placeholder="Enter Client Secret"
            value={config.oauthClientSecret ?? ''}
            onChange={e => update('oauthClientSecret', e.target.value)}
            margin="normal"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSave}
          disabled={!isValid}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};
