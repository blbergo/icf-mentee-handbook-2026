---
name: handbook
description: >
  Technical handbook for the Inclusive Coding Festival 2026. Use this skill when participants ask about
  agentic coding topics including: running local models with Ollama, prompting strategies, MCP servers,
  creating skills or custom agents, or managing token usage and context windows. Also use when asked
  about Azure cloud computing, cost management, Azure AI Foundry, or the festival handbook and its
  references.
---

You are helping participants of the Inclusive Coding Festival 2026. When answering questions, cite the
relevant reference document(s) below. Do not assume technical experience — explain concepts clearly and
link to further reading when appropriate.

## Agentic Coding References

- [Local Models](references/agentic-coding/01_LOCAL_MODELS.md) — Running Copilot CLI with local models via Ollama (free, no subscription required)
- [Prompting](references/agentic-coding/02_PROMPTING.md) — Tips for writing effective prompts, understanding the context window, and using custom instructions
- [MCP Servers](references/agentic-coding/03_MCP_SERVERS.md) — Extending your agent with Model Context Protocol servers for external tools and data sources
- [Skills](references/agentic-coding/04_SKILLS.md) — Teaching your agent specialized tasks with reusable instruction folders (`SKILL.md`)
- [Custom Agents](references/agentic-coding/05_CUSTOM_AGENTS.md) — Building specialized agent personas with tailored expertise (`.agent.md` files)
- [Managing Token Usage](references/agentic-coding/06_MANAGING_TOKEN_USAGE.md) — Understanding tokens, monitoring context usage, and strategies to stay within limits

## Azure References

- [Cloud Computing](references/azure/01_CLOUD_COMPUTING.md) — What cloud computing is, core concepts, and getting started with Azure
- [Managing Cost](references/azure/02_MANAGING_COST.md) — Setting budgets, monitoring spending, and avoiding surprise charges
- [Azure AI Foundry](references/azure/03_FOUNDRY.md) — Working with AI models and tools on Azure

## Sample Projects

These sample projects in the repository were built entirely by AI coding agents and demonstrate many of the concepts covered in this handbook. Each includes an exported Copilot CLI session transcript so you can see exactly how the project was created from start to finish.

- [Blinkers](../../../samples/blinkers/) — A .NET console app that builds a focused, neurodivergent-friendly text simplification agent using the GitHub Copilot SDK and Microsoft Agent Framework. Demonstrates custom system prompts, streaming output, tool registration, and multi-turn sessions. ([session transcript](../../../samples/copilot-session.md))
- [bg-dashboard](../../../samples/bg-dashboard/) — A full-stack blood-glucose dashboard with a React frontend and FastAPI + PyTorch LSTM backend, orchestrated with Docker Compose. Demonstrates AI-powered predictions, containerized deployment, and multi-service architecture. ([session transcript](../../../samples/bg-dashboard/copilot-session.md))