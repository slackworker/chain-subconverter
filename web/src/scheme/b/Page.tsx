import type { AppPageProps } from "../../lib/composition";
import { PlainAppPage } from "../plain";

export function BAppPage(props: AppPageProps) {
	return <PlainAppPage {...props} />;
}