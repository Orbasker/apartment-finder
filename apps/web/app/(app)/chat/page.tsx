import { ChatUI } from "./chat-ui";

export const dynamic = "force-dynamic";

export default function ChatPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-2 text-xl font-semibold">Chat</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Ask about listings, change preferences, or trigger a re-judge. Mutations stage and require
        you to reply <code>/confirm</code>.
      </p>
      <ChatUI />
    </div>
  );
}
