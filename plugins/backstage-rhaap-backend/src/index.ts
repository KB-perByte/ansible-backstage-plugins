/**
 * Backend plugin for the Ansible self-service portal.
 *
 * Provides:
 * - Admin setup and configuration REST APIs
 * - Database-backed configuration storage (portal_config table)
 * - DatabaseConfigSource for injecting DB config into Backstage's Config system
 * - Encryption for secrets at rest (AES-256-GCM)
 * - Deployment-aware restart service (OpenShift / RHEL / local)
 *
 * @packageDocumentation
 */
export { rhaapBackendPlugin as default } from './plugin';
export { DatabaseConfigSource } from './config/DatabaseConfigSource';
export { createRootConfigWithDatabaseSource } from './config/rootConfigOverride';
