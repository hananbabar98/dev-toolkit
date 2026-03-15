import { useState } from "react";
import { useTheme } from "../ThemeContext";
import { getTokens } from "../themeTokens";

type Operation = "rebase" | "cherry-pick" | "stash" | "reset" | "merge" | "tag" | "bisect" | "worktree";

interface OperationConfig {
  label: string;
  description: string;
  icon: string;
}

const OPERATIONS: Record<Operation, OperationConfig> = {
  rebase: { label: "Rebase", description: "Reapply commits on top of another branch", icon: "⎇" },
  "cherry-pick": { label: "Cherry-pick", description: "Apply specific commits to current branch", icon: "🍒" },
  stash: { label: "Stash", description: "Temporarily shelve or restore changes", icon: "📦" },
  reset: { label: "Reset", description: "Move HEAD and optionally modify index/worktree", icon: "↩" },
  merge: { label: "Merge", description: "Integrate changes from another branch", icon: "⑂" },
  tag: { label: "Tag", description: "Create lightweight or annotated version tags", icon: "#" },
  bisect: { label: "Bisect", description: "Binary search through commits to find a bug", icon: "🔍" },
  worktree: { label: "Worktree", description: "Manage multiple working trees", icon: "🌲" },
};

// ─── Rebase config ───────────────────────────────────────────────────────────
interface RebaseConfig {
  onto: string;
  upstream: string;
  interactive: boolean;
  autosquash: boolean;
  preserveMerges: boolean;
  strategy: "" | "recursive" | "ours" | "theirs";
}

// ─── Cherry-pick config ───────────────────────────────────────────────────────
interface CherryPickConfig {
  commits: string;
  noCommit: boolean;
  edit: boolean;
  signoff: boolean;
  mainline: string;
}

// ─── Stash config ────────────────────────────────────────────────────────────
interface StashConfig {
  action: "push" | "pop" | "apply" | "list" | "drop" | "show";
  message: string;
  includeUntracked: boolean;
  keepIndex: boolean;
  stashIndex: string;
  patch: boolean;
}

// ─── Reset config ────────────────────────────────────────────────────────────
interface ResetConfig {
  mode: "soft" | "mixed" | "hard" | "merge" | "keep";
  target: string;
  files: string;
}

// ─── Merge config ────────────────────────────────────────────────────────────
interface MergeConfig {
  branch: string;
  strategy: "" | "recursive" | "ours" | "octopus" | "resolve";
  noFf: boolean;
  squash: boolean;
  commit: boolean;
  message: string;
}

// ─── Tag config ──────────────────────────────────────────────────────────────
interface TagConfig {
  action: "create" | "delete" | "list" | "push";
  name: string;
  annotated: boolean;
  message: string;
  ref: string;
  remote: string;
  sign: boolean;
}

// ─── Bisect config ────────────────────────────────────────────────────────────
interface BisectConfig {
  action: "start" | "good" | "bad" | "reset" | "log" | "skip";
  badCommit: string;
  goodCommit: string;
  targetCommit: string;
}

// ─── Worktree config ─────────────────────────────────────────────────────────
interface WorktreeConfig {
  action: "add" | "list" | "remove" | "move" | "prune";
  path: string;
  branch: string;
  newBranch: boolean;
  detach: boolean;
  dest: string;
}

function buildRebase(c: RebaseConfig): { cmd: string; steps: string[] } {
  const parts = ["git rebase"];
  const steps: string[] = [];

  if (c.interactive) { parts.push("--interactive"); steps.push("Opens interactive rebase editor to reorder/squash/edit commits"); }
  if (c.autosquash) { parts.push("--autosquash"); steps.push("Automatically squash fixup! and squash! commits"); }
  if (c.preserveMerges) { parts.push("--preserve-merges"); steps.push("Re-create merge commits instead of ignoring them"); }
  if (c.strategy) { parts.push(`--strategy=${c.strategy}`); steps.push(`Use "${c.strategy}" merge strategy`); }
  if (c.onto) { parts.push(`--onto ${c.onto}`); steps.push(`Rebase onto "${c.onto}" instead of upstream`); }
  if (c.upstream) { parts.push(c.upstream); steps.push(`Use "${c.upstream}" as the upstream branch`); }
  else steps.push("Uses @{upstream} as default upstream");

  return { cmd: parts.join(" "), steps };
}

function buildCherryPick(c: CherryPickConfig): { cmd: string; steps: string[] } {
  const parts = ["git cherry-pick"];
  const steps: string[] = [];

  if (c.noCommit) { parts.push("--no-commit"); steps.push("Apply changes without creating a commit"); }
  if (c.edit) { parts.push("--edit"); steps.push("Opens editor to modify the commit message"); }
  if (c.signoff) { parts.push("--signoff"); steps.push("Adds Signed-off-by trailer to commit message"); }
  if (c.mainline) { parts.push(`--mainline ${c.mainline}`); steps.push(`Use parent #${c.mainline} as mainline (for merge commits)`); }

  const commitList = c.commits.split(/[\s,]+/).filter(Boolean);
  if (commitList.length > 1) {
    parts.push(commitList.join(" "));
    steps.push(`Apply ${commitList.length} commits: ${commitList.join(", ")}`);
  } else if (commitList.length === 1) {
    parts.push(commitList[0]);
    steps.push(`Apply commit ${commitList[0]}`);
  } else {
    parts.push("<commit>");
    steps.push("Specify at least one commit hash");
  }

  return { cmd: parts.join(" "), steps };
}

function buildStash(c: StashConfig): { cmd: string; steps: string[] } {
  const parts = ["git stash"];
  const steps: string[] = [];

  parts.push(c.action);
  steps.push({
    push: "Save current changes to the stash stack",
    pop: "Apply top stash and remove it from stack",
    apply: "Apply stash without removing it",
    list: "List all stash entries",
    drop: "Delete a specific stash entry",
    show: "Show the diff of a stash entry",
  }[c.action]);

  if (c.action === "push") {
    if (c.includeUntracked) { parts.push("--include-untracked"); steps.push("Also stash untracked files"); }
    if (c.keepIndex) { parts.push("--keep-index"); steps.push("Keep staged changes in the index"); }
    if (c.patch) { parts.push("--patch"); steps.push("Interactively select hunks to stash"); }
    if (c.message) { parts.push(`-m "${c.message}"`); steps.push(`Label this stash: "${c.message}"`); }
  }
  if (["pop", "apply", "drop", "show"].includes(c.action) && c.stashIndex !== "") {
    parts.push(`stash@{${c.stashIndex}}`);
    steps.push(`Target stash entry #${c.stashIndex}`);
  }

  return { cmd: parts.join(" "), steps };
}

function buildReset(c: ResetConfig): { cmd: string; steps: string[] } {
  const parts = ["git reset"];
  const steps: string[] = [];
  const modeDesc: Record<string, string> = {
    soft:  "Move HEAD only — index and worktree unchanged (commits become staged)",
    mixed: "Move HEAD and reset index — worktree unchanged (commits become unstaged)",
    hard:  "⚠️  Move HEAD, reset index AND worktree — all changes are DISCARDED",
    merge: "Reset index, keep worktree changes that differ between HEAD and target",
    keep:  "Reset index, keep worktree changes that don't conflict",
  };

  parts.push(`--${c.mode}`);
  steps.push(modeDesc[c.mode]);

  const target = c.target || "HEAD";
  parts.push(target);
  steps.push(`Move to: ${target}`);

  if (c.files) {
    const fileList = c.files.split(/[\s,]+/).filter(Boolean);
    parts.push("--", ...fileList);
    steps.push(`Unstage files: ${fileList.join(", ")}`);
  }

  return { cmd: parts.join(" "), steps };
}

function buildMerge(c: MergeConfig): { cmd: string; steps: string[] } {
  const parts = ["git merge"];
  const steps: string[] = [];

  if (c.noFf) { parts.push("--no-ff"); steps.push("Always create a merge commit (no fast-forward)"); }
  if (c.squash) { parts.push("--squash"); steps.push("Squash all commits into one staged change (no merge commit)"); }
  if (!c.commit) { parts.push("--no-commit"); steps.push("Stop after merge but before committing"); }
  if (c.strategy) { parts.push(`--strategy=${c.strategy}`); steps.push(`Use "${c.strategy}" merge strategy`); }
  if (c.message) { parts.push(`-m "${c.message}"`); steps.push(`Use custom merge commit message: "${c.message}"`); }
  parts.push(c.branch || "<branch>");
  steps.push(`Merge from branch: ${c.branch || "<branch>"}`);

  return { cmd: parts.join(" "), steps };
}

function buildTag(c: TagConfig): { cmd: string; steps: string[] } {
  const steps: string[] = [];
  let cmd = "";

  if (c.action === "list") {
    cmd = "git tag --list";
    steps.push("List all tags in the repository");
  } else if (c.action === "delete") {
    cmd = `git tag --delete ${c.name || "<tag-name>"}`;
    steps.push(`Delete local tag: ${c.name || "<tag-name>"}`);
  } else if (c.action === "push") {
    cmd = `git push ${c.remote || "origin"} ${c.name || "<tag-name>"}`;
    steps.push(`Push tag "${c.name || "<tag-name>"}" to remote "${c.remote || "origin"}"`);
  } else {
    const parts = ["git tag"];
    if (c.annotated) { parts.push("-a"); steps.push("Create annotated tag (stores tagger, date, message)"); }
    if (c.sign) { parts.push("-s"); steps.push("Sign tag with GPG key"); }
    parts.push(c.name || "<tag-name>");
    steps.push(`Tag name: ${c.name || "<tag-name>"}`);
    if (c.message) { parts.push(`-m "${c.message}"`); steps.push(`Tag message: "${c.message}"`); }
    if (c.ref) { parts.push(c.ref); steps.push(`Tag points to: ${c.ref}`); }
    cmd = parts.join(" ");
  }

  return { cmd, steps };
}

function buildBisect(c: BisectConfig): { cmd: string; steps: string[] } {
  const steps: string[] = [];
  let cmd = "";

  if (c.action === "start") {
    const bad = c.badCommit || "HEAD";
    const good = c.goodCommit || "<good-commit>";
    cmd = `git bisect start ${bad} ${good}`;
    steps.push(`Start bisect session`);
    steps.push(`Known bad commit: ${bad}`);
    steps.push(`Known good commit: ${good}`);
    steps.push("Git will checkout a midpoint commit for testing");
  } else if (c.action === "good") {
    cmd = `git bisect good${c.targetCommit ? " " + c.targetCommit : ""}`;
    steps.push("Mark current (or specified) commit as GOOD");
    steps.push("Git will narrow search toward the bad side");
  } else if (c.action === "bad") {
    cmd = `git bisect bad${c.targetCommit ? " " + c.targetCommit : ""}`;
    steps.push("Mark current (or specified) commit as BAD");
    steps.push("Git will narrow search toward the good side");
  } else if (c.action === "skip") {
    cmd = `git bisect skip${c.targetCommit ? " " + c.targetCommit : ""}`;
    steps.push("Skip current commit (e.g., untestable build)");
  } else if (c.action === "log") {
    cmd = "git bisect log";
    steps.push("Show all bisect steps taken so far");
  } else {
    cmd = "git bisect reset";
    steps.push("End bisect session and return to original HEAD");
  }

  return { cmd, steps };
}

function buildWorktree(c: WorktreeConfig): { cmd: string; steps: string[] } {
  const steps: string[] = [];
  let cmd = "";

  if (c.action === "list") {
    cmd = "git worktree list";
    steps.push("List all linked worktrees with their HEAD");
  } else if (c.action === "prune") {
    cmd = "git worktree prune";
    steps.push("Remove stale worktree administrative files");
  } else if (c.action === "remove") {
    cmd = `git worktree remove ${c.path || "<path>"}`;
    steps.push(`Remove worktree at: ${c.path || "<path>"}`);
  } else if (c.action === "move") {
    cmd = `git worktree move ${c.path || "<path>"} ${c.dest || "<new-path>"}`;
    steps.push(`Move worktree from "${c.path || "<path>"}" to "${c.dest || "<new-path>"}"`);
  } else {
    const parts = ["git worktree add"];
    if (c.newBranch) { parts.push(`-b ${c.branch || "<new-branch>"}`); steps.push(`Create and checkout new branch: ${c.branch || "<new-branch>"}`); }
    if (c.detach) { parts.push("--detach"); steps.push("Checkout in detached HEAD state"); }
    parts.push(c.path || "<path>");
    steps.push(`Create worktree at: ${c.path || "<path>"}`);
    if (!c.newBranch && c.branch) { parts.push(c.branch); steps.push(`Checkout branch: ${c.branch}`); }
    cmd = parts.join(" ");
  }

  return { cmd, steps };
}

function buildCommand(op: Operation, configs: AllConfigs): { cmd: string; steps: string[] } {
  switch (op) {
    case "rebase": return buildRebase(configs.rebase);
    case "cherry-pick": return buildCherryPick(configs.cherryPick);
    case "stash": return buildStash(configs.stash);
    case "reset": return buildReset(configs.reset);
    case "merge": return buildMerge(configs.merge);
    case "tag": return buildTag(configs.tag);
    case "bisect": return buildBisect(configs.bisect);
    case "worktree": return buildWorktree(configs.worktree);
  }
}

interface AllConfigs {
  rebase: RebaseConfig;
  cherryPick: CherryPickConfig;
  stash: StashConfig;
  reset: ResetConfig;
  merge: MergeConfig;
  tag: TagConfig;
  bisect: BisectConfig;
  worktree: WorktreeConfig;
}

export default function GitCommandBuilder() {
  const { theme } = useTheme();
  const tk = getTokens(theme);
  const dark = tk.dark;

  const [activeOp, setActiveOp] = useState<Operation>("rebase");
  const [copied, setCopied] = useState(false);

  const [configs, setConfigs] = useState<AllConfigs>({
    rebase: { onto: "", upstream: "", interactive: false, autosquash: false, preserveMerges: false, strategy: "" },
    cherryPick: { commits: "", noCommit: false, edit: false, signoff: false, mainline: "" },
    stash: { action: "push", message: "", includeUntracked: false, keepIndex: false, stashIndex: "", patch: false },
    reset: { mode: "mixed", target: "HEAD~1", files: "" },
    merge: { branch: "", strategy: "", noFf: false, squash: false, commit: true, message: "" },
    tag: { action: "create", name: "", annotated: true, message: "", ref: "", remote: "origin", sign: false },
    bisect: { action: "start", badCommit: "HEAD", goodCommit: "", targetCommit: "" },
    worktree: { action: "add", path: "", branch: "", newBranch: false, detach: false, dest: "" },
  });

  function updateConfig<K extends keyof AllConfigs>(key: K, patch: Partial<AllConfigs[K]>) {
    setConfigs(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  const { cmd, steps } = buildCommand(activeOp, configs);

  const copy = () => {
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const inputClass = `w-full border rounded-xl px-3 py-2 text-sm outline-none transition-all ${tk.inputBg}`;
  const labelClass = `block text-xs font-semibold tracking-wide mb-1.5 ${tk.textMuted}`;
  const selectClass = `w-full border rounded-xl px-3 py-2 text-sm outline-none transition-all ${tk.inputBg} ${dark ? "bg-black" : "bg-white"}`;

  const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
    <label className="flex items-center gap-3 cursor-pointer">
      <div
        onClick={() => onChange(!checked)}
        className={`w-9 h-5 rounded-full border transition-all duration-200 flex items-center cursor-pointer shrink-0 ${checked ? dark ? "bg-white border-white" : "bg-black border-black" : `${tk.surface} ${tk.border}`}`}
      >
        <div className={`w-3.5 h-3.5 rounded-full mx-0.5 transition-all duration-200 ${checked ? dark ? "translate-x-4 bg-black" : "translate-x-4 bg-white" : dark ? "bg-white/30" : "bg-black/30"}`} />
      </div>
      <span className={`text-sm ${tk.textMuted}`}>{label}</span>
    </label>
  );

  return (
    <div className="space-y-5">
      {/* Operation selector */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
        {(Object.entries(OPERATIONS) as [Operation, OperationConfig][]).map(([op, cfg]) => (
          <button
            key={op}
            onClick={() => setActiveOp(op)}
            title={cfg.description}
            className={`flex flex-col items-center gap-1 px-2 py-3 rounded-xl border text-center transition-all duration-150 ${activeOp === op ? `${tk.tabActive} border-transparent` : `${tk.border} ${tk.surface} ${tk.surfaceHv} ${tk.borderHv}`}`}
          >
            <span className="text-base">{cfg.icon}</span>
            <span className="text-xs font-semibold leading-tight">{cfg.label}</span>
          </button>
        ))}
      </div>

      <div className={`text-xs ${tk.textFaint} -mt-1`}>{OPERATIONS[activeOp].description}</div>

      {/* Config panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className={`border rounded-2xl ${tk.border} ${tk.surface} overflow-hidden`}>
          <div className={`px-5 py-3.5 border-b ${tk.border} flex items-center gap-2`}>
            <span className="text-base">{OPERATIONS[activeOp].icon}</span>
            <span className={`text-sm font-bold ${tk.text}`}>{OPERATIONS[activeOp].label} Options</span>
          </div>
          <div className="px-5 py-5 space-y-4">

            {/* REBASE */}
            {activeOp === "rebase" && (
              <>
                <div><label className={labelClass}>Upstream Branch</label><input className={inputClass} value={configs.rebase.upstream} onChange={e => updateConfig("rebase", { upstream: e.target.value })} placeholder="main" /></div>
                <div><label className={labelClass}>--onto (optional)</label><input className={inputClass} value={configs.rebase.onto} onChange={e => updateConfig("rebase", { onto: e.target.value })} placeholder="target-branch" /></div>
                <div><label className={labelClass}>Merge Strategy</label><select className={selectClass} value={configs.rebase.strategy} onChange={e => updateConfig("rebase", { strategy: e.target.value as RebaseConfig["strategy"] })}><option value="">Default</option><option value="recursive">recursive</option><option value="ours">ours</option><option value="theirs">theirs</option></select></div>
                <div className="space-y-2.5">
                  <Toggle checked={configs.rebase.interactive} onChange={v => updateConfig("rebase", { interactive: v })} label="Interactive (-i)" />
                  <Toggle checked={configs.rebase.autosquash} onChange={v => updateConfig("rebase", { autosquash: v })} label="Auto-squash fixup commits" />
                  <Toggle checked={configs.rebase.preserveMerges} onChange={v => updateConfig("rebase", { preserveMerges: v })} label="Preserve merge commits" />
                </div>
              </>
            )}

            {/* CHERRY-PICK */}
            {activeOp === "cherry-pick" && (
              <>
                <div><label className={labelClass}>Commit Hash(es)</label><input className={inputClass} value={configs.cherryPick.commits} onChange={e => updateConfig("cherryPick", { commits: e.target.value })} placeholder="abc1234 def5678" /></div>
                <div><label className={labelClass}>Mainline Parent # (for merge commits)</label><input className={inputClass} value={configs.cherryPick.mainline} onChange={e => updateConfig("cherryPick", { mainline: e.target.value })} placeholder="1" /></div>
                <div className="space-y-2.5">
                  <Toggle checked={configs.cherryPick.noCommit} onChange={v => updateConfig("cherryPick", { noCommit: v })} label="No commit (--no-commit)" />
                  <Toggle checked={configs.cherryPick.edit} onChange={v => updateConfig("cherryPick", { edit: v })} label="Edit message (--edit)" />
                  <Toggle checked={configs.cherryPick.signoff} onChange={v => updateConfig("cherryPick", { signoff: v })} label="Add Signed-off-by (--signoff)" />
                </div>
              </>
            )}

            {/* STASH */}
            {activeOp === "stash" && (
              <>
                <div><label className={labelClass}>Action</label><select className={selectClass} value={configs.stash.action} onChange={e => updateConfig("stash", { action: e.target.value as StashConfig["action"] })}><option value="push">push (save)</option><option value="pop">pop</option><option value="apply">apply</option><option value="list">list</option><option value="drop">drop</option><option value="show">show</option></select></div>
                {configs.stash.action === "push" && <>
                  <div><label className={labelClass}>Message (optional)</label><input className={inputClass} value={configs.stash.message} onChange={e => updateConfig("stash", { message: e.target.value })} placeholder="WIP: feature work" /></div>
                  <div className="space-y-2.5">
                    <Toggle checked={configs.stash.includeUntracked} onChange={v => updateConfig("stash", { includeUntracked: v })} label="Include untracked files (-u)" />
                    <Toggle checked={configs.stash.keepIndex} onChange={v => updateConfig("stash", { keepIndex: v })} label="Keep staged index (-k)" />
                    <Toggle checked={configs.stash.patch} onChange={v => updateConfig("stash", { patch: v })} label="Interactive patch mode (-p)" />
                  </div>
                </>}
                {["pop", "apply", "drop", "show"].includes(configs.stash.action) && <div><label className={labelClass}>Stash Index (blank = latest)</label><input className={inputClass} value={configs.stash.stashIndex} onChange={e => updateConfig("stash", { stashIndex: e.target.value })} placeholder="0" /></div>}
              </>
            )}

            {/* RESET */}
            {activeOp === "reset" && (
              <>
                <div><label className={labelClass}>Mode</label><select className={selectClass} value={configs.reset.mode} onChange={e => updateConfig("reset", { mode: e.target.value as ResetConfig["mode"] })}><option value="soft">--soft</option><option value="mixed">--mixed (default)</option><option value="hard">--hard</option><option value="merge">--merge</option><option value="keep">--keep</option></select></div>
                <div><label className={labelClass}>Target</label><input className={inputClass} value={configs.reset.target} onChange={e => updateConfig("reset", { target: e.target.value })} placeholder="HEAD~1 or commit hash" /></div>
                <div><label className={labelClass}>Files (optional, space-separated)</label><input className={inputClass} value={configs.reset.files} onChange={e => updateConfig("reset", { files: e.target.value })} placeholder="src/file.ts src/other.ts" /></div>
                {configs.reset.mode === "hard" && <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs ${dark ? "border-white/15 bg-white/[0.04] text-white/60" : "border-black/15 bg-black/[0.04] text-black/60"}`}>⚠️ --hard will permanently discard all uncommitted changes</div>}
              </>
            )}

            {/* MERGE */}
            {activeOp === "merge" && (
              <>
                <div><label className={labelClass}>Branch to merge from</label><input className={inputClass} value={configs.merge.branch} onChange={e => updateConfig("merge", { branch: e.target.value })} placeholder="feature/my-branch" /></div>
                <div><label className={labelClass}>Merge Strategy</label><select className={selectClass} value={configs.merge.strategy} onChange={e => updateConfig("merge", { strategy: e.target.value as MergeConfig["strategy"] })}><option value="">Default</option><option value="recursive">recursive</option><option value="ours">ours</option><option value="octopus">octopus</option><option value="resolve">resolve</option></select></div>
                <div><label className={labelClass}>Custom Commit Message (optional)</label><input className={inputClass} value={configs.merge.message} onChange={e => updateConfig("merge", { message: e.target.value })} placeholder="Merge feature into main" /></div>
                <div className="space-y-2.5">
                  <Toggle checked={configs.merge.noFf} onChange={v => updateConfig("merge", { noFf: v })} label="No fast-forward (--no-ff)" />
                  <Toggle checked={configs.merge.squash} onChange={v => updateConfig("merge", { squash: v })} label="Squash commits (--squash)" />
                  <Toggle checked={!configs.merge.commit} onChange={v => updateConfig("merge", { commit: !v })} label="Stop before committing (--no-commit)" />
                </div>
              </>
            )}

            {/* TAG */}
            {activeOp === "tag" && (
              <>
                <div><label className={labelClass}>Action</label><select className={selectClass} value={configs.tag.action} onChange={e => updateConfig("tag", { action: e.target.value as TagConfig["action"] })}><option value="create">Create tag</option><option value="delete">Delete tag</option><option value="list">List tags</option><option value="push">Push tag to remote</option></select></div>
                {configs.tag.action !== "list" && <div><label className={labelClass}>Tag Name</label><input className={inputClass} value={configs.tag.name} onChange={e => updateConfig("tag", { name: e.target.value })} placeholder="v1.2.0" /></div>}
                {configs.tag.action === "create" && <>
                  <div><label className={labelClass}>Commit / Ref (optional)</label><input className={inputClass} value={configs.tag.ref} onChange={e => updateConfig("tag", { ref: e.target.value })} placeholder="HEAD or commit hash" /></div>
                  <div><label className={labelClass}>Message (annotated)</label><input className={inputClass} value={configs.tag.message} onChange={e => updateConfig("tag", { message: e.target.value })} placeholder="Release v1.2.0" /></div>
                  <div className="space-y-2.5">
                    <Toggle checked={configs.tag.annotated} onChange={v => updateConfig("tag", { annotated: v })} label="Annotated tag (-a)" />
                    <Toggle checked={configs.tag.sign} onChange={v => updateConfig("tag", { sign: v })} label="GPG signed (-s)" />
                  </div>
                </>}
                {configs.tag.action === "push" && <div><label className={labelClass}>Remote</label><input className={inputClass} value={configs.tag.remote} onChange={e => updateConfig("tag", { remote: e.target.value })} placeholder="origin" /></div>}
              </>
            )}

            {/* BISECT */}
            {activeOp === "bisect" && (
              <>
                <div><label className={labelClass}>Action</label><select className={selectClass} value={configs.bisect.action} onChange={e => updateConfig("bisect", { action: e.target.value as BisectConfig["action"] })}><option value="start">start</option><option value="good">mark good</option><option value="bad">mark bad</option><option value="skip">skip</option><option value="log">log</option><option value="reset">reset (end)</option></select></div>
                {configs.bisect.action === "start" && <>
                  <div><label className={labelClass}>Known Bad Commit</label><input className={inputClass} value={configs.bisect.badCommit} onChange={e => updateConfig("bisect", { badCommit: e.target.value })} placeholder="HEAD" /></div>
                  <div><label className={labelClass}>Known Good Commit</label><input className={inputClass} value={configs.bisect.goodCommit} onChange={e => updateConfig("bisect", { goodCommit: e.target.value })} placeholder="v1.0.0 or commit hash" /></div>
                </>}
                {["good", "bad", "skip"].includes(configs.bisect.action) && <div><label className={labelClass}>Specific Commit (blank = current)</label><input className={inputClass} value={configs.bisect.targetCommit} onChange={e => updateConfig("bisect", { targetCommit: e.target.value })} placeholder="abc1234" /></div>}
              </>
            )}

            {/* WORKTREE */}
            {activeOp === "worktree" && (
              <>
                <div><label className={labelClass}>Action</label><select className={selectClass} value={configs.worktree.action} onChange={e => updateConfig("worktree", { action: e.target.value as WorktreeConfig["action"] })}><option value="add">add</option><option value="list">list</option><option value="remove">remove</option><option value="move">move</option><option value="prune">prune</option></select></div>
                {["add", "remove", "move"].includes(configs.worktree.action) && <div><label className={labelClass}>Path</label><input className={inputClass} value={configs.worktree.path} onChange={e => updateConfig("worktree", { path: e.target.value })} placeholder="../my-worktree" /></div>}
                {configs.worktree.action === "move" && <div><label className={labelClass}>Destination Path</label><input className={inputClass} value={configs.worktree.dest} onChange={e => updateConfig("worktree", { dest: e.target.value })} placeholder="../new-location" /></div>}
                {configs.worktree.action === "add" && <>
                  <div><label className={labelClass}>Branch</label><input className={inputClass} value={configs.worktree.branch} onChange={e => updateConfig("worktree", { branch: e.target.value })} placeholder="feature/branch-name" /></div>
                  <div className="space-y-2.5">
                    <Toggle checked={configs.worktree.newBranch} onChange={v => updateConfig("worktree", { newBranch: v })} label="Create new branch (-b)" />
                    <Toggle checked={configs.worktree.detach} onChange={v => updateConfig("worktree", { detach: v })} label="Detached HEAD (--detach)" />
                  </div>
                </>}
              </>
            )}
          </div>
        </div>

        {/* Output */}
        <div className="space-y-4">
          {/* Command output */}
          <div className={`border rounded-2xl ${tk.border} overflow-hidden`}>
            <div className={`flex items-center justify-between px-5 py-3.5 border-b ${tk.border} ${tk.surface}`}>
              <span className={`text-xs font-mono ${tk.textFaint}`}>$ command preview</span>
              <button
                onClick={copy}
                className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all ${copied ? tk.tabActive : `${tk.border} ${tk.surface} ${tk.surfaceHv} ${tk.textFaint}`}`}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className={`px-5 py-4 ${dark ? "bg-white/[0.02]" : "bg-black/[0.02]"}`}>
              <code className={`text-sm font-mono break-all ${tk.text}`}>{cmd}</code>
            </div>
          </div>

          {/* Steps explanation */}
          <div className={`border rounded-2xl ${tk.border} ${tk.surface} overflow-hidden`}>
            <div className={`px-5 py-3.5 border-b ${tk.border}`}>
              <span className={`text-xs font-semibold tracking-widest uppercase ${tk.textMuted}`}>What this does</span>
            </div>
            <div className="px-5 py-4 space-y-2">
              {steps.map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className={`text-xs font-mono font-bold ${tk.textDim} mt-0.5 w-4 shrink-0`}>{String(i + 1).padStart(2, "0")}</span>
                  <span className={`text-sm ${step.startsWith("⚠️") ? dark ? "text-white/70" : "text-black/70" : tk.textMuted}`}>{step}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick reference */}
          <div className={`border rounded-2xl ${tk.border} ${tk.surface} overflow-hidden`}>
            <div className={`px-5 py-3.5 border-b ${tk.border}`}>
              <span className={`text-xs font-semibold tracking-widest uppercase ${tk.textMuted}`}>Quick Reference</span>
            </div>
            <div className="px-5 py-4 space-y-1.5">
              {activeOp === "rebase" && [
                ["git rebase main", "Rebase onto main"],
                ["git rebase -i HEAD~3", "Interactive: last 3 commits"],
                ["git rebase --abort", "Cancel ongoing rebase"],
                ["git rebase --continue", "Continue after resolving conflicts"],
              ].map(([c, d]) => (
                <div key={c} className="flex items-center justify-between gap-4">
                  <code className={`text-xs font-mono ${tk.textMuted}`}>{c}</code>
                  <span className={`text-xs ${tk.textDim} text-right`}>{d}</span>
                </div>
              ))}
              {activeOp === "cherry-pick" && [
                ["git cherry-pick abc1234", "Apply one commit"],
                ["git cherry-pick abc..def", "Apply range of commits"],
                ["git cherry-pick --abort", "Cancel cherry-pick"],
                ["git cherry-pick --continue", "Continue after conflict"],
              ].map(([c, d]) => (
                <div key={c} className="flex items-center justify-between gap-4">
                  <code className={`text-xs font-mono ${tk.textMuted}`}>{c}</code>
                  <span className={`text-xs ${tk.textDim} text-right`}>{d}</span>
                </div>
              ))}
              {activeOp === "stash" && [
                ["git stash push -u", "Stash including untracked"],
                ["git stash list", "View all stashes"],
                ["git stash pop", "Apply & remove top stash"],
                ["git stash drop stash@{2}", "Delete specific stash"],
              ].map(([c, d]) => (
                <div key={c} className="flex items-center justify-between gap-4">
                  <code className={`text-xs font-mono ${tk.textMuted}`}>{c}</code>
                  <span className={`text-xs ${tk.textDim} text-right`}>{d}</span>
                </div>
              ))}
              {activeOp === "reset" && [
                ["git reset --soft HEAD~1", "Undo commit, keep staged"],
                ["git reset HEAD~1", "Undo commit, keep unstaged"],
                ["git reset --hard HEAD~1", "Undo commit, discard all"],
                ["git reset HEAD file.ts", "Unstage a file"],
              ].map(([c, d]) => (
                <div key={c} className="flex items-center justify-between gap-4">
                  <code className={`text-xs font-mono ${tk.textMuted}`}>{c}</code>
                  <span className={`text-xs ${tk.textDim} text-right`}>{d}</span>
                </div>
              ))}
              {activeOp === "merge" && [
                ["git merge feature --no-ff", "Merge with commit"],
                ["git merge --squash feature", "Squash into one commit"],
                ["git merge --abort", "Cancel merge"],
                ["git merge --continue", "Continue after conflict"],
              ].map(([c, d]) => (
                <div key={c} className="flex items-center justify-between gap-4">
                  <code className={`text-xs font-mono ${tk.textMuted}`}>{c}</code>
                  <span className={`text-xs ${tk.textDim} text-right`}>{d}</span>
                </div>
              ))}
              {activeOp === "tag" && [
                ["git tag v1.0.0", "Lightweight tag"],
                ["git tag -a v1.0.0 -m 'msg'", "Annotated tag"],
                ["git push origin v1.0.0", "Push specific tag"],
                ["git push origin --tags", "Push all tags"],
              ].map(([c, d]) => (
                <div key={c} className="flex items-center justify-between gap-4">
                  <code className={`text-xs font-mono ${tk.textMuted}`}>{c}</code>
                  <span className={`text-xs ${tk.textDim} text-right`}>{d}</span>
                </div>
              ))}
              {activeOp === "bisect" && [
                ["git bisect start HEAD v1.0", "Start: bad=HEAD, good=v1.0"],
                ["git bisect good", "Mark current as good"],
                ["git bisect bad", "Mark current as bad"],
                ["git bisect reset", "End session"],
              ].map(([c, d]) => (
                <div key={c} className="flex items-center justify-between gap-4">
                  <code className={`text-xs font-mono ${tk.textMuted}`}>{c}</code>
                  <span className={`text-xs ${tk.textDim} text-right`}>{d}</span>
                </div>
              ))}
              {activeOp === "worktree" && [
                ["git worktree add ../feat feature", "New worktree on branch"],
                ["git worktree add -b new ../path", "New worktree + branch"],
                ["git worktree list", "List worktrees"],
                ["git worktree remove ../path", "Remove worktree"],
              ].map(([c, d]) => (
                <div key={c} className="flex items-center justify-between gap-4">
                  <code className={`text-xs font-mono ${tk.textMuted}`}>{c}</code>
                  <span className={`text-xs ${tk.textDim} text-right`}>{d}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
