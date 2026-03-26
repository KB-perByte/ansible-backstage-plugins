import { useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { SetupStatus } from '@ansible/backstage-rhaap-common';
import { portalAdminApiRef } from '../apis';

export function useSetupStatus() {
  const portalAdminApi = useApi(portalAdminApiRef);
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    portalAdminApi
      .getSetupStatus()
      .then(result => {
        if (!cancelled) {
          setStatus(result);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [portalAdminApi]);

  return { status, loading, error };
}
