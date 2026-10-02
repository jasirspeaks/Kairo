import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Quote,
  Clock,
  User,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ShieldAlert,
  HelpCircle,
  TrendingUp,
} from 'lucide-react';
import {
  DealEvidence,
  DealRisk,
  DealPillarHistoryItem,
  PILLAR_LABELS,
  PillarKey,
  getPillarBarColor,
} from '../../types';
import { formatDate } from '../../lib/utils';

interface EvidenceInspectorProps {
  open: boolean;
  onClose: () => void;
  dealId: string;
  pillarKey?: PillarKey | null;
  risk?: DealRisk | null;
  title?: string;
  evidence: DealEvidence[];
  pillarHistory?: DealPillarHistoryItem[];
}

export function EvidenceInspector({
  open,
  onClose,
  dealId,
  pillarKey,
  risk,
  title,
  evidence,
  pillarHistory = [],
}: EvidenceInspectorProps) {
  const navigate = useNavigate();

  if (!open) return null;

  const displayTitle =
    title ||
    (pillarKey ? PILLAR_LABELS[pillarKey] : null) ||
    risk?.title ||
    'Supporting Evidence';

  // Filter evidence relevant to selected pillar or risk
  const relevantEvidence = evidence.filter((e) => {
    if (pillarKey) {
      return e.pillar_key === pillarKey;
    }
    if (risk) {
      if (risk.risk_category && e.pillar_key === risk.risk_category) return true;
      if (risk.title && e.quote && (
        risk.title.toLowerCase().includes(e.quote.toLowerCase().slice(0, 20)) ||
        e.quote.toLowerCase().includes(risk.title.toLowerCase().slice(0, 20))
      )) return true;
      if (risk.why_it_matters && e.quote && risk.why_it_matters.toLowerCase().includes(e.quote.toLowerCase().slice(0, 20))) return true;
      return false;
    }
    return true;
  });

  const relevantHistory = pillarKey
    ? pillarHistory.filter((h) => h.pillar_key === pillarKey)
    : [];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div
        className="absolute inset-0 bg-textPrimary/25 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-surface border-l border-border shadow-2xl flex flex-col animate-slide-left">
          {/* Header */}
          <div className="px-6 py-5 border-b border-border flex items-start justify-between gap-4 bg-surfaceHigh/50">
            <div>
              <div className="flex items-center gap-2 mb-1">
                {pillarKey ? (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                    Qualification Pillar
                  </span>
                ) : risk ? (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-red-400/10 text-red-400 border border-red-400/20">
                    Deal Risk Provenance
                  </span>
                ) : (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-400/10 text-amber-400 border border-amber-400/20">
                    Evidence Drawer
                  </span>
                )}
              </div>
              <h2 className="text-base font-display font-bold text-textPrimary leading-snug">
                {displayTitle}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-textMuted hover:text-textPrimary hover:bg-surfaceHigh transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Risk details if inspecting a risk */}
            {risk && (
              <div className="bg-surfaceHigh/60 border border-border rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-textMuted font-medium">Status</span>
                  <span
                    className={`font-semibold px-2 py-0.5 rounded text-[11px] ${
                      risk.status === 'resolved' || risk.status === 'mitigated'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-red-400/10 text-red-400 border border-red-400/20'
                    }`}
                  >
                    {risk.status === 'resolved' ? 'Resolved' : risk.status === 'mitigated' ? 'Mitigated' : 'Active Risk'}
                  </span>
                </div>
                {risk.why_it_matters && (
                  <div className="pt-2 border-t border-border/60">
                    <p className="text-[11px] uppercase tracking-wider font-semibold text-textMuted mb-1">
                      Why it matters
                    </p>
                    <p className="text-xs text-textSecondary leading-relaxed">
                      {risk.why_it_matters}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Pillar Evolution across calls */}
            {relevantHistory.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-textMuted mb-3 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-primary" />
                  Pillar Evolution Across Calls
                </h3>
                <div className="space-y-2.5">
                  {relevantHistory.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="bg-surfaceHigh/40 border border-border rounded-lg p-3 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="font-semibold text-textPrimary">
                          Call #{idx + 1}
                        </span>
                        <div className="flex items-center gap-2">
                          <span
                            className="font-bold text-[11px]"
                            style={{ color: getPillarBarColor(item.confidence) }}
                          >
                            {item.confidence}% confidence
                          </span>
                          <span className="text-[10px] text-textMuted">
                            {formatDate(item.created_at)}
                          </span>
                        </div>
                      </div>
                      <div className="h-1 rounded-full bg-border overflow-hidden mb-2">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${item.confidence}%`,
                            backgroundColor: getPillarBarColor(item.confidence),
                          }}
                        />
                      </div>
                      {item.evidence_text && (
                        <p className="text-textSecondary text-[11px] leading-relaxed">
                          {item.evidence_text}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Verbatim Transcript Evidence Quotes */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-textMuted mb-3 flex items-center gap-1.5">
                <Quote className="w-3.5 h-3.5 text-primary" />
                Verbatim Transcript Evidence ({relevantEvidence.length})
              </h3>

              {relevantEvidence.length === 0 ? (
                <div className="bg-surfaceHigh/30 border border-border/70 rounded-xl p-5 text-center">
                  <HelpCircle className="w-6 h-6 text-textMuted mx-auto mb-2 opacity-60" />
                  <p className="text-xs text-textSecondary font-medium">
                    No direct quotes linked yet.
                  </p>
                  <p className="text-[11px] text-textMuted mt-1">
                    Direct quotes are extracted and indexed whenever call transcripts are reviewed.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {relevantEvidence.map((ev) => (
                    <div
                      key={ev.id}
                      className="bg-surfaceHigh/70 border border-border rounded-xl p-4 space-y-2.5 hover:border-primary/30 transition-colors"
                    >
                      {/* Quote bubble */}
                      <div className="flex items-start gap-2.5">
                        <Quote className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        <blockquote className="text-xs text-textPrimary italic font-medium leading-relaxed">
                          "{ev.quote}"
                        </blockquote>
                      </div>

                      {/* Grounding type annotation */}
                      {ev.grounding_type && (
                        <p className="text-[11px] text-textSecondary pl-6 leading-relaxed bg-bg/30 p-2 rounded border border-border/50">
                          <span className="font-semibold text-textMuted">Type: </span>
                          {ev.grounding_type.replace(/_/g, ' ')}
                        </p>
                      )}

                      {/* Provenance metadata */}
                      <div className="flex items-center justify-between pt-2 border-t border-border/60 text-[11px] text-textMuted">
                        <div className="flex items-center gap-3">
                          {ev.speaker && (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3 text-textMuted" />
                              <strong className="text-textSecondary">{ev.speaker}</strong>
                            </span>
                          )}
                          {ev.confidence !== undefined && (
                            <span className="px-1.5 py-0.2 rounded bg-surface border border-border text-[10px]">
                              {ev.confidence}% conf
                            </span>
                          )}
                        </div>

                        {ev.conversation_id && (
                          <button
                            onClick={() => {
                              onClose();
                              navigate(`/app/deals/${dealId}/calls/${ev.conversation_id}`);
                            }}
                            className="inline-flex items-center gap-1 text-primary hover:text-primaryLight font-semibold text-[11px] transition-colors"
                          >
                            <span>View Call</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-border bg-surfaceHigh/30 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-surfaceHigh hover:bg-border text-textPrimary text-xs font-semibold transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
