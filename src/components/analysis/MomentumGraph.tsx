import React, { useState } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, ReferenceLine 
} from 'recharts';
import { MomentumPoint } from '../../types';

interface MomentumGraphProps {
  data: MomentumPoint[];
  animated?: boolean;
}

const CustomDot = (props: any) => {
  const { cx, cy, payload } = props;
  if (!payload.label) return null;
  
  return (
    <g>
      <circle cx={cx} cy={cy} r={5} fill="#7C3AED" stroke="#C4B5FD" strokeWidth={2} />
      <circle cx={cx} cy={cy} r={10} fill="#7C3AED" fillOpacity={0.2} />
    </g>
  );
};

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as MomentumPoint;

  return (
    <div className="bg-surfaceHigh border border-border rounded-xl px-4 py-3 shadow-card max-w-56">
      {d.label && (
        <p className="text-accent text-xs font-semibold mb-1">{d.label}</p>
      )}
      <p className="text-white text-sm font-medium mb-1">Momentum: {d.score}</p>
      {d.description && (
        <p className="text-textSecondary text-xs leading-relaxed">{d.description}</p>
      )}
    </div>
  );
};

export function MomentumGraph({ data, animated = false }: MomentumGraphProps) {

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Deal Momentum</h3>
          <p className="text-xs text-textSecondary mt-0.5">How your deal moved across the conversation</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-textMuted">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-accent rounded" />
            Momentum
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="momentumGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#7C3AED" stopOpacity={0} />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          
          <CartesianGrid strokeDasharray="3 3" stroke="#2A2A35" strokeOpacity={0.5} />
          <XAxis 
            dataKey="time" 
            stroke="#6B6880"
            tick={{ fill: '#6B6880', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}%`}
          />
          <YAxis 
            domain={[0, 100]}
            stroke="#6B6880"
            tick={{ fill: '#6B6880', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={50} stroke="#2A2A35" strokeDasharray="4 4" />
          
          <Line
            type="monotone"
            dataKey="score"
            stroke="#8B5CF6"
            strokeWidth={2.5}
            dot={<CustomDot />}
            activeDot={{ r: 6, fill: '#C4B5FD', stroke: '#7C3AED', strokeWidth: 2 }}
            filter="url(#glow)"
            animationDuration={animated ? 2000 : 0}
            animationEasing="ease-out"
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Key moment labels */}
      <div className="flex flex-wrap gap-2 mt-4">
        {data.filter(d => d.label).map((d, i) => (
          <div key={i} className="flex items-center gap-1.5 bg-surfaceHigh border border-border rounded-lg px-2.5 py-1">
            <div className={`w-1.5 h-1.5 rounded-full ${d.score >= 65 ? 'bg-emerald-400' : d.score >= 45 ? 'bg-amber-400' : 'bg-red-400'}`} />
            <span className="text-xs text-textSecondary">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}