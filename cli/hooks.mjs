//Node's module hooks for the command-line player: the game's TypeScript imports its modules without an
//extension (Vite and Vitest resolve them), Node needs the ".ts". Node strips the types itself (the
//repo's TypeScript is erasable only); the format is said, so it doesn't parse each file twice
const extensionless = (specifier) => /^[./]/.test(specifier) && !/\.(m?js|ts|json)$/.test(specifier);

export function resolve(specifier, context, next) {
	if (!extensionless(specifier)) return next(specifier, context);
	return next(specifier + ".ts", context).catch(() => next(specifier, context));
}

export function load(url, context, next) {
	const typescript = url.startsWith("file:") && url.endsWith(".ts");
	return next(url, typescript ? { ...context, format: "module-typescript" } : context);
}
