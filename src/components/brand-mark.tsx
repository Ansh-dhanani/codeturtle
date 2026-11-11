/** Theme-aware CodeTurtle wordmark. Decorative - nearby links/headings carry the accessible name. */
export function BrandMark({ className = "h-7 w-auto" }: { className?: string }) {
	return (
		<>
			<img
				src="/codeturtle-logo-light.svg"
				alt=""
				aria-hidden="true"
				width={800}
				height={468}
				className={`${className} block dark:hidden`}
			/>
			<img
				src="/codeturtle-logo-dark.svg"
				alt=""
				aria-hidden="true"
				width={800}
				height={468}
				className={`${className} hidden dark:block`}
			/>
		</>
	);
}
