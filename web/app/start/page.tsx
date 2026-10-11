import { OnboardScreen } from "@/components/OnboardScreen";
import { pageMeta } from "@/lib/seo";

export const metadata = {
  ...pageMeta("/start", "三個問題，開始示範", "選現場、規模、要打開的功能，馬上進到示範的「今天」。不用登入，資料只留在你的瀏覽器。"),
  robots: { index: false },
};

export default function StartPage() {
  return <OnboardScreen />;
}
