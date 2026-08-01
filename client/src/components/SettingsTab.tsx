/**
 * SettingsTab — app settings, currently the spaced-repetition daily caps.
 *
 * These lived at the bottom of the Progress tab behind a collapsed disclosure,
 * which made them hard to find and odd to sit under a page of charts. As their
 * own section they render open: a settings page has no reason to hide its one
 * group of controls.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Settings2, Loader2, User as UserIcon } from "lucide-react";

function Slider({
  label,
  hint,
  value,
  min,
  max,
  step,
  ticks,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  ticks: number[];
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <span className="font-display text-lg font-bold text-primary">{value}</span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">{hint}</p>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
      <div className="flex justify-between text-xs text-muted-foreground mt-1">
        {ticks.map((t) => <span key={t}>{t}</span>)}
      </div>
    </div>
  );
}

function ReviewSettingsCard() {
  const { data: settings, isLoading, refetch } = trpc.review.getSettings.useQuery();
  const updateMutation = trpc.review.updateSettings.useMutation({
    onSuccess: () => { refetch(); toast.success("Settings saved"); },
    onError: () => toast.error("Couldn't save settings"),
  });

  const [newWordsCap, setNewWordsCap] = useState<number | null>(null);
  const [reviewCap, setReviewCap] = useState<number | null>(null);

  const currentNew = newWordsCap ?? settings?.dailyNewWords ?? 10;
  const currentReview = reviewCap ?? settings?.dailyReviewCap ?? 20;
  const dirty =
    settings != null &&
    (currentNew !== settings.dailyNewWords || currentReview !== settings.dailyReviewCap);

  return (
    <section className="bg-card rounded-2xl p-6 shadow-[0_2px_12px_-4px_rgb(23_63_107_/_0.18)]">
      <div className="flex items-center gap-2">
        <Settings2 className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-display text-base font-bold text-foreground">Review</h2>
      </div>
      <p className="text-sm text-muted-foreground mt-1">
        How much the "Due Today" queue serves up each day, across Quiz and Flashcards.
      </p>

      {isLoading ? (
        <div className="py-10 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="mt-6 space-y-7">
          <Slider
            label="New words per day"
            hint="Words you haven't seen before, introduced into the queue."
            value={currentNew}
            min={1} max={30} step={1} ticks={[1, 10, 20, 30]}
            onChange={setNewWordsCap}
          />
          <Slider
            label="Review words per day"
            hint="Words already in rotation that are due again."
            value={currentReview}
            min={5} max={100} step={5} ticks={[5, 25, 50, 100]}
            onChange={setReviewCap}
          />
          <button
            onClick={() => updateMutation.mutate({ dailyNewWords: currentNew, dailyReviewCap: currentReview })}
            disabled={updateMutation.isPending || !dirty}
            className="w-full py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-default"
          >
            {updateMutation.isPending ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>
        </div>
      )}
    </section>
  );
}

function AccountCard({ user }: { user: { name?: string | null; email?: string | null } }) {
  const { data: profile } = trpc.auth.profile.useQuery();

  return (
    <section className="bg-card rounded-2xl p-6 shadow-[0_2px_12px_-4px_rgb(23_63_107_/_0.18)]">
      <div className="flex items-center gap-2">
        <UserIcon className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-display text-base font-bold text-foreground">Account</h2>
      </div>
      <div className="flex items-center gap-3 mt-5">
        <Avatar src={profile?.picture ?? null} name={user.name} className="w-12 h-12" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground truncate">{user.name ?? "User"}</p>
          {user.email && <p className="text-xs text-muted-foreground truncate">{user.email}</p>}
        </div>
      </div>
    </section>
  );
}

/**
 * Google's profile images occasionally 404 or are blocked by referrer policy,
 * so a failed load falls back to the initial rather than a broken image.
 */
export function Avatar({
  src,
  name,
  className,
}: {
  src: string | null;
  name?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initial = (name ?? "").trim().charAt(0).toUpperCase();

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${className} rounded-full object-cover flex-shrink-0`}
      />
    );
  }
  return (
    <div
      className={`${className} rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0`}
    >
      {initial
        ? <span className="font-display text-sm font-bold text-primary">{initial}</span>
        : <UserIcon className="w-1/2 h-1/2 text-primary" />}
    </div>
  );
}

export default function SettingsTab({
  user,
}: {
  user: { name?: string | null; email?: string | null };
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-8 space-y-5">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Your account and how reviewing works.</p>
        </div>
        <AccountCard user={user} />
        <ReviewSettingsCard />
      </div>
    </div>
  );
}
