"use client";

import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import {
	type ComponentProps,
	type Dispatch,
	type SetStateAction,
	useCallback,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

export type FREQUENCY = "monthly" | "yearly";

const defaultFrequencies: FREQUENCY[] = ["monthly", "yearly"];

type FrequencyToggleProps = ComponentProps<"fieldset"> & {
	frequency: FREQUENCY;
	setFrequency: Dispatch<SetStateAction<FREQUENCY>>;
	frequencies?: FREQUENCY[];
};

type CursorPosition = {
	left: number;
	top: number;
	width: number;
	height: number;
	opacity: number;
};

function measure(el: HTMLButtonElement): CursorPosition {
	return {
		left: el.offsetLeft,
		top: el.offsetTop,
		width: el.offsetWidth,
		height: el.offsetHeight,
		opacity: 1,
	};
}

export function FrequencyToggle({
	frequency,
	setFrequency,
	frequencies = defaultFrequencies,
	className,
	...props
}: FrequencyToggleProps) {
	const reduceMotion = useReducedMotion();
	const tabsRef = useRef<Partial<Record<FREQUENCY, HTMLButtonElement>>>({});
	const [position, setPosition] = useState<CursorPosition>({
		left: 0,
		top: 0,
		width: 0,
		height: 0,
		opacity: 0,
	});

	const moveTo = useCallback((value: FREQUENCY) => {
		const tab = tabsRef.current[value];
		if (!tab) {
			return;
		}
		setPosition(measure(tab));
	}, []);

	useLayoutEffect(() => {
		moveTo(frequency);
	}, [frequency, moveTo]);

	return (
		<fieldset
			className={cn(
				"relative mx-auto flex w-fit rounded-lg border bg-card p-1 shadow-xs",
				className
			)}
			{...props}
			aria-label="Frequency"
		>
			{frequencies.map((freq) => (
				<button
					aria-pressed={frequency === freq}
					className="relative z-10 px-4 py-1 text-sm capitalize"
					key={freq}
					onClick={() => setFrequency(freq)}
					ref={(el) => {
						if (el) {
							tabsRef.current[freq] = el;
						}
					}}
					type="button"
				>
					{freq}
				</button>
			))}
			<motion.span
				animate={{
					left: position.left,
					width: position.width,
					opacity: position.opacity,
				}}
				aria-hidden
				className="pointer-events-none absolute z-10 rounded-md bg-background mix-blend-difference dark:bg-foreground"
				initial={false}
				style={{ top: position.top, height: position.height }}
				transition={
					reduceMotion ? { duration: 0 } : { type: "spring", duration: 0.4 }
				}
			/>
		</fieldset>
	);
}
