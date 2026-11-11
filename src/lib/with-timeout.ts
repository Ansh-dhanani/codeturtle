/**
 * Run an async function with a hard timeout. Rejects with a descriptive error
 * if the wrapped call exceeds `ms`.
 */
export function withTimeout<T>(
	fn: () => Promise<T>,
	ms: number,
	label = "operation",
): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;

	const timeout = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => {
			reject(new Error(`${label} timed out after ${ms}ms`));
		}, ms);
	});

	return Promise.race([fn(), timeout]).finally(() => {
		if (timeoutId !== undefined) clearTimeout(timeoutId);
	});
}
