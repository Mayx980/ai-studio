import { configureAccountsPort } from "@/ports/accounts";
import { configurePlatformPort } from "@/ports/platform";
import { createScenarioAccountsPort } from "@/scenarios/accounts";
import { createScenarioPlatformPort } from "@/scenarios/platform";
import { loadAccountSession } from "@/stores/accounts";

// ACT: 只装配双端账号演示，不替换 r2 的工作区、模型或创作数据链路。
export async function initializeAccountPreview() {
  configureAccountsPort(createScenarioAccountsPort());
  configurePlatformPort(createScenarioPlatformPort());
  await loadAccountSession();
}
