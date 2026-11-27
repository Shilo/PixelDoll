import { execFileSync } from 'node:child_process';

export const git = (cwd: string, ...args: string[]) =>
	execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();

export function fetchMain(cwd: string) {
	git(cwd, 'fetch', 'origin', 'refs/heads/main:refs/remotes/origin/main');
	return git(cwd, 'rev-parse', 'origin/main');
}

export function commitReleaseFiles(cwd: string, message: string, ...paths: string[]) {
	git(cwd, 'add', '--', ...paths);
	git(cwd, 'commit', '-m', message, '--', ...paths);
	for (let attempt = 1; attempt <= 3; attempt++) {
		fetchMain(cwd);
		try {
			git(cwd, 'rebase', 'origin/main');
		} catch (error) {
			git(cwd, 'rebase', '--abort');
			throw error;
		}
		try {
			git(cwd, 'push', 'origin', 'HEAD:refs/heads/main');
			return;
		} catch (error) {
			if (attempt === 3) throw error;
			console.warn(`Release push attempt ${attempt} failed. Retrying with current main.`);
		}
	}
}
