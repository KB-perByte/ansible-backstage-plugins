# ADR-005: Deployment-Aware Restart Without Shell Execution

**Status**: Accepted
**Date**: 2026-03-24
**Deciders**: Portal team

## Context

After the setup wizard saves configuration to the database, the backend must restart so community plugins (auth, catalog, SCM integrations) pick up the new config via `DatabaseConfigSource`. The restart mechanism must work across three deployment modes:

- **Local dev**: Developer restarts manually
- **RHEL appliance**: Systemd manages the portal process
- **OpenShift**: Kubernetes manages the portal pod

Security constraint: no `child_process.exec()`, `execFile()`, or shell spawning from the Node.js process.

## Alternatives Considered

### Option 1: Shell Execution — `child_process.exec('systemctl restart')` (Rejected)

Spawn a shell command from Node.js to restart the service directly.

**Why rejected:**

- **Security risk**: `child_process.exec()` and `execFile()` are command injection vectors. Even with careful argument sanitization, the attack surface is unnecessary — the portal doesn't need to run arbitrary commands
- **Privilege escalation**: On RHEL, `systemctl restart` requires root or the correct systemd permissions. The portal process runs as a non-root user (`portal`)
- **Not portable**: `systemctl` doesn't exist on OpenShift. `kubectl` or `oc` aren't available inside the pod without installing the CLI binary
- **Security scanners**: Static analysis tools (Snyk, SonarQube) flag any `child_process` usage in production code, creating compliance noise

### Option 2: Signal-Based Restart — `process.kill(process.pid, 'SIGHUP')` (Rejected)

Send a signal to the current process to trigger a config reload.

**Why rejected:**

- Backstage does not support config hot-reload via signals. The `rootConfig` service is created once at startup and is not re-evaluated
- `SIGHUP` in Node.js terminates the process by default. Custom signal handlers could catch it, but the config system would still need a full re-initialization — equivalent to a restart but more fragile
- Community plugins cache config values internally. Even if `rootConfig` were refreshed, plugins like the GitHub integration or auth providers wouldn't re-read their config without their own `initialize()` being called again

### Option 3: Kubernetes CronJob for Health Check (Rejected)

Deploy a sidecar CronJob that monitors a "restart requested" flag and patches the deployment.

**Why rejected:**

- Adds infrastructure complexity (another container, RBAC, scheduling) for a rare operation (restart happens once during setup and occasionally during config changes)
- Introduces delay — CronJob polls on a schedule vs the current approach which triggers immediately
- Only works on OpenShift, not RHEL appliance

## Decision

Implement a **`RestartService`** that detects the deployment mode at runtime and triggers the appropriate restart.

**Why this approach wins:**

- **Zero shell execution**: Uses only `process.exit(0)` (a standard Node.js API) and HTTPS requests (to the K8s API). No command injection surface
- **Orchestrator-native**: On RHEL, systemd's `Restart=always` policy handles the restart — we just exit cleanly. On OpenShift, the K8s API PATCH is the same mechanism that `kubectl rollout restart` uses
- **Graceful**: The 2-second delay before exit ensures the HTTP response ("Apply successful, restarting...") reaches the browser before the process terminates
- **Fail-safe**: On OpenShift, if the K8s API patch fails (RBAC misconfigured, API server unreachable), the service falls back to `process.exit(0)` — the liveness probe will eventually restart the pod

### Detection and Restart Logic

```
  RestartService.detectDeploymentMode()
  ─────────────────────────────────────

  /etc/portal/.portal.env exists?
       │
       ├── yes ──► mode = "rhel"
       │
       └── no
            │
            KUBERNETES_SERVICE_HOST env var set?
                 │
                 ├── yes ──► mode = "openshift"
                 │
                 └── no ───► mode = "local"


  RestartService.triggerRestart()
  ───────────────────────────────

  ┌──────────┬────────────────────────────────────────────────────────┐
  │  Mode    │  Restart Mechanism                                    │
  ├──────────┼────────────────────────────────────────────────────────┤
  │          │                                                        │
  │  rhel    │  setTimeout(() => process.exit(0), 2000)              │
  │          │       │                                                │
  │          │       └──► systemd Restart=always                      │
  │          │            restarts the portal service                 │
  │          │                                                        │
  ├──────────┼────────────────────────────────────────────────────────┤
  │          │                                                        │
  │openshift │  PATCH /apis/apps/v1/namespaces/{ns}/                 │
  │          │    deployments/{name}                                  │
  │          │  body: { spec.template.metadata.annotations.          │
  │          │          restartedAt: <now> }                          │
  │          │       │                                                │
  │          │       ├──► success: K8s rolling restart                │
  │          │       │                                                │
  │          │       └──► failure: fallback to process.exit(0)       │
  │          │            (K8s liveness probe restarts pod)           │
  │          │                                                        │
  ├──────────┼────────────────────────────────────────────────────────┤
  │          │                                                        │
  │  local   │  return { triggered: false }                          │
  │          │  Log: "manual restart required"                        │
  │          │  Developer runs: pkill -f backstage-cli; yarn start   │
  │          │                                                        │
  └──────────┴────────────────────────────────────────────────────────┘

  2-second delay before exit allows the HTTP response
  to flush back to the client.
```

### OpenShift K8s API Call

```
  Portal Pod                              Kubernetes API
  ──────────                              ──────────────

  Read service account token
  from /var/run/secrets/
  kubernetes.io/serviceaccount/token
       │
       │  PATCH https://kubernetes.default.svc
       │    /apis/apps/v1/namespaces/{ns}/deployments/{name}
       │  Authorization: Bearer <sa-token>
       │  Content-Type: application/strategic-merge-patch+json
       │  Body: { restartedAt: "2026-04-01T..." }
       │─────────────────────────────────────────────────────►
       │                                                      │
       │◄─────────────────────────────────────────────────────┤
       │  200 OK                                              │
       │                                                      │
       │                                          K8s creates new pod
       │                                          terminates old pod
```

Requires RBAC permissions granted via Helm chart (`templates/restart-rbac.yaml`).

## Consequences

**Positive:**

- No shell execution — uses only `process.exit(0)` and HTTPS API calls
- Graceful: 2-second delay allows the HTTP response to flush before exit
- OpenShift uses the standard K8s API for rollout restarts (same as `kubectl rollout restart`)
- RHEL relies on systemd's `Restart=always` policy — the simplest possible mechanism

**Negative:**

- `process.exit(0)` is abrupt — in-flight requests are dropped. Acceptable because restart only happens after explicit admin action ("Apply & Restart Portal")
- K8s API patch requires RBAC permissions (Role + RoleBinding) granted via Helm chart
- Local dev requires manual restart — but this is standard for Backstage development

## Related

- `plugins/backstage-rhaap-backend/src/service/RestartService.ts`
- `ansible-portal-chart/templates/restart-rbac.yaml` (K8s RBAC for restart)
