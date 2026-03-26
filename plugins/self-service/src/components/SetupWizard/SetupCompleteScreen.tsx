import { Typography, Button, Box, makeStyles } from '@material-ui/core';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import { Page, Header, Content } from '@backstage/core-components';
import { identityApiRef, useApi } from '@backstage/core-plugin-api';

const useStyles = makeStyles(theme => ({
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 400,
    gap: 16,
  },
  icon: {
    fontSize: 72,
    color: theme.palette.success.main,
  },
}));

export const SetupCompleteScreen = () => {
  const classes = useStyles();
  const identityApi = useApi(identityApiRef);

  const handleGoToLogin = async () => {
    await identityApi.signOut();
    window.location.href = '/';
  };

  return (
    <Page themeId="tool">
      <Header title="Setup Ansible Automation Portal" />
      <Content>
        <Box className={classes.center}>
          <CheckCircleIcon className={classes.icon} />
          <Typography variant="h4">System Configured &amp; Ready</Typography>
          <Typography variant="body1" align="center">
            The setup is complete and the temporary admin session has ended.
            <br />
            You can log in using your configured identity provider.
          </Typography>
          <Box mt={2}>
            <Button
              variant="contained"
              color="primary"
              size="large"
              onClick={handleGoToLogin}
            >
              Go to login
            </Button>
          </Box>
        </Box>
      </Content>
    </Page>
  );
};
