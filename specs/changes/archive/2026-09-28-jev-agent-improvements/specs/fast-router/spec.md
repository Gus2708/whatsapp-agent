# Delta Spec: fast-router

## ADDED Requirements

### Requirement: fast-router/store-info — Instant Institutional Response
The system MUST intercept messages classified with high confidence (>= 0.85) as `store_info` and immediately return the authoritative store information card without invoking the LangChain AI Agent.

#### Scenario: Customer inquires about opening hours
- GIVEN an incoming customer message asking about business hours ("¿a qué hora abren?")
- WHEN the fast-router evaluates the message with `store_info` confidence >= 0.85
- THEN the system bypasses the AI Agent and returns the business hours (Lunes a Sábado 7:30am - 5:00pm, Domingo 8:00am - 1:00pm) in < 600ms.

#### Scenario: Customer inquires about physical location
- GIVEN an incoming customer message asking for store address ("¿dónde están ubicados?")
- WHEN the fast-router evaluates the message with `store_info` confidence >= 0.85
- THEN the system bypasses the AI Agent and returns the exact store address in Maracaibo in < 600ms.

#### Scenario: Customer inquires about payment methods
- GIVEN an incoming customer message asking about accepted payment methods ("¿aceptan zelle o pago móvil?")
- WHEN the fast-router evaluates the message with `store_info` confidence >= 0.85
- THEN the system returns the accepted payment methods and notes that Bolívares calculations strictly follow the official BCV exchange rate.

### Requirement: fast-router/social — Immediate Social Greeting and Courtesy
The system MUST handle social greetings and polite closures with confidence >= 0.85 immediately without consuming LLM context tokens.

#### Scenario: Customer sends a basic greeting
- GIVEN an incoming customer message with only a greeting ("Hola buenos días")
- WHEN the fast-router evaluates the message as `general` with confidence >= 0.85
- THEN the system returns a welcoming greeting and offers assistance without invoking OpenRouter.

#### Scenario: Low confidence falls through to LLM
- GIVEN an incoming message with mixed or ambiguous intent (e.g., greeting combined with a vague product inquiry)
- WHEN the classifier confidence is below 0.85 or marked `unclear`
- THEN the system passes the message through to the standard AI Agent.
