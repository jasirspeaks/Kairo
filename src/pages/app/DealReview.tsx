import React from 'react';
import { useParams } from 'react-router-dom';
import { TopBar } from '../../components/layout/TopBar';

// Full implementation lands in the Deal Review step of Phase 3.
// Placeholder exists so App.tsx routing compiles against a real module.
export function DealReview() {
  const { dealId } = useParams<{ dealId: string }>();

  return (
    <>
      <div className="-mx-4 md:hidden">
        <TopBar title="Deal Review" />
      </div>
      <div className="animate-fade-in">
        <p className="text-textMuted text-sm">Deal Review for {dealId} coming next.</p>
      </div>
    </>
  );
}