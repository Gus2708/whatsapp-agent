project: whatsapp-agent
stack:
  languages: [typescript, javascript]
  frameworks: [nextjs, react, tailwindcss]
  runtime: [node]
architecture:
  app_type: web_dashboard
  main_areas: [dashboard, agent, rag]
conventions:
  branching: null
  testing_style: tdd
  spec_style: delta
  cuj_e2e: optional
testing:
  unit: npm --prefix dashboard run test
  integration: null
  e2e: npm run test:e2e
  default_command: npm --prefix dashboard run test
quality:
  lint_command: npm --prefix dashboard run lint
  typecheck_command: npm --prefix dashboard run typecheck
notes:
  - "Spec flow and UI-driven changes can include E2E Critical User Journey (CUJ) testing via Playwright (npm run test:e2e)."
  - "CUJ test files are located under dashboard/e2e/*.spec.ts and run real data flows across Desktop and Mobile viewports."
updated_at: '2026-09-04T08:35:00.000000+00:00'
