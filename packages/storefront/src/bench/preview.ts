import { type ChildProcess, spawn } from 'node:child_process';

/**
 * The production build, served the way the demo is served, for a
 * measurement or an audit to visit. Ready when it answers.
 */

export interface Preview {
    readonly origin: string;
    stop(): void;
}

const answers = async (origin: string): Promise<boolean> => {
    try {
        return (await fetch(origin)).ok;
    } catch {
        return false;
    }
};

export const startPreview = async (port: number): Promise<Preview> => {
    const origin = `http://localhost:${port}`;
    const child: ChildProcess = spawn(
        'npx',
        ['vite', 'preview', '--port', String(port), '--strictPort'],
        { cwd: 'packages/storefront', stdio: ['ignore', 'ignore', 'inherit'] }
    );
    for (let waited = 0; !(await answers(origin)); waited += 1) {
        if (child.exitCode !== null || waited > 100) {
            throw new Error(`the preview did not answer at ${origin}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return { origin, stop: () => void child.kill() };
};
