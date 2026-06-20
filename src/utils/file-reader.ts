// ───────────────────────────────────────────────────────────────────────
// 文件读取工具 — 安全读取身份层文件，带降级处理
// ───────────────────────────────────────────────────────────────────────

import * as fs from "fs";
import * as path from "path";

export type FileReadResult = {
  ok: true;
  content: string;
  path: string;
  size: number;
  modifiedAt: number;
} | {
  ok: false;
  path: string;
  error: string;
};

export interface FileReadOptions {
  /** 最大文件大小（字节），默认 50KB */
  maxSize?: number;
  /** 编码，默认 utf-8 */
  encoding?: BufferEncoding;
}

const DEFAULT_MAX_SIZE = 50 * 1024; // 50KB

/**
 * 安全读取文件
 * - 检查路径是否在 workspace 内（防路径穿越）
 * - 检查文件大小
 * - 解析失败时返回错误，不抛异常
 */
export function safeReadFile(
  filePath: string,
  workspaceDir: string,
  options: FileReadOptions = {},
): FileReadResult {
  const { maxSize = DEFAULT_MAX_SIZE, encoding = "utf-8" } = options;

  try {
    const resolved = path.resolve(filePath);
    const workspaceResolved = path.resolve(workspaceDir);

    // 路径安全检查：文件必须在 workspace 内
    if (!resolved.startsWith(workspaceResolved)) {
      return {
        ok: false,
        path: filePath,
        error: `路径穿越检测：${resolved} 不在 workspace ${workspaceResolved} 内`,
      };
    }

    // 检查文件是否存在
    if (!fs.existsSync(resolved)) {
      return {
        ok: false,
        path: filePath,
        error: `文件不存在：${resolved}`,
      };
    }

    const stat = fs.statSync(resolved);

    // 检查文件大小
    if (stat.size > maxSize) {
      return {
        ok: false,
        path: filePath,
        error: `文件过大：${stat.size} 字节（限制 ${maxSize} 字节）`,
      };
    }

    const content = fs.readFileSync(resolved, encoding);

    return {
      ok: true,
      content,
      path: resolved,
      size: stat.size,
      modifiedAt: stat.mtimeMs,
    };
  } catch (err) {
    return {
      ok: false,
      path: filePath,
      error: `读取失败：${String(err)}`,
    };
  }
}

/**
 * 批量读取文件
 * @returns 记录每个文件的读取结果
 */
export function safeReadFiles(
  files: string[],
  workspaceDir: string,
  options?: FileReadOptions,
): Record<string, FileReadResult> {
  const results: Record<string, FileReadResult> = {};
  for (const file of files) {
    const resolved = path.resolve(workspaceDir, file);
    results[file] = safeReadFile(resolved, workspaceDir, options);
  }
  return results;
}

/**
 * 检查文件是否存在
 */
export function fileExists(filePath: string, workspaceDir: string): boolean {
  try {
    const resolved = path.resolve(filePath);
    const workspaceResolved = path.resolve(workspaceDir);
    if (!resolved.startsWith(workspaceResolved)) return false;
    return fs.existsSync(resolved);
  } catch {
    return false;
  }
}

/**
 * 获取文件修改时间
 */
export function getFileMtime(filePath: string, workspaceDir: string): number | null {
  try {
    const resolved = path.resolve(filePath);
    const workspaceResolved = path.resolve(workspaceDir);
    if (!resolved.startsWith(workspaceResolved)) return null;
    if (!fs.existsSync(resolved)) return null;
    return fs.statSync(resolved).mtimeMs;
  } catch {
    return null;
  }
}
