import { Typography, Button, Box } from '@material-ui/core';

interface OverviewStepProps {
  onNext: () => void;
}

export const OverviewStep = ({ onNext }: OverviewStepProps) => (
  <Box>
    <Typography variant="h5" gutterBottom>
      Overview &amp; Prerequisites
    </Typography>
    <Typography variant="body1" paragraph>
      Welcome to the Red Hat Ansible Automation Portal setup wizard. This process
      will generate the configuration required to connect your portal to your
      infrastructure.
    </Typography>
    <Typography variant="body1" paragraph>
      Before you begin, ensure you have the following information ready:
    </Typography>
    <Typography variant="h6" gutterBottom>
      What you&apos;ll need:
    </Typography>
    <ul>
      <li>
        <Typography variant="body1">
          AAP Controller URL and OAuth credentials (Client ID &amp; Secret).
        </Typography>
      </li>
      <li>
        <Typography variant="body1">
          AAP Personal Access Token (requires System Administrator privileges).
        </Typography>
      </li>
      <li>
        <Typography variant="body1">
          Git Provider App ID, Private Key and Client ID/Secret for content
          discovery and SSO.
        </Typography>
      </li>
    </ul>
    <Box mt={4}>
      <Button variant="contained" color="primary" onClick={onNext}>
        Next
      </Button>
    </Box>
  </Box>
);
