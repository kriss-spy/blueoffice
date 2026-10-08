export const APPROVAL_CHOICES = ["once", "session", "always", "deny"] as const;
export type ApprovalChoice = (typeof APPROVAL_CHOICES)[number];
export const approvalLabel: Record<ApprovalChoice, string> = {
  once: "Allow once",
  session: "Allow for session",
  always: "Always allow",
  deny: "Deny",
};
export interface ApprovalDecision {
  choice: ApprovalChoice;
  commandId: string;
  at: string;
  delivery: "pending" | "delivered" | "unknown";
}
