import { Button } from "@/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/components/ui/empty";
import { FullWidthDivider } from "@/components/full-width-divider";
import { HomeIcon, CompassIcon } from "lucide-react";

export function NotFoundPage() {
	return (
		<div className="flex w-full items-center justify-center overflow-hidden">
			<div className="flex h-screen items-center border-x">
				<div>
					<FullWidthDivider />
					<Empty>
						<EmptyHeader>
							<EmptyTitle className="font-black font-heading text-8xl">
								404
							</EmptyTitle>
							<EmptyDescription className="text-nowrap">
								The page you&apos;re looking for might have been <br />
								moved or doesn&apos;t exist.
							</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							<div className="flex gap-2">
								<Button asChild>
									<a href="#">
										<HomeIcon data-icon="inline-start" />
										Go Home
									</a>
								</Button>

								<Button asChild variant="outline">
									<a href="#">
										<CompassIcon data-icon="inline-start" />
										Explore
									</a>
								</Button>
							</div>
						</EmptyContent>
					</Empty>
					<FullWidthDivider />
				</div>
			</div>
		</div>
	);
}
