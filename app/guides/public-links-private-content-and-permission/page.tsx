import { GuidePage, guideMetadata, guides } from "../../guide-content";
export const metadata = guideMetadata(guides[1]);
export default function Page() { return <GuidePage guide={guides[1]} />; }
