import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';

export function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-bg text-textPrimary flex flex-col selection:bg-primary/30">
      {/* Top Header */}
      <header className="border-b border-border bg-surface/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2.5 text-textSecondary hover:text-textPrimary transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            <span className="text-footnote font-medium">Back to Kairo</span>
          </Link>

          <div className="flex items-center gap-2">
            <img
              src="/logo-mark.png"
              alt="Kairo"
              className="w-6 h-6 rounded-lg object-contain"
            />
            <span className="font-display font-bold text-subhead tracking-tight text-textPrimary">
              Kairo
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-12 md:py-16">
        <div className="card p-6 md:p-10 bg-surface border border-border rounded-2xl relative overflow-hidden">
          {/* Subtle Accent Glow */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

          {/* Title Area */}
          <div className="mb-8 border-b border-border pb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-caption font-semibold uppercase tracking-wider mb-4">
              <Shield className="w-3.5 h-3.5" />
              <span>Legal & Privacy</span>
            </div>
            <h1 className="font-display font-bold text-title1 md:text-largeTitle text-textPrimary mb-3">
              Privacy Policy
            </h1>
            <p className="text-textSecondary text-footnote">
              Effective Date: Pending Publication
            </p>
          </div>

          {/* Placeholder Notice — Technical infrastructure ready, awaiting founder/counsel text */}
          <div className="space-y-6 text-subhead leading-relaxed text-textSecondary">
            <div className="bg-surfaceHigh/60 border border-border/80 rounded-xl p-5 md:p-6 text-footnote">
              <p className="text-textPrimary font-semibold mb-2">
                Policy Document in Preparation
              </p>
              <p className="text-textSecondary leading-normal">
                Kairo&apos;s production privacy policy is currently being finalized. This page is public, mobile-responsive, and unauthenticated to host the official policy text once approved.
              </p>
            </div>

            <section className="space-y-3">
              <h2 className="text-body font-semibold text-textPrimary">
                Commitment to Deal Intelligence Privacy
              </h2>
              <p>
                Kairo processes deal evidence, sales conversations, and buyer interactions to uncover deal risks and assist revenue teams. Data processing commitments, retention periods, subprocessor disclosures, and customer rights will be published here in full detail.
              </p>
            </section>

            <section className="space-y-3 pt-2">
              <h2 className="text-body font-semibold text-textPrimary">
                Inquiries & Account Control
              </h2>
              <p>
                Users can manage their account settings, Google Calendar connections, and data deletion directly within the Kairo application settings. For privacy inquiries prior to document publication, contact your Kairo team representative.
              </p>
            </section>
          </div>
        </div>
      </main>

      {/* Minimal Public Footer */}
      <footer className="border-t border-border py-8 text-center text-textMuted text-footnote">
        <div className="max-w-4xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} Kairo. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link to="/signin" className="hover:text-textSecondary transition-colors">
              Sign In
            </Link>
            <Link to="/signup" className="hover:text-textSecondary transition-colors">
              Sign Up
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
