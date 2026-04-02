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
  Switch,
  FormControlLabel,
  Checkbox,
  IconButton,
  Tooltip,
  makeStyles,
} from '@material-ui/core';
import CloseIcon from '@material-ui/icons/Close';
import SettingsIcon from '@material-ui/icons/Settings';
import InfoOutlinedIcon from '@material-ui/icons/InfoOutlined';
import type { RegistriesConfig } from '@ansible/backstage-rhaap-common';

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

const ToggleRow = ({
  label,
  checked,
  onChange,
  description,
  tooltip,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
  tooltip?: string;
}) => (
  <Box mb={2}>
    <Box display="flex" alignItems="center" gridGap={4}>
      <FormControlLabel
        control={
          <Switch
            checked={checked}
            onChange={(_e, val) => onChange(val)}
            color="primary"
          />
        }
        label={
          <Box display="flex" alignItems="center" gridGap={4}>
            <Typography variant="body1">
              <strong>{label}:</strong> {checked ? 'On' : 'Off'}
            </Typography>
            {tooltip && (
              <Tooltip title={tooltip}>
                <InfoOutlinedIcon fontSize="small" color="action" />
              </Tooltip>
            )}
          </Box>
        }
      />
    </Box>
    {description && (
      <Typography
        variant="body2"
        color="textSecondary"
        style={{ marginLeft: 48 }}
      >
        {description}
      </Typography>
    )}
  </Box>
);

interface EditRegistriesModalProps {
  open: boolean;
  initialConfig: Partial<RegistriesConfig>;
  onSave: (config: Partial<RegistriesConfig>) => void;
  onClose: () => void;
}

export const EditRegistriesModal = ({
  open,
  initialConfig,
  onSave,
  onClose,
}: EditRegistriesModalProps) => {
  const classes = useStyles();
  const [config, setConfig] = useState<Partial<RegistriesConfig>>(initialConfig);
  const [saving, setSaving] = useState(false);

  const update = (partial: Partial<RegistriesConfig>) => {
    setConfig(prev => ({ ...prev, ...partial }));
  };

  const pahEnabled = config.pahEnabled !== false;
  const pahInheritAap = config.pahInheritAap !== false;

  const handleSave = async () => {
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
          <Typography variant="h6">Edit Registries</Typography>
        </Box>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Box>
          <Typography variant="h6" gutterBottom>
            Private Registries (Private Automation Hub)
          </Typography>

          <ToggleRow
            label="Private Automation Hub (PAH)"
            checked={pahEnabled}
            onChange={val => update({ pahEnabled: val })}
            description="Connect your organization's private hub to discover secure execution environments and custom collections."
          />

          {pahEnabled && (
            <Box ml={4} mb={2}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={pahInheritAap}
                    onChange={(_e, val) => update({ pahInheritAap: val })}
                    color="primary"
                  />
                }
                label="Use connection details from AAP"
              />
              <Typography
                variant="body2"
                color="textSecondary"
                style={{ marginLeft: 30 }}
              >
                When checked, the Private Automation Hub URL and Token will be
                inherited from the AAP Controller. Uncheck this box to manually
                enter credentials for a standalone Private Hub.
              </Typography>

              {!pahInheritAap && (
                <Box mt={2}>
                  <TextField
                    fullWidth
                    required
                    variant="outlined"
                    label="Private Automation Hub URL"
                    placeholder="https://pah.example.com"
                    value={config.pahUrl ?? ''}
                    onChange={e => update({ pahUrl: e.target.value })}
                    margin="normal"
                  />
                  <TextField
                    fullWidth
                    variant="outlined"
                    type="password"
                    label="Private Automation Hub Token"
                    placeholder="Leave blank to keep current value"
                    value={config.pahToken ?? ''}
                    onChange={e => update({ pahToken: e.target.value })}
                    margin="normal"
                  />
                </Box>
              )}
            </Box>
          )}
        </Box>

        <Box className={classes.section}>
          <Typography variant="h6" gutterBottom>
            Red Hat Ansible Automation Hub (Public)
          </Typography>

          <ToggleRow
            label="Certified Content"
            checked={config.certifiedContent !== false}
            onChange={val => update({ certifiedContent: val })}
            description="Supported collections from certified partners (e.g. AWS, Microsoft, Cisco)."
          />

          <ToggleRow
            label="Validated Content"
            checked={config.validatedContent !== false}
            onChange={val => update({ validatedContent: val })}
            description="Trusted solutions and patterns developed by Red Hat."
          />
        </Box>

        <Box className={classes.section}>
          <Typography variant="h6" gutterBottom>
            Ansible Galaxy (community)
          </Typography>

          <ToggleRow
            label="Ansible Galaxy"
            checked={config.galaxyEnabled !== false}
            onChange={val => update({ galaxyEnabled: val })}
            description="Access unsupported community-contributed content over the internet."
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
