import { execFileSync } from 'node:child_process';
import { cpus } from 'node:os';

/**
 * What every benchmark records about when it ran.
 */

export const gitCommit = (): string => {
    try {
        return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch {
        return 'unknown';
    }
};

export const today = (): string => new Date().toISOString().slice(0, 10);

/** The processor and its core count, as each record names the machine it ran on. */
export const machine = (): string => {
    const [first] = cpus();
    return `${first?.model ?? 'unknown'}, ${cpus().length} cores`;
};

export const megabytes = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Milliseconds to two places, as every record shows them. */
export const round = (ms: number): number => Math.round(ms * 100) / 100;
