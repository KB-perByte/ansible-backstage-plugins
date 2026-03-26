import { useEffect, useRef, useState } from 'react';
import {
  Typography,
  Box,
  CircularProgress,
  makeStyles,
} from '@material-ui/core';
import { Page, Header, Content } from '@backstage/core-components';
import { usePortalAdminApi } from '../../hooks/usePortalAdminApi';

const useStyles = makeStyles(() => ({
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 400,
    gap: 24,
  },
}));

const POLL_INTERVAL = 2000;
const TIMEOUT = 90_000;

interface ApplyingScreenProps {
  onComplete: () => void;
}

export const ApplyingScreen = ({ onComplete }: ApplyingScreenProps) => {
  const classes = useStyles();
  const api = usePortalAdminApi();
  const [timedOut, setTimedOut] = useState(false);
  const startTime = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      while (!cancelled) {
        if (Date.now() - startTime.current > TIMEOUT) {
          setTimedOut(true);
          return;
        }

        try {
          const status = await api.getSetupStatus();
          if (status.setupComplete) {
            if (!cancelled) onComplete();
            return;
          }
        } catch {
          // Backend is restarting — expected, keep polling
        }

        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      }
    };

    poll();

    return () => {
      cancelled = true;
    };
  }, [api, onComplete]);

  return (
    <Page themeId="tool">
      <Header title="Setup Ansible Automation Portal" />
      <Content>
        <Box className={classes.center}>
          {timedOut ? (
            <>
              <Typography variant="h5">
                Restart may require manual intervention
              </Typography>
              <Typography variant="body1" color="textSecondary">
                The configuration was saved but the service did not restart
                within the expected time. Please restart the portal manually.
              </Typography>
            </>
          ) : (
            <>
              <CircularProgress size={64} />
              <Typography variant="h5">Applying configuration....</Typography>
              <Typography variant="body1" color="textSecondary">
                Writing configuration files...
              </Typography>
            </>
          )}
        </Box>
      </Content>
    </Page>
  );
};
