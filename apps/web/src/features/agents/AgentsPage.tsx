import React from 'react';
import { useTranslation, type TranslationKey } from '../../shared/i18n/index.js';
import { usePageMeta } from '../../shared/hooks/usePageMeta.js';
import { CopyButton } from '../../shared/ui/CopyButton.js';
import { RULE_FAILURE_CODES } from '@seiyaku/circuit-tools';
import { CLI_COMMAND_DOCS, CLI_EXIT_CODES_DOCS, MCP_TOOLS_DOCS } from '@seiyaku/agent-sdk/docs';
import './agents.css';

export const SAMPLE_MCP_CLIENT_CONFIG_JSON = JSON.stringify(
  {
    mcpServers: {
      seiyaku: {
        command: 'npx',
        args: [
          '@seiyaku/agent-sdk',
          'mcp',
          '--vault',
          '0x0165878A594ca255338adfa4d48449f69242Eb8F',
          '--rpc',
          'https://rpc.xlayer.tech',
        ],
        env: {
          SEIYAKU_TRADER_KEY: '0x...',
        },
      },
    },
  },
  null,
  2,
);

const BLOCK_REASONS = [
  { code: RULE_FAILURE_CODES.sane, descKey: 'agents.reasons.saneDesc' },
  { code: RULE_FAILURE_CODES.tokenAllowed, descKey: 'agents.reasons.tokenAllowedDesc' },
  { code: RULE_FAILURE_CODES.notExpired, descKey: 'agents.reasons.notExpiredDesc' },
  { code: RULE_FAILURE_CODES.notFrozen, descKey: 'agents.reasons.notFrozenDesc' },
  { code: RULE_FAILURE_CODES.sizeOk, descKey: 'agents.reasons.sizeOkDesc' },
  { code: RULE_FAILURE_CODES.dailyOk, descKey: 'agents.reasons.dailyOkDesc' },
  { code: RULE_FAILURE_CODES.tradesOk, descKey: 'agents.reasons.tradesOkDesc' },
  { code: RULE_FAILURE_CODES.cooldownOk, descKey: 'agents.reasons.cooldownOkDesc' },
];

export function AgentsPage() {
  const { t } = useTranslation();

  usePageMeta(t('agents.meta.title'), t('agents.meta.desc'));

  return (
    <div className="agents-container">
      {/* 1. Header */}
      <header className="agents-header">
        <h1 className="agents-title">{t('agents.header.title')}</h1>
        <p className="agents-subtitle">{t('agents.header.subtitle')}</p>
      </header>

      {/* 2. CLI & SDK Commands Reference */}
      <section className="agents-section">
        <h2 className="agents-section-title">{t('agents.cli.title')}</h2>
        <p style={{ color: 'var(--color-muted)', fontSize: '14px', margin: '0 0 16px' }}>
          {t('agents.cli.subtitle')}
        </p>

        {/* Quickstart installation card */}
        <div className="agents-code-card" style={{ marginBottom: '24px' }}>
          <div className="agents-code-header">
            <span style={{ fontWeight: 600, fontSize: '14px' }}>{t('agents.cli.install')}</span>
            <CopyButton textToCopy={'npm install @seiyaku/agent-sdk'} />
          </div>
          <pre className="agents-code-pre">
            <code>{'npm install @seiyaku/agent-sdk'}</code>
          </pre>
        </div>

        {/* Commands List */}
        <div className="agents-commands-grid">
          {CLI_COMMAND_DOCS.map((cmd) => (
            <div key={cmd.name} className="agents-command-card" data-command={cmd.name}>
              <div className="agents-command-header">
                <div>
                  <code className="agents-command-name">seiyaku-agent {cmd.name}</code>
                  <p className="agents-command-summary">{t(cmd.summaryKey as TranslationKey)}</p>
                </div>
                <CopyButton textToCopy={cmd.example} />
              </div>

              <div className="agents-command-usage">
                <span className="agents-command-label">{t('agents.cli.usageLabel')}</span>
                <code className="agents-usage-code">{cmd.usage}</code>
              </div>

              <div className="agents-command-example">
                <span className="agents-command-label">{t('agents.cli.exampleLabel')}</span>
                <pre className="agents-example-pre">{cmd.example}</pre>
              </div>

              {cmd.options.length > 0 && (
                <div className="agents-options-list">
                  {cmd.options.map((opt) => (
                    <div key={opt.flag} className="agents-option-row">
                      <code className="agents-option-flag">{opt.flag}</code>
                      <span className="agents-option-desc">{opt.description}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 3. Exit Codes */}
      <section className="agents-section">
        <h2 className="agents-section-title">{t('agents.exitCodes.title')}</h2>
        <div className="agents-table-card">
          <table className="agents-table">
            <thead>
              <tr>
                <th style={{ width: '80px' }}>{t('agents.cli.codeHeader')}</th>
                <th style={{ width: '180px' }}>{t('agents.cli.identifierHeader')}</th>
                <th>{t('agents.cli.meaningHeader')}</th>
              </tr>
            </thead>
            <tbody>
              {CLI_EXIT_CODES_DOCS.map((ec) => (
                <tr key={ec.code}>
                  <td>
                    <code>{ec.code}</code>
                  </td>
                  <td>
                    <strong>{ec.name}</strong>
                  </td>
                  <td>{t(ec.meaningKey as TranslationKey)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. Model Context Protocol (MCP) Server */}
      <section className="agents-section">
        <h2 className="agents-section-title">{t('agents.mcp.title')}</h2>
        <p style={{ color: 'var(--color-muted)', fontSize: '14px', margin: '0 0 16px' }}>
          {t('agents.mcp.subtitle')}
        </p>

        {/* MCP Tools Table */}
        <div className="agents-table-card" style={{ marginBottom: '20px' }}>
          <table className="agents-table">
            <thead>
              <tr>
                <th style={{ width: '220px' }}>{t('agents.mcp.toolNameHeader')}</th>
                <th style={{ width: '110px' }}>{t('agents.mcp.modeHeader')}</th>
                <th>{t('agents.mcp.descHeader')}</th>
              </tr>
            </thead>
            <tbody>
              {MCP_TOOLS_DOCS.map((tool) => (
                <tr key={tool.name}>
                  <td>
                    <code>{tool.name}</code>
                  </td>
                  <td>
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: tool.readOnly
                          ? 'rgba(77, 137, 255, 0.15)'
                          : 'rgba(255, 179, 71, 0.15)',
                        color: tool.readOnly ? 'var(--color-info)' : 'var(--color-warning)',
                        fontWeight: 600,
                      }}
                    >
                      {tool.readOnly ? 'READ ONLY' : 'SIM / SEND'}
                    </span>
                  </td>
                  <td>{t(tool.summaryKey as TranslationKey)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Claude / Cursor Config Snippet */}
        <div className="agents-code-card">
          <div className="agents-code-header">
            <span style={{ fontWeight: 600, fontSize: '14px' }}>{t('agents.mcp.configTitle')}</span>
            <CopyButton textToCopy={SAMPLE_MCP_CLIENT_CONFIG_JSON} />
          </div>
          <pre className="agents-code-pre">
            <code>{SAMPLE_MCP_CLIENT_CONFIG_JSON}</code>
          </pre>
        </div>
      </section>

      {/* 5. Security & Invariant Boundaries */}
      <section className="agents-section">
        <h2 className="agents-section-title">{t('agents.invariants.title')}</h2>
        <div className="agents-invariants-grid">
          <div className="agents-invariant-card enforced">
            <h3 className="agents-invariant-title">{t('agents.invariants.enforcedTitle')}</h3>
            <ul className="agents-invariant-list">
              <li>{t('agents.invariants.inv1')}</li>
              <li>{t('agents.invariants.inv2')}</li>
              <li>{t('agents.invariants.inv3')}</li>
              <li>{t('agents.invariants.inv4')}</li>
              <li>{t('agents.invariants.inv5')}</li>
            </ul>
          </div>

          <div className="agents-invariant-card operator">
            <h3 className="agents-invariant-title">{t('agents.invariants.unprotectedTitle')}</h3>
            <ul className="agents-invariant-list">
              <li>{t('agents.invariants.unp1')}</li>
              <li>{t('agents.invariants.unp2')}</li>
            </ul>
          </div>
        </div>
      </section>

      {/* 6. Permissions Table */}
      <section className="agents-section">
        <h2 className="agents-section-title">{t('agents.permissions.title')}</h2>
        <div className="agents-table-card">
          <table className="agents-table">
            <thead>
              <tr>
                <th>{t('agents.permissions.colAction')}</th>
                <th>{t('agents.permissions.colAllowed')}</th>
                <th>{t('agents.permissions.colDetails')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>{t('agents.permissions.actionTrade')}</strong>
                </td>
                <td className="agents-check-yes">{t('agents.permissions.yes')}</td>
                <td>{t('agents.permissions.actionTradeDesc')}</td>
              </tr>
              <tr>
                <td>
                  <strong>{t('agents.permissions.actionTighten')}</strong>
                </td>
                <td className="agents-check-yes">{t('agents.permissions.yes')}</td>
                <td>{t('agents.permissions.actionTightenDesc')}</td>
              </tr>
              <tr>
                <td>
                  <strong>{t('agents.permissions.actionFreeze')}</strong>
                </td>
                <td className="agents-check-yes">{t('agents.permissions.yes')}</td>
                <td>{t('agents.permissions.actionFreezeDesc')}</td>
              </tr>
              <tr>
                <td>
                  <strong>{t('agents.permissions.actionCancelLoosen')}</strong>
                </td>
                <td className="agents-check-yes">{t('agents.permissions.yes')}</td>
                <td>{t('agents.permissions.actionCancelLoosenDesc')}</td>
              </tr>
              <tr>
                <td>
                  <strong>{t('agents.permissions.actionWithdraw')}</strong>
                </td>
                <td className="agents-check-no">{t('agents.permissions.no')}</td>
                <td>{t('agents.permissions.actionWithdrawDesc')}</td>
              </tr>
              <tr>
                <td>
                  <strong>{t('agents.permissions.actionLoosen')}</strong>
                </td>
                <td className="agents-check-no">{t('agents.permissions.no')}</td>
                <td>{t('agents.permissions.actionLoosenDesc')}</td>
              </tr>
              <tr>
                <td>
                  <strong>{t('agents.permissions.actionTransfer')}</strong>
                </td>
                <td className="agents-check-no">{t('agents.permissions.no')}</td>
                <td>{t('agents.permissions.actionTransferDesc')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 7. Block Reasons List */}
      <section className="agents-section">
        <h2 className="agents-section-title">{t('agents.reasons.title')}</h2>
        <p style={{ color: 'var(--color-muted)', fontSize: '14px', margin: 0 }}>
          {t('agents.reasons.desc')}
        </p>
        <div className="agents-reasons-grid">
          {BLOCK_REASONS.map((reason) => (
            <div key={reason.code} className="agents-reason-item">
              <span className="agents-reason-code">{reason.code}</span>
              <p className="agents-reason-desc">{t(reason.descKey as TranslationKey)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
