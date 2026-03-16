# PhishLogic UI Refactoring Plan (Enterprise-Level)

**Status**: DEFERRED - Implementing test screens first, refactoring later
**Priority**: P2 (After test screens are functional)
**Timeline**: 10 weeks (when started)

---

## Context

This plan outlines the complete enterprise-level refactoring of the PhishLogic admin UI. The goal is to transform from a monolithic architecture to a modular, maintainable system with internationalization, advanced theming, plugin architecture, and comprehensive testing.

**Current Problems**:
- 11 monolithic pages (335-708 lines each)
- Hardcoded English strings (no i18n)
- Basic CSS variable theming only
- alert() and console.error for errors
- No form validation library
- No error boundaries
- Direct API calls in components
- sonner installed but unused

**Target Architecture**: Clean layered architecture with Presentation → Container → Service → Infrastructure layers

---

## Deployment Strategy

✅ **RECOMMENDED**: Incremental refactoring after test screens are functional

**Rationale**:
1. Test screens provide immediate value for demos and testing
2. Lower risk - each improvement deployed separately
3. Backend already stable and deployed
4. Can refactor while test screens are being used

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                        │
│     Pages (Dumb) | Components (Dumb) | Layouts              │
└───────────────────────────┬─────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    CONTAINER LAYER                           │
│    Containers (Smart) | Hooks (useQuery) | VM Logic         │
└───────────────────────────┬─────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                     SERVICE LAYER                            │
│   API Client Services | Validation | Business Logic         │
└───────────────────────────┬─────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                 INFRASTRUCTURE LAYER                         │
│  i18n | Theme | Error Handler | Analytics | Logger | Plugin │
└─────────────────────────────────────────────────────────────┘
```

---

## Target Folder Structure

```
admin-ui/src/
├── core/                        # Business logic (framework-agnostic)
│   ├── domain/                  # Models & types
│   ├── services/                # Business logic services
│   └── use-cases/               # Application use cases
│
├── infrastructure/              # Technical infrastructure
│   ├── api/                     # API client abstraction
│   ├── i18n/                    # Internationalization
│   ├── theme/                   # Advanced theming
│   ├── error/                   # Error handling
│   ├── analytics/               # Analytics & monitoring
│   ├── logger/                  # Client-side logging
│   └── plugins/                 # Plugin system
│
├── presentation/                # UI Layer
│   ├── components/
│   │   ├── ui/                  # Atomic components
│   │   ├── forms/               # Form components
│   │   ├── data-display/        # Tables, badges
│   │   └── feedback/            # Alerts, toasts
│   ├── containers/              # Smart components
│   └── pages/                   # Page components
│
├── application/                 # Application layer
│   ├── hooks/
│   │   ├── api/                 # React Query hooks
│   │   ├── forms/               # Form hooks
│   │   └── ui/                  # UI hooks
│   ├── contexts/                # React contexts
│   └── providers/               # Provider composition
│
└── __tests__/                   # Test infrastructure
    ├── setup.ts
    ├── mocks/ (MSW for demo mode)
    └── utils/
```

---

## Technology Stack

### New Libraries to Add

```json
{
  "dependencies": {
    "react-i18next": "^13.5.0",              // i18n
    "i18next": "^23.7.0",
    "@tanstack/react-query": "^5.17.0",      // Server state
    "react-hook-form": "^7.49.0",            // Forms
    "zod": "^3.22.4",                        // Validation
    "@hookform/resolvers": "^3.3.4",
    "zustand": "^4.4.7",                     // Client state
    "immer": "^10.0.3"
  },
  "devDependencies": {
    "vitest": "^1.2.0",                      // Testing
    "@testing-library/react": "^14.1.2",
    "@testing-library/jest-dom": "^6.2.0",
    "msw": "^2.0.11"                         // API mocking
  }
}
```

---

## Implementation Phases (10 Weeks)

### Phase 0: Infrastructure Layer (Week 1-2)
- i18n system (react-i18next)
- Advanced theming system
- Error handling (sonner toast, ErrorBoundary)
- Plugin system basics

**Critical Files**:
- `infrastructure/i18n/config.ts`
- `infrastructure/theme/theme-provider.tsx`
- `infrastructure/error/error-boundary.tsx`
- `infrastructure/api/client/base-client.interface.ts`

### Phase 1: Service Layer (Week 3)
- API client abstraction
- Business logic services
- Endpoint modules

### Phase 2: Application Layer (Week 3-4)
- React Query setup
- API hooks (useAnalyses, useTasks, etc.)
- Form management (React Hook Form + Zod)
- UI hooks (useToast, useModal, useConfirm)

### Phase 3: Component Library (Week 5-6)
- Enhanced UI components (FormField, Table, Pagination, etc.)
- Data display components (EmptyState, LoadingSkeleton)
- Feedback components (Modal, ConfirmDialog, Alert)
- Component tests (80%+ coverage)

### Phase 4: Existing Page Refactoring (Week 7-8)
Refactor existing pages one by one:
1. DebugPage
2. DashboardPage
3. TasksPage
4. SettingsPage
5. WhitelistPage
6. CostsPage
7. Remaining pages

**Refactoring Pattern**:
- Split into Page (orchestration) + Container (data) + Presentation (UI)
- Replace useEffect with React Query hooks
- Replace alert() with toast
- Replace strings with t()
- Add tests (80%+)

### Phase 5: Testing & Demo Mode (Week 9)
- Comprehensive test suite (Vitest + Testing Library)
- MSW setup for API mocking
- Demo mode (works without backend)
- Demo banner

### Phase 6: Documentation & Polish (Week 10)
- Architecture documentation
- Component library documentation
- Testing guide
- i18n guide
- Theming guide
- Plugin development guide

---

## Refactoring Checklist (Per Page)

When refactoring each page:

- [ ] Extract API calls to React Query hooks
- [ ] Split into page + container + presentation (< 200 lines each)
- [ ] Replace alert() with toast
- [ ] Replace console.error with logger
- [ ] Replace hardcoded strings with t()
- [ ] Add loading skeletons (not just spinners)
- [ ] Add error boundaries
- [ ] Add empty states
- [ ] Write component tests (80%+ coverage)
- [ ] Update TypeScript types if needed
- [ ] Verify no useEffect for data fetching
- [ ] ESLint passes with 0 warnings

---

## Critical Files (Top 5 Priority)

1. **`infrastructure/i18n/config.ts`**
   - Foundation for internationalization
   - Blocks: All pages that need translation

2. **`infrastructure/theme/theme-provider.tsx`**
   - Advanced theming system
   - Blocks: Theme switcher, custom themes

3. **`infrastructure/api/client/base-client.interface.ts`**
   - API abstraction interface
   - Blocks: Service layer, plugin architecture

4. **`infrastructure/error/error-boundary.tsx`**
   - Global error handling
   - Blocks: Error handling refactoring

5. **`application/hooks/api/useAnalyses.ts`**
   - React Query pattern example
   - Blocks: Page refactoring (replicated for all data fetching)

---

## Verification Steps

### Phase 0 (Infrastructure)
- [ ] Language switcher component works
- [ ] Theme switcher changes colors dynamically
- [ ] ErrorBoundary catches component errors
- [ ] Toast notifications replace all alert() calls
- [ ] Plugin system loads built-in screens

### Phase 1 (Service Layer)
- [ ] All API calls go through service layer
- [ ] No direct axios usage in components
- [ ] Response validation with Zod works
- [ ] API client is swappable

### Phase 2 (Application Layer)
- [ ] React Query DevTools shows all queries
- [ ] No manual useEffect for data fetching
- [ ] Form validation works with Zod
- [ ] Cache invalidation works on mutations

### Phase 3 (Component Library)
- [ ] Each component has unit tests (80%+)
- [ ] Components are accessible (ARIA labels, keyboard nav)
- [ ] Components use theme tokens
- [ ] Components documented with JSDoc

### Phase 4 (Page Refactoring)
- [ ] Each page < 200 lines
- [ ] No alert() or console.error in code
- [ ] All strings use t()
- [ ] Tests pass (80%+ coverage)
- [ ] All features work (search, filter, CRUD)

### Phase 5 (Testing & Demo Mode)
- [ ] `npm test` runs all tests
- [ ] Coverage > 80% overall
- [ ] Demo mode works without backend
- [ ] All features functional in demo mode

### Phase 6 (Documentation)
- [ ] UI_ARCHITECTURE.md complete
- [ ] COMPONENT_LIBRARY.md complete
- [ ] TESTING.md complete
- [ ] I18N.md complete
- [ ] THEMING.md complete

---

## Performance Budget

**Initial Load**:
- Target: < 1.5s (First Contentful Paint on 3G)
- Max: < 3s

**Bundle Sizes**:
- Initial bundle: < 200KB (gzipped)
- Route chunks: < 50KB each

**Runtime Performance**:
- 60 FPS scrolling
- < 100ms interaction response
- < 500ms page transitions

---

## Code Quality Goals

**TypeScript**: 100% strict mode
**Test Coverage**: > 80%
**ESLint Warnings**: 0
**Average Page Component**: < 200 lines
**Time to Add New Page**: < 2 hours
**Time to Add New Component**: < 30 minutes

---

## Accessibility Requirements (WCAG 2.1 AA)

**Keyboard Navigation**:
- All interactive elements focusable
- Focus visible indicators
- Logical tab order
- Escape key closes modals

**Screen Reader Support**:
- ARIA labels on all inputs
- ARIA live regions for dynamic content
- Semantic HTML
- Alt text for images

**Color & Contrast**:
- 4.5:1 contrast for normal text
- Color not sole indicator
- Dark mode support

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|-----------|
| Breaking existing features | High | Medium | Comprehensive tests, incremental migration, feature flags |
| Performance regression | High | Low | Benchmarking, React Query caching, code splitting |
| i18n extraction errors | Medium | Medium | Automated tooling, thorough review |
| Learning curve | Medium | Medium | Documentation, pair programming |
| Plugin complexity | Medium | Medium | MVP approach, defer advanced features |

---

## Success Metrics

**Technical**:
- Average page component: < 200 lines ✅
- Test coverage: > 80% ✅
- Time to add new page: < 2 hours ✅
- Time to add new component: < 30 min ✅

**User Experience**:
- Error rate: < 1% ✅
- User satisfaction: > 4.0/5 ✅
- Task completion rate: > 90% ✅

**Business**:
- Feature development time: -30% ✅
- Bug fix time: -40% ✅
- Onboarding time for new devs: -50% ✅

---

## Post-Refactoring Roadmap

**After Phase 1 Complete**:

1. **Advanced Features**:
   - Bulk operations
   - Scheduled analysis
   - Custom analyzer plugins
   - API playground

2. **Plugin Ecosystem**:
   - Plugin marketplace
   - Third-party integrations
   - Custom theme builder UI

3. **Performance**:
   - Service Worker for offline support
   - Progressive Web App features
   - Real-time updates via WebSocket

4. **Enterprise Features**:
   - SSO integration
   - Audit logging
   - Role-based access control (RBAC)
   - Multi-tenancy

---

## References

- **Current Plan**: `/Users/anil.vankadaru/.claude/plans/lazy-meandering-cat.md`
- **Architecture Doc**: `docs/development/ARCHITECTURE.md`
- **Coding Standards**: `docs/development/CODING_STANDARDS.md`
- **Testing Guide**: `docs/development/TESTING_GUIDE.md`

---

## Status Updates

**2026-03-09**: Plan created and deferred. Prioritizing test screens implementation first for immediate demo value. Will revisit after test screens are functional and stable.
