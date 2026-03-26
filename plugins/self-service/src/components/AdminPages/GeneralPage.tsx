import { useEffect, useState } from 'react';
import {
  Typography,
  Switch,
  FormControlLabel,
  Box,
  Card,
  CardContent,
  makeStyles,
} from '@material-ui/core';
import { Header, Page, Content } from '@backstage/core-components';
import { usePermission } from '@backstage/plugin-permission-react';
import { portalAdminWritePermission } from '../../hooks/adminPermissions';
import { usePortalAdminApi } from '../../hooks/usePortalAdminApi';
import { useSetupStatus } from '../../hooks/useSetupStatus';

const useStyles = makeStyles(theme => ({
  card: {
    marginBottom: theme.spacing(3),
  },
}));

export const GeneralPage = () => {
  const classes = useStyles();
  const api = usePortalAdminApi();
  const { status } = useSetupStatus();
  const { allowed: canWrite } = usePermission({
    permission: portalAdminWritePermission,
  });
  const [localAdminEnabled, setLocalAdminEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (status) {
      setLocalAdminEnabled(status.localAdminEnabled);
    }
  }, [status]);

  const handleToggle = async (enabled: boolean) => {
    setSaving(true);
    try {
      await api.setLocalAdmin(enabled);
      setLocalAdminEnabled(enabled);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page themeId="tool">
      <Header title="General" subtitle="<description>" />
      <Content>
        <Card variant="outlined" className={classes.card}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Security &amp; Access Control
            </Typography>
            <Typography variant="body2" paragraph>
              Configure portal security and access policies.
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={localAdminEnabled}
                  onChange={(_e, val) => handleToggle(val)}
                  color="primary"
                  disabled={!canWrite || saving}
                />
              }
              label={
                <Box>
                  <Typography variant="body1">
                    <strong>Local Admin Access (Bootstrap):</strong>{' '}
                    {localAdminEnabled ? 'On' : 'Off'}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    Allow authentication using the built-in &apos;admin&apos;
                    account. Keep this disabled unless you are performing initial
                    setup or need emergency recovery when SSO is unavailable.
                  </Typography>
                </Box>
              }
            />
          </CardContent>
        </Card>
      </Content>
    </Page>
  );
};
