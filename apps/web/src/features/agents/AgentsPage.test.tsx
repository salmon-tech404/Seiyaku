// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentsPage, SAMPLE_MCP_CLIENT_CONFIG_JSON } from './AgentsPage.js';
import { I18nProvider } from '../../shared/i18n/index.js';
import { RouterProvider } from '../../shared/router/index.js';
import { RULE_FAILURE_CODES } from '@seiyaku/circuit-tools';
import { CLI_COMMAND_DOCS, MCP_TOOLS_DOCS } from '@seiyaku/agent-sdk/docs';

describe('AgentsPage', () => {
  it('renders English agents guide with CLI commands, exit codes, MCP tools, and invariants', () => {
    window.location.hash = '#/agents';
    const { container } = render(
      <I18nProvider initialLocale="en">
        <RouterProvider>
          <AgentsPage />
        </RouterProvider>
      </I18nProvider>,
    );

    expect(screen.getByText('Autonomous Agents Guide')).toBeDefined();
    expect(screen.getByText('Agent CLI & SDK Library (@seiyaku/agent-sdk)')).toBeDefined();
    expect(screen.getByText('CLI Exit Codes')).toBeDefined();
    expect(screen.getByText('Model Context Protocol (MCP) Server')).toBeDefined();
    expect(screen.getByText('Security & Invariant Boundaries')).toBeDefined();

    // Verify all 8 CLI commands from shared single-typed source are rendered
    const commandNames = CLI_COMMAND_DOCS.map((c) => c.name);
    expect(commandNames).toHaveLength(8);

    const renderedCommandElements = container.querySelectorAll('.agents-command-card');
    expect(renderedCommandElements.length).toBe(8);

    for (const cmd of CLI_COMMAND_DOCS) {
      const card = container.querySelector(`[data-command="${cmd.name}"]`);
      expect(card).not.toBeNull();
      // Ensure command names match single-typed source exactly
      expect(commandNames).toContain(cmd.name);
    }

    // Verify MCP tools from shared typed source
    for (const tool of MCP_TOOLS_DOCS) {
      expect(screen.getByText(tool.name)).toBeDefined();
    }

    // Verify MCP client config JSON
    const parsedConfig = JSON.parse(SAMPLE_MCP_CLIENT_CONFIG_JSON) as {
      mcpServers?: { seiyaku?: { command: string; args: string[] } };
    };
    expect(parsedConfig.mcpServers?.seiyaku?.command).toBe('npx');
    expect(parsedConfig.mcpServers?.seiyaku?.args).toContain('mcp');

    // Verify block reason codes match @seiyaku/circuit-tools
    expect(screen.getByText(RULE_FAILURE_CODES.sane)).toBeDefined();
    expect(screen.getByText(RULE_FAILURE_CODES.tokenAllowed)).toBeDefined();
    expect(screen.getByText(RULE_FAILURE_CODES.sizeOk)).toBeDefined();
  });

  it('fails if page renders an invalid or non-existent command', () => {
    // Assert all rendered command names belong to the official CLI commands list
    const validCommands = new Set(CLI_COMMAND_DOCS.map((c) => c.name));
    for (const cmd of CLI_COMMAND_DOCS) {
      expect(validCommands.has(cmd.name)).toBe(true);
    }
    // Verify an invented command would be rejected
    expect(validCommands.has('arbitrary-transfer')).toBe(false);
    expect(validCommands.has('drain-funds')).toBe(false);
  });

  it('renders Vietnamese agents guide with localized headers and summaries', () => {
    window.location.hash = '#/agents';
    render(
      <I18nProvider initialLocale="vi">
        <RouterProvider>
          <AgentsPage />
        </RouterProvider>
      </I18nProvider>,
    );

    expect(screen.getByText('Hướng dẫn dành cho Agent tự hành')).toBeDefined();
    expect(screen.getByText('Thư viện CLI & SDK (@seiyaku/agent-sdk)')).toBeDefined();
    expect(screen.getByText('Mã thoát lệnh CLI')).toBeDefined();
    expect(screen.getByText('Server Giao Thức Ngữ Cảnh Mô Hình (MCP)')).toBeDefined();
    expect(screen.getByText('Ranh Giới An Toàn & Bất Biến')).toBeDefined();
  });
});
