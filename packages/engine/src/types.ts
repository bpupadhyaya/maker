/** A role in a conversation turn. */
export type Role = "system" | "user" | "assistant";

/** One message in the conversation history. */
export interface ChatMessage {
  readonly role: Role;
  readonly content: string;
}
