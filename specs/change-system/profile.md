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
testing:
  unit: npm --prefix dashboard run test
  integration: null
  e2e: null
  default_command: npm --prefix dashboard run test
quality:
  lint_command: npm --prefix dashboard run lint
  typecheck_command: npm --prefix dashboard run typecheck
notes: []
updated_at: '2026-09-04T08:02:10.768645+00:00'
