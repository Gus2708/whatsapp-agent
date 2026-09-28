# Published workflow baseline

The user explicitly selected `activeVersion` from the supplied export on 2026-09-27. Its 40 nodes use `openai/gpt-5.6-luna`; the conflicting top-level editor snapshot uses Gemini and is not the baseline.

Source export SHA-256: `8ba759b080017494449753e8bc86a4cc832762e42f01af33f124cdb80cbb3637`.

`workflows/production-baseline.json` contains the selected nodes and connections, with top-level execution settings because the selected snapshot has no settings field. The original download is untouched. A literal Supabase token in the transcription node was replaced with `$env.SUPABASE_ANON_KEY`. Configure that variable on the destination instance. Existing n8n credential references remain and must resolve there.

Run `node scripts/build_workflow.js` to rebuild `n8n_workflow.json`. The generator now reads this baseline rather than treating the old development dumps as production authority. Existing `scratch_live/live_buscar.js`, `live_presupuesto.js`, `live_sanitize.js`, and `live_systemMessage.txt` remain earlier development fixtures; changing them no longer updates the production artifact. Update the baseline deliberately when adopting future published changes.

The overlay adds conversation context, Jev shadow observation and the clarification branch. It preserves the selected system prompt, quotation implementation, dispatch, employee handoff, transcription, admin commands, debounce, credentials and execution settings. The search receives typed result annotations without replacing its matching implementation. The original sanitizer runs after the decision guard, including reservation and bot-message registration. The Agent receives the resolved input and enables intermediate steps; its original error behavior is preserved.

The generated import has 43 nodes and `active: false`. Publication IDs, the duplicate `activeVersion`, instance ownership, pinned execution data and runtime static data are omitted to avoid importing stale publication state or customer data. No remote instance has been updated. Import into an isolated instance first; do not execute the complete customer workflow against production services as a test.

Validation includes baseline preservation, extra-branch preservation, failed-anchor rejection, hermetic execution of published search exits, reservation continuity and suppression for uncertain results, plus whole-artifact reproducibility. These checks do not establish compatibility with the destination n8n runtime; isolated runtime testing is separate.

Rollback: regenerate/import the sanitized 40-node baseline without the overlay; this removes only the three pilot nodes and the Agent/search/sanitizer pilot changes. Keep the credential environment substitution.
