using GitHub.Copilot;
using GitHub.Copilot.Rpc;
using Microsoft.Agents.AI;
using Microsoft.Agents.AI.GitHub.Copilot;
using Microsoft.Extensions.AI;
using System.ComponentModel;
using UglyToad.PdfPig;

// ═══════════════════════════════════════════════════════════
//  BLINKERS — Focus on what matters. Ignore the noise.
// ═══════════════════════════════════════════════════════════

PrintBanner();

const string BaseSystemPrompt = """
    You are Blinkers, a content-simplification assistant designed for neurodivergent users
    who may feel overwhelmed by large amounts of information.

    Your job is to take any content the user gives you — a web URL, a local file path, or
    raw text — and return a simplified, easy-to-understand version.

    SIMPLIFICATION RULES:
    - Lead with the single most important takeaway (1 sentence max)
    - Use short sentences (15 words or fewer when possible)
    - Use plain everyday language — no jargon, no acronyms without explanation
    - Break information into bullet points (3–7 bullets) rather than paragraphs
    - Avoid numbers and statistics unless they are the main point — summarise them instead
    - End with a one-line "Bottom line:" that anyone could understand at a glance

    FORMATTING:
    - Do NOT use markdown. No asterisks, no hashes, no backticks, no bold, no italics.
    - Use plain text only. Use dashes (-) for bullet points.

    INPUT DETECTION:
    - If the input looks like a URL (starts with http:// or https://):
        - If the URL appears to point to a PDF (ends in .pdf or content-type suggests PDF),
          use the read_pdf tool to extract its text, then simplify
        - Otherwise fetch the URL and simplify the page content
        - If the URL points to a video (YouTube, Vimeo, TikTok, Twitch, etc.): explain
          you cannot watch videos, but offer to simplify a transcript if the user provides one
        - If the URL returns an error or cannot be reached: say so briefly and suggest an alternative
    - If the input looks like a local file path (e.g. C:\..., /home/..., ./file.txt):
        - If it is a PDF file, use the read_pdf tool to extract its text, then simplify
        - Otherwise read the file and simplify its contents
        - If the file does not exist: say so and offer to simplify pasted text instead
    - Otherwise: treat the input as raw text and simplify it directly

    TONE:
    - Warm, calm, and patient — never condescending
    - Acknowledge complexity before simplifying ("This is a lot to take in — here's the key idea:")
    - Keep your total response under 200 words unless the user explicitly asks for more
    """;

await using var copilotClient = new CopilotClient();
await copilotClient.StartAsync();

AIFunction pdfTool = AIFunctionFactory.Create(
    async ([Description("Local file path or https:// URL of a PDF to extract text from")] string source) =>
    {
        byte[] bytes;
        if (source.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
            source.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            using var http = new HttpClient();
            bytes = await http.GetByteArrayAsync(source);
        }
        else
        {
            bytes = await File.ReadAllBytesAsync(source);
        }

        using var pdf = PdfDocument.Open(bytes);
        var text = string.Join("\n", pdf.GetPages().Select(p => p.Text));
        return string.IsNullOrWhiteSpace(text)
            ? "No readable text could be extracted from this PDF (it may be image-based)."
            : text;
    },
    "read_pdf",
    "Extracts plain text from a PDF file at a local path or a remote https:// URL.");

string customInstructions = string.Empty;
string selectedModel = string.Empty; // empty = runtime default

AgentSession CreateSession(AIAgent agent) =>
    agent.CreateSessionAsync().GetAwaiter().GetResult();

SessionConfig BuildSessionConfig() => new()
{
    OnPermissionRequest = HandlePermission,
    Tools = [pdfTool],
    Model = string.IsNullOrEmpty(selectedModel) ? null : selectedModel,
    SystemMessage = new SystemMessageConfig
    {
        Mode = SystemMessageMode.Append,
        Content = string.IsNullOrWhiteSpace(customInstructions)
            ? BaseSystemPrompt
            : BaseSystemPrompt + $"\n\nUSER CUSTOM INSTRUCTIONS:\n{customInstructions}",
    },
};

var agent = copilotClient.AsAIAgent(BuildSessionConfig());
var session = CreateSession(agent);

Console.WriteLine("What would you like simplified? Paste a URL, a file path, or just some text.");
Console.WriteLine("Type 'config' to customise instructions, 'model' to change model, 'exit' to quit.\n");

while (true)
{
    Console.ForegroundColor = ConsoleColor.Cyan;
    Console.Write("You ▶ ");
    Console.ResetColor();

    var input = Console.ReadLine()?.Trim();

    if (string.IsNullOrEmpty(input)) continue;
    if (input.Equals("exit", StringComparison.OrdinalIgnoreCase)) break;

    if (input.Equals("config", StringComparison.OrdinalIgnoreCase))
    {
        RunConfigMenu(ref customInstructions);

        // Rebuild the agent session so new instructions take effect
        agent = copilotClient.AsAIAgent(BuildSessionConfig());
        session = CreateSession(agent);

        Console.ForegroundColor = ConsoleColor.DarkGray;
        Console.WriteLine("  Settings saved. New session started.\n");
        Console.ResetColor();
        continue;
    }

    if (input.Equals("model", StringComparison.OrdinalIgnoreCase))
    {
        var newModel = await RunModelMenuAsync(copilotClient, selectedModel);
        if (newModel != selectedModel)
        {
            selectedModel = newModel;
            agent = copilotClient.AsAIAgent(BuildSessionConfig());
            session = CreateSession(agent);

            var label = string.IsNullOrEmpty(selectedModel) ? "default" : selectedModel;
            Console.ForegroundColor = ConsoleColor.DarkGray;
            Console.WriteLine($"  Model set to {label}. New session started.\n");
            Console.ResetColor();
        }
        continue;
    }

    Console.WriteLine();
    Console.ForegroundColor = ConsoleColor.Green;
    var modelLabel = string.IsNullOrEmpty(selectedModel) ? string.Empty : $" ({selectedModel})";
    Console.Write($"Blinkers{modelLabel} ▶ ");
    Console.ResetColor();

    try
    {
        await foreach (var update in agent.RunStreamingAsync(input, session))
        {
            Console.Write(update);
        }
    }
    catch (Exception ex)
    {
        Console.ForegroundColor = ConsoleColor.Red;
        Console.WriteLine($"\n[Error: {ex.Message}]");
        Console.ResetColor();
    }

    Console.WriteLine("\n");
}

Console.ForegroundColor = ConsoleColor.DarkGray;
Console.WriteLine("Goodbye. Keep your focus.");
Console.ResetColor();

// ── Helpers ─────────────────────────────────────────────────

// Returns the selected model ID (unchanged selectedModel if user cancelled).
static async Task<string> RunModelMenuAsync(CopilotClient client, string selectedModel)
{
    Console.WriteLine();
    Console.ForegroundColor = ConsoleColor.White;
    Console.WriteLine("  ── Model Selection ──────────────────────────────");
    Console.ResetColor();

    IList<GitHub.Copilot.ModelInfo> models;
    try
    {
        models = await client.ListModelsAsync();
    }
    catch (Exception ex)
    {
        Console.ForegroundColor = ConsoleColor.Red;
        Console.WriteLine($"  Could not fetch models: {ex.Message}");
        Console.ResetColor();
        return selectedModel;
    }

    for (int i = 0; i < models.Count; i++)
    {
        var m = models[i];
        var marker = m.Id == selectedModel ? " (current)" : string.Empty;
        Console.ForegroundColor = ConsoleColor.DarkGray;
        Console.Write($"  {i + 1,2}. ");
        Console.ResetColor();
        Console.Write(m.Name);
        Console.ForegroundColor = ConsoleColor.DarkGray;
        Console.WriteLine($"  [{m.Id}]{marker}");
        Console.ResetColor();
    }

    Console.WriteLine();
    Console.WriteLine("  Enter a number to select, or press Enter to keep current.");
    Console.ForegroundColor = ConsoleColor.Cyan;
    Console.Write("  Choice ▶ ");
    Console.ResetColor();

    var input = Console.ReadLine()?.Trim();
    Console.WriteLine();

    if (string.IsNullOrEmpty(input)) return selectedModel;

    if (int.TryParse(input, out int choice) && choice >= 1 && choice <= models.Count)
    {
        return models[choice - 1].Id;
    }

    Console.ForegroundColor = ConsoleColor.Red;
    Console.WriteLine("  Invalid choice — model unchanged.\n");
    Console.ResetColor();
    return selectedModel;
}

static void RunConfigMenu(ref string customInstructions)
{
    Console.WriteLine();
    Console.ForegroundColor = ConsoleColor.White;
    Console.WriteLine("  ── Blinkers Config ──────────────────────────────");
    Console.ResetColor();

    if (!string.IsNullOrWhiteSpace(customInstructions))
    {
        Console.ForegroundColor = ConsoleColor.DarkGray;
        Console.WriteLine($"  Current custom instructions:\n    {customInstructions}");
        Console.ResetColor();
    }
    else
    {
        Console.ForegroundColor = ConsoleColor.DarkGray;
        Console.WriteLine("  No custom instructions set.");
        Console.ResetColor();
    }

    Console.WriteLine();
    Console.WriteLine("  Enter custom instructions to append to the system prompt.");
    Console.WriteLine("  Examples: \"Use a reading age of 8.\", \"Respond in Spanish.\", \"Focus on action steps.\"");
    Console.WriteLine("  Leave blank and press Enter to clear current instructions.");
    Console.WriteLine();
    Console.ForegroundColor = ConsoleColor.Cyan;
    Console.Write("  Instructions ▶ ");
    Console.ResetColor();

    customInstructions = Console.ReadLine()?.Trim() ?? string.Empty;
    Console.WriteLine();
}

static Task<GitHub.Copilot.Rpc.PermissionDecision> HandlePermission(
    PermissionRequest request, PermissionInvocation invocation)
{
    Console.ForegroundColor = ConsoleColor.Yellow;

    var description = request switch
    {
        PermissionRequestCustomTool t => $"run tool \"{t.ToolName}\"",
        PermissionRequestRead r       => $"read \"{r.Path}\"",
        PermissionRequestWrite w      => $"write \"{w.FileName}\"",
        PermissionRequestShell s      => $"run shell command: {s.FullCommandText}",
        PermissionRequestUrl u        => $"fetch URL: {u.Url}",
        PermissionRequestMcp m        => $"call MCP tool \"{m.ToolName}\" on server \"{m.ServerName}\"",
        _                             => request.Kind,
    };

    Console.WriteLine($"\n  [Permission: {description}]");
    Console.Write("  Allow? (y/n): ");
    Console.ResetColor();

    var answer = Console.ReadLine()?.Trim().ToUpperInvariant();
    var decision = answer is "Y" or "YES"
        ? GitHub.Copilot.Rpc.PermissionDecision.ApproveOnce()
        : GitHub.Copilot.Rpc.PermissionDecision.Reject("User denied access.");

    return Task.FromResult(decision);
}

static void PrintBanner()
{
    Console.ForegroundColor = ConsoleColor.DarkYellow;
    Console.WriteLine("""

        ██████╗ ██╗     ██╗███╗   ██╗██╗  ██╗███████╗██████╗ ███████╗
        ██╔══██╗██║     ██║████╗  ██║██║ ██╔╝██╔════╝██╔══██╗██╔════╝
        ██████╔╝██║     ██║██╔██╗ ██║█████╔╝ █████╗  ██████╔╝███████╗
        ██╔══██╗██║     ██║██║╚██╗██║██╔═██╗ ██╔══╝  ██╔══██╗╚════██║
        ██████╔╝███████╗██║██║ ╚████║██║  ██╗███████╗██║  ██║███████║
        ╚═════╝ ╚══════╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚══════╝
        """);
    Console.ForegroundColor = ConsoleColor.Gray;
    Console.WriteLine("""
              \
               \   ,__,
                \  (oo)____    "Put on your blinders.
                   (__)    )\    Focus on what matters."
                      ||--|| *
        """);
    Console.ResetColor();
    Console.ForegroundColor = ConsoleColor.White;
    Console.WriteLine("  Simplifying the web, one chunk at a time.\n");
    Console.ResetColor();
}

