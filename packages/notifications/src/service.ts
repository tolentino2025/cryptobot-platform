// ═══════════════════════════════════════════════════════════════
// NotificationService — Critical alerts via console + webhook
// Supports Discord, Telegram-style webhooks
// ═══════════════════════════════════════════════════════════════

import { createLogger } from '@cryptobot/core';
import type { NotificationPayload, Incident } from '@cryptobot/shared-types';

const logger = createLogger('notifications');

export class NotificationService {
  private webhookUrl: string | null;

  constructor(webhookUrl?: string) {
    this.webhookUrl = webhookUrl && webhookUrl.length > 0 ? webhookUrl : null;
    if (this.webhookUrl) {
      logger.info('Webhook notifications enabled');
    }
  }

  /** Send a notification (console + optional webhook) */
  async notify(payload: NotificationPayload): Promise<void> {
    const logMethod = payload.level === 'critical' ? 'error'
      : payload.level === 'warning' ? 'warn' : 'info';

    (logger[logMethod] as Function)(
      { title: payload.title, level: payload.level },
      payload.message,
    );

    if (this.webhookUrl) {
      await this.sendWebhook(payload);
    }
  }

  /** Send critical alert */
  async critical(title: string, message: string, fields?: NotificationPayload['fields']): Promise<void> {
    await this.notify({
      level: 'critical',
      title: `🚨 ${title}`,
      message,
      timestamp: new Date(),
      fields: fields ?? [],
    });
  }

  /** Send warning */
  async warning(title: string, message: string, fields?: NotificationPayload['fields']): Promise<void> {
    await this.notify({
      level: 'warning',
      title: `⚠️ ${title}`,
      message,
      timestamp: new Date(),
      fields: fields ?? [],
    });
  }

  /** Send info */
  async info(title: string, message: string): Promise<void> {
    await this.notify({
      level: 'info',
      title: `ℹ️ ${title}`,
      message,
      timestamp: new Date(),
      fields: [],
    });
  }

  /** Notify incident */
  async notifyIncident(incident: Incident): Promise<void> {
    const level = incident.severity === 'FATAL' || incident.severity === 'CRITICAL'
      ? 'critical' : incident.severity === 'WARNING' ? 'warning' : 'info';
    await this.notify({
      level,
      title: `${incident.severity}: ${incident.title}`,
      message: incident.description,
      timestamp: incident.createdAt,
      fields: [
        { name: 'Type', value: incident.type, inline: true },
        { name: 'Severity', value: incident.severity, inline: true },
        { name: 'Action', value: incident.actionTaken, inline: false },
      ],
    });
  }

  private async sendWebhook(payload: NotificationPayload): Promise<void> {
    if (!this.webhookUrl) return;

    try {
      // Discord-style webhook format
      const body = {
        content: payload.level === 'critical' ? '@here' : undefined,
        embeds: [{
          title: payload.title,
          description: payload.message,
          color: payload.level === 'critical' ? 0xff0000
            : payload.level === 'warning' ? 0xffaa00 : 0x00aaff,
          timestamp: payload.timestamp.toISOString(),
          fields: payload.fields.map((f) => ({
            name: f.name,
            value: f.value,
            inline: f.inline ?? false,
          })),
          footer: { text: 'CryptoBot Platform' },
        }],
      };

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        logger.error(
          { status: response.status, url: this.webhookUrl },
          'Webhook request failed',
        );
      }
    } catch (error) {
      logger.error({ error }, 'Failed to send webhook notification');
    }
  }
}
