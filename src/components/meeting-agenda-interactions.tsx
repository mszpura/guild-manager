"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { castVote, addAgendaComment, deleteAgendaComment } from "@/lib/actions/meetings";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Choice = "FOR" | "AGAINST" | "ABSTAIN";

// ─── Głosowanie ────────────────────────────────────────────────────────────

const VOTE_BOXES: {
  choice: Choice;
  label: string;
  active: string;
  idle: string;
  text: string;
}[] = [
  {
    choice: "FOR",
    label: "ZA",
    active: "border-emerald-400 bg-emerald-100",
    idle: "border-emerald-100 bg-emerald-50",
    text: "text-emerald-700",
  },
  {
    choice: "AGAINST",
    label: "PRZECIW",
    active: "border-red-400 bg-red-100",
    idle: "border-red-100 bg-red-50",
    text: "text-destructive",
  },
  {
    choice: "ABSTAIN",
    label: "WSTRZYM.",
    active: "border-slate-400 bg-slate-100",
    idle: "border-border bg-muted",
    text: "text-slate-600",
  },
];

export function AgendaVote({
  itemId,
  tally,
  myChoice,
  canVote,
  showResults,
  note,
}: {
  itemId: string;
  tally: { FOR: number; AGAINST: number; ABSTAIN: number };
  myChoice: Choice | null;
  canVote: boolean;
  // Czy ujawniać wyniki. Przed oddaniem głosu (gdy głosowanie trwa) są ukryte.
  showResults: boolean;
  note?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  // Głos jest ostateczny — po oddaniu nie można głosować ponownie.
  const canInteract = canVote && myChoice === null;

  function vote(choice: Choice) {
    start(async () => {
      try {
        await castVote(itemId, choice);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się oddać głosu.");
      }
    });
  }

  return (
    <div className="mt-4">
      <div className="flex gap-2">
        {VOTE_BOXES.map((b) => {
          const active = myChoice === b.choice;
          const content = (
            <>
              <div className={`font-heading text-lg font-extrabold leading-none ${b.text}`}>
                {showResults ? tally[b.choice] : "?"}
              </div>
              <div className="mt-1 text-[10px] font-semibold tracking-wide text-muted-foreground">
                {b.label}
              </div>
            </>
          );
          return canInteract ? (
            <button
              key={b.choice}
              type="button"
              onClick={() => vote(b.choice)}
              disabled={pending}
              aria-pressed={active}
              className={`flex-1 rounded-lg border py-2 text-center transition-colors disabled:opacity-60 ${
                active ? b.active : `${b.idle} hover:border-foreground/20`
              }`}
            >
              {content}
            </button>
          ) : (
            <div
              key={b.choice}
              className={`flex-1 rounded-lg border py-2 text-center ${
                active ? b.active : b.idle
              }`}
            >
              {content}
            </div>
          );
        })}
      </div>
      {note ? (
        <p className="mt-1.5 text-[11px] font-medium text-amber-600">{note}</p>
      ) : canInteract ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Kliknij, aby oddać głos. Głosu nie można później zmienić ani wycofać.
        </p>
      ) : myChoice ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Twój głos został zapisany (ostateczny).
        </p>
      ) : null}
    </div>
  );
}

// ─── Komentarze ──────────────────────────────────────────────────────────

export type CommentView = {
  id: string;
  author: string;
  initials: string;
  time: string;
  text: string;
  canDelete: boolean;
};

export function AgendaComments({
  itemId,
  comments,
  myInitials,
}: {
  itemId: string;
  comments: CommentView[];
  myInitials: string;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [deleting, startDelete] = useTransition();

  function add() {
    const value = text.trim();
    if (!value) return;
    start(async () => {
      try {
        await addAgendaComment(itemId, value);
        setText("");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się dodać komentarza.");
      }
    });
  }

  function remove(commentId: string) {
    startDelete(async () => {
      try {
        await deleteAgendaComment(commentId);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się usunąć.");
      }
    });
  }

  return (
    <div className="mt-4 border-t border-dashed pt-4">
      <div className="mb-3 text-[11px] font-bold tracking-wide text-muted-foreground">
        KOMENTARZE · {comments.length}
      </div>

      {comments.map((c) => (
        <div key={c.id} className="group mb-3 flex gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
            {c.initials}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-[13px] font-bold">{c.author}</span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {c.time}
              </span>
              {c.canDelete ? (
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  disabled={deleting}
                  aria-label="Usuń komentarz"
                  className="ml-auto text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 disabled:opacity-50"
                >
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </div>
            <div className="text-[13px] leading-relaxed text-muted-foreground">
              {c.text}
            </div>
          </div>
        </div>
      ))}

      <div className="mt-3 flex items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">
          {myInitials}
        </span>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Dodaj komentarz do punktu…"
          className="h-9"
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={add}
          disabled={pending || text.trim() === ""}
        >
          Wyślij
        </Button>
      </div>
    </div>
  );
}
