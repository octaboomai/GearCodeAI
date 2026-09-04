import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BuildType = 'ament_cmake' | 'ament_python' | 'cmake' | 'unknown';

export interface ROS2Package {
  name: string;
  path: string;
  version?: string;
  description?: string;
  buildType: BuildType;
  dependencies: string[];
  nodeNames: string[];     // from add_executable() in CMakeLists.txt
  topicHints: string[];    // from topic name strings found in source
}

export interface ROS2Context {
  isROS2Workspace: boolean;
  packages: ROS2Package[];
  workspaceRoot: string;
  buildSystem: 'cmake' | 'python' | 'mixed';
  rosDistro?: string;      // detected from $ROS_DISTRO or colcon.meta
  analysedAt: Date;
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export class ContextEngine {
  private context: ROS2Context | null = null;

  /** Full workspace scan. Returns cached result if called again within 30s. */
  async analyzeWorkspace(): Promise<ROS2Context> {
    const root = this.workspaceRoot();
    if (!root) {
      return this.emptyContext('');
    }

    // Return cache if fresh enough
    if (this.context && (Date.now() - this.context.analysedAt.getTime()) < 30_000) {
      return this.context;
    }

    const packageXmlFiles = await vscode.workspace.findFiles(
      '**/package.xml',
      '{**/node_modules/**,**/build/**,**/install/**,**/log/**}',
      50
    );

    const packages = (
      await Promise.all(packageXmlFiles.map(f => this.parsePackage(f.fsPath)))
    ).filter((p): p is ROS2Package => p !== null);

    const isROS2 = packages.some(p =>
      p.dependencies.some(d => /^rclcpp|^rclpy|^ament/.test(d))
    );

    this.context = {
      isROS2Workspace: isROS2 || packages.length > 0,
      packages,
      workspaceRoot: root,
      buildSystem: this.detectBuildSystem(packages),
      rosDistro: this.detectDistro(root),
      analysedAt: new Date(),
    };

    return this.context;
  }

  /** Parse a single ROS 2 package from its package.xml path */
  async parsePackage(xmlPath: string): Promise<ROS2Package | null> {
    try {
      const content = fs.readFileSync(xmlPath, 'utf8');
      const pkgPath = path.dirname(xmlPath);

      const name = this.xmlTag(content, 'name') ?? path.basename(pkgPath);
      const version = this.xmlTag(content, 'version');
      const description = this.xmlTag(content, 'description');
      const buildtool = this.xmlTag(content, 'buildtool_depend') ?? '';

      const depTags = ['depend', 'build_depend', 'exec_depend', 'test_depend'];
      const dependencies: string[] = [];
      for (const tag of depTags) {
        const re = new RegExp(`<${tag}>([^<]+)<\/${tag}>`, 'g');
        for (const m of content.matchAll(re)) {
          const dep = m[1].trim();
          if (!dependencies.includes(dep)) dependencies.push(dep);
        }
      }

      const buildType = this.parseBuildType(buildtool);
      const nodeNames = this.extractNodeNames(pkgPath, buildType);
      const topicHints = this.extractTopicHints(pkgPath);

      return { name, path: pkgPath, version, description, buildType, dependencies, nodeNames, topicHints };
    } catch {
      return null;
    }
  }

  /** Returns a compact string summary for injection into the AI system prompt */
  buildContextSummary(): string {
    const ctx = this.context;
    if (!ctx || !ctx.isROS2Workspace) {
      return 'No ROS 2 workspace detected.';
    }

    const distro = ctx.rosDistro ? ` (${ctx.rosDistro})` : '';
    const header = `ROS 2${distro} workspace — ${ctx.packages.length} package(s)`;

    const pkgLines = ctx.packages.map(p => {
      const nodes = p.nodeNames.length ? `  nodes: ${p.nodeNames.join(', ')}` : '';
      const deps = p.dependencies
        .filter(d => /^rclcpp|^rclpy|^nav2|^moveit|^tf2|^sensor_msgs|^geometry_msgs|^std_msgs/.test(d))
        .slice(0, 6);
      const depsStr = deps.length ? `  key deps: ${deps.join(', ')}` : '';
      const topics = p.topicHints.length ? `  topics found: ${p.topicHints.slice(0, 4).join(', ')}` : '';
      return [`• ${p.name} [${p.buildType}]`, nodes, depsStr, topics].filter(Boolean).join('\n');
    });

    return [header, ...pkgLines].join('\n');
  }

  getContext(): ROS2Context | null { return this.context; }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private extractNodeNames(pkgPath: string, buildType: BuildType): string[] {
    if (buildType === 'ament_python') {
      // Parse setup.py console_scripts
      const setupPy = path.join(pkgPath, 'setup.py');
      if (fs.existsSync(setupPy)) {
        const content = fs.readFileSync(setupPy, 'utf8');
        const matches = [...content.matchAll(/['"](\w+)\s*=\s*[\w.]+:main['"]/g)];
        return matches.map(m => m[1]);
      }
    }

    const cmake = path.join(pkgPath, 'CMakeLists.txt');
    if (!fs.existsSync(cmake)) return [];
    const content = fs.readFileSync(cmake, 'utf8');
    // add_executable(target_name ...) and ament_target_dependencies(...)
    const execs = [...content.matchAll(/add_executable\s*\(\s*(\w+)/g)].map(m => m[1]);
    return execs;
  }

  private extractTopicHints(pkgPath: string): string[] {
    const hints = new Set<string>();
    const srcDir = path.join(pkgPath, 'src');
    if (!fs.existsSync(srcDir)) return [];

    try {
      const files = fs.readdirSync(srcDir).filter(f => /\.(cpp|hpp|py)$/.test(f));
      for (const file of files.slice(0, 5)) {
        const content = fs.readFileSync(path.join(srcDir, file), 'utf8');
        // Match string literals that look like ROS topic names
        const matches = [...content.matchAll(/"(\/[\w/]+)"/g)];
        for (const m of matches) {
          if (m[1].length < 60) hints.add(m[1]);
        }
        if (hints.size >= 10) break;
      }
    } catch { /* ignore unreadable files */ }

    return [...hints];
  }

  private detectBuildSystem(packages: ROS2Package[]): ROS2Context['buildSystem'] {
    const hasCmake = packages.some(p => p.buildType === 'ament_cmake' || p.buildType === 'cmake');
    const hasPy = packages.some(p => p.buildType === 'ament_python');
    if (hasCmake && hasPy) return 'mixed';
    if (hasPy) return 'python';
    return 'cmake';
  }

  private detectDistro(root: string): string | undefined {
    // Check colcon.meta or environment variable hint in workspace
    const meta = path.join(root, 'colcon.meta');
    if (fs.existsSync(meta)) {
      const content = fs.readFileSync(meta, 'utf8');
      const m = content.match(/ROS_DISTRO['":\s]+(\w+)/);
      if (m) return m[1];
    }
    // Check install/local_setup.bash for distro hint
    const setup = path.join(root, 'install', 'local_setup.bash');
    if (fs.existsSync(setup)) {
      const content = fs.readFileSync(setup, 'utf8');
      const m = content.match(/opt\/ros\/(\w+)/);
      if (m) return m[1];
    }
    return undefined;
  }

  private parseBuildType(buildtool: string): BuildType {
    if (buildtool.includes('ament_cmake')) return 'ament_cmake';
    if (buildtool.includes('ament_python')) return 'ament_python';
    if (buildtool.includes('cmake')) return 'cmake';
    return 'unknown';
  }

  private xmlTag(content: string, tag: string): string | undefined {
    const m = content.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
    return m?.[1]?.trim();
  }

  private workspaceRoot(): string {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
  }

  private emptyContext(root: string): ROS2Context {
    return {
      isROS2Workspace: false,
      packages: [],
      workspaceRoot: root,
      buildSystem: 'cmake',
      analysedAt: new Date(),
    };
  }
}
