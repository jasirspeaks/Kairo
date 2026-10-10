# Kairo — Deal Intelligence Co-Pilot

> **"What does the seller still not know that could kill this deal?"**

Kairo is an AI Deal Intelligence Co-pilot for Account Executives (AEs) and sales leadership who cannot afford to lose a deal they thought was healthy.

Kairo is not a generic meeting summarizer, sales coach, or personality analyzer. **The Deal is the primary object.** Calls and conversations are treated as evidence that update and evolve the deal's health state, qualification pillars, and known vs. unknown risks.

---

## 🎯 The 5 Qualification Pillars

Kairo prioritizes grounded evidence and unresolved unknowns over optimistic interpretation across 5 core pillars:

1. **Compelling Event**: The specific business consequence, executive mandate, or hard deadline forcing a decision.
2. **Economic Buyer**: Direct access to and explicit budget authority of the ultimate decision maker.
3. **Decision Process**: The step-by-step evaluation, security/InfoSec, legal, and procurement path.
4. **Budget Reality**: Formally allocated and approved spend vs. unbudgeted wishful thinking.
5. **Champion Strength**: An internal advocate with credibility, influence, and willingness to sell on your behalf.

---

## 🏗️ Monorepo Architecture

The repository is organized as a Turborepo monorepo:

```
kairo/
├── apps/
│   ├── web/         # React + Vite web application with Tailwind CSS
│   ├── desktop/     # Tauri v2 + Rust desktop application with native WASAPI audio capture
│   └── mobile/      # React Native / Expo mobile application
├── packages/
│   ├── core/        # Shared domain types, qualification logic, timeline & evaluation test suite
│   ├── api/         # Supabase client, auth hooks, review RPCs & conversation services
│   └── platform/    # Cross-platform adapters (audio recording, deep links, storage)
├── supabase/
│   ├── functions/   # Supabase Edge Functions (call-review, mobile-recording-review, etc.)
│   └── migrations/  # Database migrations, RLS policies, and atomic review claiming RPCs
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0

### Installation
```bash
# Install dependencies across all workspaces
npm install
```

### Development
```bash
# Start Web client in development mode
npm run dev --workspace=@kairo/web

# Or run Turborepo build/dev across packages
npx turbo run dev
```

### Type Checking & Testing
```bash
# Type check all 6 packages
npx turbo run check-types

# Run domain logic and AI intelligence evaluation tests
npm test --workspace=@kairo/core
```

---

## 🧪 AI Judgment & Benchmark Suite

Located in [`packages/core/test/evaluation/`](packages/core/test/evaluation/), the automated evaluation framework tests:
- **False Positive Elimination**: Catches "Happy Ears" scenarios where high buyer enthusiasm masks missing economic buyer and budget.
- **5-Pillar Accuracy**: Validates ground truth classification of qualification signals.
- **Unknown Detection**: Ensures unverified assumptions are flagged as gaps and missing info.
- **Multi-Call State Evolution**: Verifies that subsequent evidence resolves prior deal gaps and advances deal stages.
