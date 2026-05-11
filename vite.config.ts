import { defineConfig } from "vitest/config";

/**
 * GitHub Actions sets `GITHUB_REPOSITORY=owner/repo`. Project Pages live at
 * `https://owner.github.io/repo/`, so Vite must use `base: '/repo/'` for assets.
 * Local dev has no env → `base: '/'`.
 */
function githubPagesBase(): string {
	const full: string | undefined = process.env.GITHUB_REPOSITORY;
	if (full === undefined || full === "") {
		return "/";
	}
	const parts: string[] = full.split("/");
	const repo: string | undefined = parts[1];
	if (repo === undefined || repo === "") {
		return "/";
	}
	return `/${repo}/`;
}

export default defineConfig({
	base: githubPagesBase(),
	test: {
		globals: false,
		environment: "node",
	},
});
