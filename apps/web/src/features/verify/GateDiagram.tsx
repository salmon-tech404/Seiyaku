import React, { useMemo } from 'react';
import { useTranslation } from '../../shared/i18n/index.js';
import { computeCircuitLayout } from './circuitLayout.js';

export interface GateDiagramProps {
  inputValues: readonly boolean[];
}

export function GateDiagram({ inputValues }: GateDiagramProps) {
  const { t } = useTranslation();
  const layout = useMemo(() => computeCircuitLayout(inputValues), [inputValues]);

  return (
    <div className="gate-diagram-container">
      {/* Sticky Legend */}
      <div className="gate-diagram-legend">
        <div className="legend-item">
          <span className="legend-dot active" />
          <span>{t('verify.diagram.legendActive')}</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot inactive" />
          <span>{t('verify.diagram.legendInactive')}</span>
        </div>
        <div className="legend-item">
          <span className="legend-badge">{t('verify.diagram.symbolNand')}</span>
          <span>{t('verify.diagram.legendNand')}</span>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="gate-diagram-scroll" tabIndex={0} aria-label={t('verify.diagram.title')}>
        <svg
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="circuit-svg"
          role="img"
          aria-label={t('verify.diagram.desc')}
        >
          {/* Wire Connections */}
          <g className="wires-group">
            {layout.edges.map((edge) => (
              <path
                key={edge.id}
                d={edge.pathD}
                className={`circuit-wire ${edge.active ? 'wire-active' : 'wire-inactive'}`}
              />
            ))}
          </g>

          {/* Nodes */}
          <g className="nodes-group">
            {layout.nodes.map((node) => {
              const rx = node.type === 'input' ? 8 : node.type === 'output' ? 10 : 6;
              const isHigh = node.value;

              let nodeClass = 'circuit-node';
              if (node.type === 'input') {
                nodeClass += isHigh ? ' node-input-high' : ' node-input-low';
              } else if (node.type === 'gate') {
                nodeClass += isHigh ? ' node-gate-high' : ' node-gate-low';
              } else {
                nodeClass += isHigh ? ' node-out-allow' : ' node-out-block';
              }

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x - node.width / 2}, ${node.y - node.height / 2})`}
                  className={nodeClass}
                >
                  <rect width={node.width} height={node.height} rx={rx} className="node-rect" />
                  <text
                    x={node.width / 2}
                    y={node.height / 2 + 4}
                    textAnchor="middle"
                    className="node-text"
                  >
                    {node.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Accessible Formula Box */}
      <div className="gate-formula-box">
        <span className="formula-label">{t('verify.diagram.formulaTitle')}</span>
        <code className="formula-code">{layout.formulaText}</code>
      </div>
    </div>
  );
}
