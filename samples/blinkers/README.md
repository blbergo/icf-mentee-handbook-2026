# 🐴 Blinkers

> *"Put on your blinders. Focus on what matters."*

**Blinkers** is a .NET 8 console app that uses the [Microsoft Agent Framework](https://github.com/microsoft/agent-framework) and [GitHub Copilot SDK](https://github.com/github/copilot-sdk) to simplify web pages, local files, and pasted text into clear, digestible summaries — designed with neurodivergent users in mind.

Like horse blinders that help a horse focus on the path ahead, Blinkers strips away the noise so you can focus on what's important.

## Features

- **Paste a URL** → Blinkers fetches and simplifies the page
- **Paste a file path** → Blinkers reads and summarises the file
- **Paste any text** → Blinkers distils it down to the essentials
- **Streaming output** → text appears as it's generated, no waiting
- **Multi-turn sessions** → ask follow-up questions in the same conversation
- **Interactive permissions** → you're asked before any file or network access

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10)
- [GitHub Copilot CLI](https://github.com/github/copilot-sdk#requirements) installed and authenticated
  - Run `gh extension install github/gh-copilot` and `gh auth login` if you haven't already

## Usage

```bash
cd samples/blinkers/src/Blinkers
dotnet run
```

### Keywords

| Type... | What happens |
|---|---|
| A URL, file path, or text | Blinkers simplifies it |
| `config` | Opens a prompt to set custom instructions (e.g. "Respond in Spanish", "Use a reading age of 8"). Saves and starts a fresh session. Leave blank to clear. |
| `model` | Lists all available Copilot models with a numbered picker. Select one to switch; press Enter to keep the current model. Starts a fresh session on change. |
| `exit` | Quits |

## Example Session

```
You ▶ https://en.wikipedia.org/wiki/Attention_deficit_hyperactivity_disorder

  [Blinkers wants to access: url-read]
  Allow? (y/n): y

Blinkers ▶ This is a lot to take in — here's the key idea:
ADHD is a condition where the brain has trouble with focus, impulse control, and energy levels.

• It affects both children and adults
• Common signs: difficulty staying on task, acting without thinking, restlessness
• It's not about laziness — it's how the brain is wired
• There are three types: inattentive, hyperactive-impulsive, and combined
• Treatment usually includes therapy, lifestyle changes, and sometimes medication

Bottom line: ADHD is a recognised brain-based condition, not a personal failing.
```

## Edge Cases

| What you paste | What Blinkers does |
|---|---|
| A regular web URL | Fetches and simplifies the page |
| A URL ending in `.pdf` | Uses the built-in `read_pdf` tool to extract text, then simplifies |
| A local `.pdf` file path | Uses the built-in `read_pdf` tool to extract text, then simplifies |
| A scanned/image-only PDF | `read_pdf` reports no extractable text; Blinkers asks you to paste the text instead |
| A YouTube / Vimeo / TikTok link | Explains it can't watch videos; offers to simplify a transcript |
| A URL that fails to load | Says so calmly and suggests an alternative |
| A local text/code file | Reads and summarises it |
| A file that doesn't exist | Says so and offers to help with pasted text |
| Raw pasted text | Simplifies it directly — no tools needed |

## How It Works

Blinkers uses:

- **`CopilotClient`** from [`GitHub.Copilot.SDK`](https://www.nuget.org/packages/GitHub.Copilot.SDK) to connect to the Copilot runtime
- **`GitHubCopilotAgent`** (via `AsAIAgent`) from [`Microsoft.Agents.AI.GitHub.Copilot`](https://www.nuget.org/packages/Microsoft.Agents.AI.GitHub.Copilot) to wrap the client in a standard agent interface
- A custom **`read_pdf` tool** (using [`UglyToad.PdfPig`](https://github.com/UglyToad/PdfPig)) registered via `SessionConfig.Tools` — handles both local PDF files and PDF URLs by downloading and extracting text
- A custom **system prompt** that instructs the agent to detect input type, call `read_pdf` for PDF inputs, and apply neurodivergent-friendly simplification rules
- **`RunStreamingAsync`** for incremental output so users see text appear line-by-line
- **`CreateSessionAsync`** for multi-turn conversation state

## Customising

- **Change the model**: set `Model` in `SessionConfig` (e.g. `"claude-sonnet-4.5"`)
- **Auto-approve permissions**: replace `HandlePermission` with `PermissionHandler.ApproveAll` if you trust the content you're simplifying
- **Adjust the simplification style**: edit the `SystemPrompt` constant in `Program.cs`
