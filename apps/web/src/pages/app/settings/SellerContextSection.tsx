import React from 'react';
import { Briefcase, Sparkles, AlertCircle } from 'lucide-react';
import { CurrencyCode } from '@kairo/core';

interface SellerContextSectionProps {
  name: string;
  setName: (val: string) => void;
  whoYouAre: string;
  setWhoYouAre: (val: string) => void;
  whatYouSell: string;
  setWhatYouSell: (val: string) => void;
  email: string;
  currency: CurrencyCode;
  setCurrency: (val: CurrencyCode) => void;
  customTerms: string;
  setCustomTerms: (val: string) => void;
  fiscalStartMonth: number;
  setFiscalStartMonth: (val: number) => void;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function SellerContextSection({
  name,
  setName,
  whoYouAre,
  setWhoYouAre,
  whatYouSell,
  setWhatYouSell,
  email,
  currency,
  setCurrency,
  customTerms,
  setCustomTerms,
  fiscalStartMonth,
  setFiscalStartMonth,
}: SellerContextSectionProps) {
  return (
    <div className="space-y-6">
      {/* Philosophy Header Banner */}
      <div className="p-4 rounded-xl bg-primary/10 border border-primary/25 flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-glow flex-shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <p className="font-semibold text-textPrimary">
            Deal Intelligence & Anti-Happy-Ears Posture
          </p>
          <p className="text-textSecondary leading-relaxed">
            Kairo evaluates deals against 5 objective qualification pillars (Compelling Event, Economic Buyer, Decision Process, Budget Reality, Champion Strength). Grounding this context sharpens Gemini’s detection of hidden deal-killing unknowns.
          </p>
        </div>
      </div>

      {/* Seller Persona & Role */}
      <div className="card p-5 md:p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Briefcase className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-textPrimary">Seller Persona</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-textSecondary mb-1.5">
              Full Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              placeholder="e.g. Jordan Bell"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-textSecondary mb-1.5">
              Role in Sales
            </label>
            <select
              value={whoYouAre}
              onChange={(e) => setWhoYouAre(e.target.value)}
              className="input-field"
            >
              <option value="">Select your role</option>
              <option value="ae">Account Executive — full-cycle AE managing pipeline</option>
              <option value="founder">Founder — running founder-led sales</option>
              <option value="consultant">Consultant or Agency — selling professional services</option>
              <option value="freelancer">Freelancer — winning independent client engagements</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-textSecondary mb-1.5">
            Account Email (Read-only)
          </label>
          <input
            type="email"
            value={email}
            disabled
            className="input-field opacity-50 cursor-not-allowed sm:max-w-md"
          />
        </div>
      </div>

      {/* What You Sell */}
      <div className="card p-5 md:p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-textPrimary mb-1">Product & Value Proposition</h3>
          <p className="text-textMuted text-xs">
            Describe what you sell, your target buyer personas, and typical pricing model. Kairo uses this to identify whether customer objections are genuine budget constraints or soft brush-offs.
          </p>
        </div>

        <div>
          <textarea
            value={whatYouSell}
            onChange={(e) => setWhatYouSell(e.target.value)}
            placeholder="e.g. We sell enterprise security governance SaaS ($50k-$150k ACV) to CISOs and VP InfoSec. Evaluation requires InfoSec review, procurement sign-off, and pilot POC."
            className="input-field min-h-28 resize-none text-xs leading-relaxed"
          />
          <p className="text-textMuted text-[11px] mt-1.5">
            Be as specific as possible regarding deal sizes and evaluation steps.
          </p>
        </div>
      </div>

      {/* Deal Intelligence Tuning & Terminology */}
      <div className="card p-5 md:p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-textPrimary mb-1">
            Pipeline Defaults & Glossary
          </h3>
          <p className="text-textMuted text-xs">
            Configure how pipeline values are formatted and teach Kairo your industry jargon and competitor names.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-textSecondary mb-1.5">
              Default Pipeline Currency
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              className="input-field"
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="CAD">CAD (C$)</option>
              <option value="AUD">AUD (A$)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-textSecondary mb-1.5">
              Fiscal Year Begins In
            </label>
            <select
              value={fiscalStartMonth}
              onChange={(e) => setFiscalStartMonth(Number(e.target.value))}
              className="input-field"
            >
              {MONTHS.map((m, idx) => (
                <option key={m} value={idx + 1}>
                  {m} (Q1 begins {m})
                </option>
              ))}
            </select>
            <p className="text-textMuted text-[11px] mt-1">
              Used to contextualize compelling event deadlines and budget cycles.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-textSecondary mb-1.5">
            Custom Terminology, Acronyms & Competitors
          </label>
          <input
            type="text"
            value={customTerms}
            onChange={(e) => setCustomTerms(e.target.value)}
            className="input-field text-xs"
            placeholder="e.g. Gong, Clari, SOC2, HIPAA, Kubernetes, ARR, MEDDPICC"
          />
          <p className="text-textMuted text-[11px] mt-1.5">
            Comma-separated terms to assist Gemini’s transcription and avoid phonetic misinterpretations.
          </p>
        </div>
      </div>
    </div>
  );
}
