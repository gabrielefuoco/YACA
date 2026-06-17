'use client';
import { useState, useMemo, useRef } from 'react';

interface DnaRadarChartProps {
  V_static: Record<string, number>;
  V_final: Record<string, number>;
  getDnaName: (key: string) => string;
}

interface RadarItem {
  key: string;
  name: string;
  baseVal: number;
  evolvedVal: number;
  baseNorm: number;
  evolvedNorm: number;
}

export function DnaRadarChart({ V_static, V_final, getDnaName }: DnaRadarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    name: string;
    baseVal: number;
    evolvedVal: number;
    visible: boolean;
  } | null>(null);

  // Constants for SVG drawing
  const cx = 200;
  const cy = 200;
  const radius = 110; // Padding leaves room for labels

  // 1. Process and normalize data
  const chartData = useMemo(() => {
    const allKeys = Array.from(
      new Set([...Object.keys(V_static || {}), ...Object.keys(V_final || {})])
    );

    const maxStatic = Math.max(...Object.values(V_static || {}), 1);
    const maxFinal = Math.max(...Object.values(V_final || {}), 1);

    const items: RadarItem[] = allKeys.map((key) => {
      const baseVal = V_static?.[key] || 0;
      const evolvedVal = V_final?.[key] || 0;
      const baseNorm = baseVal / maxStatic;
      const evolvedNorm = evolvedVal / maxFinal;

      return {
        key,
        name: getDnaName(key),
        baseVal,
        evolvedVal,
        baseNorm,
        evolvedNorm,
      };
    });

    // Sort by combined strength and take top 8 to keep the chart readable
    return items
      .sort((a, b) => Math.max(b.baseNorm, b.evolvedNorm) - Math.max(a.baseNorm, a.evolvedNorm))
      .slice(0, 8);
  }, [V_static, V_final, getDnaName]);

  const totalAxes = chartData.length;


  // 2. Generate polygon points and metadata for each axis
  const { pointsBase, pointsEvolved, axes } = useMemo(() => {
    const pointsB: string[] = [];
    const pointsE: string[] = [];
    
    const calculatedAxes = chartData.map((item, index) => {
      const angle = (index * (2 * Math.PI) / totalAxes) - (Math.PI / 2);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      // Edge of the radar grid (100% radius)
      const ax = cx + radius * cos;
      const ay = cy + radius * sin;

      // Distance for label positioning (offset outside the grid)
      const labelDist = radius + 22;
      const lx = cx + labelDist * cos;
      const ly = cy + labelDist * sin;

      // Coordinates for base DNA point (normalized)
      const bx = cx + (radius * item.baseNorm) * cos;
      const by = cx + (radius * item.baseNorm) * sin;

      // Coordinates for evolved DNA point (normalized)
      const ex = cx + (radius * item.evolvedNorm) * cos;
      const ey = cy + (radius * item.evolvedNorm) * sin;

      pointsB.push(`${bx},${by}`);
      pointsE.push(`${ex},${ey}`);

      return {
        ...item,
        ax,
        ay,
        lx,
        ly,
        bx,
        by,
        ex,
        ey,
        angle,
        cos,
        sin,
      };
    });

    return {
      pointsBase: pointsB.join(' '),
      pointsEvolved: pointsE.join(' '),
      axes: calculatedAxes,
    };
  }, [chartData, totalAxes, cx, cy, radius]);

  // 3. Grid concentric polygons
  const gridPolygons = useMemo(() => {
    const steps = [0.2, 0.4, 0.6, 0.8, 1.0];
    return steps.map((rFactor) => {
      const points = Array.from({ length: totalAxes }).map((_, index) => {
        const angle = (index * (2 * Math.PI) / totalAxes) - (Math.PI / 2);
        const x = cx + (radius * rFactor) * Math.cos(angle);
        const y = cy + (radius * rFactor) * Math.sin(angle);
        return `${x},${y}`;
      }).join(' ');
      return { rFactor, points };
    });
  }, [totalAxes, cx, cy, radius]);

  // Render fallback if there is not enough data to build a polygon
  if (totalAxes < 3) {
    return (
      <div className="flex items-center justify-center p-8 bg-marrow-light/5 border border-marrow-light/10 rounded-xl text-center min-h-[200px]">
        <p className="text-xs text-marrow-light/55 italic">
          Dati del DNA insufficienti per generare la mappa radar. Seleziona più preset o guarda qualche titolo per evolvere il profilo.
        </p>
      </div>
    );
  }

  // Handle hover on node or axis
  const handleMouseMove = (e: React.MouseEvent<SVGElement>, index: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    
    // Relative position inside the container
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const item = axes[index];
    setHoveredIndex(index);
    setTooltip({
      x,
      y: y - 12,
      name: item.name,
      baseVal: item.baseVal,
      evolvedVal: item.evolvedVal,
      visible: true,
    });
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
    setTooltip(prev => prev ? { ...prev, visible: false } : null);
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-[420px] mx-auto select-none">
      {/* SVG Radar Chart */}
      <svg 
        viewBox="0 0 400 400" 
        className="w-full h-auto drop-shadow-sm font-sans"
        onMouseLeave={handleMouseLeave}
      >
        {/* Gradients & Filters */}
        <defs>
          <radialGradient id="radarCenterGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.05" />
            <stop offset="100%" stopColor="var(--color-background-light)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Center Glow */}
        <circle cx={cx} cy={cy} r={radius} fill="url(#radarCenterGlow)" />

        {/* Concentric Grid Polygons */}
        {gridPolygons.map((grid, idx) => (
          <polygon
            key={idx}
            points={grid.points}
            fill="none"
            stroke="var(--color-marrow-light)"
            strokeOpacity={idx === gridPolygons.length - 1 ? 0.25 : 0.1}
            strokeWidth={idx === gridPolygons.length - 1 ? 1.5 : 1}
          />
        ))}

        {/* Axis Lines */}
        {axes.map((axis, index) => (
          <line
            key={index}
            x1={cx}
            y1={cy}
            x2={axis.ax}
            y2={axis.ay}
            stroke="var(--color-marrow-light)"
            strokeOpacity={hoveredIndex === index ? 0.35 : 0.12}
            strokeWidth={hoveredIndex === index ? 1.5 : 1}
            className="transition-all duration-300"
          />
        ))}

        {/* Base DNA Polygon (Background Layer) */}
        <polygon
          points={pointsBase}
          fill="color-mix(in srgb, var(--color-accent) 8%, transparent)"
          stroke="var(--color-accent)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          strokeOpacity={0.65}
          className="transition-all duration-300"
        />

        {/* Evolved DNA Polygon (Foreground Layer) */}
        <polygon
          points={pointsEvolved}
          fill="color-mix(in srgb, var(--color-primary) 28%, transparent)"
          stroke="var(--color-primary)"
          strokeWidth={3}
          className="transition-all duration-300"
        />

        {/* Interactive Hover Zones for Axes (invisible lines with high width) */}
        {axes.map((axis, index) => (
          <line
            key={`hover-zone-${index}`}
            x1={cx}
            y1={cy}
            x2={axis.ax}
            y2={axis.ay}
            stroke="transparent"
            strokeWidth={20}
            className="cursor-pointer"
            onMouseMove={(e) => handleMouseMove(e, index)}
          />
        ))}

        {/* Base DNA Data Nodes */}
        {axes.map((axis, index) => (
          <circle
            key={`node-base-${index}`}
            cx={axis.bx}
            cy={axis.by}
            r={3}
            fill="var(--color-accent)"
            stroke="var(--color-background-light)"
            strokeWidth={1}
            opacity={0.7}
            pointerEvents="none"
          />
        ))}

        {/* Evolved DNA Data Nodes */}
        {axes.map((axis, index) => (
          <circle
            key={`node-evolved-${index}`}
            cx={axis.ex}
            cy={axis.ey}
            r={hoveredIndex === index ? 5.5 : 4}
            fill="var(--color-primary)"
            stroke="var(--color-background-light)"
            strokeWidth={1.5}
            className="transition-all duration-200"
            pointerEvents="none"
          />
        ))}

        {/* Axis Labels */}
        {axes.map((axis, index) => {
          // Truncate labels that are too long
          const displayLabel = axis.name.length > 12 
            ? `${axis.name.slice(0, 11)}…` 
            : axis.name;

          // Adjust text anchor alignment based on quadrant to prevent overlaps
          let textAnchor: 'start' | 'end' | 'middle' = 'middle';
          if (axis.cos > 0.15) textAnchor = 'start';
          if (axis.cos < -0.15) textAnchor = 'end';

          // Shift labels slightly vertically based on position
          let dy = '0.35em';
          if (axis.sin > 0.8) dy = '0.9em';
          if (axis.sin < -0.8) dy = '-0.2em';

          const isHovered = hoveredIndex === index;

          return (
            <text
              key={`label-${index}`}
              x={axis.lx}
              y={axis.ly}
              textAnchor={textAnchor}
              dy={dy}
              className={`text-[9px] font-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                isHovered 
                  ? 'fill-primary scale-105' 
                  : 'fill-marrow-light/70'
              }`}
              onMouseMove={(e) => handleMouseMove(e, index)}
            >
              {displayLabel}
            </text>
          );
        })}
      </svg>

      {/* Floating HTML Tooltip */}
      {tooltip && tooltip.visible && (
        <div 
          className="absolute z-50 glass-panel p-2.5 rounded-lg border border-marrow-light/15 shadow-xl text-[10px] pointer-events-none transition-all duration-75 -translate-x-1/2 -translate-y-full"
          style={{ 
            left: `${tooltip.x}px`, 
            top: `${tooltip.y}px` 
          }}
        >
          <p className="font-black text-marrow-deep uppercase tracking-wider mb-1.5 border-b border-marrow-light/10 pb-1 pr-4">
            {tooltip.name}
          </p>
          <div className="flex flex-col gap-1 font-bold">
            <div className="flex items-center justify-between gap-6">
              <span className="text-accent/80 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-accent"></span>
                DNA Base:
              </span>
              <span className="text-marrow-deep font-mono font-black">{tooltip.baseVal}</span>
            </div>
            <div className="flex items-center justify-between gap-6">
              <span className="text-primary flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                DNA Evoluto:
              </span>
              <span className="text-marrow-deep font-mono font-black">{tooltip.evolvedVal}</span>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Legend */}
      <div className="flex justify-center items-center gap-6 mt-2 pb-2">
        <div className="flex items-center gap-2 text-[10px] font-bold text-marrow-light/75">
          <span className="w-3.5 h-1.5 rounded-full border border-accent bg-accent/10 border-dashed"></span>
          <span>Base (Preset)</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold text-marrow-light/75">
          <span className="w-3.5 h-1.5 rounded-full border border-primary bg-primary/20"></span>
          <span>Evoluto (Storico)</span>
        </div>
      </div>
    </div>
  );
}
