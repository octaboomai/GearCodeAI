import * as vscode from 'vscode';
import * as https from 'https';
import { ContextEngine } from './contextEngine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface NIMResponse {
  content: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  model?: string;
}

// ─── Bridge ───────────────────────────────────────────────────────────────────

export class NIMBridge {
  private static readonly BASE_HOST = 'integrate.api.nvidia.com';
  private static readonly BASE_PATH = '/v1/chat/completions';

  constructor(private readonly ctx: ContextEngine) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  /** General free-form query with workspace context injected. */
  async query(userMessage: string, extraContext?: string): Promise<NIMResponse> {
    const content = extraContext
      ? `Additional context:\n${extraContext}\n\n${userMessage}`
      : userMessage;
    return this.complete([{ role: 'user', content }]);
  }

  /** Explain/modify a code selection. */
  async queryCode(code: string, question: string, language: string): Promise<NIMResponse> {
    const content =
      `${question}\n\nCode (${language}):\n\`\`\`${language}\n${code}\n\`\`\``;
    return this.complete([{ role: 'user', content }]);
  }

  /** Analyse a captured build/runtime error and return a fix. */
  async fixError(errorText: string, activeFileCode?: string): Promise<NIMResponse> {
    let content =
      `I got this error building my ROS 2 package:\n\`\`\`\n${errorText}\n\`\`\`\n`;
    if (activeFileCode) {
      content += `\nActive file (first 3 000 chars):\n\`\`\`\n${activeFileCode.slice(0, 3000)}\n\`\`\`\n`;
    }
    content += '\nDiagnose the root cause and provide the corrected code, with a brief explanation.';
    return this.complete([{ role: 'user', content }]);
  }

  // ── Core ───────────────────────────────────────────────────────────────────

  private async complete(messages: ChatMessage[]): Promise<NIMResponse> {
    const apiKey = this.requireApiKey();
    const model = this.model();
    const systemPrompt = this.buildSystemPrompt();

    const payload: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    return this.post(apiKey, model, payload);
  }

  private buildSystemPrompt(): string {
    const workspaceCtx = this.ctx.buildContextSummary();

    return `You are RoboCode, an expert engineering assistant specialised in:
- ROS 2 (Humble / Iron / Jazzy) — nodes, topics, services, actions, lifecycle, launch files
- C++ (rclcpp) and Python (rclpy) ROS 2 client libraries
- colcon + ament_cmake build system and CMakeLists.txt
- Nav2, MoveIt2, tf2, sensor_msgs, geometry_msgs, std_msgs, PCL, OpenCV
- micro-ROS for STM32 / ESP32 integration with ROS 2
- PX4 and ArduPilot drone firmware
- Debugging colcon, cmake, linker, and runtime ROS 2 errors

Current workspace:
${workspaceCtx}

Rules:
1. When fixing errors: show the corrected code block first, then a one-paragraph explanation.
2. When explaining: be technical and concise — the user is an engineer, not a student.
3. Always fence code with the correct language tag (\`\`\`cpp, \`\`\`python, \`\`\`cmake, etc.).
4. If the error is ambiguous, state the most likely cause and ask one clarifying question.
5. Never add unnecessary disclaimers or filler.`;
  }

  private post(apiKey: string, model: string, messages: ChatMessage[]): Promise<NIMResponse> {
    // DeepSeek-R1 supports reasoning_effort for extended chain-of-thought.
    // Other models ignore unknown fields, so this is safe to include conditionally.
    const isDeepSeek = model.startsWith('deepseek');

    const body = JSON.stringify({
      model,
      messages,
      temperature: isDeepSeek ? 0.6 : 0.15,   // R1 prefers higher temp
      top_p: 0.9,
      max_tokens: isDeepSeek ? 4096 : 2048,    // R1 benefits from more tokens (thinks out loud)
      stream: false,
      ...(isDeepSeek ? { reasoning_effort: 'medium' } : {}),
    });

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: NIMBridge.BASE_HOST,
          port: 443,
          path: NIMBridge.BASE_PATH,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          let raw = '';
          res.on('data', (chunk: Buffer) => (raw += chunk.toString()));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(raw);

              if (parsed.error) {
                reject(new Error(`NIM API: ${parsed.error.message ?? JSON.stringify(parsed.error)}`));
                return;
              }

              if (res.statusCode && res.statusCode >= 400) {
                reject(new Error(`NIM API HTTP ${res.statusCode}: ${raw.slice(0, 200)}`));
                return;
              }

              resolve({
                content: parsed.choices?.[0]?.message?.content ?? '',
                usage: parsed.usage,
                model: parsed.model,
              });
            } catch {
              reject(new Error(`Failed to parse NIM response: ${raw.slice(0, 300)}`));
            }
          });
        }
      );

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  // ── Config helpers ─────────────────────────────────────────────────────────

  private requireApiKey(): string {
    const key = vscode.workspace
      .getConfiguration('robocode')
      .get<string>('nimApiKey', '');

    if (!key.trim()) {
      const msg = 'RoboCode: No NVIDIA NIM API key set.';
      vscode.window.showErrorMessage(msg, 'Open Settings').then((choice) => {
        if (choice === 'Open Settings') {
          vscode.commands.executeCommand(
            'workbench.action.openSettings',
            'robocode.nimApiKey'
          );
        }
      });
      throw new Error(msg);
    }
    return key.trim();
  }

  private model(): string {
    return vscode.workspace
      .getConfiguration('robocode')
      .get<string>('nimModel', 'deepseek-ai/deepseek-r1');
  }
}
