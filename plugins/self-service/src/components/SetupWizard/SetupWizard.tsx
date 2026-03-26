import {
  makeStyles,
  Stepper,
  Step,
  StepLabel,
  Typography,
  Paper,
  Box,
} from '@material-ui/core';
import { Navigate } from 'react-router-dom';
import { Header, Page, Content } from '@backstage/core-components';
import { useWizardState, STEP_LABELS, WizardStep } from './useWizardState';
import { usePortalAdminApi } from '../../hooks/usePortalAdminApi';
import { useSetupStatus } from '../../hooks/useSetupStatus';
import { OverviewStep } from './OverviewStep';
import { ConnectAAPStep } from './ConnectAAPStep';
import { ConnectRegistriesStep } from './ConnectRegistriesStep';
import { ConnectSourceControlStep } from './ConnectSourceControlStep';
import { ReviewStep } from './ReviewStep';
import { ApplyingScreen } from './ApplyingScreen';
import { SetupCompleteScreen } from './SetupCompleteScreen';

const useStyles = makeStyles(theme => ({
  root: {
    display: 'flex',
    gap: theme.spacing(4),
    padding: theme.spacing(3),
  },
  sidebar: {
    minWidth: 200,
    flexShrink: 0,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  stepper: {
    backgroundColor: 'transparent',
    padding: 0,
  },
  stepLabel: {
    cursor: 'pointer',
  },
  paper: {
    padding: theme.spacing(4),
    minHeight: 400,
  },
  errorBox: {
    marginTop: theme.spacing(2),
    padding: theme.spacing(2),
    backgroundColor: theme.palette.error.light,
    borderRadius: theme.shape.borderRadius,
    color: theme.palette.error.contrastText,
  },
}));

export const SetupWizard = () => {
  const classes = useStyles();
  const api = usePortalAdminApi();
  const wizard = useWizardState();
  const { status, loading } = useSetupStatus();

  // If setup is already complete, redirect to catalog
  if (!loading && status?.setupComplete && !wizard.state.isComplete) {
    return <Navigate to="/self-service/catalog" replace />;
  }

  if (wizard.state.isComplete) {
    return <SetupCompleteScreen />;
  }

  if (wizard.state.isApplying) {
    return <ApplyingScreen onComplete={wizard.setComplete} />;
  }

  const handleApply = async () => {
    try {
      wizard.setError(null);
      wizard.setApplying(true);
      await api.applySetup();
    } catch (err) {
      wizard.setApplying(false);
      wizard.setError(
        err instanceof Error ? err.message : 'Failed to apply configuration',
      );
    }
  };

  const renderStep = () => {
    switch (wizard.currentStepName) {
      case 'overview':
        return <OverviewStep onNext={wizard.goNext} />;
      case 'aap':
        return (
          <ConnectAAPStep
            config={wizard.state.aap}
            onChange={wizard.setAAPConfig}
            onNext={async () => {
              try {
                wizard.setError(null);
                await api.saveAAPConfig(wizard.state.aap as any);
                wizard.goNext();
              } catch (err) {
                wizard.setError(
                  err instanceof Error ? err.message : 'Failed to save AAP config',
                );
              }
            }}
            onBack={wizard.goBack}
          />
        );
      case 'registries':
        return (
          <ConnectRegistriesStep
            config={wizard.state.registries}
            onChange={wizard.setRegistriesConfig}
            onNext={async () => {
              try {
                wizard.setError(null);
                await api.saveRegistriesConfig(wizard.state.registries as any);
                wizard.goNext();
              } catch (err) {
                wizard.setError(
                  err instanceof Error ? err.message : 'Failed to save registries config',
                );
              }
            }}
            onBack={wizard.goBack}
          />
        );
      case 'source-control':
        return (
          <ConnectSourceControlStep
            scmConfigs={wizard.state.scm}
            onSave={async (provider, config) => {
              try {
                wizard.setError(null);
                await api.saveSCMConfig(provider, config as any);
                wizard.setSCMConfig(provider, config);
              } catch (err) {
                wizard.setError(
                  err instanceof Error ? err.message : 'Failed to save SCM config',
                );
              }
            }}
            onRemove={async provider => {
              try {
                await api.deleteSCMConfig(provider);
                wizard.removeSCMConfig(provider);
              } catch (err) {
                wizard.setError(
                  err instanceof Error ? err.message : 'Failed to remove SCM config',
                );
              }
            }}
            onNext={wizard.goNext}
            onBack={wizard.goBack}
          />
        );
      case 'review':
        return (
          <ReviewStep
            aap={wizard.state.aap}
            registries={wizard.state.registries}
            scm={wizard.state.scm}
            onApply={handleApply}
            onBack={wizard.goBack}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Page themeId="tool">
      <Header title="Setup Ansible Automation Portal" />
      <Content>
        <div className={classes.root}>
          <div className={classes.sidebar}>
            <Stepper
              activeStep={wizard.state.currentStep}
              orientation="vertical"
              className={classes.stepper}
            >
              {wizard.steps.map((step, index) => (
                <Step key={step} completed={index < wizard.state.currentStep}>
                  <StepLabel
                    className={classes.stepLabel}
                    onClick={() => {
                      if (index <= wizard.state.currentStep) {
                        wizard.goToStep(index);
                      }
                    }}
                  >
                    {STEP_LABELS[step as WizardStep]}
                  </StepLabel>
                </Step>
              ))}
            </Stepper>
          </div>

          <Paper className={`${classes.content} ${classes.paper}`}>
            {renderStep()}
            {wizard.state.error && (
              <Box className={classes.errorBox}>
                <Typography variant="body2">{wizard.state.error}</Typography>
              </Box>
            )}
          </Paper>
        </div>
      </Content>
    </Page>
  );
};
