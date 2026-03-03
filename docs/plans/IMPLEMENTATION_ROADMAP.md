# PhishLogic Implementation Roadmap

## Overview

This roadmap coordinates the implementation of three major feature sets:
1. **PowerPoint Generation** - Convert markdown pitch deck to .pptx
2. **AI Enhancement** - Add AI-powered analysis capabilities
3. **Admin UI** - Configuration and management dashboard

---

## Feature Dependencies

```
PowerPoint Generation
├─ Independent (no dependencies)
└─ Can be done in parallel with other features

AI Enhancement
├─ Phase 1: AI Services (independent)
├─ Phase 2: AI Analyzers (depends on Phase 1)
└─ Phase 3: Integration (depends on Phase 2)

Admin UI
├─ Phase 1: Backend APIs (depends on AI Enhancement Phase 1)
├─ Phase 2: React App Setup (independent)
└─ Phase 3: UI Pages (depends on Phase 1)
```

---

## Recommended Implementation Order

### Option 1: AI-First Approach (Recommended)

**Focus**: Get AI features working first, then build UI to configure them

**Timeline**: 6-8 weeks

#### Month 1: AI Foundation + Admin Backend
- Week 1-2: AI Enhancement Phase 1 (Quick Wins)
- Week 3-4: AI Enhancement Phase 2 (High-Impact)
- Week 3-4 (parallel): Admin Backend APIs

#### Month 2: Admin UI + Developer Tools
- Week 5-6: Admin UI Development
- Week 7-8: AI Developer Tools + Integration
- Week 7-8 (parallel): PowerPoint Generation

**Why This Order?**
- ✅ Delivers value early (AI features work via env vars)
- ✅ Backend APIs ready when UI is built
- ✅ Can test AI features before UI exists
- ✅ PowerPoint done in parallel (independent team member)

---

### Option 2: UI-First Approach

**Focus**: Build UI shell first, then implement AI features

**Timeline**: 7-9 weeks

#### Month 1: UI Foundation
- Week 1-2: Admin UI React setup + skeleton pages
- Week 3-4: Backend API stubs + database schemas
- Week 5-6: AI Enhancement Phase 1

#### Month 2: AI Integration + Polish
- Week 7-8: AI Enhancement Phase 2
- Week 9: Integration and testing
- Week 9 (parallel): PowerPoint Generation

**Why This Order?**
- ✅ Early UI mockups for stakeholder approval
- ✅ Clear backend contract defined early
- ⚠️ Longer before usable features
- ⚠️ More mock data maintenance

---

### Option 3: Parallel Teams

**Focus**: Multiple features simultaneously (requires 2-3 developers)

**Timeline**: 4-5 weeks

#### Team A: AI Enhancement
- Week 1-2: AI Services + Analyzers
- Week 3-4: Integration + Testing

#### Team B: Admin UI
- Week 1-2: React setup + Backend APIs
- Week 3-4: UI pages + Integration

#### Team C (or spare time): PowerPoint
- Week 3-4: Python scripts + Generation

**Why This Order?**
- ✅ Fastest time to completion
- ✅ Parallel progress on all fronts
- ⚠️ Requires coordination
- ⚠️ Needs multiple developers

---

## Detailed Implementation Plan

### Phase 1: AI Quick Wins (Week 1-2)

**Goal**: Add AI without major architecture changes

#### Week 1: Foundation
**Days 1-2**:
- [ ] Create AI configuration schema in `app.config.ts`
- [ ] Create Anthropic and OpenAI client wrappers
- [ ] Add AI environment variables

**Days 3-5**:
- [ ] Implement AI Verdict Reasoning service
- [ ] Replace template-based reasoning in `verdict.service.ts`
- [ ] Test with 20+ examples

**Deliverable**: Natural language explanations powered by Claude

#### Week 2: Semantic Analysis
**Days 1-3**:
- [ ] Create Semantic AI Analyzer
- [ ] Integrate GPT-4o-mini for text analysis
- [ ] Register in analyzer registry

**Days 4-5**:
- [ ] Test with phishing email examples
- [ ] Tune prompts for accuracy
- [ ] Document cost per analysis

**Deliverable**: Social engineering detection

---

### Phase 2: High-Impact AI Features (Week 3-4)

**Goal**: Add visual analysis for sophisticated threats

#### Week 3: Visual Analyzer
**Days 1-3**:
- [ ] Create Visual AI Analyzer
- [ ] Integrate Claude Vision API
- [ ] Add screenshot capture logic

**Days 4-5**:
- [ ] Test with fake login pages
- [ ] Optimize screenshot quality vs cost
- [ ] Add conditional logic (only for high-risk URLs)

**Deliverable**: Visual phishing detection

#### Week 4: Cost Tracking
**Days 1-3**:
- [ ] Create ModelSelectorService
- [ ] Implement per-task model selection
- [ ] Enhance ExecutionStep with AI metadata

**Days 4-5**:
- [ ] Create CostTrackerService
- [ ] Implement budget monitoring
- [ ] Create CLI tool for cost analytics

**Deliverable**: Cost tracking and monitoring

---

### Phase 3: Admin Backend (Week 3-4, Parallel)

**Goal**: Create APIs for Admin UI

#### Week 3: Database & Config APIs
**Days 1-2**:
- [ ] Create database migrations (task_configs, whitelist_entries, analyses)
- [ ] Create ConfigManagerService for dynamic config
- [ ] Create AnalysisStoreService

**Days 3-5**:
- [ ] Implement task configuration API endpoints
- [ ] Implement whitelist management API endpoints
- [ ] Create admin routes in Fastify

**Deliverable**: Backend APIs functional

#### Week 4: Cost & Debug APIs
**Days 1-3**:
- [ ] Implement cost analytics API endpoints
- [ ] Implement debug interface API endpoints
- [ ] Add analysis ID to all responses

**Days 4-5**:
- [ ] Create search functionality
- [ ] Implement rerun analysis feature
- [ ] Test all API endpoints

**Deliverable**: Complete backend

---

### Phase 4: Admin UI Development (Week 5-6)

**Goal**: Build React admin dashboard

#### Week 5: Setup & Core Pages
**Days 1-2**:
- [ ] Setup React + TypeScript + Vite project
- [ ] Install Tailwind CSS + Shadcn/UI
- [ ] Create project structure

**Days 3-5**:
- [ ] Build Task Configuration UI page
- [ ] Build Whitelist Management UI page
- [ ] Create custom hooks (useTaskConfig, useWhitelist)

**Deliverable**: 2 core pages functional

#### Week 6: Analytics & Debug Pages
**Days 1-3**:
- [ ] Build Cost Analytics Dashboard
- [ ] Integrate Recharts for visualizations
- [ ] Create cost breakdown charts

**Days 4-5**:
- [ ] Build Debug Interface page
- [ ] Implement analysis ID search
- [ ] Add execution trace viewer

**Deliverable**: Complete admin dashboard

---

### Phase 5: AI Developer Tools (Week 7-8)

**Goal**: Improve development velocity

#### Week 7: Debug Assistant
**Days 1-3**:
- [ ] Create debug-assistant CLI tool
- [ ] Implement interactive AI conversation
- [ ] Add recommendations for tuning

**Days 4-5**:
- [ ] Test with false positive/negative cases
- [ ] Document usage
- [ ] Measure cost per session

**Deliverable**: AI-powered debugging tool

#### Week 8: Code Generator
**Days 1-3**:
- [ ] Create integration-generator CLI tool
- [ ] Implement code generation from prompts
- [ ] Pattern matching from existing code

**Days 4-5**:
- [ ] Test with Slack adapter generation
- [ ] Auto-generate tests
- [ ] Document usage

**Deliverable**: Code generation tool

---

### Phase 6: PowerPoint Generation (Week 7-8, Parallel)

**Goal**: Convert markdown to professional PowerPoint

#### Week 7: Python Scripts
**Days 1-2**:
- [ ] Create `requirements-pptx.txt`
- [ ] Install Python dependencies
- [ ] Create markdown parser script

**Days 3-5**:
- [ ] Create PowerPoint generator with templates
- [ ] Add brand colors and layouts
- [ ] Generate basic slides

**Deliverable**: Automated slide generation

#### Week 8: Visual Assets & Polish
**Days 1-3**:
- [ ] Create diagram generation scripts
- [ ] Create chart generation scripts
- [ ] Capture screenshots manually

**Days 4-5**:
- [ ] Run full generation script
- [ ] Manual refinement in Google Slides
- [ ] Export to .pptx and PDF

**Deliverable**: Professional pitch deck

---

## Testing Strategy

### Unit Testing
- [ ] AI client wrappers
- [ ] Model selector service
- [ ] Cost tracker service
- [ ] All analyzers
- [ ] API controllers

### Integration Testing
- [ ] End-to-end: Task config UI → API → Analysis execution
- [ ] Whitelist CRUD operations
- [ ] Cost tracking accuracy
- [ ] Debug interface functionality

### Manual Testing
- [ ] Test with 100+ real phishing examples
- [ ] Compare AI verdicts vs rule-based
- [ ] Verify budget alerts trigger
- [ ] Validate cost calculations

### Performance Testing
- [ ] Average analysis time (<5s with AI)
- [ ] API response times (<500ms)
- [ ] Database query performance
- [ ] UI responsiveness

---

## Verification Checklist

### AI Enhancement
- [ ] AI Verdict Reasoning produces natural explanations
- [ ] Semantic Analyzer detects social engineering
- [ ] Visual Analyzer catches fake login pages
- [ ] Cost tracking shows accurate per-analysis costs
- [ ] Budget alerts trigger at 80% threshold

### Admin UI
- [ ] Task Configuration UI allows AI/Hybrid/Native selection
- [ ] Whitelist Management CRUD operations work
- [ ] Cost Analytics shows charts and breakdowns
- [ ] Debug Interface searches by analysis ID
- [ ] No server restart needed for config changes

### PowerPoint Generation
- [ ] All 28 slides generated
- [ ] Speaker notes included
- [ ] Brand colors applied
- [ ] Charts and diagrams rendered
- [ ] .pptx opens in PowerPoint/Google Slides

---

## Dependencies

### Software Requirements
- Node.js >= 22.0.0
- Python >= 3.8
- SQLite or PostgreSQL
- Redis (optional, for caching)

### API Keys Required
- Anthropic API key (for Claude)
- OpenAI API key (for GPT)

### External Services
- None required (all self-hosted)

---

## Risk Assessment

### High Risk
- **AI Cost Overruns**: Mitigate with budget alerts and per-analysis limits
- **Hybrid Engine Complexity**: Start with simpler features first
- **UI/Backend Integration**: Define API contract early

### Medium Risk
- **Visual Analyzer Latency**: Optimize screenshot quality
- **Database Performance**: Add indexes for common queries
- **UI Responsiveness**: Use React Query for caching

### Low Risk
- **PowerPoint Generation**: Independent, can be done manually if scripts fail
- **Cost Tracking**: Simple calculation, low complexity
- **Debug Assistant**: Developer tool, not production-critical

---

## Success Metrics

### Week 2 Checkpoint
- ✅ AI Verdict Reasoning functional
- ✅ Semantic Analyzer integrated
- ✅ Costs < $0.003 per analysis

### Week 4 Checkpoint
- ✅ Visual Analyzer functional
- ✅ Cost tracking working
- ✅ Backend APIs complete

### Week 6 Checkpoint
- ✅ Admin UI 4 pages complete
- ✅ Task configuration via UI works
- ✅ No server restart needed

### Week 8 Checkpoint
- ✅ All features complete
- ✅ End-to-end testing passed
- ✅ PowerPoint deck generated

---

## Post-Implementation

### Week 9-10: Stabilization
- [ ] Bug fixes from testing
- [ ] Performance optimization
- [ ] Documentation updates
- [ ] User training materials

### Month 3: Monitoring & Iteration
- [ ] Track false positive/negative rates
- [ ] Monitor AI costs
- [ ] Gather user feedback
- [ ] Plan Phase 2 features

---

## Quick Start Guide

### Start with AI Enhancement (Recommended)

**If you're a solo developer**:
1. Week 1-2: AI Quick Wins
2. Week 3-4: AI High-Impact + Backend APIs
3. Week 5-6: Admin UI
4. Week 7: Testing and polish
5. Week 8: PowerPoint (if time allows)

**If you have 2 developers**:
- Dev A: AI Enhancement (Week 1-4)
- Dev B: Admin UI (Week 1-4)
- Both: Integration and testing (Week 5-6)

**If you want results fast**:
1. Week 1: AI Verdict Reasoning only
2. Deploy and evaluate
3. Decide on next features based on impact

---

## Related Documents

- [PowerPoint Generation Plan](./POWERPOINT_GENERATION_PLAN.md) - Detailed Python script implementation
- [AI Enhancement Plan](./AI_ENHANCEMENT_PLAN.md) - AI features and analyzers
- [Cost Tracking Plan](./COST_TRACKING_PLAN.md) - Per-task model selection and cost monitoring
- [Admin UI Plan](./ADMIN_UI_PLAN.md) - React dashboard and configuration management
- [Browser/Gmail Integration Plan](./BROWSER_GMAIL_INTEGRATION_PLAN.md) - Existing integrations

---

**Last Updated**: March 2, 2026
**Status**: Ready for Implementation
**Estimated Total Time**: 6-8 weeks (solo) / 4-5 weeks (team of 2-3)
