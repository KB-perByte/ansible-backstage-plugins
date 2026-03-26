import * as fs from 'fs';
import * as https from 'https';
import { LoggerService } from '@backstage/backend-plugin-api';
import { DeploymentMode } from '@ansible/backstage-rhaap-common';

/**
 * Handles deployment-aware restart triggers.
 *
 * Security: No execFile, exec, or shell spawning. Uses graceful process.exit(0)
 * and relies on the orchestrator (systemd / Kubernetes) to restart the service.
 */
export class RestartService {
  private readonly logger: LoggerService;

  constructor(options: { logger: LoggerService }) {
    this.logger = options.logger;
  }

  detectDeploymentMode(): DeploymentMode {
    if (fs.existsSync('/etc/portal/.portal.env')) return 'rhel';
    if (process.env.KUBERNETES_SERVICE_HOST) return 'openshift';
    return 'local';
  }

  async triggerRestart(): Promise<{
    triggered: boolean;
    mode: DeploymentMode;
  }> {
    const mode = this.detectDeploymentMode();

    switch (mode) {
      case 'openshift':
        try {
          await this.patchDeploymentAnnotation();
          this.logger.info('K8s rollout restart triggered');
        } catch (err) {
          this.logger.warn(
            'K8s API patch failed, falling back to graceful exit',
            err instanceof Error ? err : undefined,
          );
          this.scheduleGracefulExit();
        }
        return { triggered: true, mode };

      case 'rhel':
        this.logger.info(
          'RHEL deployment — scheduling graceful exit for systemd restart',
        );
        this.scheduleGracefulExit();
        return { triggered: true, mode };

      case 'local':
        this.logger.info(
          'Local development — manual restart required',
        );
        return { triggered: false, mode };

      default:
        return { triggered: false, mode };
    }
  }

  private scheduleGracefulExit(): void {
    // Delay to let the HTTP response flush to the client
    setTimeout(() => {
      this.logger.info(
        'Exiting for restart — orchestrator will restart the service',
      );
      process.exit(0);
    }, 2000);
  }

  private async patchDeploymentAnnotation(): Promise<void> {
    const saPath = '/var/run/secrets/kubernetes.io/serviceaccount';
    const namespace = fs
      .readFileSync(`${saPath}/namespace`, 'utf8')
      .trim();
    const token = fs
      .readFileSync(`${saPath}/token`, 'utf8')
      .trim();
    const ca = fs.readFileSync(`${saPath}/ca.crt`);
    const deploymentName =
      process.env.DEPLOYMENT_NAME ?? 'rhaap-portal';

    const body = JSON.stringify({
      spec: {
        template: {
          metadata: {
            annotations: {
              'kubectl.kubernetes.io/restartedAt': new Date().toISOString(),
            },
          },
        },
      },
    });

    const url = `https://kubernetes.default.svc/apis/apps/v1/namespaces/${encodeURIComponent(namespace)}/deployments/${encodeURIComponent(deploymentName)}`;

    const response = await new Promise<{ statusCode: number; body: string }>(
      (resolve, reject) => {
        const req = https.request(
          url,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/strategic-merge-patch+json',
              'Content-Length': Buffer.byteLength(body),
            },
            ca,
          },
          res => {
            let data = '';
            res.on('data', chunk => {
              data += chunk;
            });
            res.on('end', () =>
              resolve({ statusCode: res.statusCode ?? 0, body: data }),
            );
          },
        );
        req.on('error', reject);
        req.write(body);
        req.end();
      },
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(
        `K8s API returned ${response.statusCode}: ${response.body.slice(0, 200)}`,
      );
    }
  }
}
