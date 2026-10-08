"use client";
import type { AccountManagerViewModel } from "./account-manager-page";
import { AccountGroupManager } from "./account-group-manager";
export function AccountManagerView({viewModel}:{readonly viewModel:AccountManagerViewModel}) {
 return <AccountGroupManager initialGroups={viewModel.groups??[]} initialAccounts={viewModel.accounts}/>;
}
