export type UserAccount = { id: string; username: string; name: string; role: "user" | "customerAdmin" | "platformAdmin"; customerId?: string; customerName?: string; enabled: boolean; mustChangePassword: boolean };
export type AccountSession = { mode: "local" | "users"; user: UserAccount | null; csrf?: string };
export interface AccountsPort {
  readonly scope: "production" | "scenario";
  session(): Promise<AccountSession>;
  login(username: string, password: string): Promise<AccountSession>;
  logout(): Promise<void>;
  changePassword(previous: string, password: string): Promise<void>;
}
export let accounts: AccountsPort;
export function configureAccountsPort(port: AccountsPort) { accounts = port; }
