import type { AppPageProps } from "../../lib/composition";
import { PlainAppPage } from "../plain";

export function CAppPage(props: AppPageProps) {
	return <PlainAppPage {...props} />;
}