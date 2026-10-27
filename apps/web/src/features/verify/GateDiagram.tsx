import React, { useMemo, useState, useRef } from 'react';
import { useTranslation } from '../../shared/i18n/index.js';
import { computeCircuitLayout } from './circuitLayout.js';

export interface GateDiagramProps {
  inputValues: readonly boolean[];
}

export function GateDiagram({ inputValues }: GateDiagramProps) {
  const { t } = useTranslation();
  const layout = useMemo(() => computeCircuitLayout(inputValues), [inputValues]);
  const [zoomMode, setZoomMode] = useState<'fit' | '100' | 'custom'>('100');
  const [zoom, setZoom] = useState<number>(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [dragStartX, setDragStartX] = useState<number>(0);
  const [dragStartY, setDragStartY] = useState<number>(0);
  const [scrollStartLeft, setScrollStartLeft] = useState<number>(0);
  const [scrollStartTop, setScrollStartTop] = useState<number>(0);

  const handleZoomIn = () => {
    setZoomMode('custom');
    setZoom((prev) => Math.min(3, Number((prev + 0.25).toFixed(2))));
  };

  const handleZoomOut = () => {
    setZoomMode('custom');
    setZoom((prev) => Math.max(0.5, Number((prev - 0.25).toFixed(2))));
  };

  const handleFit = () => {
    setZoomMode('fit');
    setZoom(1);
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = 0;
      scrollRef.current.scrollTop = 0;
    }
  };

  const handle100Percent = () => {
    setZoomMode('100');
    setZoom(1);
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = 0;
      scrollRef.current.scrollTop = 0;
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoomMode('custom');
      const delta = e.deltaY < 0 ? 0.15 : -0.15;
      setZoom((prev) => Math.min(3, Math.max(0.5, Number((prev + delta).toFixed(2)))));
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrollRef.current) return;
    setIsPanning(true);
    setDragStartX(e.clientX);
    setDragStartY(e.clientY);
    setScrollStartLeft(scrollRef.current.scrollLeft);
    setScrollStartTop(scrollRef.current.scrollTop);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanning || !scrollRef.current) return;
    e.preventDefault();
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    scrollRef.current.scrollLeft = scrollStartLeft - dx;
    scrollRef.current.scrollTop = scrollStartTop - dy;
  };

  const handleMouseUpOrLeave = () => {
    if (isPanning) {
      setIsPanning(false);
    }
  };

  // Determine rendered width style based on zoom mode
  let svgWidthStyle = '100%';
  if (zoomMode === '100') {
    svgWidthStyle = `${layout.width}px`;
  } else if (zoomMode === 'custom') {
    svgWidthStyle = `${Math.round(layout.width * zoom)}px`;
  }

  return (
    <div className="gate-diagram-container">
      {/* Top Header: Sticky Legend on left, Zoom controls on top-right */}
      <div className="gate-diagram-header-toolbar">
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

        <div
          className="gate-diagram-zoom-controls"
          role="toolbar"
          aria-label={t('verify.diagram.title')}
        >
          <button
            type="button"
            className={`diagram-zoom-btn ${zoomMode === 'fit' ? 'active' : ''}`}
            onClick={handleFit}
            aria-label={t('verify.diagram.zoomFit')}
            title={t('verify.diagram.zoomFit')}
          >
            <span>{t('verify.diagram.zoomFit')}</span>
          </button>

          <button
            type="button"
            className={`diagram-zoom-btn ${zoomMode === '100' ? 'active' : ''}`}
            onClick={handle100Percent}
            aria-label={t('verify.diagram.zoom100')}
            title={t('verify.diagram.zoom100')}
          >
            <span>{'100%'}</span>
          </button>

          <button
            type="button"
            className="diagram-zoom-btn"
            onClick={handleZoomOut}
            aria-label={t('verify.diagram.zoomOut')}
            title={t('verify.diagram.zoomOut')}
            disabled={zoom <= 0.5 && zoomMode === 'custom'}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          <button
            type="button"
            className="diagram-zoom-btn"
            onClick={handleZoomIn}
            aria-label={t('verify.diagram.zoomIn')}
            title={t('verify.diagram.zoomIn')}
            disabled={zoom >= 3 && zoomMode === 'custom'}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile horizontal scroll hint */}
      <div className="mobile-scroll-hint" aria-hidden="true">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M18 8L22 12L18 16" />
          <path d="M6 8L2 12L6 16" />
          <line x1="2" y1="12" x2="22" y2="12" />
        </svg>
        <span>{t('verify.diagram.scrollHint')}</span>
      </div>

      {/* SVG Canvas with dynamic viewBox and responsive fit */}
      <div
        ref={scrollRef}
        className="gate-diagram-scroll"
        tabIndex={0}
        aria-label={t('verify.diagram.title')}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
        onWheel={handleWheel}
        style={{
          cursor: isPanning ? 'grabbing' : 'grab',
          overflowX: 'auto',
          overflowY: 'auto',
        }}
      >
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          preserveAspectRatio="xMidYMid meet"
          className="circuit-svg"
          style={{
            width: svgWidthStyle,
            minWidth: zoomMode === '100' ? `${layout.width}px` : undefined,
            height: 'auto',
            display: 'block',
          }}
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
                  <rect
                    width={node.width}
                    height={node.height}
                    rx={rx}
                    className="node-rect"
                    fill="var(--color-panel)"
                  />
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
