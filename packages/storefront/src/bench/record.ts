import { execFileSync } from 'node:child_process';
import { cpus } from 'node:os';

/**
 * What every benchmark records about when it ran.
 */

const gitCommit = (): string => {
    try {
        return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch {
        return 'unknown';
    }
};

const today = (): string => new Date().toISOString().slice(0, 10);

/** The processor and its core count, as each record names the machine it ran on. */
const machine = (): string => {
    const [first] = cpus();
    return `${first?.model ?? 'unknown'}, ${cpus().length} cores`;
};

/** When and where a benchmark ran, as every record keeps it. */
export interface Recorded {
    readonly date: string;
    readonly commit: string;
    readonly machine: string;
    readonly node: string;
}

/** When and where this run is, on this machine and this Node. */
export const recorded = (): Recorded => ({
    date: today(),
    commit: gitCommit(),
    machine: machine(),
    node: process.version,
});

/** The table at the top of every record that says when and where it ran. */
export const recordedTable = ({ date, commit, machine: on, node }: Recorded): string =>
    `| Recorded | Commit | Machine | Node |
| -------- | ------ | ------- | ---- |
| ${date} | \`${commit}\` | ${on} | ${node} |`;

export const megabytes = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Milliseconds to two places, as every record shows them. */
export const round = (ms: number): number => Math.round(ms * 100) / 100;
