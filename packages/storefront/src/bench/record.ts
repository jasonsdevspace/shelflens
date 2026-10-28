import { execFileSync } from 'node:child_process';

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
