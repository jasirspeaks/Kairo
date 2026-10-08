import React, { useState } from 'react';
import { Shield, ShieldCheck, Download, ExternalLink, CheckCircle2, Clock } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { exportUserPipeline } from '@kairo/api';

interface PrivacySecuritySectionProps {
  userId?: string;
}

export function PrivacySecuritySection({ userId }: PrivacySecuritySectionProps) {
  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  async function handleExport() {
    if (!userId) return;
    setExporting(true);
    setExportSuccess(false);

    try {
      const data = await exportUserPipeline(userId);
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `kairo-pipeline-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to export pipeline data:', err);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* 48-Hour Universal Audio Purge Card */}
      <div className="card p-5 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-textPrimary">
              Automated 48-Hour Audio Purge
            </h3>
          </div>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Enforced & Active
          </span>
        </div>

        <p className="text-textSecondary text-xs leading-relaxed">
          In accordance with enterprise data privacy standards and InfoSec protocols, raw audio files stored in Kairo’s secure cloud storage bucket are permanently purged after <strong>48 hours</strong>.
        </p>

        <div className="p-3.5 rounded-lg bg-surfaceHigh border border-border text-xs text-textMuted space-y-2">
          <p>
            • Once transcription is generated, only verified text transcripts and structured deal qualification evidence are preserved in your private database.
          </p>
          <p>
            • Deleted audio cannot be recovered. Account deletion also triggers an immediate hard purge of all associated records.
          </p>
        </div>
      </div>

      {/* AI Processing & Deal Confidentiality */}
      <div className="card p-5 md:p-6 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-textPrimary">
            AI Processing & Deal Confidentiality
          </h3>
        </div>

        <p className="text-textSecondary text-xs leading-relaxed">
          Kairo respects deal confidentiality. Your sales conversations, buyer quotes, transcripts, and CRM data are processed strictly to evaluate deal qualification and surface deal risks in your workspace. AI inference requests are isolated to your workspace and not shared with other customers.
        </p>

        <div className="pt-2">
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:text-primaryLight transition-colors"
          >
            Review Complete Privacy Policy & Subprocessors
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Data Export & Portability */}
      <div className="card p-5 md:p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4 text-glow" />
          <h3 className="text-sm font-semibold text-textPrimary">Data Portability & Export</h3>
        </div>

        <p className="text-textSecondary text-xs leading-relaxed">
          Download a complete snapshot of your pipeline, including deal records, 5-pillar health scores, risk histories, and meeting timelines as structured JSON.
        </p>

        <div className="pt-2 flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={exporting}
            disabled={exporting || !userId}
            onClick={handleExport}
          >
            <Download className="w-3.5 h-3.5" />
            Export My Pipeline (.json)
          </Button>

          {exportSuccess && (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Export downloaded
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
