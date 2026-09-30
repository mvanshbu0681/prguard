import { dismissFinding } from "../learnings/dismiss.ts";
import { statusBadge } from "../review/badges.ts";
import { registerCommand, threadFinding } from "./run.ts";

registerCommand("ignore", async (c) => {
  const finding = threadFinding(c.payload)!;
  if (finding.status === "dismissed") return void (await c.reply("Already dismissed."));
  const learning = await dismissFinding({
    gh: c.gh,
    r: c.r,
    finding,
    reason: c.args || null,
    source: "command",
    author: c.payload.author,
    url: c.payload.url,
  });
  await c.reply(`${statusBadge("learned")} Got it. I won't flag this in \`${c.repo.fullName}\` again.\n\n> ${learning.text}`);
});
