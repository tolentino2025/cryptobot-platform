# CryptoBot Platform — Architecture

> **AVISO**: Este sistema é uma ferramenta de automação técnica. Não existe NENHUMA garantia de retorno financeiro.

## Overview

Plataforma de trading spot automático com 10 módulos independentes:

1. **Market Data Service** — WebSocket + REST, snapshots em Redis
2. **Feature Engine** — Indicadores técnicos e contexto de decisão
3. **Claude Decision Engine** — Motor de decisão IA (apenas sugere, nunca executa)
4. **Risk Engine** — Autoridade soberana, 20+ regras de validação
5. **Execution Orchestrator** — Ordens idempotentes com lifecycle tracking
6. **Exchange Adapter** — Abstração de corretora (SIM/DEMO/LIVE)
7. **Portfolio Service** — Posições, saldos, PnL, reconciliação
8. **Control Plane / Ops API** — Endpoints administrativos
9. **Audit & Ledger** — Persistência total de eventos
10. **Notification Service** — Alertas críticos via console + webhook

## Princípios

- IA NUNCA executa ordens
- Risk Engine tem poder de veto absoluto
- SIM é sempre o modo padrão
- Fail-safe: em dúvida, o sistema PARA

## Stack

- Backend: TypeScript, Node.js, Fastify, Zod, Prisma, PostgreSQL, Redis
- Frontend: Next.js, Tailwind, shadcn/ui
- AI: Claude API (Sonnet) com structured output
- Infra: Docker, Docker Compose

## Modos

| Modo | Descrição |
|------|-----------|
| SIM | Simulação pura, sem corretora real |
| DEMO | Testnet da Binance, dinheiro fictício |
| LIVE | Dinheiro real, requer dupla validação |

Consulte o documento completo da Etapa 1 para detalhes.
