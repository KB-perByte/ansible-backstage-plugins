import {
  Typography,
  TextField,
  Button,
  Box,
  Link,
} from '@material-ui/core';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import type { AAPConfig } from '@ansible/backstage-rhaap-common';

interface ConnectAAPStepProps {
  config: Partial<AAPConfig>;
  onChange: (config: Partial<AAPConfig>) => void;
  onNext: () => void;
  onBack: () => void;
}

export const ConnectAAPStep = ({
  config,
  onChange,
  onNext,
  onBack,
}: ConnectAAPStepProps) => {
  const handleChange =
    (field: keyof AAPConfig) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ [field]: e.target.value });
    };

  const isValid =
    !!config.controllerUrl?.trim() &&
    !!config.adminToken?.trim() &&
    !!config.clientId?.trim() &&
    !!config.clientSecret?.trim();

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Connect AAP
      </Typography>
      <Typography variant="body1" paragraph>
        Connect to your Ansible Automation Platform (AAP) instance. This
        integration allows the portal to use AAP as an Identity Provider (SSO)
        and enables the portal to sync data in the background.
      </Typography>

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
        onChange={handleChange('controllerUrl')}
        margin="normal"
      />

      <Box mt={3}>
        <Typography variant="h6" gutterBottom>
          Service Access (Discovery &amp; Execution)
        </Typography>
        <Typography variant="body2" paragraph>
          The portal requires a service token to discover Job Templates and
          Private Automation Hub content, trigger job runs from software
          templates, and sync execution logs automatically — even when no users
          are logged in.
        </Typography>
        <TextField
          fullWidth
          required
          variant="outlined"
          type="password"
          label="Admin Personal Access Token"
          placeholder="Enter access token"
          helperText="Paste an Admin Token from AAP here."
          value={config.adminToken ?? ''}
          onChange={handleChange('adminToken')}
          margin="normal"
        />
      </Box>

      <Box mt={3}>
        <Typography variant="h6" gutterBottom>
          User Sign-in (OAuth)
        </Typography>
        <Typography variant="body2" paragraph>
          Configure OAuth credentials to allow your team to log in to the portal
          using their existing AAP accounts.
        </Typography>
        <TextField
          fullWidth
          required
          variant="outlined"
          label="Client ID"
          placeholder="Enter client ID"
          value={config.clientId ?? ''}
          onChange={handleChange('clientId')}
          margin="normal"
        />
        <TextField
          fullWidth
          required
          variant="outlined"
          type="password"
          label="Client secret"
          placeholder="Enter secret"
          value={config.clientSecret ?? ''}
          onChange={handleChange('clientSecret')}
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

      <Box mt={4} display="flex" gridGap={8}>
        <Button variant="outlined" onClick={onBack}>
          Back
        </Button>
        <Button
          variant="contained"
          color="primary"
          onClick={onNext}
          disabled={!isValid}
        >
          Next
        </Button>
      </Box>
    </Box>
  );
};
