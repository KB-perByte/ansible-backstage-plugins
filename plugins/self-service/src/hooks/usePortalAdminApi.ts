import { useApi } from '@backstage/core-plugin-api';
import { portalAdminApiRef } from '../apis';

export function usePortalAdminApi() {
  return useApi(portalAdminApiRef);
}
