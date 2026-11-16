export type UserAccount = { id: string; username: string; name: string; role: "admin" | "user"; enabled: boolean; mustChangePassword: boolean };
export type AccountSession = { mode: "local" | "users"; user: UserAccount | null; csrf?: string };
export interface AccountsPort {
  readonly scope: "production" | "scenario";
  session(): Promise<AccountSession>;
  login(username: string, password: string): Promise<AccountSession>;
  logout(): Promise<void>;
  changePassword(previous: string, password: string): Promise<void>;
  list(): Promise<UserAccount[]>;
  create(input: { username: string; name: string; password: string }): Promise<void>;
  update(id: string, enabled: boolean): Promise<void>;
  resetPassword(id: string, password: string): Promise<void>;
}
export let accounts: AccountsPort;
export function configureAccountsPort(port: AccountsPort) { accounts = port; }
