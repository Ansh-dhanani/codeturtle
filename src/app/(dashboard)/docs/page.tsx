import ArchitectureDiagram from "@/components/docs/architecture-diagram";

export default function DocsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Documentation</h1>
        <p className="text-muted-foreground">
          Learn how CodeTurtle works and how to use it
        </p>
      </div>

      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">System Architecture</h2>
        <p className="text-muted-foreground">
          CodeTurtle connects to your GitHub repositories, indexes the codebase into a vector database, and automatically reviews pull requests using AI.
        </p>
        <ArchitectureDiagram />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border p-6 space-y-3">
          <h3 className="text-lg font-semibold">How It Works</h3>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            <li>Connect your GitHub repository</li>
            <li>CodeTurtle indexes all files into Pinecone</li>
            <li>When a PR is opened, the webhook triggers a review</li>
            <li>AI analyzes the diff with RAG context from your codebase</li>
            <li>Review is posted as a GitHub PR review (blocks merge if score &lt; 5)</li>
          </ol>
        </div>

        <div className="rounded-lg border p-6 space-y-3">
          <h3 className="text-lg font-semibold">AI Models</h3>
          <p className="text-sm text-muted-foreground">
            Choose your preferred AI provider and model in Settings. Multiple providers available with free and paid tiers.
          </p>
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
            <li><strong>Google Gemini 2.5 Flash</strong> — Free, fast, default</li>
            <li><strong>Google Gemini 2.5 Pro</strong> — Pro tier, deeper analysis</li>
            <li><strong>OpenAI GPT-4o Mini</strong> — Free tier available</li>
            <li><strong>Anthropic Claude Haiku 3.5</strong> — Free tier available</li>
            <li><strong>Groq Llama 3.3 70B</strong> — Free tier, ultra-fast</li>
          </ul>
        </div>

        <div className="rounded-lg border p-6 space-y-3">
          <h3 className="text-lg font-semibold">Generate Fix PR</h3>
          <p className="text-sm text-muted-foreground">
            After a review is complete, click "Generate Fix PR" to automatically create a new branch with all suggested code changes applied. This creates a separate PR you can review and merge.
          </p>
        </div>

        <div className="rounded-lg border p-6 space-y-3">
          <h3 className="text-lg font-semibold">Webhook Setup</h3>
          <p className="text-sm text-muted-foreground">
            Webhooks are created automatically when you connect a repository. Make sure your GitHub App has <code className="bg-muted px-1 rounded">admin:repo_hook</code> scope. The webhook URL is your app URL + <code className="bg-muted px-1 rounded">/api/webhooks/github</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
