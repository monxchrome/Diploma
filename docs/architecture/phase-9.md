# Phase 9 Architecture

## Scope

Phase 9 changes the web product surface, not the decision engine. The browser continues to call NestJS only; NestJS continues to authorize all project access, apply entitlements and quotas, and call FastAPI through the existing internal boundary. No Prisma schema, API contract, retrieval strategy, agent graph, billing policy, or authentication flow changes.

## Product flow

```text
Home composer
  -> select or create project inline
  -> use ready project sources by default
  -> POST existing analysis request
  -> POST existing run request
  -> friendly progress and report-first result
```

The composer resolves `AUTO` to the existing `MULTI_AGENT` input. `FOCUSED` resolves to `SINGLE_AGENT`; `MULTI_PERSPECTIVE` resolves to `MULTI_AGENT`. Web research remains off unless the user explicitly enables it and the existing entitlement allows it.

## Initial UX audit and change map

The prior dashboard prioritized API/environment cards and recent projects. Its observed existing-project path was: open a project from Dashboard, open Analyses, choose New analysis, select a knowledge base, create the analysis, then press Run. That is six discrete clicks plus required title, decision-question and knowledge-base inputs before execution. The form additionally exposed implementation terms such as multi-agent, evidence scope, preferred domains and specialist selection in the main flow.

The new existing-project path is one decision input and Analyze. The project is inferred from the current context, last use or sole accessible project; one compact choice is shown only when needed. For a first project, the only added requirement is its name in the inline composer. Title, raw knowledge-base IDs, requested specialists, graph settings, research query/date/domain controls and technical quality metrics were removed from the main flow. Friendly approach and web-research choices moved to Advanced; workflow, research, conflict and quality metrics moved to Details.

Project sources and documents were consolidated under Sources. Dashboard now redirects to Home, and the former analysis creation route redirects to the project-contextual composer. The product retains project, report, research, source, conflict and workflow deep links for technical users.

## Client persistence

The composer stores a non-secret UI draft in local storage: question, selected project, source selection, friendly mode and web-research choice. It never stores file content, access tokens, refresh tokens, provider identifiers, credentials, system prompts or hidden reasoning. The draft is cleared only after a run starts successfully.

## Compatibility

`/dashboard` redirects to `/home`. The former project analysis creation route redirects to the Home composer with the project preselected. Existing project, progress, report, research, source, conflict and workflow routes remain valid for deep links and technical access.
