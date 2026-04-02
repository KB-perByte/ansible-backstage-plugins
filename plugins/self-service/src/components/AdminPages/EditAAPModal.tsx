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
  Link,
  makeStyles,
} from '@material-ui/core';
import CloseIcon from '@material-ui/icons/Close';
import SettingsIcon from '@material-ui/icons/Settings';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import type { AAPConfig } from '@ansible/backstage-rhaap-common';

const useStyles = makeStyles(theme => ({
  title: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  section: {
    marginTop: theme.spacing(3),
  },
}));

interface EditAAPModalProps {
  open: boolean;
  initialConfig: Partial<AAPConfig>;
  onSave: (config: Partial<AAPConfig>) => void;
  onClose: () => void;
}

export const EditAAPModal = ({
  open,
  initialConfig,
  onSave,
  onClose,
}: EditAAPModalProps) => {
  const classes = useStyles();
  const [config, setConfig] = useState<Partial<AAPConfig>>(initialConfig);
  const [saving, setSaving] = useState(false);

  const update = (field: keyof AAPConfig, value: string) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const isValid =
    !!config.controllerUrl?.trim() &&
    !!config.clientId?.trim();

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      await onSave(config);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle disableTypography className={classes.title}>
        <Box display="flex" alignItems="center" gridGap={8}>
          <SettingsIcon />
          <Typography variant="h6">
            Edit Ansible Automation Platform (AAP)
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="h6" gutterBottom>
          AAP controller URL
        </Typography>
        <TextField
          fullWidth
          required
          variant="outlined"
          placeholder="https://aap.example.com"
          helperText="Enter the URL of your Automation Controller (e.g. https://aap.example.com)"
          value={config.controllerUrl ?? ''}
          onChange={e => update('controllerUrl', e.target.value)}
          margin="normal"
        />

        <Box className={classes.section}>
          <Typography variant="h6" gutterBottom>
            Service Access (Discovery &amp; Execution)
          </Typography>
          <Typography variant="body2" paragraph>
            The portal requires a service token to discover Job Templates and
            Private Automation Hub content, trigger job runs from software
            templates, and sync execution logs automatically.
          </Typography>
          <TextField
            fullWidth
            variant="outlined"
            type="password"
            label="Admin Personal Access Token"
            placeholder="Leave blank to keep current value"
            helperText="Paste an Admin Token from AAP here. Leave blank to keep the existing token."
            value={config.adminToken ?? ''}
            onChange={e => update('adminToken', e.target.value)}
            margin="normal"
          />
        </Box>

        <Box className={classes.section}>
          <Typography variant="h6" gutterBottom>
            User Sign-in (OAuth)
          </Typography>
          <Typography variant="body2" paragraph>
            Configure OAuth credentials to allow your team to log in to the
            portal using their existing AAP accounts.
          </Typography>
          <TextField
            fullWidth
            required
            variant="outlined"
            label="Client ID"
            placeholder="Enter client ID"
            value={config.clientId ?? ''}
            onChange={e => update('clientId', e.target.value)}
            margin="normal"
          />
          <TextField
            fullWidth
            variant="outlined"
            type="password"
            label="Client secret"
            placeholder="Leave blank to keep current value"
            value={config.clientSecret ?? ''}
            onChange={e => update('clientSecret', e.target.value)}
            margin="normal"
          />
          <Link
            href="#"
            target="_blank"
            rel="noopener"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            Find these under AAP application settings
            <OpenInNewIcon fontSize="small" />
          </Link>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSave}
          disabled={!isValid || saving}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
