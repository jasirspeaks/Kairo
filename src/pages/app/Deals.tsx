import React from 'react';
import { TopBar } from '../../components/layout/TopBar';

// Full implementation lands in the Deals-page step of Phase 3.
// Placeholder exists so App.tsx routing compiles against a real module.
export function Deals() {
  return (
    <>
      <div className="-mx-4 md:hidden">
        <TopBar title="Deals" />
      </div>
      <div className="animate-fade-in">
        <div className="mb-6 hidden md:block">
          <h1 className="font-display text-title1 font-bold text-textPrimary mb-1">Deals</h1>
          <p className="text-textSecondary text-subhead">All deals, filterable by timeline, stage, and status.</p>
        </div>
        <p className="text-textMuted text-sm">Deals table coming next.</p>
      </div>
    </>
  );
}