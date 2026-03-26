import {
  Typography,
  TextField,
  Button,
  Box,
  Switch,
  FormControlLabel,
  Checkbox,
  Tooltip,
} from '@material-ui/core';
import InfoOutlinedIcon from '@material-ui/icons/InfoOutlined';
import type { RegistriesConfig } from '@ansible/backstage-rhaap-common';

interface ConnectRegistriesStepProps {
  config: Partial<RegistriesConfig>;
  onChange: (config: Partial<RegistriesConfig>) => void;
  onNext: () => void;
  onBack: () => void;
}

const ToggleRow = ({
  label,
  checked,
  onChange,
  tooltip,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  tooltip?: string;
  description?: string;
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
      <Typography variant="body2" color="textSecondary" style={{ marginLeft: 48 }}>
        {description}
      </Typography>
    )}
  </Box>
);

export const ConnectRegistriesStep = ({
  config,
  onChange,
  onNext,
  onBack,
}: ConnectRegistriesStepProps) => {
  const pahEnabled = config.pahEnabled !== false;
  const pahInheritAap = config.pahInheritAap !== false;

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Connect Registries
      </Typography>
      <Typography variant="body1" paragraph>
        Enable the sources where your team discovers automation content
        (Execution Environments, Collections etc).
      </Typography>

      <Box mt={3}>
        <Typography variant="h6" gutterBottom>
          Private Registries (Private Automation Hub)
        </Typography>

        <ToggleRow
          label="Private Automation Hub (PAH)"
          checked={pahEnabled}
          onChange={val => onChange({ pahEnabled: val })}
          description="Connect your organization's private hub to discover secure execution environments and custom collections."
        />

        {pahEnabled && (
          <Box ml={4} mb={2}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={pahInheritAap}
                  onChange={(_e, val) => onChange({ pahInheritAap: val })}
                  color="primary"
                />
              }
              label="Use connection details from AAP (Step 2)"
            />
            <Typography variant="body2" color="textSecondary" style={{ marginLeft: 30 }}>
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
                  onChange={e => onChange({ pahUrl: e.target.value })}
                  margin="normal"
                />
                <TextField
                  fullWidth
                  required
                  variant="outlined"
                  type="password"
                  label="Private Automation Hub Token"
                  placeholder="Enter token"
                  value={config.pahToken ?? ''}
                  onChange={e => onChange({ pahToken: e.target.value })}
                  margin="normal"
                />
              </Box>
            )}
          </Box>
        )}
      </Box>

      <Box mt={3}>
        <Typography variant="h6" gutterBottom>
          Red Hat Ansible Automation Hub (Public)
        </Typography>

        <ToggleRow
          label="Certified Content"
          checked={config.certifiedContent !== false}
          onChange={val => onChange({ certifiedContent: val })}
          description="Supported collections from certified partners (e.g. AWS, Microsoft, Cisco)."
        />

        <ToggleRow
          label="Validated Content"
          checked={config.validatedContent !== false}
          onChange={val => onChange({ validatedContent: val })}
          description="Trusted solutions and patterns developed by Red Hat."
        />
      </Box>

      <Box mt={3}>
        <Typography variant="h6" gutterBottom>
          Ansible Galaxy (community)
        </Typography>

        <ToggleRow
          label="Ansible Galaxy"
          checked={config.galaxyEnabled !== false}
          onChange={val => onChange({ galaxyEnabled: val })}
          description="Access unsupported community-contributed content over the internet."
        />
      </Box>

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
