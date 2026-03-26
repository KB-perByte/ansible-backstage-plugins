import {
  Typography,
  Button,
  Box,
  makeStyles,
} from '@material-ui/core';
import type {
  AAPConfig,
  RegistriesConfig,
  SCMConfig,
} from '@ansible/backstage-rhaap-common';

const useStyles = makeStyles(theme => ({
  summaryBox: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(3),
    marginBottom: theme.spacing(2),
  },
  section: {
    marginBottom: theme.spacing(2),
  },
  row: {
    display: 'flex',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(0.5),
  },
  label: {
    fontWeight: 600,
    minWidth: 220,
  },
  note: {
    marginTop: theme.spacing(2),
    fontStyle: 'italic',
  },
}));

const MASK = '********';

const SummaryRow = ({
  label,
  value,
  classes,
}: {
  label: string;
  value: string;
  classes: ReturnType<typeof useStyles>;
}) => (
  <Box className={classes.row}>
    <Typography variant="body2" className={classes.label}>
      {label}:
    </Typography>
    <Typography variant="body2">{value}</Typography>
  </Box>
);

function getPahSummary(registries: Partial<RegistriesConfig>): string {
  if (registries.pahEnabled === false) return 'Disabled';
  if (registries.pahInheritAap !== false) return 'Inherited from AAP connection details.';
  return `Standalone: ${registries.pahUrl ?? 'Not configured'}`;
}

interface ReviewStepProps {
  aap: Partial<AAPConfig>;
  registries: Partial<RegistriesConfig>;
  scm: Record<string, Partial<SCMConfig>>;
  onApply: () => void;
  onBack: () => void;
}

export const ReviewStep = ({
  aap,
  registries,
  scm,
  onApply,
  onBack,
}: ReviewStepProps) => {
  const classes = useStyles();

  const publicRegistries: string[] = [];
  if (registries.certifiedContent !== false) publicRegistries.push('Certified Content');
  if (registries.validatedContent !== false) publicRegistries.push('Validated Content');
  if (registries.galaxyEnabled !== false) publicRegistries.push('Ansible Galaxy');

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Review
      </Typography>
      <Typography variant="body1" paragraph>
        Review your configuration settings below. Once confirmed, click
        &quot;Apply &amp; Restart Portal&quot; to save the configuration and
        restart the service. This will end your temporary setup session.
      </Typography>

      <Box className={classes.summaryBox}>
        <Box className={classes.section}>
          <Typography variant="h6" gutterBottom>
            Connect AAP
          </Typography>
          <SummaryRow
            label="Controller URL"
            value={aap.controllerUrl ?? 'Not configured'}
            classes={classes}
          />
          <SummaryRow
            label="OAuth Client ID"
            value={aap.clientId ?? 'Not configured'}
            classes={classes}
          />
          <SummaryRow label="OAuth Client Secret" value={MASK} classes={classes} />
          <SummaryRow
            label="Admin Personal Access Token"
            value={MASK}
            classes={classes}
          />
          <SummaryRow
            label="Sync Schedule"
            value="Templates (30m), Users (1h)"
            classes={classes}
          />
        </Box>

        <Box className={classes.section}>
          <Typography variant="h6" gutterBottom>
            Connect Registries
          </Typography>
          <SummaryRow
            label="Public Registries"
            value={publicRegistries.length > 0 ? publicRegistries.join(', ') : 'None enabled'}
            classes={classes}
          />
          <SummaryRow
            label="Private Automation Hub"
            value={getPahSummary(registries)}
            classes={classes}
          />
        </Box>

        <Box className={classes.section}>
          <Typography variant="h6" gutterBottom>
            Connect Source Control
          </Typography>
          {Object.keys(scm).length === 0 ? (
            <Typography variant="body2">No providers configured.</Typography>
          ) : (
            Object.entries(scm).map(([provider, config]) => (
              <Box key={provider} mb={1}>
                <Typography variant="subtitle2">
                  {provider.charAt(0).toUpperCase() + provider.slice(1)}
                  : Configured.
                </Typography>
                {config.targetOrgs && (
                  <Box ml={2}>
                    <Typography variant="body2">
                      Discovery: Organizations: {config.targetOrgs}
                    </Typography>
                  </Box>
                )}
                {config.oauthClientId && (
                  <Box ml={2}>
                    <Typography variant="body2">
                      Authentication (SSO): Enabled. Client ID:{' '}
                      {config.oauthClientId}
                    </Typography>
                  </Box>
                )}
                {!config.oauthClientId && (
                  <Box ml={2}>
                    <Typography variant="body2">
                      Authentication (SSO): Not configured.
                    </Typography>
                  </Box>
                )}
              </Box>
            ))
          )}
        </Box>
      </Box>

      <Typography variant="body2" color="textSecondary" className={classes.note}>
        Note: Sensitive values like secrets, keys, and tokens are masked for
        security.
      </Typography>

      <Box mt={4} display="flex" gridGap={8}>
        <Button variant="outlined" onClick={onBack}>
          Back
        </Button>
        <Button variant="contained" color="primary" onClick={onApply}>
          Apply &amp; Restart Portal
        </Button>
      </Box>
    </Box>
  );
};
