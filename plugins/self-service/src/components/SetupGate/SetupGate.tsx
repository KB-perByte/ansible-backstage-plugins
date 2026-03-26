import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSetupStatus } from '../../hooks/useSetupStatus';

/**
 * Invisible component mounted as application/listener.
 * Redirects to the setup wizard if onboarding is enabled and setup is not complete.
 */
export const SetupGate = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { status, loading } = useSetupStatus();

  useEffect(() => {
    if (loading || !status) return;

    // Only redirect if onboarding is enabled and setup not complete
    if (!status.onboardingEnabled || status.setupComplete) return;

    // Don't redirect if already on setup page (prevent loop)
    if (pathname.includes('/setup')) return;

    navigate('/self-service/setup', { replace: true });
  }, [status, loading, pathname, navigate]);

  return null;
};
