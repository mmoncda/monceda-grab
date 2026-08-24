import { GuidePage, guideMetadata, guides } from "../../guide-content";
export const metadata = guideMetadata(guides[3]);
export default function Page() { return <GuidePage guide={guides[3]} />; }
