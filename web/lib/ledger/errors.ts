export class LedgerError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export class LedgerUnavailable extends LedgerError {
  constructor() {
    super("測試帳本還沒準備好。在 web 目錄執行：npx wrangler d1 migrations apply dropout-ledger-test --local", 503);
  }
}
